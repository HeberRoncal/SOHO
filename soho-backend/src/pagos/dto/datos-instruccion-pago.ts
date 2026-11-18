import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { objeto } from '../../autenticacion/acceso/datos-auth.js';
import { UUID_PEDIDO } from '../../pedidos/configuracion-pedidos.js';
import { DatosPreparacionPedido } from '../../pedidos/preparacion/datos-preparacion-pedido.js';
import type { PreparacionPedido } from '../../pedidos/preparacion/preparacion-pedido.interface.js';

export class DatosInstruccionPago {
  static uuid(v: unknown) {
    if (typeof v !== 'string' || !UUID_PEDIDO.test(v.toLowerCase()))
      throw new BadRequestException('El identificador debe ser un UUID v4.');
    return v.toLowerCase();
  }
  static preparacion(v: unknown): PreparacionPedido {
    // Normalización exclusiva del contrato nuevo; no cambia la huella v1 de pedidos.
    const nfc = (x: unknown, profundidad = 0): unknown => {
      if (profundidad > 8)
        throw new BadRequestException(
          'La estructura de preparación no es válida.',
        );
      return typeof x === 'string'
        ? x.normalize('NFC')
        : Array.isArray(x)
          ? x.map((v) => nfc(v, profundidad + 1))
          : x && typeof x === 'object'
            ? Object.fromEntries(
                Object.entries(x).map(([k, v]) => [k, nfc(v, profundidad + 1)]),
              )
            : x;
    };
    const p = DatosPreparacionPedido.validar(nfc(v));
    return {
      ...p,
      articulos: [...p.articulos].sort((a, b) =>
        a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0,
      ),
    };
  }
  static emision(v: unknown) {
    const d = objeto(v, [
      'claveSolicitud',
      'claveCreacionPedido',
      'metodo',
      'versionConfiguracionEsperada',
      'preparacion',
    ]);
    if (d.metodo !== 'YAPE' && d.metodo !== 'PLIN')
      throw new BadRequestException('Selecciona YAPE o PLIN.');
    if (
      typeof d.versionConfiguracionEsperada !== 'number' ||
      !Number.isSafeInteger(d.versionConfiguracionEsperada) ||
      d.versionConfiguracionEsperada < 1 ||
      d.versionConfiguracionEsperada > 4294967295
    )
      throw new BadRequestException(
        'La versión de configuración no es válida.',
      );
    return {
      claveSolicitud: this.uuid(d.claveSolicitud),
      claveCreacionPedido: this.uuid(d.claveCreacionPedido),
      metodo: d.metodo,
      versionConfiguracionEsperada: d.versionConfiguracionEsperada,
      preparacion: this.preparacion(d.preparacion),
    };
  }
  static huella(v: unknown) {
    return createHash('sha256').update(JSON.stringify(v)).digest('hex');
  }
  static huellaPreparacion(p: PreparacionPedido) {
    return this.huella({
      versionContrato: 1,
      preparacion: this.preparacion(p),
    });
  }
}
