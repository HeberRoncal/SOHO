import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { tallaBorrador } from './datos-borrador.js';

export class IdentidadProducto {
  static slug(valor: string): string {
    return valor
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
  static sku(
    marca: string,
    modelo: string,
    color: string,
    talla: string,
  ): string {
    const medida = tallaBorrador(talla).replace('.', 'P');
    if (
      !/^[A-Z0-9]{1,12}$/.test(marca) ||
      !/^[A-Z0-9]{1,60}$/.test(modelo) ||
      !/^[A-Z]{2}$/.test(color)
    )
      throw new BadRequestException(
        'Completa los códigos de marca, modelo y color antes de añadir tallas.',
      );
    return [marca, modelo, color, medida].join('-');
  }
  static huella(valor: unknown): string {
    const ordenar = (x: unknown): unknown =>
      Array.isArray(x)
        ? x.map(ordenar)
        : x && typeof x === 'object'
          ? Object.fromEntries(
              Object.entries(x)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([k, v]) => [k, ordenar(v)]),
            )
          : x;
    return createHash('sha256')
      .update(JSON.stringify(ordenar(valor)))
      .digest('hex');
  }
}
