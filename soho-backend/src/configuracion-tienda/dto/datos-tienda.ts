import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { objeto } from '../../autenticacion/acceso/datos-auth.js';

export class DatosTienda {
  static uuid(v: unknown): string {
    if (
      typeof v !== 'string' ||
      !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(v)
    )
      throw new BadRequestException('La clave de guardado no es válida.');
    return v.toLowerCase();
  }
  private static texto(
    v: unknown,
    maximo: number,
    multilinea = false,
  ): string | null {
    if (v === null) return null;
    if (typeof v !== 'string')
      throw new BadRequestException('El contenido de Tienda no es válido.');
    const t = v.normalize('NFC').trim();
    if (
      t.length > maximo ||
      /[\p{Cc}\p{Cf}]/u.test(multilinea ? t.replace(/[\r\n\t]/g, '') : t)
    )
      throw new BadRequestException(
        'Revisa la longitud y los caracteres de los campos de Tienda.',
      );
    return t || null;
  }
  static contenido(v: unknown) {
    const d = objeto(v, [
      'correo',
      'whatsapp',
      'horario',
      'enlaces',
      'politicas',
    ]);
    const correo = this.texto(d.correo, 160)?.toLowerCase() ?? null;
    if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(correo))
      throw new BadRequestException('Introduce un correo de atención válido.');
    const whatsapp = this.texto(d.whatsapp, 20)?.replace(/ /g, '') ?? null;
    if (whatsapp && !/^9\d{8}$/.test(whatsapp))
      throw new BadRequestException(
        'WhatsApp requiere nueve dígitos que comiencen con 9.',
      );
    if (!Array.isArray(d.enlaces) || d.enlaces.length !== 2)
      throw new BadRequestException(
        'Conserva las dos posiciones de enlaces de ayuda.',
      );
    const enlaces = d.enlaces.map((v) => {
      const e = objeto(v, ['texto', 'url']);
      const texto = this.texto(e.texto, 100) ?? '',
        url = this.texto(e.url, 2048);
      if (url) {
        if (!texto || !/^https?:\/\/[^\s/?#@]+(?:[/?#][^\s]*)?$/u.test(url))
          throw new BadRequestException(
            'Los enlaces requieren texto y una URL HTTP o HTTPS sin credenciales.',
          );
        try {
          const u = new URL(url);
          if (!u.hostname || u.username || u.password) throw Error();
        } catch {
          throw new BadRequestException(
            'La URL del enlace de ayuda no es válida.',
          );
        }
      }
      return { texto, url };
    });
    const p = objeto(d.politicas, ['cambios', 'privacidad', 'terminos']);
    return {
      correo,
      whatsapp: whatsapp || null,
      horario: this.texto(d.horario, 160),
      enlaces,
      politicas: {
        cambios: this.texto(p.cambios, 10000, true),
        privacidad: this.texto(p.privacidad, 10000, true),
        terminos: this.texto(p.terminos, 10000, true),
      },
    };
  }
  static guardar(v: unknown) {
    const d = objeto(v, ['claveSolicitud', 'versionEsperada', 'tienda']);
    if (
      typeof d.versionEsperada !== 'number' ||
      !Number.isSafeInteger(d.versionEsperada) ||
      d.versionEsperada < 0 ||
      d.versionEsperada >= 4294967295
    )
      throw new BadRequestException('La versión de Tienda no es válida.');
    return {
      claveSolicitud: this.uuid(d.claveSolicitud),
      versionEsperada: d.versionEsperada,
      tienda: this.contenido(d.tienda),
    };
  }
  static huella(v: unknown) {
    return createHash('sha256').update(JSON.stringify(v)).digest('hex');
  }
}
