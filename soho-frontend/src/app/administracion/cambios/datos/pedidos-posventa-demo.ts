import { PRODUCTOS_DEMOSTRACION } from './catalogo-posventa-demo';
import { COBERTURA_DEMOSTRACION } from './cobertura-posventa-demo';
import {
  PedidoAdmin,
  EstadoPagoAdmin,
  EstadoEntregaAdmin,
  ESTADOS_ENTREGA_ADMIN,
} from '../../pedidos/modelos/pedido-admin';

// Pedidos y contactos ficticios para revisar interfaces. No proceden del checkout ni crean reservas.
const clientes = [
  ['Andrea Castillo Ríos', 'La Esperanza', 'registrado'],
  ['Diego Ramírez Soto', 'Trujillo', 'invitado'],
  ['Lucía Fernández Paz', 'Víctor Larco Herrera', 'registrado'],
  ['Mateo Torres Vega', 'El Porvenir', 'invitado'],
  ['Valeria Salazar León', 'Florencia de Mora', 'registrado'],
  ['Camila Pérez Flores', 'Huanchaco', 'invitado'],
] as const;
const escenarios: readonly {
  pago: EstadoPagoAdmin;
  entrega: EstadoEntregaAdmin;
  producto: string;
  cliente: number;
  cantidad?: number;
  segundo?: string;
  descuento?: boolean;
  observacion?: string;
}[] = [
  { pago: 'pendiente', entrega: 'pendiente', producto: 'samba', cliente: 1, segundo: 'oldskool' },
  { pago: 'pendiente', entrega: 'pendiente', producto: 'af1', cliente: 2 },
  {
    pago: 'observado',
    entrega: 'pendiente',
    producto: 'nb990v6',
    cliente: 3,
    observacion: 'El comprobante de ejemplo necesita una imagen más legible.',
  },
  {
    pago: 'rechazado',
    entrega: 'pendiente',
    producto: 'chuck70',
    cliente: 4,
    observacion: 'El comprobante de ejemplo no coincide con el importe del pedido.',
  },
  { pago: 'aprobado', entrega: 'confirmado', producto: 'suede', cliente: 0, cantidad: 2 },
  { pago: 'aprobado', entrega: 'en-preparacion', producto: 'af1', cliente: 1 },
  {
    pago: 'aprobado',
    entrega: 'incidencia',
    producto: 'nb990v5',
    cliente: 2,
    observacion: 'Incidencia de stock de demostración: revisar disponibilidad antes de preparar.',
  },
  { pago: 'aprobado', entrega: 'enviado', producto: 'peg', cliente: 5 },
  { pago: 'aprobado', entrega: 'entregado', producto: 'samba', cliente: 0, descuento: true },
  { pago: 'aprobado', entrega: 'entregado', producto: 'suede', cliente: 3 },
  {
    pago: 'anulado',
    entrega: 'cancelado',
    producto: 'oldskool',
    cliente: 4,
    observacion: 'El cliente ficticio solicitó cancelar antes de verificar el pago.',
  },
  {
    pago: 'aprobado',
    entrega: 'cancelado',
    producto: 'chuck70',
    cliente: 5,
    observacion:
      'Cancelación de ejemplo después de aprobar el pago. El reembolso se revisa por separado.',
  },
];
function articulo(id: string, cantidad = 1) {
  const p = PRODUCTOS_DEMOSTRACION.find((p) => p.identificador === id)!;
  const v = p.variantes.find((v) => v.talla === '42')!;
  const color = p.colores.find((c) => c.codigo === v.codigoColor)!;
  return Object.freeze({
    sku: v.sku,
    nombre: p.nombre,
    color: color.nombre,
    talla: v.talla,
    imagen: color.imagenes[0] ?? p.imagenes[0],
    cantidad,
    precioUnitario: p.precio,
    importe: (Math.round(p.precio * 100) * cantidad) / 100,
  });
}
export const PEDIDOS_ADMIN_DEMO: readonly PedidoAdmin[] = Object.freeze(
  escenarios.map((e, i) => {
    const [nombre, distrito, tipo] = clientes[e.cliente];
    const articulos = Object.freeze([
      articulo(e.producto, e.cantidad),
      ...(e.segundo ? [articulo(e.segundo)] : []),
    ]);
    const subtotalCentimos = articulos.reduce((s, a) => s + Math.round(a.importe * 100), 0);
    const envio = COBERTURA_DEMOSTRACION.find((z) => z.nombre === distrito)!.tarifa;
    const descuento = e.descuento ? Math.round(subtotalCentimos * 0.1) / 100 : 0;
    const fecha = `2026-11-${String(8 - Math.floor(i / 2)).padStart(2, '0')}T${i % 2 ? '13:30' : '17:00'}:00Z`;
    const eventos = [
      {
        fecha,
        titulo: 'Pedido de ejemplo registrado',
        descripcion: 'Datos ficticios para revisar la interfaz administrativa.',
      },
    ];
    if (e.pago === 'aprobado')
      eventos.push({
        fecha: new Date(Date.parse(fecha) + 20 * 60000).toISOString(),
        titulo: 'Pago aprobado en el ejemplo',
        descripcion: 'Estado ilustrativo; no se verificó una transferencia real.',
      });
    if (e.entrega !== 'pendiente')
      eventos.push({
        fecha: new Date(Date.parse(fecha) + 40 * 60000).toISOString(),
        titulo: ESTADOS_ENTREGA_ADMIN[e.entrega],
        descripcion: e.observacion ?? 'Estado de preparación y entrega del pedido de ejemplo.',
      });
    return Object.freeze({
      codigo: 'SOHO-' + String(128 - i).padStart(6, '0'),
      fecha,
      cliente: Object.freeze({
        identificador: 'CLI-' + String(e.cliente + 1).padStart(6, '0'),
        nombre,
        tipo,
        correo: `cliente${e.cliente + 1}@soho.example`,
        celular: `900 000 ${String(101 + e.cliente)}`,
      }),
      direccion: Object.freeze({
        distrito,
        linea: `Calle de ejemplo ${100 + e.cliente * 20}`,
        referencia: 'Dirección ficticia para demostración',
      }),
      articulos,
      subtotal: subtotalCentimos / 100,
      envio,
      descuento,
      total: (subtotalCentimos + Math.round(envio * 100) - Math.round(descuento * 100)) / 100,
      ...(e.descuento ? { cupon: 'DEMO10' } : {}),
      metodoPago: i % 2 ? ('Yape' as const) : ('Plin' as const),
      estadoPago: e.pago,
      estadoEntrega: e.entrega,
      ...(e.pago !== 'anulado'
        ? { comprobante: `comprobante-demo-${128 - i}.png`, operacion: `DEMO-${128 - i}` }
        : {}),
      ...(e.observacion ? { observacion: e.observacion } : {}),
      ...(['enviado', 'entregado'].includes(e.entrega)
        ? {
            seguimiento: Object.freeze({
              empresa: 'Courier de demostración',
              codigo: `DEMO-ENV-${128 - i}`,
            }),
          }
        : {}),
      eventos: Object.freeze(eventos.map((e) => Object.freeze(e))),
    });
  }),
);
