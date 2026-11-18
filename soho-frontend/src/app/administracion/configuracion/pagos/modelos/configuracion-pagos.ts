export const BILLETERAS_PAGO = ['YAPE', 'PLIN'] as const;
export type BilleteraPago = (typeof BILLETERAS_PAGO)[number];
export type EstadoQrPago =
  'PENDIENTE' | 'CONCILIANDO' | 'DISPONIBLE' | 'FALLIDO' | 'ELIMINANDO' | 'ELIMINADO';
export interface ArchivoQrPago {
  id: string;
  metodo: BilleteraPago;
  estado: EstadoQrPago;
  nombre: string;
  url: string | null;
  ancho: number;
  alto: number;
  bytes: number;
  creadoEn: string;
  revisionEn: string | null;
}
export interface MetodoPagoConfigurado {
  metodo: BilleteraPago;
  activo: boolean;
  celular: string | null;
  titular: string | null;
  qr: ArchivoQrPago | null;
}
export interface ConfiguracionPagos {
  version: number;
  actualizadoEn: string | null;
  actualizadoPor: { id: string; nombre: string } | null;
  metodos: MetodoPagoConfigurado[];
}
export interface CapacidadesPagos {
  cargarQr: boolean;
  maximoBytes: number;
  formatos: string[];
  maximoLado: number;
}
export interface BorradorMetodoPago {
  metodo: BilleteraPago;
  activo: boolean;
  celular: string;
  titular: string;
  qr: ArchivoQrPago | null;
}
export interface PublicarPagos {
  claveSolicitud: string;
  versionEsperada: number;
  confirmado: true;
  metodos: {
    metodo: BilleteraPago;
    activo: boolean;
    celular: string | null;
    titular: string | null;
    qrId: string | null;
  }[];
}
export interface DatosCargaQr {
  claveCarga: string;
  metodo: BilleteraPago;
  nombre: string;
  tipo: string;
  tamano: number;
  sha256: string;
  archivoId: string | null;
}
export const FORMATOS_QR = ['image/png', 'image/jpeg', 'image/webp'];
export const MAXIMO_QR = 2 * 1024 * 1024;
export function registroPagos(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('Respuesta de Pagos inválida.');
  return v as Record<string, unknown>;
}
export function uuidPagos(v: unknown): string {
  if (
    typeof v !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  )
    throw Error('Identificador inválido.');
  return v.toLowerCase();
}
function texto(v: unknown, max: number, vacio = false): string {
  if (typeof v !== 'string' || (!vacio && !v.trim()) || v.length > max || /[\p{Cc}\p{Cf}]/u.test(v))
    throw Error('Texto inválido.');
  return v;
}
function numero(v: unknown, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min || v > max)
    throw Error('Número inválido.');
  return v;
}
function fecha(v: unknown): string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(v) || !Number.isFinite(Date.parse(v)))
    throw Error('Fecha inválida.');
  return v;
}
export function billeteraPago(v: unknown): BilleteraPago {
  if (v !== 'YAPE' && v !== 'PLIN') throw Error('Método inválido.');
  return v;
}
export function archivoQrPago(v: unknown): ArchivoQrPago {
  const a = registroPagos(v);
  const estado = texto(a['estado'], 20) as EstadoQrPago;
  if (
    !['PENDIENTE', 'CONCILIANDO', 'DISPONIBLE', 'FALLIDO', 'ELIMINANDO', 'ELIMINADO'].includes(
      estado,
    ) ||
    a['proveedor'] !== 'CLOUDINARY' ||
    a['formato'] !== 'png'
  )
    throw Error('Archivo QR inválido.');
  let url: string | null = null;
  if (estado === 'DISPONIBLE') {
    const u = new URL(texto(a['url'], 2048));
    const cloud = texto(a['cloudName'], 160),
      publicId = texto(a['publicId'], 512),
      version = texto(a['versionCloudinary'], 30);
    if (
      !/^[a-z0-9_-]+$/i.test(cloud) ||
      !/^[1-9]\d*$/.test(version) ||
      !/^[a-z0-9_/-]+$/i.test(publicId) ||
      !a['assetId'] ||
      u.protocol !== 'https:' ||
      u.hostname !== 'res.cloudinary.com' ||
      u.port ||
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      u.pathname !== `/${cloud}/image/upload/v${version}/${publicId}.png`
    )
      throw Error('URL QR inválida.');
    url = u.href;
  } else if (a['url'] !== null) throw Error('Una carga pendiente no tiene URL publicable.');
  return {
    id: uuidPagos(a['id']),
    metodo: billeteraPago(a['metodo']),
    estado,
    nombre: texto(a['nombre'], 255),
    url,
    ancho: numero(a['ancho'], 1, 4096),
    alto: numero(a['alto'], 1, 4096),
    bytes: numero(a['bytes'], 1, MAXIMO_QR),
    creadoEn: fecha(a['creadoEn']),
    revisionEn: a['revisionEn'] === null ? null : fecha(a['revisionEn']),
  };
}
export function configuracionPagos(v: unknown): ConfiguracionPagos {
  const c = registroPagos(v),
    version = numero(c['version'], 0, 4294967295);
  if (!Array.isArray(c['metodos']) || c['metodos'].length !== 2)
    throw Error('Publicación inválida.');
  const metodos = c['metodos'].map((v) => {
    const m = registroPagos(v),
      metodo = billeteraPago(m['metodo']);
    if (typeof m['activo'] !== 'boolean') throw Error('Activación inválida.');
    const celular = m['celular'] === null ? null : texto(m['celular'], 9),
      titular = m['titular'] === null ? null : texto(m['titular'], 120);
    if ((celular !== null && !/^9\d{8}$/.test(celular)) || (m['activo'] && (!celular || !titular)))
      throw Error('Receptor inválido.');
    const qr = m['qr'] === null ? null : archivoQrPago(m['qr']);
    if (qr && (qr.metodo !== metodo || qr.estado !== 'DISPONIBLE'))
      throw Error('QR de otro método o pendiente.');
    return { metodo, activo: m['activo'], celular, titular, qr };
  });
  if (
    new Set(metodos.map((m) => m.metodo)).size !== 2 ||
    new Set(metodos.flatMap((m) => (m.qr ? [m.qr.id] : []))).size !==
      metodos.filter((m) => m.qr).length
  )
    throw Error('Métodos repetidos.');
  const actualizadoEn = c['actualizadoEn'] === null ? null : fecha(c['actualizadoEn']);
  const por = c['actualizadoPor'] === null ? null : registroPagos(c['actualizadoPor']);
  const actualizadoPor = por
    ? { id: uuidPagos(por['id']), nombre: texto(por['nombre'], 200) }
    : null;
  if (
    version === 0
      ? actualizadoEn !== null ||
        actualizadoPor !== null ||
        metodos.some((m) => m.activo || m.celular || m.titular || m.qr)
      : !actualizadoEn || !actualizadoPor
  )
    throw Error('Versión inconsistente.');
  return {
    version,
    actualizadoEn,
    actualizadoPor,
    metodos: BILLETERAS_PAGO.map((b) => metodos.find((m) => m.metodo === b)!),
  };
}
export function consultaPagos(v: unknown) {
  const r = registroPagos(v),
    c = registroPagos(r['capacidades']);
  if (
    typeof c['cargarQr'] !== 'boolean' ||
    c['maximoBytes'] !== MAXIMO_QR ||
    c['maximoLado'] !== 4096 ||
    !Array.isArray(c['formatos']) ||
    c['formatos'].length !== 3 ||
    new Set(c['formatos']).size !== 3 ||
    !c['formatos'].every((v) => FORMATOS_QR.includes(v))
  )
    throw Error('Capacidades inválidas.');
  return {
    configuracion: configuracionPagos(r['configuracion']),
    capacidades: {
      cargarQr: c['cargarQr'],
      maximoBytes: MAXIMO_QR,
      maximoLado: 4096,
      formatos: [...FORMATOS_QR],
    },
  };
}
export function borradorPagos(c: ConfiguracionPagos): BorradorMetodoPago[] {
  return c.metodos.map((m) => ({ ...m, celular: m.celular ?? '', titular: m.titular ?? '' }));
}
export function erroresPagos(borrador: readonly BorradorMetodoPago[]) {
  const errores: Record<string, string> = {};
  for (const m of borrador) {
    const celular = m.celular.replace(/ /g, '').trim(),
      titular = m.titular.normalize('NFC').trim();
    if (
      (m.activo && !celular) ||
      (celular && !/^9\d{8}$/.test(celular)) ||
      /[\p{Cc}\p{Cf}]/u.test(m.celular)
    )
      errores[m.metodo + '-celular'] = 'Usa un celular de nueve dígitos que empiece por 9.';
    if ((m.activo && !titular) || titular.length > 120 || /[\p{Cc}\p{Cf}]/u.test(m.titular))
      errores[m.metodo + '-titular'] =
        'Completa el titular, hasta 120 caracteres y sin saltos de línea.';
    if (m.qr && (m.qr.metodo !== m.metodo || m.qr.estado !== 'DISPONIBLE'))
      errores[m.metodo + '-qr'] = 'El QR debe estar disponible y corresponder a esta billetera.';
  }
  return errores;
}
export function crearPublicacionPagos(
  borrador: readonly BorradorMetodoPago[],
  version: number,
): PublicarPagos {
  if (Object.keys(erroresPagos(borrador)).length)
    throw Error('Revisa el celular y el titular antes de guardar o activar el método.');
  return publicacionPagosGuardada({
    claveSolicitud: crypto.randomUUID(),
    versionEsperada: version,
    confirmado: true,
    metodos: borrador.map((m) => ({
      metodo: m.metodo,
      activo: m.activo,
      celular: m.celular.replace(/ /g, '').trim() || null,
      titular: m.titular.normalize('NFC').trim() || null,
      qrId: m.qr?.id ?? null,
    })),
  });
}
export function publicacionPagosGuardada(v: unknown): PublicarPagos {
  const c = registroPagos(v);
  if (
    Object.keys(c).sort().join(',') !== 'claveSolicitud,confirmado,metodos,versionEsperada' ||
    c['confirmado'] !== true ||
    !Array.isArray(c['metodos']) ||
    c['metodos'].length !== 2
  )
    throw Error('Solicitud guardada inválida.');
  const metodos = c['metodos'].map((v) => {
    const m = registroPagos(v);
    if (
      Object.keys(m).sort().join(',') !== 'activo,celular,metodo,qrId,titular' ||
      typeof m['activo'] !== 'boolean'
    )
      throw Error('Método guardado inválido.');
    const celular = m['celular'] === null ? null : texto(m['celular'], 9),
      titular = m['titular'] === null ? null : texto(m['titular'], 120);
    if ((celular && !/^9\d{8}$/.test(celular)) || (m['activo'] && (!celular || !titular)))
      throw Error('Receptor guardado inválido.');
    return Object.freeze({
      metodo: billeteraPago(m['metodo']),
      activo: m['activo'],
      celular,
      titular,
      qrId: m['qrId'] === null ? null : uuidPagos(m['qrId']),
    });
  });
  if (
    new Set(metodos.map((m) => m.metodo)).size !== 2 ||
    new Set(metodos.flatMap((m) => (m.qrId ? [m.qrId] : []))).size !==
      metodos.filter((m) => m.qrId).length
  )
    throw Error('Métodos guardados repetidos.');
  return Object.freeze({
    claveSolicitud: uuidPagos(c['claveSolicitud']),
    versionEsperada: numero(c['versionEsperada'], 0, 4294967294),
    confirmado: true,
    metodos: Object.freeze(
      BILLETERAS_PAGO.map((b) => metodos.find((m) => m.metodo === b)!),
    ) as unknown as PublicarPagos['metodos'],
  });
}
export function respuestaPublicacionPagos(v: unknown, cuerpo: PublicarPagos) {
  const r = registroPagos(v),
    c = configuracionPagos(r['configuracion']);
  if (
    r['modificada'] !== true ||
    c.version !== cuerpo.versionEsperada + 1 ||
    c.metodos.some(
      (m, i) =>
        m.metodo !== cuerpo.metodos[i].metodo ||
        m.activo !== cuerpo.metodos[i].activo ||
        m.celular !== cuerpo.metodos[i].celular ||
        m.titular !== cuerpo.metodos[i].titular ||
        (m.qr?.id ?? null) !== cuerpo.metodos[i].qrId,
    )
  )
    throw Error('Resultado de otra publicación.');
  return c;
}
export function datosCargaQrGuardada(v: unknown): Readonly<DatosCargaQr> {
  const d = registroPagos(v);
  if (
    Object.keys(d).sort().join(',') !== 'archivoId,claveCarga,metodo,nombre,sha256,tamano,tipo' ||
    typeof d['sha256'] !== 'string' ||
    !/^[0-9a-f]{64}$/.test(d['sha256']) ||
    !FORMATOS_QR.includes(d['tipo'] as string)
  )
    throw Error('Carga guardada inválida.');
  return Object.freeze({
    claveCarga: uuidPagos(d['claveCarga']),
    metodo: billeteraPago(d['metodo']),
    nombre: texto(d['nombre'], 255),
    tipo: d['tipo'] as string,
    tamano: numero(d['tamano'], 1, MAXIMO_QR),
    sha256: d['sha256'],
    archivoId: d['archivoId'] === null ? null : uuidPagos(d['archivoId']),
  });
}
export async function describirArchivoQr(
  archivo: File,
  metodo: BilleteraPago,
  claveCarga: string = crypto.randomUUID(),
): Promise<Readonly<DatosCargaQr>> {
  if (!FORMATOS_QR.includes(archivo.type) || archivo.size < 12 || archivo.size > MAXIMO_QR)
    throw Error('Elige un PNG, JPG o WebP estático de hasta 2 MB.');
  const bytes = await archivo.arrayBuffer(),
    digest = await crypto.subtle.digest('SHA-256', bytes);
  return datosCargaQrGuardada({
    claveCarga,
    metodo,
    nombre: archivo.name.normalize('NFC').replace(/[/\\]/g, '-').trim(),
    tipo: archivo.type,
    tamano: archivo.size,
    sha256: Array.from(new Uint8Array(digest))
      .map((n) => n.toString(16).padStart(2, '0'))
      .join(''),
    archivoId: null,
  });
}
export function respuestaCargaQr(v: unknown, datos: DatosCargaQr): ArchivoQrPago {
  const a = archivoQrPago(registroPagos(v)['archivo']);
  if (a.metodo !== datos.metodo || (datos.archivoId && a.id !== datos.archivoId))
    throw Error('Resultado de otra carga.');
  return a;
}
