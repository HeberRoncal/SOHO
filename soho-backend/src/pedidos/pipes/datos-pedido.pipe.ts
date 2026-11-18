import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import { objeto } from '../../autenticacion/acceso/datos-auth.js';
import {
  DatosPreparacionPedido,
  texto,
} from '../preparacion/datos-preparacion-pedido.js';
import type { CreatePedidoDto } from '../dto/create-pedido.dto.js';
import { MAXIMO_BASE64, UUID_PEDIDO } from '../configuracion-pedidos.js';

@Injectable()
export class DatosPedidoPipe implements PipeTransform {
  transform(valor: unknown): CreatePedidoDto {
    const d = objeto(valor, [
      'claveCreacion',
      'contacto',
      'entrega',
      'facturacion',
      'articulos',
      'cotizacion',
      'metodoPago',
      'comprobante',
    ]);
    if (
      typeof d.claveCreacion !== 'string' ||
      !UUID_PEDIDO.test(d.claveCreacion)
    )
      throw new BadRequestException(
        'La clave de creación debe ser un UUID v4.',
      );
    const { contacto, entrega, facturacion, articulos, cotizacion } =
      DatosPreparacionPedido.validar({
        contacto: d.contacto,
        entrega: d.entrega,
        facturacion: d.facturacion,
        articulos: d.articulos,
        cotizacion: d.cotizacion,
      });
    if (d.metodoPago !== 'YAPE' && d.metodoPago !== 'PLIN')
      throw new BadRequestException('Selecciona YAPE o PLIN.');
    return {
      claveCreacion: d.claveCreacion,
      contacto,
      entrega,
      facturacion,
      articulos,
      cotizacion,
      metodoPago: d.metodoPago,
      comprobante: validarComprobante(d.comprobante),
    };
  }
}

export function validarComprobante(
  valor: unknown,
): CreatePedidoDto['comprobante'] {
  const a = objeto(valor, [
    'nombreArchivo',
    'tipoArchivo',
    'contenidoBase64',
    'numeroOperacion',
  ]);
  if (
    a.tipoArchivo !== 'image/png' &&
    a.tipoArchivo !== 'image/jpeg' &&
    a.tipoArchivo !== 'image/webp'
  )
    throw new BadRequestException('Adjunta un comprobante PNG, JPEG o WebP.');
  if (
    typeof a.contenidoBase64 !== 'string' ||
    !a.contenidoBase64.length ||
    a.contenidoBase64.length > MAXIMO_BASE64 ||
    a.contenidoBase64.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(a.contenidoBase64)
  )
    throw new BadRequestException(
      'El comprobante debe contener base64 válido, sin prefijo data:, de hasta 5 MiB.',
    );
  const nombreArchivo = texto(a.nombreArchivo, 1, 255);
  if (/[\\/]/.test(nombreArchivo))
    throw new BadRequestException('Envía solo el nombre del archivo.');
  const numeroOperacion =
    a.numeroOperacion === undefined
      ? undefined
      : texto(a.numeroOperacion, 1, 12);
  if (numeroOperacion !== undefined && !/^[0-9]{1,12}$/.test(numeroOperacion))
    throw new BadRequestException(
      'El número de operación admite hasta doce dígitos.',
    );
  return {
    nombreArchivo,
    tipoArchivo: a.tipoArchivo,
    contenidoBase64: a.contenidoBase64,
    ...(numeroOperacion === undefined ? {} : { numeroOperacion }),
  };
}
