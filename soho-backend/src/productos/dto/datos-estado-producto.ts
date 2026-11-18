import { objeto } from '../../autenticacion/acceso/datos-auth.js';
import { idProducto } from './consulta-productos.js';
import { versionBorrador } from '../borradores/datos-borrador.js';

export class DatosEstadoProducto {
  static leer(valor: unknown) {
    const datos = objeto(valor, ['claveSolicitud', 'version']);
    return {
      claveSolicitud: idProducto(datos.claveSolicitud).toLowerCase(),
      version: versionBorrador(datos.version),
    };
  }
}
