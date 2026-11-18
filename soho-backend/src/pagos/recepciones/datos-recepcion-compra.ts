import { objeto } from '../../autenticacion/acceso/datos-auth.js';
import { validarComprobante } from '../../pedidos/pipes/datos-pedido.pipe.js';
import { DatosInstruccionPago } from '../dto/datos-instruccion-pago.js';

export class DatosRecepcionCompra {
  static leer(valor: unknown) {
    const d = objeto(valor, [
      'claveSolicitud',
      'instruccionPagoId',
      'comprobante',
    ]);
    const c = validarComprobante(d.comprobante);
    return {
      claveSolicitud: DatosInstruccionPago.uuid(d.claveSolicitud),
      instruccionPagoId: DatosInstruccionPago.uuid(d.instruccionPagoId),
      comprobante: { ...c, nombreArchivo: c.nombreArchivo.normalize('NFC') },
    };
  }
}
