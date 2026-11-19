import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import {
  link,
  mkdir,
  open,
  readFile,
  readdir,
  stat,
  unlink,
} from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import {
  ConfiguracionPedidos,
  MAXIMO_COMPROBANTE,
} from '../configuracion-pedidos.js';
import type { CreatePedidoDto } from '../dto/create-pedido.dto.js';
import { CloudinaryService } from '../../productos/fotografias/cloudinary.service.js';

export interface ArchivoPreparado {
  contenido: Buffer;
  formato: string;
  extension: string;
  sha256: string;
}
export interface ArchivoGuardado {
  clave: string;
  sha256: string;
  formato: string;
  tamanoBytes: number;
}

@Injectable()
export class ComprobantesPrivadosService {
  private readonly log = new Logger(ComprobantesPrivadosService.name);
  private procesando = 0;

  constructor(
    @Inject(ConfiguracionPedidos) private readonly config: ConfiguracionPedidos,
    @Optional()
    @Inject(CloudinaryService)
    private readonly cloudinary?: CloudinaryService,
  ) {}

  private get almacenamientoLocalPruebas(): boolean {
    return process.env.NODE_ENV === 'test';
  }

  private cloudinaryRequerido(): CloudinaryService {
    if (!this.cloudinary)
      throw new ServiceUnavailableException(
        'Completa la configuración de Cloudinary en el backend.',
      );
    this.cloudinary.config.exigir();
    return this.cloudinary;
  }

  private claveCloudinary(clave: string): string {
    const coincidencia =
      /^cloudinary\/comprobantes\/([0-9a-f-]{36})\.(png|jpg|webp)$/.exec(clave);
    if (!coincidencia)
      throw new ServiceUnavailableException(
        'No se pudo recuperar el comprobante.',
      );
    return coincidencia[1];
  }

  private nuevaClave(extension: string): string {
    if (this.almacenamientoLocalPruebas)
      return `comprobantes/${randomUUID()}.${extension}`;
    this.cloudinaryRequerido();
    return `cloudinary/comprobantes/${randomUUID()}.${extension}`;
  }

  decodificar(base64: string): Buffer {
    const contenido = Buffer.from(base64, 'base64');
    if (
      !contenido.length ||
      contenido.length > MAXIMO_COMPROBANTE ||
      contenido.toString('base64') !== base64
    )
      throw new BadRequestException(
        'El comprobante debe contener base64 canónico de hasta 5 MiB.',
      );
    return contenido;
  }

  async preparar(
    contenido: Buffer,
    declarado: CreatePedidoDto['comprobante']['tipoArchivo'],
  ): Promise<ArchivoPreparado> {
    if (this.procesando >= 2)
      throw new ServiceUnavailableException(
        'Hay comprobantes en proceso. Reintenta con la misma clave de creación.',
      );
    this.procesando++;
    try {
      const formato = contenido
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        ? 'png'
        : contenido[0] === 255 && contenido[1] === 216 && contenido[2] === 255
          ? 'jpeg'
          : contenido.toString('ascii', 0, 4) === 'RIFF' &&
              contenido.toString('ascii', 8, 12) === 'WEBP'
            ? 'webp'
            : null;
      if (!formato || declarado !== `image/${formato}`) throw Error('Formato');
      const imagen = sharp(contenido, {
        failOn: 'warning',
        limitInputPixels: 20_000_000,
      });
      const metadatos = await imagen.metadata();
      if (
        metadatos.format !== formato ||
        (metadatos.pages ?? 1) !== 1 ||
        !metadatos.width ||
        !metadatos.height ||
        metadatos.width > 8192 ||
        metadatos.height > 8192
      )
        throw Error('Dimensiones');
      // Decodifica realmente todos los píxeles y elimina metadatos y contenido añadido.
      const salida = await imagen
        .rotate()
        .toFormat(
          formato,
          formato === 'jpeg'
            ? { quality: 95, chromaSubsampling: '4:4:4' }
            : formato === 'webp'
              ? { lossless: true }
              : {},
        )
        .timeout({ seconds: 5 })
        .toBuffer();
      if (salida.length > MAXIMO_COMPROBANTE) throw Error('Tamaño');
      return {
        contenido: salida,
        formato: declarado,
        extension: formato === 'jpeg' ? 'jpg' : formato,
        sha256: createHash('sha256').update(salida).digest('hex'),
      };
    } catch {
      throw new BadRequestException(
        'Adjunta una imagen PNG, JPEG o WebP válida, estática, de hasta 5 MiB y 20 megapíxeles.',
      );
    } finally {
      this.procesando--;
    }
  }

