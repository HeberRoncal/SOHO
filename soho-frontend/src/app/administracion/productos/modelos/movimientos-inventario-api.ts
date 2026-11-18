import {
  adaptarPaginacion,
  registro,
  texto,
} from '../../../tienda/pedidos/modelos/contrato-pedidos';
import { adaptarMovimientos, enteroProducto } from './consulta-productos-api';
import { uuid } from './edicion-productos-api';
import { DatosMovimiento } from './movimiento-inventario';

export interface VarianteInventarioAdmin {
  id: string;
  sku: string;
  producto: {
    id: string;
    nombre: string;
    codigoInterno: string;
    estado: 'borrador' | 'publicado' | 'archivado';
  };
  color: { codigo: string; nombre: string };
  talla: string;
  sistemaTallas: 'EU';
  habilitada: boolean;
  existencias: number;
  cantidadReservada: number;
  versionExistencias: number;
  disponible: number;
  faltante: number;
}
export interface SolicitudMovimiento {
  claveSolicitud: string;
  versionExistencias: number;
  reservadoEsperado: number;
  habilitadaEsperada: boolean;
  tipo: 'ENTRADA' | 'SALIDA' | 'AJUSTE';
  cantidad: number;
  motivo: string;
  referencia: string | null;
}
export interface MovimientoPendiente {
  varianteId: string;
  cuerpo: SolicitudMovimiento;
  incierto: boolean;
}
export function varianteInventario(v: unknown): VarianteInventarioAdmin {
  const r = registro(v),
    p = registro(r['producto']),
    c = registro(r['color']);
  const existencias = enteroProducto(r['existencias'], 99999),
    cantidadReservada = enteroProducto(r['cantidadReservada'], 99999),
    versionExistencias = enteroProducto(r['versionExistencias'], 4294967295),
    habilitada = r['habilitada'];
  if (
    typeof habilitada !== 'boolean' ||
    !versionExistencias ||
    r['sistemaTallas'] !== 'EU' ||
    !['borrador', 'publicado', 'archivado'].includes(String(p['estado'])) ||
    r['disponible'] !== (habilitada ? Math.max(0, existencias - cantidadReservada) : 0) ||
    r['faltante'] !== Math.max(0, cantidadReservada - existencias)
  )
    throw Error('Inventario incoherente.');
  const talla = texto(r['talla']);
  if (!/^(3[5-9]|4[0-8])(\.5)?$/.test(talla) || Number(talla) > 48) throw Error('Talla inválida.');
  return {
    id: uuid(r['id']),
    sku: texto(r['sku']),
    producto: {
      id: uuid(p['id']),
      nombre: texto(p['nombre']),
      codigoInterno: texto(p['codigoInterno']),
      estado: p['estado'] as VarianteInventarioAdmin['producto']['estado'],
    },
    color: { codigo: texto(c['codigo']), nombre: texto(c['nombre']) },
    talla,
    sistemaTallas: 'EU',
    habilitada,
    existencias,
    cantidadReservada,
    versionExistencias,
    disponible: r['disponible'] as number,
    faltante: r['faltante'] as number,
  };
}
export function listaVariantesInventario(v: unknown) {
  const r = registro(v);
  if (!Array.isArray(r['variantes'])) throw Error('Variantes inválidas.');
  const variantes = r['variantes'].map(varianteInventario),
    paginacion = adaptarPaginacion(r['paginacion']);
  if (
    new Set(variantes.map((v) => v.id)).size !== variantes.length ||
    variantes.length > paginacion.limite
  )
    throw Error('Listado incoherente.');
  return { variantes, paginacion };
}
export function solicitudMovimiento(
  v: VarianteInventarioAdmin,
  d: DatosMovimiento,
  claveSolicitud = crypto.randomUUID(),
): SolicitudMovimiento {
  if (
    !/^\d+$/.test(d.cantidad.trim()) ||
    !['entrada', 'salida', 'ajuste'].includes(d.tipo) ||
    !['sumar', 'restar'].includes(d.sentido)
  )
    throw Error('Revisa el tipo y la cantidad.');
  const n = Number(d.cantidad),
    cantidad = d.tipo === 'salida' || (d.tipo === 'ajuste' && d.sentido === 'restar') ? -n : n;
  return validarSolicitudMovimiento({
    claveSolicitud,
    versionExistencias: v.versionExistencias,
    reservadoEsperado: v.cantidadReservada,
    habilitadaEsperada: v.habilitada,
    tipo: d.tipo.toUpperCase(),
    cantidad,
    motivo: d.motivo.trim().normalize('NFC'),
    referencia: d.referencia.trim().normalize('NFC') || null,
  });
}
export function validarSolicitudMovimiento(v: unknown): SolicitudMovimiento {
  const r = registro(v),
    campos = [
      'claveSolicitud',
      'versionExistencias',
      'reservadoEsperado',
      'habilitadaEsperada',
      'tipo',
      'cantidad',
      'motivo',
      'referencia',
    ];
  if (Object.keys(r).length !== campos.length || Object.keys(r).some((k) => !campos.includes(k)))
    throw Error('Solicitud inválida.');
  const version = enteroProducto(r['versionExistencias'], 4294967295),
    reservado = enteroProducto(r['reservadoEsperado'], 99999),
    cantidad = r['cantidad'],
    tipo = r['tipo'];
  if (
    !version ||
    typeof r['habilitadaEsperada'] !== 'boolean' ||
    !['ENTRADA', 'SALIDA', 'AJUSTE'].includes(String(tipo)) ||
    !Number.isSafeInteger(cantidad) ||
    Math.abs(cantidad as number) < 1 ||
    Math.abs(cantidad as number) > 99999 ||
    (tipo === 'ENTRADA' && (cantidad as number) < 0) ||
    (tipo === 'SALIDA' && (cantidad as number) > 0)
  )
    throw Error('Solicitud inválida.');
  const motivo = texto(r['motivo']),
    referencia = r['referencia'] === null ? null : texto(r['referencia']);
  if (
    !motivo.trim() ||
    motivo.length > 160 ||
    /[\p{Cc}\p{Cf}]/u.test(motivo) ||
    (referencia !== null && (referencia.length > 80 || /[\p{Cc}\p{Cf}]/u.test(referencia)))
  )
    throw Error('Motivo o referencia inválidos.');
  return {
    claveSolicitud: uuid(r['claveSolicitud']),
    versionExistencias: version,
    reservadoEsperado: reservado,
    habilitadaEsperada: r['habilitadaEsperada'],
    tipo: tipo as SolicitudMovimiento['tipo'],
    cantidad: cantidad as number,
    motivo,
    referencia,
  };
}
export function resultadoMovimiento(v: unknown, p: MovimientoPendiente, administradorId: string) {
  const r = registro(v),
    o = registro(r['operacion']),
    raw = registro(r['movimiento']),
    variante = varianteInventario(r['variante']);
  const movimiento = adaptarMovimientos({
    capacidades: { escrituraDisponible: false },
    movimientos: [raw],
    paginacion: { pagina: 1, limite: 1, total: 1, paginas: 1 },
  }).movimientos[0];
  const d = p.cuerpo;
  if (
    o['claveSolicitud'] !== d.claveSolicitud ||
    o['versionAnterior'] !== d.versionExistencias ||
    o['versionPosterior'] !== d.versionExistencias + 1 ||
    variante.versionExistencias !== o['versionPosterior'] ||
    variante.id !== p.varianteId ||
    raw['varianteId'] !== p.varianteId ||
    uuid(registro(raw['responsable'])['id']) !== administradorId ||
    movimiento.origen !== 'manual' ||
    raw['pedido'] !== null ||
    movimiento.cantidad !== d.cantidad ||
    movimiento.tipo !== d.tipo.toLowerCase() ||
    movimiento.motivo !== d.motivo ||
    raw['referencia'] !== d.referencia ||
    movimiento.reservado !== d.reservadoEsperado ||
    raw['habilitada'] !== d.habilitadaEsperada ||
    variante.habilitada !== d.habilitadaEsperada ||
    variante.existencias !== movimiento.saldo ||
    variante.cantidadReservada !== movimiento.reservado ||
    variante.sku !== movimiento.sku ||
    variante.producto.id !== movimiento.productoId
  )
    throw Error('Resultado de otra operación o incoherente.');
  return { movimiento, variante };
}
