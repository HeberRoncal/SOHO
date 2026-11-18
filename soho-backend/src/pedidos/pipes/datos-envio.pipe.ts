import { BadRequestException, type PipeTransform } from '@nestjs/common';
import { objeto } from '../../autenticacion/acceso/datos-auth.js';
import type {
  AccionEntrega,
  CambioEntregaDto,
} from '../dto/cambio-entrega.dto.js';

export class DatosEnvioPipe implements PipeTransform {
  constructor(private readonly accion: AccionEntrega) {}

  transform(value: unknown): CambioEntregaDto {
    const d = objeto(value, [
      'versionPedido',
      'nota',
      ...(this.accion === 'ENVIAR'
        ? ['transportista', 'referenciaSeguimiento']
        : []),
      ...(this.accion === 'ENTREGAR' ? ['confirmado'] : []),
    ]);
    if (
      !Number.isInteger(d.versionPedido) ||
      (d.versionPedido as number) < 1 ||
      (d.versionPedido as number) >= 4294967295
    )
      throw new BadRequestException(
        'Actualiza la versión del pedido antes de continuar.',
      );
    const texto = (
      v: unknown,
      min: number,
      max: number,
      multilinea = false,
    ) => {
      if (typeof v !== 'string')
        throw new BadRequestException('Los datos del envío deben ser texto.');
      const t = v.trim(),
        controles = multilinea ? v.replace(/[\r\n]/g, '') : v;
      if (
        Array.from(t).length < min ||
        Array.from(t).length > max ||
        /[\p{Cc}\p{Cf}]/u.test(controles)
      )
        throw new BadRequestException(
          `El texto debe tener entre ${min} y ${max} caracteres válidos.`,
        );
      return t;
    };
    const base = {
      versionPedido: d.versionPedido as number,
      nota: texto(d.nota ?? '', 0, 300, true),
    };
    if (this.accion === 'ENVIAR')
      return {
        ...base,
        transportista: texto(d.transportista, 2, 80),
        referenciaSeguimiento: texto(d.referenciaSeguimiento, 3, 80),
      };
    if (this.accion === 'ENTREGAR') {
      if (d.confirmado !== true)
        throw new BadRequestException('Confirma que el pedido fue entregado.');
      return { ...base, confirmado: true };
    }
    return base;
  }
}
