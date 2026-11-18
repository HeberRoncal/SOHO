import { Injectable, computed, inject, signal } from '@angular/core';
import { ALMACENAMIENTO_PEDIDOS } from '../../pedidos/servicios/acceso-pedidos';
import { UUID_COMPRA } from '../modelos/contrato-checkout';

export interface ArchivoCompra {
  hash: string;
  nombre: string;
  tipo: string;
  numero: string | null;
}
export interface IntentoCompra {
  clave: string;
  dueno: string | null;
  acceso?: string;
  creadoEn: number;
  instruccion: { clave: string; hash?: string; id?: string };
  recepcion?: { clave: string; id?: string; archivo?: ArchivoCompra; rechazada?: boolean };
  operacion?: {
    clave: string;
    tipo: 'PROCESAR' | 'CORREGIR';
    version: number;
    archivo?: ArchivoCompra;
    rechazada?: boolean;
  };
  codigo?: string;
  carritoAtendido?: boolean;
}
const PREFIJO = 'soho:compras:v1:';
const hashValido = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const idValido = (v: unknown): v is string => typeof v === 'string' && UUID_COMPRA.test(v);
function archivoValido(a: ArchivoCompra | undefined): boolean {
  return (
    a === undefined ||
    (!!a &&
      hashValido(a.hash) &&
      typeof a.nombre === 'string' &&
      a.nombre.length > 0 &&
      a.nombre.length <= 240 &&
      ['image/png', 'image/jpeg', 'image/webp'].includes(a.tipo) &&
      (a.numero === null || /^\d{1,12}$/.test(a.numero)))
  );
}
function valido(v: IntentoCompra, dueno: string | null): boolean {
  if (
    (v?.recepcion?.rechazada !== undefined && typeof v.recepcion.rechazada !== 'boolean') ||
    (v?.operacion?.rechazada !== undefined && typeof v.operacion.rechazada !== 'boolean') ||
    (v?.carritoAtendido !== undefined && typeof v.carritoAtendido !== 'boolean')
  )
    return false;
  return (
    !!v &&
    v.dueno === dueno &&
    idValido(v.clave) &&
    (dueno ? v.acceso === undefined : hashValido(v.acceso)) &&
    Number.isSafeInteger(v.creadoEn) &&
    v.creadoEn > 0 &&
    v.creadoEn <= Date.now() &&
    !!v.instruccion &&
    idValido(v.instruccion.clave) &&
    (v.instruccion.hash === undefined || hashValido(v.instruccion.hash)) &&
    (v.instruccion.id === undefined || idValido(v.instruccion.id)) &&
    (!v.recepcion ||
      (idValido(v.recepcion.clave) &&
        (v.recepcion.id === undefined || idValido(v.recepcion.id)) &&
        archivoValido(v.recepcion.archivo))) &&
    (!v.operacion ||
      (idValido(v.operacion.clave) &&
        ['PROCESAR', 'CORREGIR'].includes(v.operacion.tipo) &&
        Number.isSafeInteger(v.operacion.version) &&
        v.operacion.version > 0 &&
        archivoValido(v.operacion.archivo))) &&
    (v.codigo === undefined || /^SOHO-[A-Z0-9]{6,24}$/.test(v.codigo))
  );
}
export function nuevaClaveCompra(): string {
  const a = crypto.getRandomValues(new Uint8Array(16));
  a[6] = (a[6] & 15) | 64;
  a[8] = (a[8] & 63) | 128;
  const h = Array.from(a, (n) => n.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
export async function huellaCompra(valor: string | Uint8Array): Promise<string> {
  const bytes = typeof valor === 'string' ? new TextEncoder().encode(valor) : valor;
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)),
    (n) => n.toString(16).padStart(2, '0'),
  ).join('');
}

