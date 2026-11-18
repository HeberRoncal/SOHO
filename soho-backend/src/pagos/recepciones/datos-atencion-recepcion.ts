import { BadRequestException } from '@nestjs/common';
import { objeto } from '../../autenticacion/acceso/datos-auth.js';
import { texto } from '../../pedidos/preparacion/datos-preparacion-pedido.js';
import { DatosProcesamientoRecepcion } from './datos-procesamiento-recepcion.js';
import { DatosInstruccionPago } from '../dto/datos-instruccion-pago.js';

export class DatosAtencionRecepcion {
  static accion(v: unknown, registro: boolean) {
    const q = objeto(v, [
      'claveSolicitud',
      'versionEsperada',
      'comprobanteActualId',
      'motivo',
      'confirmado',
      registro ? 'aceptarCondicionesOriginales' : 'mensaje',
    ]);
    if (
      q.confirmado !== true ||
      (registro && q.aceptarCondicionesOriginales !== true)
    )
      throw new BadRequestException(
        'Confirma expresamente la decisión y las condiciones originales cuando corresponda.',
      );
    return {
      ...DatosProcesamientoRecepcion.leer({
        claveSolicitud: q.claveSolicitud,
        versionEsperada: q.versionEsperada,
      }),
      comprobanteActualId: DatosInstruccionPago.uuid(q.comprobanteActualId),
      motivo: texto(q.motivo, 3, 300).normalize('NFC'),
      confirmado: true as const,
      ...(registro
        ? { aceptarCondicionesOriginales: true as const }
        : { mensaje: texto(q.mensaje, 3, 500).normalize('NFC') }),
    };
  }
  static consulta(v: unknown) {
    const q = objeto(v, ['pagina', 'limite', 'busqueda', 'estado']);
    const entero = (v: unknown, def: number, max: number) => {
      if (v === undefined) return def;
      if (
        typeof v !== 'string' ||
        !/^[1-9][0-9]{0,5}$/.test(v) ||
        Number(v) > max
      )
        throw new BadRequestException('La paginación no es válida.');
      return Number(v);
    };
    const estados = [
      'RECIBIENDO',
      'RECIBIDA',
      'REQUIERE_ATENCION',
      'PEDIDO_CREADO',
    ] as const;
    if (
      q.estado !== undefined &&
      !estados.includes(q.estado as (typeof estados)[number])
    )
      throw new BadRequestException('El estado no es válido.');
    return {
      pagina: entero(q.pagina, 1, 100000),
      limite: entero(q.limite, 20, 50),
      busqueda: q.busqueda === undefined ? '' : texto(q.busqueda, 0, 100),
      estado: q.estado as (typeof estados)[number] | undefined,
    };
  }
}
