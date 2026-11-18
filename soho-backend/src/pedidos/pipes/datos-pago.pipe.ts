import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import { objeto } from '../../autenticacion/acceso/datos-auth.js';
import type { DecisionPagoDto } from '../dto/decision-pago.dto.js';
import type { CorregirComprobanteDto } from '../dto/corregir-comprobante.dto.js';
import { validarComprobante } from './datos-pedido.pipe.js';

function versiones(d: Record<string, unknown>) {
  if (
    ![d.versionPedido, d.versionPago].every(
      (v) =>
        Number.isInteger(v) && (v as number) > 0 && (v as number) < 4294967295,
    ) ||
    typeof d.comprobanteId !== 'string' ||
    !/^[0-9a-f-]{36}$/.test(d.comprobanteId)
  )
    throw new BadRequestException('Actualiza el pedido antes de decidir.');
  return {
    versionPedido: d.versionPedido as number,
    versionPago: d.versionPago as number,
    comprobanteId: d.comprobanteId,
  };
}

@Injectable()
export class DatosPagoPipe implements PipeTransform {
  transform(value: unknown): DecisionPagoDto {
    const d = objeto(value, [
      'versionPedido',
      'versionPago',
      'comprobanteId',
      'accion',
      'confirmado',
      'motivo',
      'mensaje',
      'solicitud',
    ]);
    const base = versiones(d);
    if (!['APROBADO', 'OBSERVADO', 'RECHAZADO'].includes(d.accion as string))
      throw new BadRequestException('Selecciona una decisión válida.');
    if (d.accion === 'APROBADO') {
      if (
        d.confirmado !== true ||
        d.motivo !== undefined ||
        d.mensaje !== undefined ||
        d.solicitud !== undefined
      )
        throw new BadRequestException('Confirma la verificación del ingreso.');
      return { ...base, accion: 'APROBADO', confirmado: true };
    }
    if (
      !['ILEGIBLE', 'MONTO', 'INGRESO', 'DATOS', 'OTRO'].includes(
        d.motivo as string,
      ) ||
      typeof d.mensaje !== 'string'
    )
      throw new BadRequestException('Indica motivo y mensaje.');
    const mensaje = d.mensaje.trim();
    if (
      Array.from(mensaje).length < 10 ||
      Array.from(mensaje).length > 500 ||
      /[\p{Cc}\p{Cf}]/u.test(mensaje)
    )
      throw new BadRequestException(
        'El mensaje debe tener entre 10 y 500 caracteres, sin caracteres de control.',
      );
    if (
      d.accion === 'OBSERVADO' &&
      !['LEGIBLE', 'CORREGIDO'].includes(d.solicitud as string)
    )
      throw new BadRequestException('Indica qué comprobante se solicita.');
    if (
      d.accion === 'RECHAZADO' &&
      (d.confirmado !== true || d.solicitud !== undefined)
    )
      throw new BadRequestException('Confirma el rechazo.');
    return {
      ...base,
      accion: d.accion as 'OBSERVADO' | 'RECHAZADO',
      motivo: d.motivo as DecisionPagoDto['motivo'],
      mensaje,
      ...(d.accion === 'OBSERVADO'
        ? { solicitud: d.solicitud as 'LEGIBLE' | 'CORREGIDO' }
        : { confirmado: true }),
    };
  }
}

export function datosCorreccion(value: unknown): CorregirComprobanteDto {
  const d = objeto(value, [
    'versionPedido',
    'versionPago',
    'comprobanteId',
    'comprobante',
  ]);
  return { ...versiones(d), comprobante: validarComprobante(d.comprobante) };
}
