import { objeto } from '../../autenticacion/acceso/datos-auth.js';
import {
  DatosBorrador,
  versionBorrador,
} from '../borradores/datos-borrador.js';

export class DatosPublicado {
  static leer(valor: unknown) {
    const datos = objeto(valor, [
      'claveSolicitud',
      'version',
      'nombre',
      'descripcion',
      'categoriaId',
      'genero',
      'precio',
      'precioAnterior',
      'esNovedad',
      'ordenCatalogo',
      'ordenColor',
    ]);
    return {
      ...DatosBorrador.leer(datos, true),
      version: versionBorrador(datos.version),
    };
  }
}
