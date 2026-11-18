import { BadRequestException } from '@nestjs/common';
import {
  nombre,
  normalizarCorreo,
  objeto,
} from '../../autenticacion/acceso/datos-auth.js';
import type { CreatePedidoDto } from '../dto/create-pedido.dto.js';
import type { PreparacionPedido } from './preparacion-pedido.interface.js';

export function texto(
  valor: unknown,
  minimo: number,
  maximo: number,
  multilinea = false,
): string {
  if (typeof valor !== 'string')
    throw new BadRequestException('Completa los datos del pedido.');
  const limpio = valor.trim();
  if (
    Array.from(limpio).length < minimo ||
    Array.from(limpio).length > maximo ||
    /[\p{Cc}\p{Cf}]/u.test(multilinea ? limpio.replace(/[\r\n]/g, '') : limpio)
  )
    throw new BadRequestException(
      'Revisa la longitud y el contenido de los datos del pedido.',
    );
  return limpio;
}

function importe(valor: unknown, enteros = 6): string {
  if (
    typeof valor !== 'string' ||
    !new RegExp(`^(0|[1-9][0-9]{0,${enteros - 1}})\\.[0-9]{2}$`).test(valor)
  )
    throw new BadRequestException(
      'Envía los importes como texto con dos decimales.',
    );
  return valor;
}

function facturacion(valor: unknown): CreatePedidoDto['facturacion'] {
  if (valor === undefined) return undefined;
  const d = objeto(valor, [
    'tipo',
    'tipoDocumento',
    'numeroDocumento',
    'razonSocial',
    'domicilioFiscal',
  ]);
  const numeroDocumento = texto(d.numeroDocumento, 6, 12);
  if (
    d.tipo === 'FACTURA' &&
    d.tipoDocumento === 'RUC' &&
    /^(10|15|17|20)[0-9]{9}$/.test(numeroDocumento)
  )
    return {
      tipo: 'FACTURA',
      tipoDocumento: 'RUC',
      numeroDocumento,
      razonSocial: texto(d.razonSocial, 2, 160),
      domicilioFiscal: texto(d.domicilioFiscal, 6, 180),
    };
  const documentos = {
    DNI: /^[0-9]{8}$/,
    CE: /^[A-Za-z0-9]{9,12}$/,
    PAS: /^[A-Za-z0-9]{6,12}$/,
  };
  if (
    d.tipo === 'BOLETA' &&
    typeof d.tipoDocumento === 'string' &&
    Object.hasOwn(documentos, d.tipoDocumento) &&
    documentos[d.tipoDocumento as keyof typeof documentos].test(
      numeroDocumento,
    ) &&
    d.razonSocial === undefined &&
    d.domicilioFiscal === undefined
  )
    return {
      tipo: 'BOLETA',
      tipoDocumento: d.tipoDocumento as 'DNI' | 'CE' | 'PAS',
      numeroDocumento,
    };
  throw new BadRequestException(
    'Los datos de boleta o factura no son válidos.',
  );
}

export class DatosPreparacionPedido {
  static validar(valor: unknown): PreparacionPedido {
    const d = objeto(valor, [
      'contacto',
      'entrega',
      'facturacion',
      'articulos',
      'cotizacion',
    ]);
    const c = objeto(d.contacto, ['nombres', 'apellidos', 'correo']);
    const contacto = {
      nombres: nombre(c.nombres),
      apellidos: nombre(c.apellidos),
      correo: normalizarCorreo(c.correo),
    };
    const e = objeto(d.entrega, [
      'destinatario',
      'celular',
      'distrito',
      'direccion',
      'referencia',
    ]);
    const entrega = {
      destinatario: texto(
        e.destinatario ?? `${contacto.nombres} ${contacto.apellidos}`,
        2,
        140,
      ),
      celular: texto(e.celular, 9, 9),
      distrito: texto(e.distrito, 1, 80),
      direccion: texto(e.direccion, 6, 180),
      referencia:
        e.referencia === undefined ? '' : texto(e.referencia, 0, 200, true),
    };
    if (
      !/^9[0-9]{8}$/.test(entrega.celular) ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entrega.distrito)
    )
      throw new BadRequestException(
        'Revisa el celular y el código del distrito.',
      );
    if (
      !Array.isArray(d.articulos) ||
      !d.articulos.length ||
      d.articulos.length > 50
    )
      throw new BadRequestException(
        'El pedido debe contener entre uno y cincuenta artículos.',
      );
    const articulos = d.articulos.map((valorArticulo: unknown) => {
      const a = objeto(valorArticulo, [
        'sku',
        'cantidad',
        'precioUnitarioEsperado',
      ]);
      if (
        !Number.isSafeInteger(a.cantidad) ||
        (a.cantidad as number) < 1 ||
        (a.cantidad as number) > 100
      )
        throw new BadRequestException(
          'La cantidad debe ser un entero entre uno y cien.',
        );
      return {
        sku: texto(a.sku, 1, 96),
        cantidad: a.cantidad as number,
        precioUnitarioEsperado: importe(a.precioUnitarioEsperado),
      };
    });
    if (
      articulos.reduce((s, a) => s + a.cantidad, 0) > 100 ||
      new Set(articulos.map((a) => a.sku.toLowerCase())).size !==
        articulos.length
    )
      throw new BadRequestException(
        'Agrupa cada SKU en una línea; el máximo por pedido es cien pares.',
      );
    const q = objeto(d.cotizacion, ['costoEnvio', 'plazoEntrega', 'total']);
    const cotizacion = {
      costoEnvio: importe(q.costoEnvio),
      plazoEntrega:
        q.plazoEntrega === null ? null : texto(q.plazoEntrega, 1, 80),
      total: importe(q.total, 12),
    };
    return {
      contacto,
      entrega,
      facturacion: facturacion(d.facturacion),
      articulos,
      cotizacion,
    };
  }
}
