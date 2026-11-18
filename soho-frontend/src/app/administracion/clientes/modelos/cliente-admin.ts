import { PedidoAdmin } from '../../pedidos/modelos/pedido-admin';
import { normalizarBusquedaAdmin } from '../../productos/modelos/producto-administracion';

export interface ClienteAdmin {
  readonly identificador: string;
  readonly nombre: string;
  readonly correo: string;
  readonly celular: string;
  readonly tipo: 'registrado' | 'invitado';
  readonly cuentaDesde?: string;
}
export interface FichaClienteAdmin extends ClienteAdmin {
  readonly pedidos: readonly PedidoAdmin[];
  readonly primerPedido?: string;
  readonly ultimoPedido?: string;
  readonly pagosAprobados: number;
  readonly direcciones: readonly PedidoAdmin['direccion'][];
}
export type TipoClienteAdmin = '' | ClienteAdmin['tipo'];
export type OrdenClientesAdmin = 'recientes' | 'nombre' | 'pedidos';

const formatoFecha = new Intl.DateTimeFormat('es-PE', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'America/Lima',
});
export const fechaClienteAdmin = (fecha: string) => formatoFecha.format(new Date(fecha));
export const inicialesClienteAdmin = (nombre: string) =>
  nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('');

export function fichaClienteAdmin(
  cliente: ClienteAdmin,
  pedidos: readonly PedidoAdmin[],
): FichaClienteAdmin {
  // Identidad explícita: un correo o teléfono compartido no fusiona a dos compradores.
  const propios = pedidos
    .filter((p) => p.cliente.identificador === cliente.identificador)
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || a.codigo.localeCompare(b.codigo));
  const direcciones = propios
    .map((p) => p.direccion)
    .filter(
      (d, i, todas) =>
        todas.findIndex(
          (a) => a.linea === d.linea && a.distrito === d.distrito && a.referencia === d.referencia,
        ) === i,
    );
  return {
    ...cliente,
    pedidos: propios,
    primerPedido: propios.at(-1)?.fecha,
    ultimoPedido: propios[0]?.fecha,
    pagosAprobados:
      propios
        .filter((p) => p.estadoPago === 'aprobado')
        .reduce((s, p) => s + Math.round(p.total * 100), 0) / 100,
    direcciones,
  };
}
export function coincideClienteAdmin(
  cliente: ClienteAdmin,
  busqueda: string,
  tipo: TipoClienteAdmin,
): boolean {
  const q = normalizarBusquedaAdmin(busqueda);
  const telefono = busqueda.replace(/[\s()+.-]/g, '');
  return (
    (!tipo || cliente.tipo === tipo) &&
    (!q ||
      normalizarBusquedaAdmin(
        [cliente.nombre, cliente.correo, cliente.identificador].join(' '),
      ).includes(q) ||
      (/^\d+$/.test(telefono) && cliente.celular.replace(/\D/g, '').includes(telefono)))
  );
}
export function ordenarClientesAdmin(
  clientes: readonly FichaClienteAdmin[],
  orden: OrdenClientesAdmin,
): FichaClienteAdmin[] {
  return [...clientes].sort((a, b) => {
    if (orden === 'nombre') return a.nombre.localeCompare(b.nombre, 'es');
    if (orden === 'pedidos' && a.pedidos.length !== b.pedidos.length)
      return b.pedidos.length - a.pedidos.length;
    return (
      (b.ultimoPedido ?? '').localeCompare(a.ultimoPedido ?? '') ||
      a.nombre.localeCompare(b.nombre, 'es')
    );
  });
}
