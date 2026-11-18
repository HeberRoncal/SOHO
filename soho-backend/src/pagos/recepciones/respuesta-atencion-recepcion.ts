import { ServiceUnavailableException } from '@nestjs/common';
import { isDeepStrictEqual } from 'node:util';
import type { OperacionRecepcionCompra } from '../../generated/prisma/client.js';
import type { RecepcionCompra } from './recepcion-compra.interface.js';
import { RespuestaRecepcionCompra } from './respuesta-recepcion-compra.js';
import { RespuestaProcesamientoRecepcion } from './respuesta-procesamiento-recepcion.js';

export class RespuestaAtencionRecepcion {
  static crear(r: RecepcionCompra, o: OperacionRecepcionCompra, plazo: number) {
    return {
      ...RespuestaRecepcionCompra.actual(r, plazo),
      operacion: {
        claveSolicitud: o.claveSolicitud,
        estado: 'CONFIRMADA' as const,
      },
      resultado: o.accion,
      ...(o.accion === 'SOLICITAR_CORRECCION'
        ? { correccion: { solicitudId: o.id, mensaje: o.mensaje } }
        : {}),
    };
  }
  static leer(r: RecepcionCompra, o: OperacionRecepcionCompra, plazo: number) {
    try {
      const s = o.despues as ReturnType<
        typeof RespuestaProcesamientoRecepcion.estado
      > | null;
      if (
        !s ||
        !['SOLICITAR_CORRECCION', 'ADJUNTAR_COMPROBANTE'].includes(o.accion) ||
        o.estado !== 'CONFIRMADA' ||
        ![200, 201].includes(o.codigoHttp!) ||
        s.version !== o.versionResultante ||
        s.comprobanteActualId !== o.comprobanteId ||
        s.pedidoId !== null ||
        !['RECIBIDA', 'REQUIERE_ATENCION'].includes(s.estado) ||
        !isDeepStrictEqual(
          Object.keys(s).sort(),
          [
            'estado',
            'version',
            'comprobanteActualId',
            'motivos',
            'pedidoId',
          ].sort(),
        )
      )
        throw Error();
      const respuesta = this.crear({ ...r, ...s, pedido: null }, o, plazo);
      if (
        !isDeepStrictEqual(o.respuesta, JSON.parse(JSON.stringify(respuesta)))
      )
        throw Error();
      return respuesta;
    } catch {
      throw new ServiceUnavailableException(
        'La operación de recepción requiere revisión. Conserva su referencia.',
      );
    }
  }
}
