import { cancelacionApiFixture } from './cancelaciones-administracion-api.fixtures';

export const MOTIVO_RECUPERACION = 'Cliente confirma que continuará con el pedido.';
export function recuperacionApiFixture(recuperado = false, responsable = 'admin') {
  const p = cancelacionApiFixture({ pago: 'PENDIENTE', version: recuperado ? 4 : 3 });
  return {
    ...p,
    estadoEntrega: recuperado ? 'PENDIENTE' : 'INCIDENCIA',
    vencimientoReservas: { unidadesLiberadas: recuperado ? 0 : 2, unidadesConservadas: 0 },
    recuperacionReservas: {
      puedeSolicitar: !recuperado,
      ultima: recuperado
        ? {
            versionPedido: 4,
            fecha: '2026-11-14T17:00:00.000Z',
            motivo: MOTIVO_RECUPERACION,
            responsable: { id: responsable, nombre: 'Sofía Administradora' },
          }
        : null,
    },
  };
}
export function planRecuperacionFixture() {
  const p = recuperacionApiFixture();
  return {
    codigo: p.codigo,
    versionPedido: p.version,
    versionPago: p.pago.version,
    puedeRecuperar: true,
    motivoBloqueo: null,
    unidadesConservadas: 0,
    articulos: [
      {
        id: '45093077-3e17-4197-b8ba-1aa940f6beab',
        sku: p.articulos[0].sku,
        nombre: p.articulos[0].nombreProducto,
        cantidad: 2,
        disponibles: 5,
        habilitada: true,
        reservaAnteriorId: '45093077-3e17-4197-b8ba-1aa940f6beaa',
        horas: 24,
        accionVencimiento: 'LIBERAR_Y_ALERTAR',
        accionCancelacion: 'PREGUNTAR',
        configuracionVersion: 7,
      },
    ],
  };
}
