import { PEDIDOS_ADMIN_DEMO } from './pedidos-posventa-demo';
import { PRODUCTOS_POSVENTA_DEMO } from './productos-posventa-demo';
import { SolicitudAdmin, importeReferenciaSolicitud } from '../modelos/solicitud-admin';

const entregado = PEDIDOS_ADMIN_DEMO.find((p) => p.codigo === 'SOHO-000120')!;
const producto = PRODUCTOS_POSVENTA_DEMO.find((p) =>
  p.variantes.some((v) => v.sku === entregado.articulos[0].sku),
)!;
const variante = producto.variantes.find(
  (v) =>
    v.sku !== entregado.articulos[0].sku && v.habilitada && v.existencias > v.cantidadReservada,
)!;
const color = producto.colores.find((c) => c.codigo === variante.codigoColor)!;
const rechazado = PEDIDOS_ADMIN_DEMO.find((p) => p.codigo === 'SOHO-000119')!;
export const SOLICITUDES_ADMIN_DEMO: readonly SolicitudAdmin[] = Object.freeze([
  Object.freeze({
    identificador: 'CD-000002',
    pedido: entregado.codigo,
    cliente: entregado.cliente,
    fecha: '2026-11-07T15:00:00Z',
    tipo: 'cambio' as const,
    estado: 'evaluacion' as const,
    articulo: entregado.articulos[0],
    cantidad: 1,
    unidades: Object.freeze([0]),
    importeReferencia: importeReferenciaSolicitud(entregado, entregado.articulos[0].sku, 1),
    motivo: 'talla' as const,
    descripcion:
      'El cliente de ejemplo solicita otra talla del mismo modelo para revisar el flujo de atención.',
    variante: Object.freeze({
      sku: variante.sku,
      productoId: producto.identificador,
      nombre: producto.nombre,
      color: color.nombre,
      talla: variante.talla,
      imagen: color.imagenes[0] ?? producto.imagenes[0],
    }),
    evidencias: Object.freeze([]),
    revision: 1,
    notas: Object.freeze([]),
    eventos: Object.freeze([
      Object.freeze({
        fecha: '2026-11-07T15:00:00Z',
        titulo: 'Solicitud de ejemplo registrada',
        descripcion: 'Caso ficticio pendiente de evaluación. No reserva la variante solicitada.',
        autor: 'Admin Demo',
      }),
    ]),
  }),
  Object.freeze({
    identificador: 'CD-000001',
    pedido: rechazado.codigo,
    cliente: rechazado.cliente,
    fecha: '2026-11-06T15:00:00Z',
    tipo: 'devolucion' as const,
    estado: 'rechazada' as const,
    articulo: rechazado.articulos[0],
    cantidad: 1,
    unidades: Object.freeze([0]),
    importeReferencia: importeReferenciaSolicitud(rechazado, rechazado.articulos[0].sku, 1),
    motivo: 'otro' as const,
    descripcion: 'Solicitud ficticia sin información suficiente para evaluar el caso.',
    evidencias: Object.freeze([]),
    revision: 2,
    notas: Object.freeze([]),
    eventos: Object.freeze([
      Object.freeze({
        fecha: '2026-11-06T15:00:00Z',
        titulo: 'Solicitud de ejemplo registrada',
        descripcion: 'Caso ficticio para revisar la interfaz.',
        autor: 'Admin Demo',
      }),
      Object.freeze({
        fecha: '2026-11-06T16:00:00Z',
        titulo: 'Solicitud rechazada · ejemplo',
        descripcion:
          'Falta información del caso en este ejemplo. No representa una política comercial de SOHO.',
        autor: 'Admin Demo',
      }),
    ]),
  }),
]);
