import { registro, texto } from '../../../tienda/pedidos/modelos/contrato-pedidos';

export interface PoliticaReserva {
  readonly modo: 'HASTA_DECISION' | 'TIEMPO';
  readonly horas: number | null;
  readonly accionVencimiento: 'LIBERAR_Y_ALERTAR' | 'SOLO_ALERTAR' | null;
  readonly accionCancelacion: 'LIBERAR' | 'PREGUNTAR';
}
export interface ConfiguracionReserva extends PoliticaReserva {
  readonly version: number;
  readonly creadoEn: string;
  readonly actualizadoEn: string;
  readonly actualizadoPor: { readonly id: string; readonly nombre: string } | null;
}
export interface RespuestaReservas {
  readonly configuracion: ConfiguracionReserva;
  readonly capacidades: { readonly reservaTemporalDisponible: boolean };
  readonly modificada?: boolean;
}
export interface BorradorReserva {
  modo: PoliticaReserva['modo'];
  horas: string;
  accionVencimiento: '' | NonNullable<PoliticaReserva['accionVencimiento']>;
  accionCancelacion: PoliticaReserva['accionCancelacion'];
}
export function adaptarConfiguracionReservas(valor: unknown, escritura = false): RespuestaReservas {
  const r = registro(valor),
    c = registro(r['configuracion']),
    capacidades = registro(r['capacidades']);
  const version = c['version'],
    modo = c['modo'],
    horas = c['horas'],
    vencimiento = c['accionVencimiento'],
    cancelacion = c['accionCancelacion'];
  if (
    !Number.isInteger(version) ||
    (version as number) < 1 ||
    (version as number) > 4294967295 ||
    (modo !== 'HASTA_DECISION' && modo !== 'TIEMPO') ||
    (cancelacion !== 'LIBERAR' && cancelacion !== 'PREGUNTAR') ||
    (modo === 'HASTA_DECISION'
      ? horas !== null || vencimiento !== null
      : !Number.isInteger(horas) ||
        (horas as number) < 1 ||
        (horas as number) > 999999 ||
        (vencimiento !== 'LIBERAR_Y_ALERTAR' && vencimiento !== 'SOLO_ALERTAR')) ||
    typeof capacidades['reservaTemporalDisponible'] !== 'boolean' ||
    (escritura && typeof r['modificada'] !== 'boolean')
  )
    throw Error('Configuración de reservas inválida.');
  const fecha = (valor: unknown) => {
    const f = texto(valor);
    if (!Number.isFinite(Date.parse(f)) || new Date(f).toISOString() !== f)
      throw Error('Fecha de configuración inválida.');
    return f;
  };
  const creadoEn = fecha(c['creadoEn']),
    actualizadoEn = fecha(c['actualizadoEn']);
  if (actualizadoEn < creadoEn) throw Error('Fechas de configuración incoherentes.');
  let actualizadoPor: ConfiguracionReserva['actualizadoPor'] = null;
  if (c['actualizadoPor'] !== null) {
    const u = registro(c['actualizadoPor']),
      id = texto(u['id']),
      nombre = texto(u['nombre']);
    if (!id.trim() || id.length > 36 || !nombre.trim() || /[\p{Cc}\p{Cf}]/u.test(id + nombre))
      throw Error('Responsable inválido.');
    actualizadoPor = Object.freeze({ id, nombre });
  }
  return Object.freeze({
    configuracion: Object.freeze({
      version: version as number,
      modo,
      horas: horas as number | null,
      accionVencimiento: vencimiento as PoliticaReserva['accionVencimiento'],
      accionCancelacion: cancelacion,
      creadoEn,
      actualizadoEn,
      actualizadoPor,
    }),
    capacidades: Object.freeze({
      reservaTemporalDisponible: capacidades['reservaTemporalDisponible'],
    }),
    ...(escritura ? { modificada: r['modificada'] as boolean } : {}),
  });
}
export function borradorReserva(p: PoliticaReserva): BorradorReserva {
  return {
    modo: p.modo,
    horas: p.horas === null ? '' : String(p.horas),
    accionVencimiento: p.accionVencimiento ?? '',
    accionCancelacion: p.accionCancelacion,
  };
}
export function politicaReserva(b: BorradorReserva): PoliticaReserva {
  return {
    modo: b.modo,
    horas: b.modo === 'TIEMPO' ? Number(b.horas) : null,
    accionVencimiento: b.modo === 'TIEMPO' ? b.accionVencimiento || null : null,
    accionCancelacion: b.accionCancelacion,
  };
}
export function mismaPolitica(a: PoliticaReserva, b: PoliticaReserva): boolean {
  return (
    a.modo === b.modo &&
    a.horas === b.horas &&
    a.accionVencimiento === b.accionVencimiento &&
    a.accionCancelacion === b.accionCancelacion
  );
}
