import { ServiceUnavailableException } from '@nestjs/common';
import { isDeepStrictEqual } from 'node:util';
import { RespuestaInstruccionPago } from '../dto/respuesta-instruccion-pago.js';
import type { RecepcionCompra } from './recepcion-compra.interface.js';

const MOTIVOS = [
  'PRECIO_CAMBIADO',
  'STOCK_INSUFICIENTE',
  'ARTICULO_NO_DISPONIBLE',
  'COBERTURA_DESHABILITADA',
  'COBERTURA_TARIFA_PENDIENTE',
  'COTIZACION_CAMBIADA',
  'TOTAL_CAMBIADO',
  'COMPROBANTE_REQUIERE_CORRECCION',
  'INVENTARIO_INCONSISTENTE',
  'PREPARACION_INCONSISTENTE',
];

export class RespuestaRecepcionCompra {
  static actual(r: RecepcionCompra, accesoInvitadoMs: number) {
    const pendiente = r.estado === 'RECIBIENDO',
      c = pendiente
        ? r.comprobantes[0]
        : r.comprobantes.find((c) => c.id === r.comprobanteActualId);
    if (
      !c ||
      (pendiente
        ? c.estadoArchivo !== 'PENDIENTE'
        : c.estadoArchivo !== 'DISPONIBLE') ||
      (r.instruccion.usuarioId === null
        ? !r.accesoInvitadoExpiraEn
        : r.accesoInvitadoExpiraEn !== null) ||
      !Array.isArray(r.motivos) ||
      r.motivos.some((m) => typeof m !== 'string' || !MOTIVOS.includes(m))
    )
      throw new ServiceUnavailableException(
        'La recepción registrada requiere revisión. Conserva su referencia.',
      );
    return {
      recepcion: {
        versionContrato: 1,
        id: r.id,
        referencia: r.referencia,
        claveSolicitud: r.claveSolicitud,
        claveCreacionPedido: r.claveCreacionPedido,
        estado: r.estado,
        version: r.version,
        creadoEn: r.creadoEn.toISOString(),
        recibidaEn: r.recibidaEn?.toISOString() ?? null,
        accesoExpiraEn: r.accesoInvitadoExpiraEn?.toISOString() ?? null,
        instruccion: RespuestaInstruccionPago.leer(
          r.instruccion,
          accesoInvitadoMs,
        ),
        comprobante: {
          id: c.id,
          version: c.version,
          nombreArchivo: c.nombreArchivo,
          formato: c.formato,
          tamanoBytes: c.tamanoBytes,
          numeroOperacion: c.numeroOperacion,
          estadoArchivo: c.estadoArchivo,
          confirmadoEn: c.confirmadoEn?.toISOString() ?? null,
        },
        motivos: r.motivos as string[],
        pedido: r.pedido ? { codigo: r.pedido.codigo } : null,
        capacidades: {
          reenviarMismaImagen: pendiente,
          consultarComprobante: !pendiente,
          procesamientoDisponible: false,
        },
      },
    };
  }

  static inicial(r: RecepcionCompra, accesoInvitadoMs: number) {
    const primero = r.comprobantes[0];
    if (
      !r.recibidaEn ||
      !primero ||
      primero.version !== 1 ||
      primero.estadoArchivo !== 'DISPONIBLE'
    )
      throw new ServiceUnavailableException(
        'La recepción registrada requiere revisión. Conserva su referencia.',
      );
    const original = this.actual(
      {
        ...r,
        estado: 'RECIBIDA',
        version: 2,
        motivos: [],
        comprobanteActualId: primero.id,
        pedido: null,
      },
      accesoInvitadoMs,
    );
    if (!isDeepStrictEqual(r.respuesta, JSON.parse(JSON.stringify(original))))
      throw new ServiceUnavailableException(
        'La respuesta de recepción requiere revisión. Conserva su referencia.',
      );
    return original;
  }
}