  private ruta(clave: string): string {
    if (!/^comprobantes\/[0-9a-f-]{36}\.(png|jpg|webp)$/.test(clave))
      throw new ServiceUnavailableException(
        'No se pudo recuperar el comprobante.',
      );
    return join(this.config.directorio, clave);
  }

  async guardar(archivo: ArchivoPreparado): Promise<ArchivoGuardado> {
    if (!this.almacenamientoLocalPruebas) {
      const reserva = this.reservar(archivo);
      try {
        await this.guardarReservado(reserva, archivo);
        return reserva;
      } catch (error) {
        await this.eliminar(reserva.clave);
        throw error;
      }
    }
    const clave = this.nuevaClave(archivo.extension);
    let creado = false;
    try {
      await mkdir(join(this.config.directorio, 'comprobantes'), {
        recursive: true,
        mode: 0o700,
      });
      const fichero = await open(this.ruta(clave), 'wx', 0o600);
      creado = true;
      try {
        await fichero.writeFile(archivo.contenido);
      } finally {
        await fichero.close();
      }
      return {
        clave,
        formato: archivo.formato,
        sha256: archivo.sha256,
        tamanoBytes: archivo.contenido.length,
      };
    } catch {
      if (creado) await this.eliminar(clave);
      throw new ServiceUnavailableException(
        'No se pudo guardar el comprobante. Reintenta con la misma clave de creación.',
      );
    }
  }

  async eliminar(clave: string): Promise<void> {
    if (clave.startsWith('cloudinary/')) {
      try {
        await this.cloudinaryRequerido().eliminarComprobante(
          this.claveCloudinary(clave),
        );
      } catch {
        this.log.error(
          'No se pudo retirar un comprobante huérfano; revisar el almacenamiento privado.',
        );
      }
      return;
    }
    try {
      await unlink(this.ruta(clave));
    } catch (error) {
      if (!(
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      ))
        this.log.error(
          'No se pudo retirar un comprobante huérfano; revisar el almacenamiento privado.',
        );
    }
  }

  reservar(archivo: ArchivoPreparado): ArchivoGuardado {
    return {
      clave: this.nuevaClave(archivo.extension),
      sha256: archivo.sha256,
      formato: archivo.formato,
      tamanoBytes: archivo.contenido.length,
    };
  }

