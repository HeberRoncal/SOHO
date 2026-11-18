import { BadRequestException } from '@nestjs/common';
import { objeto } from '../../autenticacion/acceso/datos-auth.js';
import { idProducto } from '../dto/consulta-productos.js';

export type GrupoBorrador =
  | { id: string; version: number }
  | {
      marcaId: string;
      codigoModelo: string;
      modelo: string;
      slugCarpeta?: string;
    };
export type ColorBorrador = {
  codigo: string;
  nombre: string;
  hexadecimal: string;
};
export interface CambioBorrador {
  claveSolicitud: string;
  version?: number;
  nombre?: string;
  descripcion?: string;
  grupoModelo?: GrupoBorrador | null;
  color?: ColorBorrador | null;
  categoriaId?: string | null;
  genero?: 'HOMBRE' | 'MUJER' | 'UNISEX';
  precio?: string | null;
  precioAnterior?: string | null;
  esNovedad?: boolean;
  ordenCatalogo?: number;
  ordenColor?: number;
  tallas?: string[];
}
function invalido(campo: string): never {
  throw new BadRequestException('El campo ' + campo + ' no es válido.');
}
function texto(v: unknown, max: number, campo: string, vacio = false): string {
  if (typeof v !== 'string' || v.length > max || /[\p{Cc}\p{Cf}]/u.test(v))
    return invalido(campo);
  const s = v.trim().normalize('NFC');
  return s.length > max || (!s && !vacio) ? invalido(campo) : s;
}
export function versionBorrador(v: unknown): number {
  return typeof v === 'number' &&
    Number.isSafeInteger(v) &&
    v >= 1 &&
    v < 4294967295
    ? v
    : invalido('version');
}
function orden(v: unknown, campo: string): number {
  return typeof v === 'number' &&
    Number.isSafeInteger(v) &&
    v >= 0 &&
    v <= 4294967295
    ? v
    : invalido(campo);
}
function codigo(v: unknown, max: number, campo: string): string {
  const s = texto(v, max, campo).toUpperCase();
  return s.length <= max && /^[A-Z0-9]+$/.test(s) ? s : invalido(campo);
}
export function tallaBorrador(v: unknown): string {
  if (typeof v !== 'string' || !/^(?:3[5-9]|4[0-8])(?:\.[05])?$/.test(v))
    return invalido('tallas');
  const [entero, decimal = '0'] = v.split('.');
  if (entero === '48' && decimal !== '0') return invalido('tallas');
  return decimal === '0' ? entero : entero + '.5';
}
function dinero(v: unknown, campo: string): string | null {
  if (v === null) return null;
  if (typeof v !== 'string' || !/^(?:0|[1-9]\d{0,5})(?:\.\d{1,2})?$/.test(v))
    return invalido(campo);
  const [e, d = ''] = v.split('.');
  if (e === '0' && !/[1-9]/.test(d)) return invalido(campo);
  return e + '.' + d.padEnd(2, '0');
}
function grupo(v: unknown): GrupoBorrador | null {
  if (v === null) return null;
  const q = objeto(v, [
    'id',
    'version',
    'marcaId',
    'codigoModelo',
    'modelo',
    'slugCarpeta',
  ]);
  if ('id' in q) {
    objeto(q, ['id', 'version']);
    return {
      id: idProducto(q.id).toLowerCase(),
      version: versionBorrador(q.version),
    };
  }
  const r: GrupoBorrador = {
    marcaId: idProducto(q.marcaId).toLowerCase(),
    codigoModelo: codigo(q.codigoModelo, 60, 'codigoModelo'),
    modelo: texto(q.modelo, 100, 'modelo'),
  };
  if (q.slugCarpeta !== undefined) {
    const s = texto(q.slugCarpeta, 160, 'slugCarpeta');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)) return invalido('slugCarpeta');
    r.slugCarpeta = s;
  }
  return r;
}
function color(v: unknown): ColorBorrador | null {
  if (v === null) return null;
  const q = objeto(v, ['codigo', 'nombre', 'hexadecimal']);
  const c = codigo(q.codigo, 2, 'color.codigo'),
    hex = texto(q.hexadecimal, 7, 'color.hexadecimal').toUpperCase();
  if (!/^[A-Z]{2}$/.test(c) || !/^#[A-F0-9]{6}$/.test(hex))
    return invalido('color');
  return {
    codigo: c,
    nombre: texto(q.nombre, 50, 'color.nombre'),
    hexadecimal: hex,
  };
}
export class DatosBorrador {
  static leer(valor: unknown, editar: boolean): CambioBorrador {
    const campos = [
      'claveSolicitud',
      'nombre',
      'descripcion',
      'grupoModelo',
      'color',
      'categoriaId',
      'genero',
      'precio',
      'precioAnterior',
      'esNovedad',
      'ordenCatalogo',
      'ordenColor',
      'tallas',
    ];
    const q = objeto(valor, editar ? [...campos, 'version'] : campos);
    const r: CambioBorrador = {
      claveSolicitud: idProducto(q.claveSolicitud).toLowerCase(),
    };
    if (editar) r.version = versionBorrador(q.version);
    if (!editar || q.nombre !== undefined)
      r.nombre = texto(q.nombre, 180, 'nombre');
    if (q.descripcion !== undefined)
      r.descripcion = texto(q.descripcion, 600, 'descripcion', true);
    if (q.grupoModelo !== undefined) r.grupoModelo = grupo(q.grupoModelo);
    if (q.color !== undefined) r.color = color(q.color);
    if (q.categoriaId !== undefined)
      r.categoriaId =
        q.categoriaId === null ? null : idProducto(q.categoriaId).toLowerCase();
    if (q.genero !== undefined) {
      if (!['HOMBRE', 'MUJER', 'UNISEX'].includes(q.genero as string))
        return invalido('genero');
      r.genero = q.genero as CambioBorrador['genero'];
    }
    if (q.precio !== undefined) r.precio = dinero(q.precio, 'precio');
    if (q.precioAnterior !== undefined)
      r.precioAnterior = dinero(q.precioAnterior, 'precioAnterior');
    if (q.esNovedad !== undefined) {
      if (typeof q.esNovedad !== 'boolean') return invalido('esNovedad');
      r.esNovedad = q.esNovedad;
    }
    for (const campo of ['ordenCatalogo', 'ordenColor'] as const)
      if (q[campo] !== undefined) r[campo] = orden(q[campo], campo);
    if (q.tallas !== undefined) {
      if (!Array.isArray(q.tallas) || q.tallas.length > 27)
        return invalido('tallas');
      r.tallas = q.tallas
        .map(tallaBorrador)
        .sort((a, b) => Number(a) - Number(b));
      if (new Set(r.tallas).size !== r.tallas.length) return invalido('tallas');
    }
    if (editar && Object.keys(r).length === 2) return invalido('cambios');
    return r;
  }
}
