import { CloudinaryService } from './cloudinary.service.js';
import type { FotografiaPreparada } from './cloudinary.service.js';
import { ConfiguracionCloudinary } from './configuracion-cloudinary.js';
import type { ArchivoImagen } from '../../generated/prisma/client.js';
import { createHash } from 'node:crypto';
const config = () =>
  new ConfiguracionCloudinary({
    CLOUDINARY_CLOUD_NAME: 'sintetico',
    CLOUDINARY_API_KEY: '123456',
    CLOUDINARY_API_SECRET: 'secreto-sintetico',
    NODE_ENV: 'test',
  });
const contenido = Buffer.from('foto-sintetica');
const archivo = () =>
  ({
    id: '113e4567-e89b-42d3-a456-426614174000',
    productoOrigenId: '223e4567-e89b-42d3-a456-426614174000',
    proveedor: 'CLOUDINARY',
    cloudName: 'sintetico',
    publicId: 'soho-prueba',
    carpetaCloudinary: 'SOHO/productos/modelo/SHO-0015-blanco',
    nombreOriginal: 'frontal.png',
    hashContenido: createHash('sha256').update(contenido).digest('hex'),
    solicitudHash: 'a'.repeat(64),
    formato: 'png',
    ancho: 2,
    alto: 3,
    bytes: contenido.length,
    assetId: 'asset-prueba',
    versionCloudinary: 17n,
  }) as ArchivoImagen;
