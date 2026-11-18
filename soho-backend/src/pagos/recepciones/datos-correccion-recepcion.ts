import { objeto } from '../../autenticacion/acceso/datos-auth.js';
import { validarComprobante } from '../../pedidos/pipes/datos-pedido.pipe.js';
import { DatosProcesamientoRecepcion } from './datos-procesamiento-recepcion.js';

export class DatosCorreccionRecepcion {
  static leer(v: unknown) {
    const q = objeto(v, ['claveSolicitud', 'versionEsperada', 'comprobante']);
    const c = validarComprobante(q.comprobante);
    return {
      ...DatosProcesamientoRecepcion.leer({
        claveSolicitud: q.claveSolicitud,
        versionEsperada: q.versionEsperada,
      }),
      comprobante: { ...c, nombreArchivo: c.nombreArchivo.normalize('NFC') },
    };
  }
}