  private validarReserva(a: ArchivoGuardado) {
    const extension = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/webp': 'webp',
    }[a.formato];
    const claveValida =
      /^comprobantes\/[0-9a-f-]{36}\.(png|jpg|webp)$/.test(a.clave) ||
      /^cloudinary\/comprobantes\/[0-9a-f-]{36}\.(png|jpg|webp)$/.test(a.clave);
    if (
      !extension ||
      !a.clave.endsWith('.' + extension) ||
      !claveValida ||
      !/^[0-9a-f]{64}$/.test(a.sha256) ||
      !Number.isSafeInteger(a.tamanoBytes) ||
      a.tamanoBytes < 1 ||
      a.tamanoBytes > MAXIMO_COMPROBANTE
    )
      throw new ServiceUnavailableException(
        'La identidad del comprobante requiere revisión.',
      );
    if (a.clave.startsWith('cloudinary/')) {
      if (this.almacenamientoLocalPruebas)
        throw new ServiceUnavailableException(
          'El comprobante no está disponible en este entorno.',
        );
      this.cloudinaryRequerido();
      return null;
    }
    return this.ruta(a.clave);
  }

  reservarCopia(origen: ArchivoGuardado): ArchivoGuardado {
    this.validarReserva(origen);
    return {
      ...origen,
      clave: this.nuevaClave(origen.clave.split('.').pop()!),
    };
  }

  async copiarReservado(origen: ArchivoGuardado, destino: ArchivoGuardado) {
    this.validarReserva(origen);
    this.validarReserva(destino);
    if (
      origen.clave === destino.clave ||
      origen.sha256 !== destino.sha256 ||
      origen.formato !== destino.formato ||
      origen.tamanoBytes !== destino.tamanoBytes
    )
      throw new ServiceUnavailableException(
        'La copia privada no corresponde al comprobante fuente.',
      );
    const contenido = await this.leer(
      origen.clave,
      origen.sha256,
      origen.tamanoBytes,
    );
    await this.guardarReservado(destino, {
      contenido,
      sha256: origen.sha256,
      formato: origen.formato,
      extension: origen.clave.split('.').pop()!,
    });
  }

  async comprobarReservado(archivo: ArchivoGuardado): Promise<boolean> {
    const ruta = this.validarReserva(archivo);
    if (ruta === null)
      return this.cloudinaryRequerido().comprobarComprobante(
        this.claveCloudinary(archivo.clave),
        archivo,
      );
    try {
      await stat(ruta);
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      )
        return this.recuperarTemporal(archivo, ruta);
      throw new ServiceUnavailableException(
        'El comprobante no está disponible temporalmente.',
      );
    }
    await this.leer(archivo.clave, archivo.sha256, archivo.tamanoBytes);
    return true;
  }

  private async recuperarTemporal(
    archivo: ArchivoGuardado,
    ruta: string,
  ): Promise<boolean> {
    const carpeta = join(this.config.directorio, 'comprobantes'),
      nombre = archivo.clave.split('/')[1];
    let entradas;
    try {
      entradas = await readdir(carpeta, { withFileTypes: true });
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      )
        return false;
      throw new ServiceUnavailableException(
        'El almacenamiento privado no está disponible temporalmente.',
      );
    }
    for (const entrada of entradas) {
      if (
        !entrada.isFile() ||
        !entrada.name.startsWith(nombre + '.') ||
        !/^[0-9a-f-]{36}\.tmp$/.test(entrada.name.slice(nombre.length + 1))
      )
        continue;
      const temporal = join(carpeta, entrada.name);
      let fichero;
      try {
        fichero = await open(temporal, 'r+');
      } catch (error) {
        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === 'ENOENT'
        )
          continue;
        throw new ServiceUnavailableException(
          'El comprobante temporal no está disponible.',
        );
      }
      let completo = false;
      try {
        const datos = await fichero.stat();
        if (datos.size !== archivo.tamanoBytes) continue;
        const contenido = await fichero.readFile();
        if (
          createHash('sha256').update(contenido).digest('hex') !==
          archivo.sha256
        )
          continue;
        await fichero.sync();
        try {
          await link(temporal, ruta);
        } catch (error) {
          if (!(
            error &&
            typeof error === 'object' &&
            'code' in error &&
            (error.code === 'EEXIST' || error.code === 'ENOENT')
          ))
            throw error;
        }
        await this.leer(archivo.clave, archivo.sha256, archivo.tamanoBytes);
        completo = true;
      } finally {
        await fichero.close();
      }
      if (completo) {
        try {
          await unlink(temporal);
        } catch (error) {
          if (!(
            error &&
            typeof error === 'object' &&
            'code' in error &&
            error.code === 'ENOENT'
          ))
            this.log.error(
              'Quedó un temporal de comprobante confirmado para mantenimiento privado.',
            );
        }
        return true;
      }
    }
    return false;
  }

  async guardarReservado(
    reserva: ArchivoGuardado,
    archivo: ArchivoPreparado,
  ): Promise<void> {
    const ruta = this.validarReserva(reserva);
    if (
      archivo.formato !== reserva.formato ||
      archivo.contenido.length !== reserva.tamanoBytes ||
      createHash('sha256').update(archivo.contenido).digest('hex') !==
        reserva.sha256
    )
      throw new ServiceUnavailableException(
        'El contenido no corresponde al comprobante reservado.',
      );
    if (ruta === null) {
      try {
        await this.cloudinaryRequerido().guardarComprobante(
          this.claveCloudinary(reserva.clave),
          { ...archivo, tamanoBytes: archivo.contenido.length },
        );
        return;
      } catch {
        throw new ServiceUnavailableException(
          'No se pudo confirmar el archivo privado. Conserva la referencia de recepción.',
        );
      }
    }
    if (await this.comprobarReservado(reserva)) return;
    const temporal = ruta + '.' + randomUUID() + '.tmp';
    let creado = false;
    try {
      await mkdir(join(this.config.directorio, 'comprobantes'), {
        recursive: true,
        mode: 0o700,
      });
      const fichero = await open(temporal, 'wx', 0o600);
      creado = true;
      try {
        await fichero.writeFile(archivo.contenido);
        await fichero.sync();
      } finally {
        await fichero.close();
      }
      // Publica bytes completos sin reemplazar una identidad existente; también entre procesos.
      try {
        await link(temporal, ruta);
      } catch (error) {
        if (!(await this.comprobarReservado(reserva))) throw error;
      }
      if (!(await this.comprobarReservado(reserva)))
        throw Error('Archivo ausente');
    } catch {
      throw new ServiceUnavailableException(
        'No se pudo confirmar el archivo privado. Conserva la referencia de recepción.',
      );
    } finally {
      if (creado) {
        try {
          await unlink(temporal);
        } catch (error) {
          if (!(
            error &&
            typeof error === 'object' &&
            'code' in error &&
            error.code === 'ENOENT'
          ))
            this.log.error(
              'No se pudo retirar un temporal de comprobante; revisar el almacenamiento privado.',
            );
        }
      }
    }
  }

  async leer(
    clave: string,
    sha256: string,
    tamanoBytes: number,
  ): Promise<Buffer> {
    if (clave.startsWith('cloudinary/')) {
      try {
        return await this.cloudinaryRequerido().leerComprobante(
          this.claveCloudinary(clave),
          {
            formato: this.formatoDesdeClave(clave),
            sha256,
            tamanoBytes,
          },
        );
      } catch {
        throw new ServiceUnavailableException(
          'El comprobante no está disponible temporalmente.',
        );
      }
    }
    try {
      const contenido = await readFile(this.ruta(clave));
      if (
        contenido.length !== tamanoBytes ||
        contenido.length > MAXIMO_COMPROBANTE ||
        createHash('sha256').update(contenido).digest('hex') !== sha256
      )
        throw Error('Integridad');
      return contenido;
    } catch {
      throw new ServiceUnavailableException(
        'El comprobante no está disponible temporalmente.',
      );
    }
  }

  async leerOptimizado(
    clave: string,
    sha256: string,
    formato: string,
    tamanoBytes: number,
  ): Promise<{ contenido: Buffer; formato: string }> {
    const archivo = { clave, sha256, formato, tamanoBytes };
    this.validarReserva(archivo);
    if (clave.startsWith('cloudinary/')) {
      try {
        return {
          contenido: await this.cloudinaryRequerido().leerComprobanteOptimizado(
            this.claveCloudinary(clave),
            { formato, sha256, tamanoBytes },
          ),
          formato: 'image/webp',
        };
      } catch {
        throw new ServiceUnavailableException(
          'El comprobante no está disponible temporalmente.',
        );
      }
    }
    const contenido = await this.leer(clave, sha256, tamanoBytes);
    try {
      return {
        contenido: await sharp(contenido, {
          failOn: 'warning',
          limitInputPixels: 20_000_000,
        })
          .rotate()
          .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 85 })
          .timeout({ seconds: 5 })
          .toBuffer(),
        formato: 'image/webp',
      };
    } catch {
      throw new ServiceUnavailableException(
        'El comprobante no está disponible temporalmente.',
      );
    }
  }

  private formatoDesdeClave(clave: string): string {
    const extension = /\.(png|jpg|webp)$/.exec(clave)?.[1];
    if (!extension)
      throw new ServiceUnavailableException(
        'El comprobante no está disponible temporalmente.',
      );
    return extension === 'jpg' ? 'image/jpeg' : `image/${extension}`;
  }
}
