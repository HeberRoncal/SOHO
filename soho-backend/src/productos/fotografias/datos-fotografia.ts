import { BadRequestException } from '@nestjs/common';
import type { ArchivoImagen } from '../../generated/prisma/client.js';
import { objeto } from '../../autenticacion/acceso/datos-auth.js';
import { idProducto } from '../dto/consulta-productos.js';
import { versionBorrador } from '../borradores/datos-borrador.js';

export class DatosFotografia {
  static carga(cuerpo: unknown) {
    const q = objeto(cuerpo, ['datos']);
    if (typeof q.datos !== 'string' || q.datos.length > 4096)
      throw new BadRequestException('Envía el campo datos como JSON.');
    let valor: unknown;
    try {
      valor = JSON.parse(q.datos) as unknown;
    } catch {
      throw new BadRequestException('El JSON de datos no es válido.');
    }
    const datos = objeto(valor, ['claveCarga', 'version']);
    return {
      claveCarga: idProducto(datos.claveCarga).toLowerCase(),
      version: versionBorrador(datos.version),
    };
  }
  static galeria(valor: unknown) {
    const datos = objeto(valor, ['claveSolicitud', 'version', 'imagenes']);
    if (!Array.isArray(datos.imagenes) || datos.imagenes.length > 8)
      throw new BadRequestException(
        'La galería admite hasta ocho fotografías.',
      );
    const imagenes = datos.imagenes.map((v: unknown) => {
      const i = objeto(v, ['archivoId', 'textoAlternativo']);
      const texto = i.textoAlternativo ?? '';
      if (
        typeof texto !== 'string' ||
        texto.length > 160 ||
        /[\p{Cc}\p{Cf}]/u.test(texto)
      )
        throw new BadRequestException('El texto alternativo no es válido.');
      return {
        archivoId: idProducto(i.archivoId).toLowerCase(),
        textoAlternativo: texto.trim(),
      };
    });
    if (new Set(imagenes.map((i) => i.archivoId)).size !== imagenes.length)
      throw new BadRequestException('No repitas archivos en la galería.');
    return {
      claveSolicitud: idProducto(datos.claveSolicitud).toLowerCase(),
      version: versionBorrador(datos.version),
      imagenes,
    };
  }
  static archivo(a: ArchivoImagen) {
    return {
      id: a.id,
      estado: a.estado,
      proveedor: a.proveedor,
      nombre: a.nombreOriginal,
      url: a.urlEntrega,
      formato: a.formato,
      ancho: a.ancho,
      alto: a.alto,
      bytes: a.bytes,
      versionCloudinary: a.versionCloudinary?.toString() ?? null,
      creadoEn: a.creadoEn.toISOString(),
      revisionEn: a.proximaRevisionEn?.toISOString() ?? null,
      limpiezaDesde: a.limpiarDesde?.toISOString() ?? null,
    };
  }
}
