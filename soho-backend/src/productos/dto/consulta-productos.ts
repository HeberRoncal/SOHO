import { BadRequestException } from '@nestjs/common';
import { objeto } from '../../autenticacion/acceso/datos-auth.js';

const invalido = (): never => {
  throw new BadRequestException(
    'Los filtros de productos o inventario no son válidos.',
  );
};
function texto(valor: unknown, maximo: number): string {
  if (valor === undefined) return '';
  if (
    typeof valor !== 'string' ||
    valor.length > maximo ||
    /[\p{Cc}\p{Cf}]/u.test(valor)
  )
    return invalido();
  return valor.trim();
}
function opcion<T extends string>(
  valor: unknown,
  opciones: readonly T[],
  defecto: T,
): T {
  const v = texto(valor, 40);
  return !v ? defecto : opciones.includes(v as T) ? (v as T) : invalido();
}
function entero(valor: unknown, defecto: number, maximo: number): number {
  if (valor === undefined) return defecto;
  if (typeof valor !== 'string' || !/^[1-9]\d{0,5}$/.test(valor))
    return invalido();
  const n = Number(valor);
  return n <= maximo ? n : invalido();
}
export function idProducto(valor: unknown): string {
  if (
    typeof valor !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      valor,
    )
  )
    return invalido();
  return valor;
}
function fecha(valor: unknown): string {
  const v = texto(valor, 10);
  if (!v) return '';
  const d = new Date(v + 'T00:00:00Z');
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
    !Number.isFinite(d.getTime()) ||
    d.toISOString().slice(0, 10) !== v
  )
    return invalido();
  return v;
}
export function leerProductos(valor: unknown) {
  const q = objeto(valor, [
    'busqueda',
    'marca',
    'categoria',
    'estado',
    'disponibilidad',
    'orden',
    'pagina',
    'limite',
  ]);
  const marca = texto(q.marca, 80),
    categoria = texto(q.categoria, 100);
  if (
    [marca, categoria].some((v) => v && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v))
  )
    return invalido();
  return {
    busqueda: texto(q.busqueda, 120),
    marca,
    categoria,
    estado: opcion(
      q.estado,
      ['', 'publicado', 'borrador', 'archivado'] as const,
      '',
    ),
    disponibilidad: opcion(
      q.disponibilidad,
      ['', 'disponible', 'bajo', 'agotado'] as const,
      '',
    ),
    orden: opcion(
      q.orden,
      [
        'catalogo',
        'nombre',
        'precio-ascendente',
        'precio-descendente',
        'stock',
      ] as const,
      'catalogo',
    ),
    pagina: entero(q.pagina, 1, 100000),
    limite: entero(q.limite, 20, 50),
  };
}
export type ConsultaProductos = ReturnType<typeof leerProductos>;
export function leerMovimientos(valor: unknown) {
  const q = objeto(valor, [
    'producto',
    'sku',
    'busqueda',
    'tipo',
    'origen',
    'desde',
    'hasta',
    'pagina',
    'limite',
  ]);
  const desde = fecha(q.desde),
    hasta = fecha(q.hasta);
  if (desde && hasta && desde > hasta) return invalido();
  return {
    producto:
      q.producto === undefined || q.producto === ''
        ? ''
        : idProducto(q.producto),
    sku: texto(q.sku, 96),
    busqueda: texto(q.busqueda, 120),
    desde,
    hasta,
    tipo: opcion(q.tipo, ['', 'entrada', 'salida', 'ajuste'] as const, ''),
    origen: opcion(
      q.origen,
      ['', 'manual', 'stock-inicial', 'envio-pedido'] as const,
      '',
    ),
    pagina: entero(q.pagina, 1, 100000),
    limite: entero(q.limite, 20, 50),
  };
}
export type ConsultaMovimientos = ReturnType<typeof leerMovimientos>;
export function sinFiltros(q: unknown) {
  objeto(q, []);
}
export const escaparLike = (v: string) => v.replace(/[\\%_]/g, '\\$&');
