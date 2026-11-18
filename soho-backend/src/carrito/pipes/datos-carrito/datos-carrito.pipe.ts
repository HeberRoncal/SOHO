import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import type { OperacionCarritoDto } from '../../dto/operacion-carrito.dto/operacion-carrito.dto.js';

@Injectable()
export class DatosCarritoPipe implements PipeTransform<
  unknown,
  OperacionCarritoDto
> {
  transform(value: unknown): OperacionCarritoDto {
    const fail = (): never => {
      throw new BadRequestException('Datos del carrito no válidos.');
    };
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return fail();
    const v = value as Record<string, unknown>;
    if (
      Object.keys(v).some(
        (k) => !['clave', 'version', 'tipo', 'articulos'].includes(k),
      ) ||
      typeof v.clave !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        v.clave,
      ) ||
      !Number.isSafeInteger(v.version) ||
      Number(v.version) < 0 ||
      !['GUARDAR', 'COMBINAR'].includes(String(v.tipo)) ||
      !Array.isArray(v.articulos) ||
      v.articulos.length > 100
    )
      return fail();
    const skus = new Set<string>();
    const articulos = v.articulos.map((a: unknown) => {
      if (!a || typeof a !== 'object' || Array.isArray(a)) return fail();
      const linea = a as Record<string, unknown>;
      if (
        Object.keys(linea).length !== 2 ||
        typeof linea.sku !== 'string' ||
        !/^[A-Za-z0-9_-]{1,100}$/.test(linea.sku) ||
        skus.has(linea.sku) ||
        !Number.isSafeInteger(linea.cantidad) ||
        Number(linea.cantidad) < 1 ||
        Number(linea.cantidad) > 99
      )
        return fail();
      skus.add(linea.sku);
      return { sku: linea.sku, cantidad: Number(linea.cantidad) };
    });
    return {
      clave: v.clave,
      version: Number(v.version),
      tipo: v.tipo as OperacionCarritoDto['tipo'],
      articulos,
    };
  }
}
