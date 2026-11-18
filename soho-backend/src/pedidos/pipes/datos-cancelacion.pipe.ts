import { BadRequestException, type PipeTransform } from '@nestjs/common';
import { objeto } from '../../autenticacion/acceso/datos-auth.js';
import type { CancelarPedidoDto } from '../dto/cancelar-pedido.dto.js';
import type { LiberarReservasCancelacionDto } from '../dto/liberar-reservas-cancelacion.dto.js';

export class DatosCancelacionPipe implements PipeTransform {
  constructor(private readonly accion: 'CANCELAR' | 'LIBERAR') {}

  transform(value: unknown): CancelarPedidoDto | LiberarReservasCancelacionDto {
    const d = objeto(value, [
      'versionPedido',
      'versionPago',
      'confirmado',
      ...(this.accion === 'CANCELAR'
        ? ['motivo', 'decisionReservasConsultadas']
        : []),
    ]);
    if (
      ![d.versionPedido, d.versionPago].every(
        (v) =>
          Number.isInteger(v) &&
          (v as number) > 0 &&
          (v as number) <= 4294967295,
      ) ||
      d.versionPedido === 4294967295
    )
      throw new BadRequestException(
        'Actualiza las versiones del pedido y del pago antes de continuar.',
      );
    if (d.confirmado !== true)
      throw new BadRequestException('Confirma la acción antes de continuar.');
    const base = {
      versionPedido: d.versionPedido as number,
      versionPago: d.versionPago as number,
      confirmado: true as const,
    };
    if (this.accion === 'LIBERAR') return base;
    if (typeof d.motivo !== 'string')
      throw new BadRequestException('Indica el motivo de cancelación.');
    const motivo = d.motivo.trim();
    if (
      Array.from(motivo).length < 10 ||
      Array.from(motivo).length > 300 ||
      /[\p{Cc}\p{Cf}]/u.test(d.motivo.replace(/[\r\n]/g, ''))
    )
      throw new BadRequestException(
        'El motivo debe tener entre 10 y 300 caracteres válidos.',
      );
    if (
      d.decisionReservasConsultadas !== undefined &&
      !['LIBERAR', 'CONSERVAR'].includes(
        d.decisionReservasConsultadas as string,
      )
    )
      throw new BadRequestException(
        'Elige liberar o conservar las reservas consultadas.',
      );
    return {
      ...base,
      motivo,
      ...(d.decisionReservasConsultadas !== undefined
        ? {
            decisionReservasConsultadas: d.decisionReservasConsultadas as
              'LIBERAR' | 'CONSERVAR',
          }
        : {}),
    };
  }
}
