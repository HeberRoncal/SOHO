import { registro, texto } from '../../../tienda/pedidos/modelos/contrato-pedidos';
import { PedidoAdmin } from './pedido-admin';

export interface PlanRecuperacionReservas {
  readonly codigo: string;
  readonly versionPedido: number;
  readonly versionPago: number;
  readonly puedeRecuperar: boolean;
  readonly motivoBloqueo: string | null;
  readonly unidadesConservadas: number;
  readonly articulos: readonly {
    readonly id: string;
    readonly sku: string;
    readonly nombre: string;
    readonly cantidad: number;
    readonly disponibles: number;
    readonly habilitada: boolean;
    readonly reservaAnteriorId: string;
    readonly horas: number;
    readonly accionVencimiento: 'LIBERAR_Y_ALERTAR';
    readonly accionCancelacion: 'LIBERAR' | 'PREGUNTAR';
    readonly configuracionVersion: number;
  }[];
}
export interface SolicitudRecuperacionReservas {
  readonly versionPedido: number;
  readonly versionPago: number;
  readonly confirmado: boolean;
  readonly motivo: string;
}
export function adaptarPlanRecuperacion(
  valor: unknown,
  pedido: PedidoAdmin,
): PlanRecuperacionReservas {
  const p = registro(valor);
  const entero = (v: unknown, min = 0, max = 4294967295) => {
    if (!Number.isSafeInteger(v) || (v as number) < min || (v as number) > max)
      throw Error('Cantidad de recuperación inválida.');
    return v as number;
  };
  if (
    texto(p['codigo']) !== pedido.codigo ||
    p['versionPedido'] !== pedido.version ||
    p['versionPago'] !== pedido.versionPago ||
    typeof p['puedeRecuperar'] !== 'boolean' ||
    !Array.isArray(p['articulos']) ||
    (p['puedeRecuperar']
      ? p['motivoBloqueo'] !== null || !pedido.recuperacionReservas?.puedeSolicitar
      : typeof p['motivoBloqueo'] !== 'string')
  )
    throw Error('Plan de recuperación incoherente.');
  const skus = new Set<string>();
  const articulos = p['articulos'].map((v) => {
    const a = registro(v),
      sku = texto(a['sku']);
    if (
      skus.has(sku) ||
      !pedido.articulos.some((r) => r.sku === sku && r.cantidad === a['cantidad']) ||
      a['accionVencimiento'] !== 'LIBERAR_Y_ALERTAR' ||
      !['LIBERAR', 'PREGUNTAR'].includes(a['accionCancelacion'] as string) ||
      typeof a['habilitada'] !== 'boolean'
    )
      throw Error('Artículo de recuperación inválido.');
    skus.add(sku);
    return Object.freeze({
      id: texto(a['id']),
      sku,
      nombre: texto(a['nombre']),
      cantidad: entero(a['cantidad'], 1, 99999),
      disponibles: entero(a['disponibles']),
      habilitada: a['habilitada'],
      reservaAnteriorId: texto(a['reservaAnteriorId']),
      horas: entero(a['horas'], 1, 999999),
      accionVencimiento: 'LIBERAR_Y_ALERTAR' as const,
      accionCancelacion: a['accionCancelacion'] as 'LIBERAR' | 'PREGUNTAR',
      configuracionVersion: entero(a['configuracionVersion'], 1),
    });
  });
  const unidadesConservadas = entero(p['unidadesConservadas']);
  if (
    (p['puedeRecuperar'] &&
      (!articulos.length || articulos.some((a) => !a.habilitada || a.disponibles < a.cantidad))) ||
    articulos.reduce((s, a) => s + a.cantidad, 0) + unidadesConservadas >
      pedido.articulos.reduce((s, a) => s + a.cantidad, 0)
  )
    throw Error('Disponibilidad incoherente.');
  return Object.freeze({
    codigo: pedido.codigo,
    versionPedido: pedido.version!,
    versionPago: pedido.versionPago!,
    puedeRecuperar: p['puedeRecuperar'],
    motivoBloqueo: p['motivoBloqueo'] as string | null,
    unidadesConservadas,
    articulos: Object.freeze(articulos),
  });
}
