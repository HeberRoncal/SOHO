import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import { objeto } from '../../autenticacion/acceso/datos-auth.js';
import { Prisma } from '../../generated/prisma/client.js';
import type {
  ActualizarCoberturaDto,
  CambioZonaEntrega,
} from '../dto/actualizar-cobertura.dto.js';
import { CodigoZonaPipe } from './codigo-zona.pipe.js';

@Injectable()
export class DatosCoberturaPipe implements PipeTransform<
  unknown,
  ActualizarCoberturaDto
> {
  transform(valor: unknown): ActualizarCoberturaDto {
    const datos = objeto(valor, ['version', 'zonas']);
    if (
      typeof datos.version !== 'string' ||
      datos.version.length !== 64 ||
      !/^[0-9a-f]{64}$/.test(datos.version)
    )
      throw new BadRequestException('Actualiza la cobertura antes de guardar.');
    if (!Array.isArray(datos.zonas) || datos.zonas.length !== 7)
      throw new BadRequestException(
        'Envía la configuración de los siete distritos.',
      );
    const codigos = new Set<string>();
    const zonas = datos.zonas.map((valorZona: unknown): CambioZonaEntrega => {
      const zona = objeto(valorZona, [
        'codigo',
        'tarifa',
        'plazo',
        'habilitada',
      ]);
      const codigo = new CodigoZonaPipe().transform(zona.codigo);
      if (codigos.has(codigo))
        throw new BadRequestException('No repitas distritos en la cobertura.');
      codigos.add(codigo);
      let tarifa: string | null = null;
      if (zona.tarifa !== null) {
        if (
          typeof zona.tarifa !== 'string' ||
          !/^(?:0|[1-9][0-9]{0,5})(?:\.[0-9]{1,2})?$/.test(zona.tarifa) ||
          /[^0-9.]/.test(zona.tarifa)
        )
          throw new BadRequestException(
            'La tarifa debe ser un importe de cero o más, con hasta dos decimales, o null si está pendiente.',
          );
        tarifa = new Prisma.Decimal(zona.tarifa).toFixed(2);
      }
      if (codigo === 'la-esperanza' && tarifa !== '0.00')
        throw new BadRequestException('El envío a La Esperanza es gratuito.');
      let plazo: string | null = null;
      if (zona.plazo !== null) {
        if (
          typeof zona.plazo !== 'string' ||
          /[\p{Cc}\p{Cf}]/u.test(zona.plazo) ||
          Array.from(zona.plazo.trim()).length > 80
        )
          throw new BadRequestException(
            'El tiempo estimado admite hasta 80 caracteres válidos.',
          );
        plazo = zona.plazo.trim() || null;
      }
      if (typeof zona.habilitada !== 'boolean')
        throw new BadRequestException(
          'Indica la habilitación de cada distrito con un booleano.',
        );
      return { codigo, tarifa, plazo, habilitada: zona.habilitada };
    });
    return { version: datos.version, zonas };
  }
}