/** Solo referencias y huellas; nunca datos de entrega ni bytes de comprobantes. */
@Injectable({ providedIn: 'root' })
export class AccesoCompras {
  private readonly almacen = inject(ALMACENAMIENTO_PEDIDOS);
  readonly intentos = signal<readonly IntentoCompra[]>([]);
  readonly actual = signal<IntentoCompra | null>(null);
  private readonly claveEnCurso = signal<string | null>(null);
  readonly enCurso = computed(
    () => this.intentos().find((r) => r.clave === this.claveEnCurso()) ?? null,
  );
  readonly persistente = signal(this.almacen !== null);
  private dueno: string | null | undefined;
  sincronizar(dueno: string | null) {
    if (this.dueno === dueno) return;
    this.dueno = dueno;
    this.intentos.set([]);
    this.actual.set(null);
    this.claveEnCurso.set(null);
    try {
      const d = JSON.parse(this.almacen?.getItem(PREFIJO + (dueno ?? 'invitado')) ?? 'null');
      if (!d) return;
      if (
        d.version !== 1 ||
        !Array.isArray(d.intentos) ||
        d.intentos.length > 20 ||
        !d.intentos.every((v: IntentoCompra) => valido(v, dueno)) ||
        new Set(d.intentos.map((v: IntentoCompra) => v.clave)).size !== d.intentos.length
      )
        throw Error('Referencias inválidas.');
      // Las compras anteriores a este indicador ya pudieron limpiar su cesta.
      const intentos: IntentoCompra[] = d.intentos.map((r: IntentoCompra) => ({
        ...r,
        ...(r.codigo && r.carritoAtendido === undefined ? { carritoAtendido: true } : {}),
      }));
      this.intentos.set(intentos);
      this.claveEnCurso.set(intentos.find((r) => r.clave === d.actual)?.clave ?? null);
      this.retomar();
    } catch {
      this.persistente.set(false);
    }
  }
  preparar(dueno: string | null): IntentoCompra {
    this.sincronizar(dueno);
    const anterior = this.retomar();
    if (anterior) return anterior;
    if (this.intentos().length >= 20)
      throw Error(
        'Hay veinte compras conservadas en esta pestaña. Retoma una compra antes de iniciar otra.',
      );
    const r: IntentoCompra = {
      clave: nuevaClaveCompra(),
      dueno,
      creadoEn: Date.now(),
      carritoAtendido: false,
      instruccion: { clave: nuevaClaveCompra() },
      ...(dueno
        ? {}
        : {
            acceso: Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
              n.toString(16).padStart(2, '0'),
            ).join(''),
          }),
    };
    this.guardar(r, true);
    return r;
  }
  guardar(r: IntentoCompra, activar = false) {
    if (this.dueno === undefined || !valido(r, this.dueno))
      throw Error('No se pudo conservar la referencia de compra.');
    const intentos = [...this.intentos().filter((v) => v.clave !== r.clave), r];
    if (intentos.length > 20) throw Error('No hay espacio para otra referencia de compra.');
    const claveEnCurso = activar ? r.clave : this.claveEnCurso();
    this.escribir(intentos, claveEnCurso);
    this.intentos.set(intentos);
    this.claveEnCurso.set(claveEnCurso);
    this.actual.set(r);
  }
  seleccionar(clave: string) {
    const r = this.intentos().find((v) => v.clave === clave);
    if (!r) throw Error('No se encontró el acceso de esta compra en la pestaña.');
    // Consultar el historial no sustituye la compra que se estaba preparando.
    this.actual.set(r);
    return r;
  }
  nueva() {
    this.finalizar(this.actual()?.clave);
    this.actual.set(null);
  }
  retomar() {
    const r = this.enCurso();
    this.actual.set(r);
    return r;
  }
  finalizar(clave: string | undefined) {
    if (!clave || this.claveEnCurso() !== clave) return;
    this.escribir(this.intentos(), null);
    this.claveEnCurso.set(null);
  }
  private escribir(intentos: readonly IntentoCompra[], actual: string | null) {
    try {
      if (!this.almacen) throw Error();
      const clave = PREFIJO + (this.dueno ?? 'invitado');
      const contenido = JSON.stringify({ version: 1, actual, intentos });
      this.almacen.setItem(clave, contenido);
      if (this.almacen.getItem(clave) !== contenido) throw Error();
      this.persistente.set(true);
    } catch {
      this.persistente.set(false);
      throw Error(
        'Permite el almacenamiento de esta pestaña para conservar el acceso y recuperar el pago antes de continuar.',
      );
    }
  }
}