const recurso = (a = archivo()) => ({
  asset_id: a.assetId,
  public_id: a.publicId,
  resource_type: 'image',
  type: 'upload',
  asset_folder: a.carpetaCloudinary,
  version: 17,
  secure_url:
    'https://res.cloudinary.com/sintetico/image/upload/v17/' +
    a.publicId +
    '.png',
  format: 'png',
  width: 2,
  height: 3,
  bytes: contenido.length,
  context: {
    custom: {
      soho_archivo: a.id,
      soho_producto: a.productoOrigenId,
      soho_hash: a.hashContenido,
      soho_solicitud: a.solicitudHash,
    },
  },
});
const idComprobante = '323e4567-e89b-42d3-a456-426614174000';
const bytesComprobante = Buffer.from('comprobante-sintetico');
const datosComprobante = () => ({
  contenido: bytesComprobante,
  formato: 'image/png',
  sha256: createHash('sha256').update(bytesComprobante).digest('hex'),
  tamanoBytes: bytesComprobante.length,
});
const recursoComprobante = (publicId = idComprobante) => ({
  asset_id: 'asset-comprobante',
  public_id: publicId,
  resource_type: 'image',
  type: 'authenticated',
  asset_folder: 'SOHO/comprobantes',
  version: 19,
  format: 'png',
  width: 20,
  height: 20,
  bytes: bytesComprobante.length,
  context: {
    custom: {
      soho_comprobante: idComprobante,
      soho_hash: datosComprobante().sha256,
      soho_formato: 'image/png',
      soho_bytes: String(bytesComprobante.length),
    },
  },
});
const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status });
describe('Cloudinary mediante REST autenticado', () => {
  it('consulta el modo de carpetas y reutiliza su caché', async () => {
    const http = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ settings: { folder_mode: 'dynamic' } }));
    const c = new CloudinaryService(config(), http);
    expect(await c.modoCarpetas()).toBe('dynamic');
    expect(await c.modoCarpetas()).toBe('dynamic');
    expect(http).toHaveBeenCalledTimes(1);
  });
  it('envía archivo binario y firma de servidor sin sobrescribir ni prefijar la carpeta dinámica', async () => {
    const a = archivo();
    let formulario: FormData | undefined;
    const http = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
      if (
        (url instanceof Request ? url.url : url.toString()).endsWith(
          '/image/upload',
        )
      ) {
        formulario = init!.body as FormData;
        return json({ existing: true });
      }
      if (
        (url instanceof Request ? url.url : url.toString()).startsWith(
          'https://res.cloudinary.com/',
        )
      )
        return new Response(contenido);
      return json(recurso(a));
    });
    const c = new CloudinaryService(config(), http);
    await c.subir(a, {
      contenido,
      mime: 'image/png',
      formato: 'png',
    } as FotografiaPreparada);
    expect(formulario!.get('overwrite')).toBe('false');
    expect(formulario!.get('asset_folder')).toBe(a.carpetaCloudinary);
    expect(formulario!.get('public_id')).toBe(a.publicId);
    expect(formulario!.has('folder')).toBe(false);
    expect(formulario!.get('signature')).toMatch(/^[a-f0-9]{64}$/);
    expect(formulario!.has('api_secret')).toBe(false);
    expect(formulario!.get('file')).toBeInstanceOf(Blob);
  });
  it('conserva la ruta completa del identificador en modo fijo', async () => {
    const a = {
      ...archivo(),
      publicId: 'SOHO/productos/modelo/SHO-0015-blanco/soho-prueba',
    };
    let formulario: FormData | undefined;
    const http = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
      if (
        (url instanceof Request ? url.url : url.toString()).endsWith(
          '/image/upload',
        )
      ) {
        formulario = init!.body as FormData;
        return json({});
      }
      if (
        (url instanceof Request ? url.url : url.toString()).startsWith(
          'https://res.cloudinary.com/',
        )
      )
        return new Response(contenido);
      const r = recurso(a);
      return json({
        ...r,
        asset_folder: undefined,
        folder: a.carpetaCloudinary,
      });
    });
    await new CloudinaryService(config(), http).subir(a, {
      contenido,
      mime: 'image/png',
      formato: 'png',
    } as FotografiaPreparada);
    expect(formulario!.get('folder')).toBe(a.carpetaCloudinary);
    expect(formulario!.get('public_id')).toBe('soho-prueba');
    expect(formulario!.has('asset_folder')).toBe(false);
  });
  it('devuelve ausencia solo ante 404 y oculta los mensajes del proveedor', async () => {
    const http = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({}, 404))
      .mockResolvedValueOnce(
        json({ error: { message: 'secreto-sintetico' } }, 401),
      );
    const c = new CloudinaryService(config(), http);
    expect(await c.buscar(archivo())).toBeNull();
    await expect(c.buscar(archivo())).rejects.not.toThrow('secreto-sintetico');
  });
  it.each(['public_id', 'secure_url', 'asset_folder'])(
    'rechaza una identidad externa distinta en %s',
    (campo) => {
      expect(() =>
        new CloudinaryService(config()).verificar(archivo(), {
          ...recurso(),
          [campo]: 'https://otra.example/foto.png',
        }),
      ).toThrow();
    },
  );
  it('comprueba el contenido SHA-256 incluso si el contexto y las dimensiones coinciden', async () => {
    const http = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(recurso()))
      .mockResolvedValueOnce(new Response(Buffer.alloc(contenido.length, 0)));
    await expect(
      new CloudinaryService(config(), http).buscar(archivo()),
    ).rejects.toThrow();
  });
  it('no borra una versión externa que sustituyó el archivo confirmado', async () => {
    const http = vi.fn<typeof fetch>().mockResolvedValue(
      json({
        ...recurso(),
        version: 18,
        secure_url:
          'https://res.cloudinary.com/sintetico/image/upload/v18/soho-prueba.png',
      }),
    );
    await expect(
      new CloudinaryService(config(), http).eliminar(archivo()),
    ).rejects.toThrow();
    expect(http).toHaveBeenCalledTimes(1);
  });
  it('borra por asset_id y confirma que desapareció', async () => {
    const http = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(recurso()))
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(json({}, 404));
    await new CloudinaryService(config(), http).eliminar(archivo());
    const llamada = http.mock.calls[1];
    expect(llamada[1]!.method).toBe('DELETE');
    expect((llamada[1]!.body as URLSearchParams).get('asset_ids[]')).toBe(
      'asset-prueba',
    );
  });
  it('sube comprobantes como autenticados, sin sobrescribir ni exponer el secreto', async () => {
    let formulario: FormData | undefined;
    let subido = false;
    const http = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
      const destino = url instanceof Request ? url.url : url.toString();
      if (destino.endsWith('/config?settings=true'))
        return json({ settings: { folder_mode: 'dynamic' } });
      if (destino.endsWith('/image/upload')) {
        formulario = init!.body as FormData;
        subido = true;
        return json({});
      }
      if (
        subido &&
        destino.endsWith(
          `/resources/image/authenticated/${idComprobante}?context=true`,
        )
      )
        return json(recursoComprobante());
      return json({}, 404);
    });
    await new CloudinaryService(config(), http).guardarComprobante(
      idComprobante,
      datosComprobante(),
    );
    expect(formulario!.get('type')).toBe('authenticated');
    expect(formulario!.get('overwrite')).toBe('false');
    expect(formulario!.get('asset_folder')).toBe('SOHO/comprobantes');
    expect(formulario!.get('public_id')).toBe(idComprobante);
    expect(formulario!.get('context')).toContain(
      `soho_hash=${datosComprobante().sha256}`,
    );
    expect(formulario!.has('api_secret')).toBe(false);
  });
  it('conserva la identidad en cuentas Cloudinary con carpetas fijas', async () => {
    let formulario: FormData | undefined,
      subido = false;
    const publicId = `SOHO/comprobantes/${idComprobante}`,
      http = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
        const destino = url instanceof Request ? url.url : url.toString();
        if (destino.endsWith('/config?settings=true'))
          return json({ settings: { folder_mode: 'fixed' } });
        if (destino.endsWith('/image/upload')) {
          formulario = init!.body as FormData;
          subido = true;
          return json({});
        }
        if (
          subido &&
          destino.endsWith(
            `/resources/image/authenticated/${publicId}?context=true`,
          )
        )
          return json({
            ...recursoComprobante(publicId),
            asset_folder: undefined,
            folder: 'SOHO/comprobantes',
          });
        return json({}, 404);
      });
    await new CloudinaryService(config(), http).guardarComprobante(
      idComprobante,
      datosComprobante(),
    );
    expect(formulario!.get('folder')).toBe('SOHO/comprobantes');
    expect(formulario!.has('asset_folder')).toBe(false);
    expect(formulario!.get('public_id')).toBe(idComprobante);
  });
  it('entrega una transformación WebP mediante URL autenticada y verifica el original', async () => {
    const optimizada = Buffer.from('webp-optimizado');
    let urlEntrega = '';
    const http = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      const destino = url instanceof Request ? url.url : url.toString();
      if (destino.startsWith('https://res.cloudinary.com/')) {
        urlEntrega = destino;
        const transformada = destino.includes('f_webp');
        return new Response(transformada ? optimizada : bytesComprobante, {
          headers: {
            'content-type': transformada ? 'image/webp' : 'image/png',
          },
        });
      }
      return json(recursoComprobante());
    });
    const c = new CloudinaryService(config(), http);
    expect(await c.leerComprobante(idComprobante, datosComprobante())).toEqual(
      bytesComprobante,
    );
    expect(
      await c.leerComprobanteOptimizado(idComprobante, datosComprobante()),
    ).toEqual(optimizada);
    expect(urlEntrega).toContain('/image/authenticated/');
    expect(urlEntrega).toContain('/s--');
    expect(urlEntrega).toContain('f_webp');
  });
});
