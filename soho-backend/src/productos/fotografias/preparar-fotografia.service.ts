import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { MAXIMO_FOTOGRAFIA } from './configuracion-cloudinary.js';
import type { FotografiaPreparada } from './cloudinary.service.js';

export interface FotografiaRecibida {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

@Injectable()
export class PrepararFotografiaService {
  private procesando = 0;
  async preparar(
    archivo: FotografiaRecibida | undefined,
  ): Promise<FotografiaPreparada> {
    if (this.procesando >= 2)
      throw new ServiceUnavailableException(
        'Hay fotografías en proceso. Reintenta más adelante.',
      );
    this.procesando++;
    try {
      if (
        !archivo ||
        !Buffer.isBuffer(archivo.buffer) ||
        archivo.buffer.length < 12 ||
        archivo.buffer.length > MAXIMO_FOTOGRAFIA
      )
        throw Error('Archivo');
      const original = archivo.buffer;
      const formato = original
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        ? 'png'
        : original[0] === 255 && original[1] === 216 && original[2] === 255
          ? 'jpeg'
          : original.toString('ascii', 0, 4) === 'RIFF' &&
              original.toString('ascii', 8, 12) === 'WEBP'
            ? 'webp'
            : original.toString('ascii', 4, 8) === 'ftyp'
              ? 'avif'
              : null;
      if (!formato || archivo.mimetype !== 'image/' + formato)
        throw Error('Formato');
      const imagen = sharp(original, {
        failOn: 'warning',
        limitInputPixels: 20_000_000,
      });
      const meta = await imagen.metadata();
      if (
        (formato === 'avif'
          ? meta.format !== 'heif' || meta.compression !== 'av1'
          : meta.format !== formato) ||
        (meta.pages ?? 1) !== 1 ||
        !meta.width ||
        !meta.height ||
        meta.width > 8192 ||
        meta.height > 8192
      )
        throw Error('Dimensiones');
      const formatoSalida = formato === 'avif' ? 'webp' : formato;
      const { data, info } = await imagen
        .rotate()
        .toFormat(
          formatoSalida,
          formatoSalida === 'jpeg'
            ? { quality: 95, chromaSubsampling: '4:4:4' }
            : formatoSalida === 'webp'
              ? { lossless: true }
              : {},
        )
        .timeout({ seconds: 5 })
        .toBuffer({ resolveWithObject: true });
      if (data.length > MAXIMO_FOTOGRAFIA) throw Error('Tamaño');
      const nombre =
        typeof archivo.originalname === 'string'
          ? archivo.originalname.normalize('NFC').replace(/[/\\]/g, '-').trim()
          : '';
      if (!nombre || nombre.length > 255 || /[\p{Cc}\p{Cf}]/u.test(nombre))
        throw Error('Nombre');
      return {
        contenido: data,
        formato: formatoSalida === 'jpeg' ? 'jpg' : formatoSalida,
        mime: ('image/' + formatoSalida) as FotografiaPreparada['mime'],
        ancho: info.width,
        alto: info.height,
        hash: createHash('sha256').update(data).digest('hex'),
        hashOriginal: createHash('sha256').update(original).digest('hex'),
        nombre,
      };
    } catch {
      throw new BadRequestException(
        'Adjunta una fotografía JPEG, PNG, WebP o AVIF estática válida, de hasta 5 MiB, 20 megapíxeles y 8192 píxeles por lado.',
      );
    } finally {
      this.procesando--;
    }
  }
}
