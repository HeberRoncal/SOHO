import { ProductoAdministracion, resumenInventario } from './producto-administracion';
import { MovimientoInventario } from './movimiento-inventario';
import {
  adaptarPaginacion,
  registro,
  texto,
} from '../../../tienda/pedidos/modelos/contrato-pedidos';

export type EstadoConsultaProductos = 'inicial' | 'cargando' | 'lista' | 'error';
export const PAGINA_PRODUCTOS = { pagina: 1, limite: 20, total: 0, paginas: 0 };
export interface ConteosProductos {
  publicados: number;
  borradores: number;
  archivados: number;
  variantes: number;
}
export const CONTEOS_PRODUCTOS: ConteosProductos = {
  publicados: 0,
  borradores: 0,
  archivados: 0,
  variantes: 0,
};
export interface OpcionProducto {
  id: string;
  slug: string;
  nombre: string;
  activa: boolean;
}
export interface OpcionesProductos {
  marcas: readonly OpcionProducto[];
  categorias: readonly OpcionProducto[];
}
export interface AlertaStock {
  producto: { identificador: string; nombre: string };
  variante: {
    identificador: string;
    sku: string;
    talla: string;
    existencias: number;
    cantidadReservada: number;
  };
  color: string;
  disponible: number;
  faltante: number;
  imagen: string | null;
}
export interface ResumenInventario {
  resumen: ConteosProductos;
  alertasTotal: number;
  agotadasTotal: number;
  faltantesTotal: number;
  alertas: readonly AlertaStock[];
}
export function enteroProducto(v: unknown, maximo = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(v) || (v as number) < 0 || (v as number) > maximo)
    throw Error('Cantidad de inventario inválida.');
  return v as number;
}
export function listaProducto(v: unknown): unknown[] {
  if (!Array.isArray(v)) throw Error('Listado inválido.');
  return v;
}
function booleano(v: unknown): boolean {
  if (typeof v !== 'boolean') throw Error('Estado inválido.');
  return v;
}
function id(v: unknown): string {
  const t = texto(v);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t))
    throw Error('Identificador inválido.');
  return t;
}
function importe(v: unknown): number | null {
  if (v === null) return null;
  const t = texto(v);
  if (!/^\d{1,6}\.\d{2}$/.test(t) || Number(t) <= 0) throw Error('Precio inválido.');
  return Number(t);
}
function imagen(v: unknown): string {
  const t = texto(v);
  if (!/^\/(?!\/)/.test(t) && !/^https?:\/\//.test(t)) throw Error('Fotografía inválida.');
  return t;
}
export function soloConsulta(v: unknown) {
  if (registro(registro(v)['capacidades'])['escrituraDisponible'] !== false)
    throw Error('Capacidades inválidas.');
}
export function adaptarConteos(v: unknown): ConteosProductos {
  const r = registro(v);
  return {
    publicados: enteroProducto(r['publicados']),
    borradores: enteroProducto(r['borradores']),
    archivados: enteroProducto(r['archivados']),
    variantes: enteroProducto(r['variantes']),
  };
}
export function adaptarOpciones(v: unknown): OpcionesProductos {
  soloConsulta(v);
  const r = registro(v);
  const opciones = (v: unknown) =>
    listaProducto(v).map((v) => {
      const o = registro(v);
      return {
        id: id(o['id']),
        slug: texto(o['slug']),
        nombre: texto(o['nombre']),
        activa: booleano(o['activa']),
      };
    });
  return { marcas: opciones(r['marcas']), categorias: opciones(r['categorias']) };
}
export function adaptarProductoAdmin(v: unknown): ProductoAdministracion {
  const p = registro(v),
    estado = texto(p['estado']),
    genero = texto(p['genero']);
  if (
    !['borrador', 'publicado', 'archivado'].includes(estado) ||
    !['Hombre', 'Mujer', 'Unisex'].includes(genero)
  )
    throw Error('Producto inválido.');
  const nombreOpcion = (v: unknown) => (v === null ? '' : texto(registro(v)['nombre']));
  const colores = listaProducto(p['colores']).map((v) => {
    const c = registro(v);
    return {
      codigo: texto(c['codigo']),
      nombre: texto(c['nombre']),
      hexadecimal: texto(c['hexadecimal']),
      imagenes: listaProducto(c['imagenes']).map(imagen),
    };
  });
  const variantes = listaProducto(p['variantes']).map((v) => {
    const a = registro(v),
      existencias = enteroProducto(a['existencias'], 99999),
      cantidadReservada = enteroProducto(a['cantidadReservada'], 99999),
      habilitada = booleano(a['habilitada']);
    if (
      a['sistemaTallas'] !== 'EU' ||
      !colores.some((c) => c.codigo === a['codigoColor']) ||
      a['disponible'] !== (habilitada ? Math.max(0, existencias - cantidadReservada) : 0) ||
      a['faltante'] !== Math.max(0, cantidadReservada - existencias)
    )
      throw Error('Inventario incoherente.');
    return {
      identificador: id(a['id']),
      sku: texto(a['sku']),
      codigoColor: texto(a['codigoColor']),
      talla: texto(a['talla']),
      sistemaTallas: 'EU' as const,
      existencias,
      cantidadReservada,
      habilitada,
    };
  });
  if (
    new Set(variantes.map((v) => v.sku)).size !== variantes.length ||
    new Set(variantes.map((v) => v.identificador)).size !== variantes.length
  )
    throw Error('Variantes repetidas.');
  const producto: ProductoAdministracion = {
    identificador: id(p['id']),
    slug: texto(p['slug']),
    codigoInterno: texto(p['codigoInterno']),
    nombre: texto(p['nombre']),
    modelo: p['modelo'] === null ? '' : texto(p['modelo']),
    codigoModelo: p['codigoModelo'] === null ? '' : texto(p['codigoModelo']),
    descripcion: texto(p['descripcion']),
    marca: nombreOpcion(p['marca']),
    categoria: nombreOpcion(p['categoria']),
    genero: genero as ProductoAdministracion['genero'],
    estado: estado as ProductoAdministracion['estado'],
    precio: importe(p['precio']),
    precioAnterior: importe(p['precioAnterior']),
    esNovedad: booleano(p['esNovedad']),
    // Las respuestas idempotentes históricas pueden preceder al campo.
    esDestacado: p['esDestacado'] === undefined ? false : booleano(p['esDestacado']),
    imagenes: listaProducto(p['imagenes']).map(imagen),
    colores,
    variantes,
  };
  const inventario = registro(p['inventario']),
    calculado = resumenInventario(producto);
  for (const k of ['fisico', 'reservado', 'disponible', 'bajo', 'agotadas', 'activas'] as const)
    if (inventario[k] !== calculado[k]) throw Error('Resumen de producto incoherente.');
  return Object.freeze(producto);
}
export function adaptarListadoProductos(v: unknown) {
  soloConsulta(v);
  const r = registro(v);
  return {
    productos: listaProducto(r['productos']).map(adaptarProductoAdmin),
    paginacion: adaptarPaginacion(r['paginacion']),
    resumen: adaptarConteos(r['resumen']),
  };
}
export function adaptarMovimientos(v: unknown) {
  soloConsulta(v);
  const r = registro(v);
  const movimientos: MovimientoInventario[] = listaProducto(r['movimientos']).map((v) => {
    const m = registro(v),
      origen = texto(m['origen']),
      tipo = texto(m['tipo']);
    const anterior = enteroProducto(m['saldoAnterior'], 99999),
      saldo = enteroProducto(m['saldo'], 99999),
      reservado = enteroProducto(m['reservado'], 99999),
      delta = m['cantidad'];
    if (
      !['entrada', 'salida', 'ajuste'].includes(tipo) ||
      !['manual', 'stock-inicial', 'envio-pedido'].includes(origen) ||
      !Number.isInteger(delta) ||
      delta === 0 ||
      saldo - anterior !== delta ||
      (tipo === 'entrada' && (delta as number) < 0) ||
      (tipo === 'salida' && (delta as number) > 0)
    )
      throw Error('Movimiento inválido.');
    const disponible = booleano(m['habilitada']) ? Math.max(0, saldo - reservado) : 0;
    if (m['disponible'] !== disponible || !Number.isFinite(Date.parse(texto(m['fecha']))))
      throw Error('Historial inválido.');
    return {
      identificador: id(m['id']),
      fecha: texto(m['fecha']),
      administrador:
        m['responsable'] === null
          ? 'Carga inicial / sistema'
          : texto(registro(m['responsable'])['nombre']),
      productoId: id(m['productoId']),
      producto: texto(m['producto']),
      sku: texto(m['sku']),
      color: texto(m['color']),
      talla: texto(m['talla']),
      tipo: tipo as MovimientoInventario['tipo'],
      origen: origen as MovimientoInventario['origen'],
      cantidad: delta as number,
      saldoAnterior: anterior,
      saldo,
      reservado,
      disponible,
      motivo: texto(m['motivo']),
      referencia: m['referencia'] === null ? '' : texto(m['referencia']),
      pedido: m['pedido'] === null ? null : texto(m['pedido']),
    };
  });
  return { movimientos, paginacion: adaptarPaginacion(r['paginacion']) };
}
export function adaptarResumenInventario(v: unknown): ResumenInventario {
  soloConsulta(v);
  const r = registro(v);
  const alertas = listaProducto(r['alertas']).map((v) => {
    const a = registro(v),
      p = registro(a['producto']),
      va = registro(a['variante']);
    const existencias = enteroProducto(va['existencias'], 99999),
      cantidadReservada = enteroProducto(va['cantidadReservada'], 99999);
    const disponible = Math.max(0, existencias - cantidadReservada),
      faltante = Math.max(0, cantidadReservada - existencias);
    if (a['disponible'] !== disponible || disponible > 2 || a['faltante'] !== faltante)
      throw Error('Alerta incoherente.');
    return {
      producto: { identificador: id(p['id']), nombre: texto(p['nombre']) },
      variante: {
        identificador: id(va['id']),
        sku: texto(va['sku']),
        talla: texto(va['talla']),
        existencias,
        cantidadReservada,
      },
      color: texto(a['color']),
      disponible,
      faltante,
      imagen: a['imagen'] === null ? null : imagen(a['imagen']),
    };
  });
  const alertasTotal = enteroProducto(r['alertasTotal']),
    agotadasTotal = enteroProducto(r['agotadasTotal']),
    faltantesTotal = enteroProducto(r['faltantesTotal']);
  if (
    alertas.length > 7 ||
    alertas.length > alertasTotal ||
    agotadasTotal > alertasTotal ||
    faltantesTotal > agotadasTotal
  )
    throw Error('Conteos de alertas inválidos.');
  return {
    resumen: adaptarConteos(r['resumen']),
    alertas,
    alertasTotal,
    agotadasTotal,
    faltantesTotal,
  };
}
