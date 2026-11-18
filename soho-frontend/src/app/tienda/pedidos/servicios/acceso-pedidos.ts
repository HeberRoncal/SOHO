import { DOCUMENT } from '@angular/common';
import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import { CODIGO_PEDIDO } from '../modelos/contrato-pedidos';

export const ALMACENAMIENTO_PEDIDOS = new InjectionToken<Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem'
> | null>('ALMACENAMIENTO_PEDIDOS', {
  providedIn: 'root',
  factory: () => {
    try {
      return inject(DOCUMENT).defaultView?.sessionStorage ?? null;
    } catch {
      return null;
    }
  },
});
export interface ReferenciaPedido {
  clave: string;
  dueno: string | null;
  acceso?: string;
  creadoEn: number;
}
const CLAVE = 'soho:pedidos:accesos:v1',
  DURACION = 30 * 86400000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const secreto = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
function aleatorio(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (v) =>
    v.toString(16).padStart(2, '0'),
  ).join('');
}
function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const a = crypto.getRandomValues(new Uint8Array(16));
  a[6] = (a[6] & 15) | 64;
  a[8] = (a[8] & 63) | 128;
  const h = Array.from(a, (v) => v.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

@Injectable({ providedIn: 'root' })
export class AccesoPedidos {
  private readonly almacen = inject(ALMACENAMIENTO_PEDIDOS);
  readonly persistente = signal(this.almacen !== null);
  readonly referencia = signal<ReferenciaPedido | null>(null);
  private dueno: string | null | undefined;
  private invitados: Array<{ codigo: string; acceso: string; vence: number }> = [];
  constructor() {
    try {
      const d = JSON.parse(this.almacen?.getItem(CLAVE) ?? 'null');
      if (!d || d.version !== 1 || (d.dueno !== null && typeof d.dueno !== 'string')) return;
      this.dueno = d.dueno;
      if (Array.isArray(d.invitados))
        this.invitados = d.invitados
          .filter(
            (a: { codigo?: unknown; acceso?: unknown; vence?: unknown }) =>
              CODIGO_PEDIDO.test(String(a?.codigo ?? '')) &&
              secreto(a?.acceso) &&
              typeof a?.vence === 'number' &&
              a.vence > Date.now() &&
              a.vence <= Date.now() + DURACION,
          )
          .slice(-20)
          .map((a: { codigo: string; acceso: string; vence: number }) => ({
            codigo: a.codigo,
            acceso: a.acceso,
            vence: a.vence,
          }));
      const r = d.referencia;
      if (
        r &&
        typeof r.clave === 'string' &&
        UUID.test(r.clave) &&
        r.dueno === d.dueno &&
        (r.dueno !== null ? r.acceso === undefined : secreto(r.acceso)) &&
        typeof r.creadoEn === 'number' &&
        r.creadoEn > Date.now() - DURACION &&
        r.creadoEn <= Date.now()
      )
        this.referencia.set({
          clave: r.clave,
          dueno: r.dueno,
          creadoEn: r.creadoEn,
          ...(r.acceso ? { acceso: r.acceso } : {}),
        });
    } catch {
      this.persistente.set(false);
    }
  }
  sincronizar(dueno: string | null) {
    if (this.dueno !== undefined && this.dueno !== dueno) {
      this.invitados = [];
      this.referencia.set(null);
    }
    this.dueno = dueno;
    this.guardar();
  }
  preparar(dueno: string | null): ReferenciaPedido {
    this.sincronizar(dueno);
    const anterior = this.referencia();
    if (anterior) return anterior;
    const r = {
      clave: uuid(),
      dueno,
      creadoEn: Date.now(),
      ...(dueno ? {} : { acceso: aleatorio(32) }),
    };
    this.referencia.set(r);
    this.guardar();
    return r;
  }
  confirmar(codigo: string) {
    const r = this.referencia();
    if (r?.acceso)
      this.invitados = [
        ...this.invitados.filter((a) => a.codigo !== codigo),
        { codigo, acceso: r.acceso, vence: r.creadoEn + DURACION },
      ].slice(-20);
    this.referencia.set(null);
    this.guardar();
  }
  acceso(codigo: string) {
    return this.invitados.find((a) => a.codigo === codigo && a.vence > Date.now())?.acceso;
  }
  registrarInvitado(codigo: string, acceso: string, creadoEn: string) {
    const fecha = Date.parse(creadoEn),
      vence = fecha + DURACION;
    if (
      this.dueno !== null ||
      !CODIGO_PEDIDO.test(codigo) ||
      !secreto(acceso) ||
      !Number.isFinite(fecha) ||
      fecha > Date.now() ||
      vence <= Date.now()
    )
      throw Error('No se pudo conservar el acceso al pedido invitado.');
    const anterior = this.invitados.find((a) => a.codigo === codigo);
    if (anterior && anterior.acceso !== acceso)
      throw Error('El pedido ya tiene otro acceso privado.');
    this.invitados = [
      ...this.invitados.filter((a) => a.codigo !== codigo),
      { codigo, acceso, vence: anterior ? Math.min(anterior.vence, vence) : vence },
    ].slice(-20);
    this.guardar();
    if (!this.persistente())
      throw Error(
        'No pudimos guardar el acceso al pedido. Conserva esta pestaña y vuelve a abrirlo desde la recepción.',
      );
  }
  private guardar() {
    try {
      this.almacen?.setItem(
        CLAVE,
        JSON.stringify({
          version: 1,
          dueno: this.dueno ?? null,
          referencia: this.referencia(),
          invitados: this.invitados,
        }),
      );
    } catch {
      this.persistente.set(false);
    }
  }
}
