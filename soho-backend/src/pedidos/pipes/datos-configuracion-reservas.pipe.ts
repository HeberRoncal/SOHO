import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import { objeto } from '../../autenticacion/acceso/datos-auth.js';
import type { ActualizarConfiguracionReservasDto } from '../dto/actualizar-configuracion-reservas.dto.js';

@Injectable()
export class DatosConfiguracionReservasPipe implements PipeTransform<
  unknown,
  ActualizarConfiguracionReservasDto
> {
  transform(value: unknown): ActualizarConfiguracionReservasDto {
    const d = objeto(value, [
      'version',
      'confirmado',
      'modo',
      'horas',
      'accionVencimiento',
      'accionCancelacion',
    ]);
    if (
      !Number.isInteger(d.version) ||
      (d.version as number) < 1 ||
      (d.version as number) > 4294967295
    )
      throw new BadRequestException(
        'Consulta la versión vigente de la configuración antes de guardar.',
      );
    if (d.confirmado !== true)
      throw new BadRequestException(
        'Confirma el cambio de configuración antes de guardar.',
      );
    if (d.modo !== 'HASTA_DECISION' && d.modo !== 'TIEMPO')
      throw new BadRequestException(
        'Selecciona una política de reserva válida.',
      );
    if (
      d.accionCancelacion !== 'LIBERAR' &&
      d.accionCancelacion !== 'PREGUNTAR'
    )
      throw new BadRequestException(
        'Selecciona liberar o preguntar al cancelar un pedido.',
      );
    if (d.modo === 'HASTA_DECISION') {
      if (d.horas !== null || d.accionVencimiento !== null)
        throw new BadRequestException(
          'La reserva hasta decisión requiere horas y acción de vencimiento en null.',
        );
    } else if (
      !Number.isInteger(d.horas) ||
      (d.horas as number) < 1 ||
      (d.horas as number) > 999999 ||
      (d.accionVencimiento !== 'LIBERAR_Y_ALERTAR' &&
        d.accionVencimiento !== 'SOLO_ALERTAR')
    )
      throw new BadRequestException(
        'La reserva temporal requiere de 1 a 999999 horas enteras y una acción de vencimiento válida.',
      );
    return {
      version: d.version as number,
      confirmado: true,
      modo: d.modo,
      horas: d.horas as number | null,
      accionVencimiento:
        d.accionVencimiento as ActualizarConfiguracionReservasDto['accionVencimiento'],
      accionCancelacion: d.accionCancelacion,
    };
  }
}
