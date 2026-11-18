import { CODIGO_PEDIDO, registro, texto } from '../../../tienda/pedidos/modelos/contrato-pedidos';
import {
  ESTADOS_ENTREGA_ADMIN,
  ESTADOS_PAGO_ADMIN,
  EstadoEntregaAdmin,
  EstadoPagoAdmin,
} from '../../pedidos/modelos/pedido-admin';

export const PAGINA_CLIENTES = { pagina: 1, limite: 20, total: 0, paginas: 0 };
export const RESUMEN_CLIENTES = {
  total: 0,
  registrados: 0,
  invitados: 0,
  unidadInvitados: 'pedido' as const,
};
export type PaginaClientes = typeof PAGINA_CLIENTES;
export type EstadoClientes = 'inicial' | 'cargando' | 'lista' | 'error' | 'ausente' | 'sin-permiso';
export interface ReferenciaCompra {
  codigo: string;
  fecha: string;
}
export interface FilaCliente {
  identificador: string;
  tipo: 'registrado' | 'invitado';
  nombre: string;
  correo: string;
  telefonoEntrega: {
    celular: string;
    destinatario: string;
    pedidoCodigo: string;
    fecha: string;
  } | null;
  pedidosTotal: number;
  ultimoPedido: ReferenciaCompra | null;
}
export interface DetalleCliente extends FilaCliente {
  cuenta: { creadaEn: string; activa: boolean; correoVerificado: boolean } | null;
  resumen: {
    pedidosTotal: number;
    direccionesTotal: number;
    primerPedido: ReferenciaCompra | null;
    ultimoPedido: ReferenciaCompra | null;
    pagosAprobados: string;
    moneda: 'PEN';
  };
}
export interface DireccionCliente {
  direccion: string;
  distritoCodigo: string;
  distritoNombre: string;
  provincia: string;
  departamento: string;
  referencia: string;
  pedidosTotal: number;
  ultimaUtilizacionEn: string;
  pedidoReferencia: string;
}
export interface CompraCliente {
  codigo: string;
  fecha: string;
  contacto: { nombres: string; apellidos: string; correo: string };
  direccion: Omit<DireccionCliente, 'pedidosTotal' | 'ultimaUtilizacionEn' | 'pedidoReferencia'> & {
    destinatario: string;
    celular: string;
  };
  estadoPago: EstadoPagoAdmin | null;
  estadoEntrega: EstadoEntregaAdmin;
  moneda: 'PEN';
  total: string;
  articulos: readonly {
    sku: string;
    nombre: string;
    imagen: string;
    color: string;
    talla: string;
    cantidad: number;
  }[];
}
const invalido = (): never => {
  throw Error('Respuesta de Clientes inválida.');
};
export function identificadorCliente(v: unknown) {
  const s = texto(v);
  if (!/^(?:invitado:)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s))
    return invalido();
  return s.toLowerCase();
}
function cadena(v: unknown, max = 254, vacia = false) {
  const s = texto(v);
  if (
    (!vacia && !s.trim()) ||
    s.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(s)
  )
    return invalido();
  return s;
}
function entero(v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(v) || (v as number) < min || (v as number) > max) return invalido();
  return v as number;
}
function fecha(v: unknown) {
  const s = cadena(v, 24);
  const d = new Date(s);
  if (!Number.isFinite(d.getTime()) || d.toISOString() !== s) return invalido();
  return s;
}
function codigo(v: unknown) {
  const s = cadena(v, 32);
  return CODIGO_PEDIDO.test(s) ? s : invalido();
}
function lista(v: unknown): unknown[] {
  return Array.isArray(v) ? v : invalido();
}
function booleano(v: unknown) {
  return typeof v === 'boolean' ? v : invalido();
}
function dinero(v: unknown) {
  const s = texto(v);
  return /^(0|[1-9]\d{0,62})\.\d{2}$/.test(s) ? s : invalido();
}
function capacidades(v: unknown) {
  if (registro(v)['escrituraDisponible'] !== false) invalido();
}
function referencia(v: unknown): ReferenciaCompra | null {
  if (v === null) return null;
  const r = registro(v);
  return { codigo: codigo(r['codigo']), fecha: fecha(r['fecha']) };
}
function celular(v: unknown) {
  const s = texto(v);
  return /^9\d{8}$/.test(s) ? s : invalido();
}
function fila(v: unknown): FilaCliente {
  const r = registro(v),
    id = identificadorCliente(r['identificador']);
  const tipo = id.startsWith('invitado:') ? 'invitado' : 'registrado';
  if (r['tipo'] !== tipo) return invalido();
  const total = entero(r['pedidosTotal']),
    ultimo = referencia(r['ultimoPedido']);
  const t = r['telefonoEntrega'] === null ? null : registro(r['telefonoEntrega']);
  if (
    (total === 0) !== (ultimo === null) ||
    (ultimo === null) !== (t === null) ||
    (tipo === 'invitado' && total !== 1)
  )
    return invalido();
  const telefono = t
    ? {
        celular: celular(t['celular']),
        destinatario: cadena(t['destinatario'], 140),
        pedidoCodigo: codigo(t['pedidoCodigo']),
        fecha: fecha(t['fecha']),
      }
    : null;
  if (telefono && (telefono.pedidoCodigo !== ultimo!.codigo || telefono.fecha !== ultimo!.fecha))
    return invalido();
  return {
    identificador: id,
    tipo,
    nombre: cadena(r['nombre'], 161),
    correo: cadena(r['correo']),
    telefonoEntrega: telefono,
    pedidosTotal: total,
    ultimoPedido: ultimo,
  };
}
export function paginaClientes(v: unknown): PaginaClientes {
  const r = registro(v),
    total = entero(r['total']),
    limite = entero(r['limite'], 1, 50),
    paginas = entero(r['paginas']);
  if (paginas !== Math.ceil(total / limite)) return invalido();
  return { pagina: entero(r['pagina'], 1, 100000), limite, paginas, total };
}
function paginaLista<T>(r: Record<string, unknown>, campo: string, adaptar: (v: unknown) => T) {
  const pagina = paginaClientes(r['paginacion']),
    datos = lista(r[campo]).map(adaptar);
  const esperadas = Math.min(
    pagina.limite,
    Math.max(0, pagina.total - (pagina.pagina - 1) * pagina.limite),
  );
  if (datos.length !== esperadas) return invalido();
  return { datos, pagina };
}
export function listadoClientes(v: unknown) {
  const r = registro(v);
  capacidades(r['capacidades']);
  const p = paginaLista(r, 'clientes', fila),
    s = registro(r['resumen']);
  const resumen = {
    total: entero(s['total']),
    registrados: entero(s['registrados']),
    invitados: entero(s['invitados']),
    unidadInvitados: 'pedido' as const,
  };
  if (
    s['unidadInvitados'] !== 'pedido' ||
    resumen.total !== resumen.registrados + resumen.invitados ||
    p.pagina.total > resumen.total ||
    new Set(p.datos.map((c) => c.identificador)).size !== p.datos.length
  )
    return invalido();
  return { clientes: p.datos, paginacion: p.pagina, resumen };
}
export function detalleCliente(v: unknown, esperado: string): DetalleCliente {
  const r = registro(registro(v)['cliente']);
  capacidades(r['capacidades']);
  const c = fila(r),
    s = registro(r['resumen']),
    cuenta = r['cuenta'] === null ? null : registro(r['cuenta']);
  if (
    c.identificador !== identificadorCliente(esperado) ||
    (c.tipo === 'invitado') !== (cuenta === null)
  )
    return invalido();
  const primer = referencia(s['primerPedido']),
    ultimo = referencia(s['ultimoPedido']);
  const direcciones = entero(s['direccionesTotal']);
  if (
    s['moneda'] !== 'PEN' ||
    entero(s['pedidosTotal']) !== c.pedidosTotal ||
    JSON.stringify(ultimo) !== JSON.stringify(c.ultimoPedido) ||
    (c.pedidosTotal === 0) !== (primer === null) ||
    direcciones > c.pedidosTotal ||
    (c.pedidosTotal === 0) !== (direcciones === 0) ||
    (primer && ultimo && primer.fecha > ultimo.fecha)
  )
    return invalido();
  const importe = dinero(s['pagosAprobados']);
  if (!c.pedidosTotal && importe !== '0.00') return invalido();
  return {
    ...c,
    cuenta: cuenta
      ? {
          creadaEn: fecha(cuenta['creadaEn']),
          activa: booleano(cuenta['activa']),
          correoVerificado: booleano(cuenta['correoVerificado']),
        }
      : null,
    resumen: {
      pedidosTotal: c.pedidosTotal,
      direccionesTotal: direcciones,
      primerPedido: primer,
      ultimoPedido: ultimo,
      pagosAprobados: importe,
      moneda: 'PEN',
    },
  };
}
function direccion(v: unknown) {
  const r = registro(v);
  return {
    direccion: cadena(r['direccion'], 180),
    distritoCodigo: cadena(r['distritoCodigo'], 80),
    distritoNombre: cadena(r['distritoNombre'], 80),
    provincia: cadena(r['provincia'], 80),
    departamento: cadena(r['departamento'], 80),
    referencia: cadena(r['referencia'], 200, true),
  };
}
export function comprasCliente(v: unknown) {
  const p = paginaLista(registro(v), 'pedidos', (v): CompraCliente => {
    const r = registro(v),
      c = registro(r['contacto']),
      d = registro(r['direccion']);
    const pago = r['estadoPago'] === null ? null : texto(r['estadoPago']).toLowerCase(),
      entrega = texto(r['estadoEntrega']).toLowerCase().replaceAll('_', '-');
    if (
      (pago !== null && !Object.hasOwn(ESTADOS_PAGO_ADMIN, pago)) ||
      !Object.hasOwn(ESTADOS_ENTREGA_ADMIN, entrega) ||
      r['moneda'] !== 'PEN'
    )
      return invalido();
    const articulos = lista(r['articulos']).map((v) => {
      const a = registro(v),
        imagen = cadena(a['imagen'], 1024),
        talla = texto(a['talla']);
      if (
        (!/^\/(?!\/)/.test(imagen) && !/^https:\/\//.test(imagen)) ||
        !/^\d{2}(?:\.5)?$/.test(talla) ||
        Number(talla) < 35 ||
        Number(talla) > 48
      )
        return invalido();
      return {
        sku: cadena(a['sku'], 96),
        nombre: cadena(a['nombre'], 180),
        imagen,
        color: cadena(a['color'], 50),
        talla,
        cantidad: entero(a['cantidad'], 1, 99999),
      };
    });
    if (new Set(articulos.map((a) => a.sku)).size !== articulos.length) return invalido();
    return {
      codigo: codigo(r['codigo']),
      fecha: fecha(r['fecha']),
      contacto: {
        nombres: cadena(c['nombres'], 80),
        apellidos: cadena(c['apellidos'], 80),
        correo: cadena(c['correo']),
      },
      direccion: {
        ...direccion(d),
        destinatario: cadena(d['destinatario'], 140),
        celular: celular(d['celular']),
      },
      estadoPago: pago as EstadoPagoAdmin | null,
      estadoEntrega: entrega as EstadoEntregaAdmin,
      moneda: 'PEN',
      total: dinero(r['total']),
      articulos,
    };
  });
  if (new Set(p.datos.map((p) => p.codigo)).size !== p.datos.length) return invalido();
  return { pedidos: p.datos, paginacion: p.pagina };
}
export function direccionesCliente(v: unknown) {
  const p = paginaLista(registro(v), 'direcciones', (v) => {
    const r = registro(v);
    return {
      ...direccion(r),
      pedidosTotal: entero(r['pedidosTotal'], 1),
      ultimaUtilizacionEn: fecha(r['ultimaUtilizacionEn']),
      pedidoReferencia: codigo(r['pedidoReferencia']),
    };
  });
  const claves = p.datos.map((d) =>
    JSON.stringify([
      d.direccion,
      d.distritoCodigo,
      d.distritoNombre,
      d.provincia,
      d.departamento,
      d.referencia,
    ]),
  );
  if (new Set(claves).size !== claves.length) return invalido();
  return { direcciones: p.datos, paginacion: p.pagina };
}
const formatoEntero = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 });
export function importeCliente(v: string) {
  const [s, c] = dinero(v).split('.');
  return 'S/\u00a0' + formatoEntero.format(BigInt(s)) + '.' + c;
}
