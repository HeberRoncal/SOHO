import { BadRequestException } from '@nestjs/common';
import { objeto } from '../../autenticacion/acceso/datos-auth.js';
import { idProducto } from '../../productos/dto/consulta-productos.js';

export class DatosMovimientoManual {
  static leer(valor: unknown) {
    const d = objeto(valor, [
      'claveSolicitud',
      'versionExistencias',
      'reservadoEsperado',
      'habilitadaEsperada',
      'tipo',
      'cantidad',
      'motivo',
      'referencia',
    ]);
    const invalido = (campo: string): never => {
      throw new BadRequestException('El campo ' + campo + ' no es válido.');
    };
    const entero = (
      v: unknown,
      min: number,
      max: number,
      campo: string,
    ): number =>
      typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max
        ? v
        : invalido(campo);
    const texto = (
      v: unknown,
      max: number,
      campo: string,
      opcional = false,
    ): string | null => {
      if (opcional && (v === undefined || v === null)) return null;
      if (typeof v !== 'string' || v.length > max || /[\p{Cc}\p{Cf}]/u.test(v))
        return invalido(campo);
      const s = v.trim().normalize('NFC');
      if (s.length > max || (!opcional && !s)) return invalido(campo);
      return s || null;
    };
    if (!['ENTRADA', 'SALIDA', 'AJUSTE'].includes(d.tipo as string))
      invalido('tipo');
    const cantidad = entero(d.cantidad, -99999, 99999, 'cantidad');
    if (
      !cantidad ||
      (d.tipo === 'ENTRADA' && cantidad < 0) ||
      (d.tipo === 'SALIDA' && cantidad > 0)
    )
      invalido('cantidad');
    if (typeof d.habilitadaEsperada !== 'boolean')
      invalido('habilitadaEsperada');
    return {
      claveSolicitud: idProducto(d.claveSolicitud).toLowerCase(),
      versionExistencias: entero(
        d.versionExistencias,
        1,
        4294967295,
        'versionExistencias',
      ),
      reservadoEsperado: entero(
        d.reservadoEsperado,
        0,
        99999,
        'reservadoEsperado',
      ),
      habilitadaEsperada: d.habilitadaEsperada as boolean,
      tipo: d.tipo as 'ENTRADA' | 'SALIDA' | 'AJUSTE',
      cantidad,
      motivo: texto(d.motivo, 160, 'motivo')!,
      referencia: texto(d.referencia, 80, 'referencia', true),
    };
  }
}
