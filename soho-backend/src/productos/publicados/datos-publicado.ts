import { BadRequestException } from '@nestjs/common';
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
      'esDestacado',
      'ordenCatalogo',
      'ordenColor',
    ]);
    const { esDestacado, ...datosComerciales } = datos;
    if (esDestacado !== undefined && typeof esDestacado !== 'boolean')
      throw new BadRequestException('El campo esDestacado no es válido.');
    return {
      ...DatosBorrador.leer(datosComerciales, true, esDestacado !== undefined),
      ...(esDestacado !== undefined ? { esDestacado } : {}),
      version: versionBorrador(datos.version),
    };
  }
}
