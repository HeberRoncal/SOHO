import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import type { FotografiaPreparada } from '../../productos/fotografias/cloudinary.service.js';
import type { FotografiaRecibida } from '../../productos/fotografias/preparar-fotografia.service.js';
import { DatosPagos } from '../dto/datos-pagos.js';

@Injectable()
export class PrepararQrService {
  private activas = 0;
  async preparar(
    a: FotografiaRecibida | undefined,
  ): Promise<FotografiaPreparada> {
    if (this.activas >= 2)
      throw new ServiceUnavailableException(
        'Hay imágenes en proceso. Reintenta más adelante.',
      );
    this.activas++;
    try {
      if (
        !a ||
        !Buffer.isBuffer(a.buffer) ||
        a.buffer.length < 12 ||
        a.buffer.length > DatosPagos.maximoBytes
      )
        throw Error();
      const formato = a.buffer
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        ? 'png'
        : a.buffer[0] === 255 && a.buffer[1] === 216 && a.buffer[2] === 255
          ? 'jpeg'
          : a.buffer.toString('ascii', 0, 4) === 'RIFF' &&
              a.buffer.toString('ascii', 8, 12) === 'WEBP'
            ? 'webp'
            : null;
      if (!formato || a.mimetype !== 'image/' + formato) throw Error();
      if (formato !== 'jpeg' && this.animada(a.buffer, formato)) throw Error();
      const imagen = sharp(a.buffer, {
          failOn: 'warning',
          limitInputPixels: 4096 * 4096,
        }),
        meta = await imagen.metadata();
      if (
        meta.format !== formato ||
        (meta.pages ?? 1) !== 1 ||
        !meta.width ||
        !meta.height ||
        meta.width > 4096 ||
        meta.height > 4096
      )
        throw Error();
      // PNG sin pérdida: conserva margen, proporción y módulos, sin recortar ni reducir.
      const { data, info } = await imagen
        .rotate()
        .png()
        .timeout({ seconds: 5 })
        .toBuffer({ resolveWithObject: true });
      if (data.length > DatosPagos.maximoBytes) throw Error();
      const nombre =
        typeof a.originalname === 'string'
          ? a.originalname.normalize('NFC').replace(/[/\\]/g, '-').trim()
          : '';
      if (!nombre || nombre.length > 255 || /[\p{Cc}\p{Cf}]/u.test(nombre))
        throw Error();
      return {
        contenido: data,
        formato: 'png',
        mime: 'image/png',
        ancho: info.width,
        alto: info.height,
        hash: createHash('sha256').update(data).digest('hex'),
        hashOriginal: createHash('sha256').update(a.buffer).digest('hex'),
        nombre,
      };
    } catch {
      throw new BadRequestException(
        'Adjunta un QR PNG, JPEG o WebP estático válido, de hasta 2 MiB y 4096 píxeles por lado.',
      );
    } finally {
      this.activas--;
    }
  }
  private animada(b: Buffer, formato: 'png' | 'webp') {
    let p = formato === 'png' ? 8 : 12;
    while (p < b.length) {
      if (p + (formato === 'png' ? 12 : 8) > b.length) throw Error();
      const largo =
        formato === 'png' ? b.readUInt32BE(p) : b.readUInt32LE(p + 4);
      const tipo = b.toString(
        'ascii',
        p + (formato === 'png' ? 4 : 0),
        p + (formato === 'png' ? 8 : 4),
      );
      if (['acTL', 'ANIM', 'ANMF'].includes(tipo)) return true;
      if (
        formato === 'webp' &&
        tipo === 'VP8X' &&
        largo >= 1 &&
        (b[p + 8] & 2) !== 0
      )
        return true;
      p += largo + (formato === 'png' ? 12 : 8 + (largo % 2));
      if (p > b.length) throw Error();
    }
    return false;
  }
}
