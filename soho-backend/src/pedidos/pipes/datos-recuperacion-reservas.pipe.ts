import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import { objeto } from '../../autenticacion/acceso/datos-auth.js';
import type { RecuperarReservasDto } from '../dto/recuperar-reservas.dto.js';

@Injectable()
export class DatosRecuperacionReservasPipe implements PipeTransform {
  transform(value: unknown): RecuperarReservasDto {
    const d = objeto(value, [
      'versionPedido',
      'versionPago',
      'motivo',
      'confirmado',
    ]);
    if (
      !Number.isInteger(d.versionPedido) ||
      (d.versionPedido as number) < 1 ||
      (d.versionPedido as number) >= 4294967295 ||
      !Number.isInteger(d.versionPago) ||
      (d.versionPago as number) < 1 ||
      (d.versionPago as number) > 4294967295
    )
      throw new BadRequestException(
        'Actualiza las versiones del pedido y del pago.',
      );
    if (d.confirmado !== true)
      throw new BadRequestException('Confirma la recuperación de reservas.');
    if (
      typeof d.motivo !== 'string' ||
      Array.from(d.motivo.trim()).length < 10 ||
      Array.from(d.motivo.trim()).length > 300 ||
      /[\p{Cc}\p{Cf}]/u.test(d.motivo.replace(/[\r\n]/g, ''))
    )
      throw new BadRequestException(
        'El motivo debe tener entre 10 y 300 caracteres válidos.',
      );
    return {
      versionPedido: d.versionPedido as number,
      versionPago: d.versionPago as number,
      motivo: d.motivo.trim(),
      confirmado: true,
    };
  }
}
