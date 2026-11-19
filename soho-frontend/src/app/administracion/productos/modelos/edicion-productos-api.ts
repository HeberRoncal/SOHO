import { registro, texto } from '../../../tienda/pedidos/modelos/contrato-pedidos';
import { adaptarProductoAdmin, enteroProducto, listaProducto } from './consulta-productos-api';

export interface GrupoModeloAdmin {
  id: string;
  marcaId: string;
  codigoModelo: string;
  modelo: string;
  version: number;
}
export interface OpcionesEdicionProductos {
  marcas: { id: string; codigo: string; nombre: string; activa: boolean }[];
  categorias: { id: string; nombre: string; activa: boolean }[];
  gruposModelo: GrupoModeloAdmin[];
  tallas: string[];
}
export function opcionesEdicion(v: unknown): OpcionesEdicionProductos {
  const r = registro(v);
  return {
    marcas: listaProducto(r['marcas']).map((v) => {
      const m = registro(v);
      return {
        id: uuid(m['id']),
        codigo: texto(m['codigo']),
        nombre: texto(m['nombre']),
        activa: activo(m['activa']),
      };
    }),
    categorias: listaProducto(r['categorias']).map((v) => {
      const c = registro(v);
      return { id: uuid(c['id']), nombre: texto(c['nombre']), activa: activo(c['activa']) };
    }),
    gruposModelo: listaProducto(r['gruposModelo']).map((v) => {
      const g = registro(v);
      return {
        id: uuid(g['id']),
        marcaId: uuid(g['marcaId']),
        codigoModelo: texto(g['codigoModelo']),
        modelo: texto(g['modelo']),
        version: version(g['version']),
      };
    }),
    tallas: listaProducto(r['tallas']).map((v) => {
      const t = registro(v),
        valor = texto(t['valor']);
      if (t['sistema'] !== 'EU' || !/^(3[5-9]|4[0-8])(\.5)?$/.test(valor) || Number(valor) > 48)
        throw Error('Talla inválida.');
      return valor;
    }),
  };
}
export function uuid(v: unknown): string {
  const s = texto(v);
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(s))
    throw Error('Identificador inválido.');
  return s;
}
function activo(v: unknown): boolean {
  if (typeof v !== 'boolean') throw Error('Estado inválido.');
  return v;
}
function version(v: unknown): number {
  const n = enteroProducto(v);
  if (!n) throw Error('Versión inválida.');
  return n;
}
export function productoEdicion(v: unknown) {
  const r = registro(v),
    producto = adaptarProductoAdmin(r),
    grupo = r['grupoModelo'] === null ? null : registro(r['grupoModelo']);
  return {
    producto,
    version: version(r['version']),
    grupo: grupo ? { id: uuid(grupo['id']), version: version(grupo['version']) } : null,
    marcaId: r['marca'] === null ? '' : uuid(registro(r['marca'])['id']),
    categoriaId: r['categoria'] === null ? '' : uuid(registro(r['categoria'])['id']),
    ordenCatalogo: enteroProducto(r['ordenCatalogo']),
    ordenColor: enteroProducto(r['ordenColor']),
  };
}
export type ProductoEdicion = ReturnType<typeof productoEdicion>;
export interface ArchivoProducto {
  id: string;
  estado: 'PENDIENTE' | 'CONCILIANDO' | 'DISPONIBLE' | 'ELIMINANDO' | 'ELIMINADO' | 'FALLIDO';
  url: string | null;
  nombre: string | null;
}
export interface ImagenGaleria {
  archivoId: string;
  textoAlternativo: string;
}
export function archivoProducto(v: unknown): ArchivoProducto {
  const a = registro(v),
    estado = texto(a['estado']);
  if (
    !['PENDIENTE', 'CONCILIANDO', 'DISPONIBLE', 'ELIMINANDO', 'ELIMINADO', 'FALLIDO'].includes(
      estado,
    )
  )
    throw Error('Estado de carga inválido.');
  const url = a['url'] === null ? null : texto(a['url']);
  if (url !== null && !/^\/(?!\/)|^https?:\/\//.test(url)) throw Error('URL inválida.');
  return {
    id: uuid(a['id']),
    estado: estado as ArchivoProducto['estado'],
    url,
    nombre: a['nombre'] === null ? null : texto(a['nombre']),
  };
}
export function galeriaProducto(v: unknown) {
  const r = registro(v),
    archivos = listaProducto(r['archivos']).map(archivoProducto);
  const imagenes = listaProducto(r['galeria']).map((v, i) => {
    const g = registro(v);
    if (g['orden'] !== i) throw Error('Orden de galería inválido.');
    if (g['archivo'] !== null) {
      const a = archivoProducto(g['archivo']);
      if (!archivos.some((x) => x.id === a.id)) archivos.push(a);
    }
    return { archivoId: uuid(g['archivoId']), textoAlternativo: texto(g['textoAlternativo']) };
  });
  if (imagenes.length > 10 || new Set(imagenes.map((i) => i.archivoId)).size !== imagenes.length)
    throw Error('Galería inválida.');
  return { productoId: uuid(r['productoId']), version: version(r['version']), imagenes, archivos };
}
export interface OperacionProducto {
  claveSolicitud: string;
  ruta: string;
  metodo: 'POST' | 'PATCH';
  cuerpo: Record<string, unknown>;
  tipo: 'CREAR' | 'ACTUALIZAR' | 'ACTUALIZAR_GALERIA' | 'PUBLICAR' | 'ARCHIVAR' | 'RESTAURAR';
  productoId: string | null;
  contexto?: 'borrador' | 'publicado';
  incierto?: boolean;
}

export function rutaOperacionProducto(
  p: Pick<OperacionProducto, 'tipo' | 'productoId' | 'contexto'>,
) {
  if (p.tipo === 'CREAR') return '/api/admin/productos';
  return `/api/admin/productos/${p.productoId}/${
    p.tipo === 'ACTUALIZAR'
      ? (p.contexto ?? 'borrador')
      : p.tipo === 'PUBLICAR'
        ? 'publicacion'
        : p.tipo === 'ARCHIVAR'
          ? 'archivo'
          : p.tipo === 'RESTAURAR'
            ? 'restauracion'
            : 'galeria'
  }`;
}

export function operacionProductoGuardada(v: unknown, soloMetadatos = false): OperacionProducto {
  const r = registro(v);
  const tipos = ['CREAR', 'ACTUALIZAR', 'ACTUALIZAR_GALERIA', 'PUBLICAR', 'ARCHIVAR', 'RESTAURAR'];
  if (!tipos.includes(String(r['tipo']))) throw Error('Operación inválida.');
  const p = r as unknown as OperacionProducto;
  uuid(p.claveSolicitud);
  if (p.tipo === 'CREAR' ? p.productoId !== null : !p.productoId) throw Error('Producto inválido.');
  if (p.productoId !== null) uuid(p.productoId);
  if (
    p.contexto !== undefined &&
    (p.tipo !== 'ACTUALIZAR' || !['borrador', 'publicado'].includes(p.contexto))
  )
    throw Error('Contexto inválido.');
  if (p.incierto !== undefined && typeof p.incierto !== 'boolean') throw Error('Estado inválido.');
  const metodo = ['CREAR', 'PUBLICAR', 'ARCHIVAR', 'RESTAURAR'].includes(p.tipo) ? 'POST' : 'PATCH';
  if (p.ruta !== rutaOperacionProducto(p) || p.metodo !== metodo) throw Error('Ruta inválida.');
  const c = registro(p.cuerpo);
  if (c['claveSolicitud'] !== p.claveSolicitud) throw Error('Clave incoherente.');
  if (
    p.tipo !== 'CREAR' &&
    (!Number.isInteger(c['version']) ||
      Number(c['version']) < 1 ||
      Number(c['version']) >= 4294967295)
  )
    throw Error('Versión inválida.');
  if (soloMetadatos) return p;
  const comerciales = [
    'nombre',
    'descripcion',
    'categoriaId',
    'genero',
    'precio',
    'precioAnterior',
    'esNovedad',
    ...(p.contexto === 'publicado' ? ['esDestacado'] : []),
    'ordenCatalogo',
    'ordenColor',
  ];
  const campos =
    p.tipo === 'ACTUALIZAR_GALERIA'
      ? ['imagenes']
      : ['PUBLICAR', 'ARCHIVAR', 'RESTAURAR'].includes(p.tipo)
        ? []
        : [
            ...comerciales,
            ...(p.contexto === 'publicado' ? [] : ['grupoModelo', 'color', 'tallas']),
          ];
  if (
    Object.keys(c).some(
      (k) => !['claveSolicitud', ...(p.tipo === 'CREAR' ? [] : ['version']), ...campos].includes(k),
    )
  )
    throw Error('Campos inválidos.');
  if (p.tipo === 'CREAR' && (typeof c['nombre'] !== 'string' || !c['nombre'].trim()))
    throw Error('Nombre inválido.');
  if (p.tipo === 'ACTUALIZAR' && !campos.some((k) => k in c)) throw Error('Cambio vacío.');
  for (const k of ['nombre', 'descripcion'])
    if (
      k in c &&
      (typeof c[k] !== 'string' ||
        c[k].length > (k === 'nombre' ? 180 : 600) ||
        /[\p{Cc}\p{Cf}]/u.test(c[k]))
    )
      throw Error('Texto inválido.');
  for (const k of ['precio', 'precioAnterior'])
    if (
      k in c &&
      c[k] !== null &&
      (typeof c[k] !== 'string' ||
        !/^(?:0|[1-9]\d{0,5})(?:\.\d{1,2})?$/.test(c[k]) ||
        Number(c[k]) <= 0)
    )
      throw Error('Importe inválido.');
  if ('categoriaId' in c && c['categoriaId'] !== null) uuid(c['categoriaId']);
  if ('genero' in c && !['HOMBRE', 'MUJER', 'UNISEX'].includes(String(c['genero'])))
    throw Error('Género inválido.');
  if ('esNovedad' in c && typeof c['esNovedad'] !== 'boolean') throw Error('Estado inválido.');
  if ('esDestacado' in c && typeof c['esDestacado'] !== 'boolean') throw Error('Estado inválido.');
  for (const k of ['ordenCatalogo', 'ordenColor'])
    if (k in c && (!Number.isInteger(c[k]) || Number(c[k]) < 0 || Number(c[k]) > 4294967295))
      throw Error('Orden inválido.');
  if (p.tipo === 'ACTUALIZAR_GALERIA') {
    if (!Array.isArray(c['imagenes']) || c['imagenes'].length > 10)
      throw Error('Galería inválida.');
    const ids = new Set<string>();
    for (const v of c['imagenes']) {
      const i = registro(v),
        id = uuid(i['archivoId']);
      if (
        ids.has(id) ||
        Object.keys(i).some((k) => !['archivoId', 'textoAlternativo'].includes(k)) ||
        (i['textoAlternativo'] !== undefined &&
          (typeof i['textoAlternativo'] !== 'string' || i['textoAlternativo'].length > 160))
      )
        throw Error('Imagen inválida.');
      ids.add(id);
    }
  }
  return p;
}
