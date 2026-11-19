import {
  BadRequestException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import {
  ConfiguracionPedidos,
  MAXIMO_COMPROBANTE,
} from '../configuracion-pedidos.js';
import { CloudinaryService } from '../../productos/fotografias/cloudinary.service.js';
import { ConfiguracionCloudinary } from '../../productos/fotografias/configuracion-cloudinary.js';
import { ComprobantesPrivadosService } from './comprobantes-privados.service.js';

describe('Comprobantes privados y validación real de imágenes', () => {
  let directorio: string, servicio: ComprobantesPrivadosService;
  beforeEach(async () => {
    directorio = await mkdtemp(join(tmpdir(), 'soho-comprobantes-test-'));
    servicio = new ComprobantesPrivadosService(
      new ConfiguracionPedidos({ PEDIDOS_DIRECTORIO_PRIVADO: directorio }),
    );
  });
  afterEach(async () => {
    await rm(directorio, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });
  const imagen = () =>
    sharp({
      create: { width: 20, height: 20, channels: 3, background: '#ffffff' },
    });
  it.each(['png', 'jpeg', 'webp'] as const)(
    'decodifica, guarda y recupera %s sin publicar el nombre original',
    async (formato) => {
      const entrada = await imagen().toFormat(formato).toBuffer();
      const preparado = await servicio.preparar(entrada, `image/${formato}`);
      const guardado = await servicio.guardar(preparado);
      expect(guardado.clave).toMatch(
        /^comprobantes\/[0-9a-f-]+\.(png|jpg|webp)$/,
      );
      expect(
        await servicio.leer(
          guardado.clave,
          guardado.sha256,
          guardado.tamanoBytes,
        ),
      ).toEqual(preparado.contenido);
      await servicio.eliminar(guardado.clave);
      expect(await readdir(join(directorio, 'comprobantes'))).toEqual([]);
    },
  );
  it('elimina metadatos y contenido añadido al archivo', async () => {
    const entrada = await imagen()
      .withExif({ IFD0: { Artist: 'Dato privado de prueba' } })
      .png()
      .toBuffer();
    const preparado = await servicio.preparar(
      Buffer.concat([entrada, Buffer.from('<script>alert(1)</script>')]),
      'image/png',
    );
    expect((await sharp(preparado.contenido).metadata()).exif).toBeUndefined();
    expect(preparado.contenido.includes(Buffer.from('<script>'))).toBe(false);
  });
  it('rechaza firmas falsas, MIME incoherente e imágenes truncadas', async () => {
    const entrada = await imagen().png().toBuffer();
    await expect(
      servicio.preparar(Buffer.from('no es una imagen'), 'image/png'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      servicio.preparar(entrada, 'image/jpeg'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      servicio.preparar(entrada.subarray(0, 50), 'image/png'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('rechaza imágenes de dimensiones excesivas', async () => {
    const entrada = await sharp({
      create: { width: 8193, height: 1, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer();
    await expect(
      servicio.preparar(entrada, 'image/png'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('rechaza WebP animado aunque su formato esté permitido', async () => {
    const a = await imagen().png().toBuffer();
    const b = await sharp({
      create: { width: 20, height: 20, channels: 3, background: '#000000' },
    })
      .png()
      .toBuffer();
    const animado = await sharp([a, b], { join: { animated: true } })
      .webp()
      .toBuffer();
    expect((await sharp(animado).metadata()).pages).toBe(2);
    await expect(
      servicio.preparar(animado, 'image/webp'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('rechaza base64 no canónico y archivos de más de 5 MiB', () => {
    expect(() => servicio.decodificar('YQ==\n')).toThrow(BadRequestException);
    expect(() => servicio.decodificar('YR==')).toThrow(BadRequestException);
    expect(() =>
      servicio.decodificar(
        Buffer.alloc(MAXIMO_COMPROBANTE + 1).toString('base64'),
      ),
    ).toThrow(BadRequestException);
  });
  it('no devuelve un archivo alterado ni permite recorrer directorios', async () => {
    const guardado = await servicio.guardar(
      await servicio.preparar(await imagen().png().toBuffer(), 'image/png'),
    );
    await writeFile(join(directorio, guardado.clave), 'alterado');
    await expect(
      servicio.leer(guardado.clave, guardado.sha256, guardado.tamanoBytes),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(servicio.leer('../archivo', '', 0)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
  it('optimiza también las imágenes históricas locales para su entrega', async () => {
    const preparada = await servicio.preparar(
        await imagen().png().toBuffer(),
        'image/png',
      ),
      guardado = await servicio.guardar(preparada),
      optimizada = await servicio.leerOptimizado(
        guardado.clave,
        guardado.sha256,
        guardado.formato,
        guardado.tamanoBytes,
      );
    expect(optimizada.formato).toBe('image/webp');
    expect((await sharp(optimizada.contenido).metadata()).format).toBe('webp');
    expect(optimizada.contenido).not.toEqual(preparada.contenido);
  });
  it('guarda y entrega nuevos comprobantes privados desde Cloudinary sin copia local', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    let id = '',
      subido = false,
      eliminado = false;
    const configCloudinary = new ConfiguracionCloudinary({
        CLOUDINARY_CLOUD_NAME: 'sintetico',
        CLOUDINARY_API_KEY: '123456',
        CLOUDINARY_API_SECRET: 'secreto-sintetico',
        NODE_ENV: 'production',
      }),
      cloudinary = new CloudinaryService(
        configCloudinary,
        vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
          const destino = url instanceof Request ? url.url : url.toString();
          if (destino.endsWith('/config?settings=true'))
            return new Response(
              JSON.stringify({ settings: { folder_mode: 'dynamic' } }),
            );
          if (destino.endsWith('/image/upload')) {
            const formulario = init!.body as FormData;
            const publicId = formulario.get('public_id');
            if (typeof publicId !== 'string')
              throw Error('La solicitud no incluyó el identificador público.');
            id = publicId;
            subido = true;
            return new Response('{}');
          }
          if (destino.includes('/resources/image/authenticated/')) {
            if (!subido || eliminado)
              return new Response('{}', { status: 404 });
            return new Response(
              JSON.stringify({
                asset_id: 'asset-comprobante-test',
                public_id: id,
                resource_type: 'image',
                type: 'authenticated',
                asset_folder: 'SOHO/comprobantes',
                version: 21,
                format: 'png',
                width: 20,
                height: 20,
                bytes: preparado.contenido.length,
                context: {
                  custom: {
                    soho_comprobante: id,
                    soho_hash: preparado.sha256,
                    soho_formato: preparado.formato,
                    soho_bytes: String(preparado.contenido.length),
                  },
                },
              }),
            );
          }
          if (destino.startsWith('https://res.cloudinary.com/'))
            return new Response(Buffer.from('webp optimizado'), {
              headers: { 'content-type': 'image/webp' },
            });
          if (destino.endsWith('/resources')) {
            eliminado = true;
            return new Response('{}');
          }
          return new Response('{}', { status: 404 });
        }),
      ),
      preparado = await servicio.preparar(
        await imagen().png().toBuffer(),
        'image/png',
      );
    servicio = new ComprobantesPrivadosService(
      new ConfiguracionPedidos({ PEDIDOS_DIRECTORIO_PRIVADO: directorio }),
      cloudinary,
    );
    const guardado = await servicio.guardar(preparado),
      optimizado = await servicio.leerOptimizado(
        guardado.clave,
        guardado.sha256,
        guardado.formato,
        guardado.tamanoBytes,
      );
    expect(guardado.clave).toBe(`cloudinary/comprobantes/${id}.png`);
    expect(optimizado.formato).toBe('image/webp');
    expect(optimizado.contenido.toString()).toBe('webp optimizado');
    expect(await readdir(directorio)).toEqual([]);
    await servicio.eliminar(guardado.clave);
    expect(eliminado).toBe(true);
  });
  it('responde sin exponer rutas si el disco no permite guardar', async () => {
    const rutaArchivo = join(directorio, 'archivo');
    await writeFile(rutaArchivo, 'prueba');
    const imposible = new ComprobantesPrivadosService(
      new ConfiguracionPedidos({ PEDIDOS_DIRECTORIO_PRIVADO: rutaArchivo }),
    );
    const log = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    await expect(
      imposible.guardar(
        await servicio.preparar(await imagen().png().toBuffer(), 'image/png'),
      ),
    ).rejects.toThrow('No se pudo guardar');
    log.mockRestore();
  });

  it.each(['png', 'jpeg', 'webp'] as const)(
    'reserva sin IO y publica %s completo con verificación posterior',
    async (formato) => {
      const preparado = await servicio.preparar(
          await imagen().toFormat(formato).toBuffer(),
          `image/${formato}`,
        ),
        reserva = servicio.reservar(preparado);
      expect(await readdir(directorio)).toEqual([]);
      expect(await servicio.comprobarReservado(reserva)).toBe(false);
      await servicio.guardarReservado(reserva, preparado);
      expect(await servicio.comprobarReservado(reserva)).toBe(true);
      expect(await readdir(join(directorio, 'comprobantes'))).toEqual([
        reserva.clave.split('/')[1],
      ]);
      expect(
        await servicio.leer(reserva.clave, reserva.sha256, reserva.tamanoBytes),
      ).toEqual(preparado.contenido);
    },
  );
  it('dos escritores de la misma reserva publican una sola identidad sin temporales', async () => {
    const p = await servicio.preparar(
        await imagen().png().toBuffer(),
        'image/png',
      ),
      reserva = servicio.reservar(p);
    await Promise.all([
      servicio.guardarReservado(reserva, p),
      servicio.guardarReservado(reserva, p),
    ]);
    expect(await readdir(join(directorio, 'comprobantes'))).toEqual([
      reserva.clave.split('/')[1],
    ]);
    expect(
      await servicio.leer(reserva.clave, reserva.sha256, reserva.tamanoBytes),
    ).toEqual(p.contenido);
  });
  it('un contenido distinto nunca ocupa la identidad reservada', async () => {
    const p = await servicio.preparar(
        await imagen().png().toBuffer(),
        'image/png',
      ),
      reserva = servicio.reservar(p);
    await expect(
      servicio.guardarReservado(reserva, {
        ...p,
        contenido: Buffer.from('otro'),
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(await readdir(directorio)).toEqual([]);
  });
  it('rechaza una reserva con recorrido de directorios o formato distinto', async () => {
    const p = await servicio.preparar(
        await imagen().png().toBuffer(),
        'image/png',
      ),
      reserva = servicio.reservar(p);
    await expect(
      servicio.guardarReservado({ ...reserva, clave: '../comprobante.png' }, p),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(
      servicio.guardarReservado({ ...reserva, formato: 'image/jpeg' }, p),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(await readdir(directorio)).toEqual([]);
  });
  it('conserva un archivo existente alterado para revisión sin sobrescribirlo', async () => {
    const p = await servicio.preparar(
        await imagen().png().toBuffer(),
        'image/png',
      ),
      reserva = servicio.reservar(p);
    await servicio.guardarReservado(reserva, p);
    await writeFile(join(directorio, reserva.clave), 'alterado');
    await expect(servicio.guardarReservado(reserva, p)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    const { readFile } = await import('node:fs/promises');
    expect(await readFile(join(directorio, reserva.clave), 'utf8')).toBe(
      'alterado',
    );
  });

  it('recupera los bytes completos de un temporal interrumpido antes de publicar su identidad', async () => {
    const p = await servicio.preparar(
        await imagen().png().toBuffer(),
        'image/png',
      ),
      r = servicio.reservar(p),
      { mkdir } = await import('node:fs/promises');
    await mkdir(join(directorio, 'comprobantes'));
    await writeFile(
      join(directorio, r.clave + '.' + randomUUID() + '.tmp'),
      p.contenido,
    );
    expect(await servicio.comprobarReservado(r)).toBe(true);
    expect(await readdir(join(directorio, 'comprobantes'))).toEqual([
      r.clave.split('/')[1],
    ]);
  });
  it('copia los mismos bytes en una identidad independiente sin volver a preparar la imagen', async () => {
    const p = await servicio.preparar(
        await imagen().png().toBuffer(),
        'image/png',
      ),
      origen = await servicio.guardar(p),
      destino = servicio.reservarCopia(origen),
      preparar = vi.spyOn(servicio, 'preparar');
    expect(destino.clave).not.toBe(origen.clave);
    await servicio.copiarReservado(origen, destino);
    expect(preparar).not.toHaveBeenCalled();
    expect(
      await servicio.leer(destino.clave, destino.sha256, destino.tamanoBytes),
    ).toEqual(p.contenido);
    await servicio.eliminar(destino.clave);
    expect(
      await servicio.leer(origen.clave, origen.sha256, origen.tamanoBytes),
    ).toEqual(p.contenido);
  });
  it('rechaza una copia sobre el origen o con otros metadatos sin alterar evidencia', async () => {
    const p = await servicio.preparar(
        await imagen().png().toBuffer(),
        'image/png',
      ),
      origen = await servicio.guardar(p),
      destino = servicio.reservarCopia(origen);
    await expect(
      servicio.copiarReservado(origen, origen),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(
      servicio.copiarReservado(origen, { ...destino, sha256: 'a'.repeat(64) }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(
      await servicio.leer(origen.clave, origen.sha256, origen.tamanoBytes),
    ).toEqual(p.contenido);
    expect(await servicio.comprobarReservado(destino)).toBe(false);
  });
  it('un temporal incompleto no se anuncia disponible ni impide reenviar los mismos bytes', async () => {
    const p = await servicio.preparar(
        await imagen().png().toBuffer(),
        'image/png',
      ),
      r = servicio.reservar(p),
      { mkdir } = await import('node:fs/promises');
    await mkdir(join(directorio, 'comprobantes'));
    await writeFile(
      join(directorio, r.clave + '.' + randomUUID() + '.tmp'),
      p.contenido.subarray(0, 10),
    );
    expect(await servicio.comprobarReservado(r)).toBe(false);
    await servicio.guardarReservado(r, p);
    expect(await servicio.leer(r.clave, r.sha256, r.tamanoBytes)).toEqual(
      p.contenido,
    );
  });
});
