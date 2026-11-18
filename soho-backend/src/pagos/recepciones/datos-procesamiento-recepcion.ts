import { BadRequestException } from '@nestjs/common';
import { objeto } from '../../autenticacion/acceso/datos-auth.js';
import { DatosInstruccionPago } from '../dto/datos-instruccion-pago.js';

export class DatosProcesamientoRecepcion {
  static leer(v: unknown) {
    const d = objeto(v, ['claveSolicitud', 'versionEsperada']);
    if (
      typeof d.versionEsperada !== 'number' ||
      !Number.isSafeInteger(d.versionEsperada) ||
      d.versionEsperada < 1 ||
      d.versionEsperada > 4294967295
    )
      throw new BadRequestException('La versión de recepción no es válida.');
    return {
      claveSolicitud: DatosInstruccionPago.uuid(d.claveSolicitud),
      versionEsperada: d.versionEsperada,
    };
  }
}
