import { Injectable, computed, inject, signal } from '@angular/core';
import { PedidosAdministracion } from '../../pedidos/servicios/pedidos-administracion';
import { ProductosAdministracion } from '../../productos/servicios/productos-administracion';
import { SOLICITUDES_ADMIN_DEMO } from '../datos/solicitudes-admin-demo';
import {
  DecisionSolicitud,
  NuevaSolicitud,
  SolicitudAdmin,
  VarianteCambio,
  cantidadAtendida,
  erroresNuevaSolicitud,
  importeReferenciaSolicitud,
  pedidoAdmiteSolicitud,
  solicitudAbierta,
} from '../modelos/solicitud-admin';

@Injectable({ providedIn: 'root' })
export class SolicitudesAdministracion {
  private readonly pedidos = inject(PedidosAdministracion);
  private readonly productos = inject(ProductosAdministracion);
  private readonly registros = signal(SOLICITUDES_ADMIN_DEMO);
  private secuencia = 2;
  readonly solicitudes = this.registros.asReadonly();
  readonly hayCambios = computed(() => this.registros() !== SOLICITUDES_ADMIN_DEMO);
  readonly resumen = computed(() => ({
    total: this.solicitudes().length,
    abiertas: this.solicitudes().filter(solicitudAbierta).length,
    evaluacion: this.solicitudes().filter((s) => s.estado === 'evaluacion').length,
    cerradas: this.solicitudes().filter((s) => s.estado === 'cerrada').length,
  }));
  readonly pedidosElegibles = computed(() =>
    this.pedidos.pedidos.filter((p) => !p.remoto && pedidoAdmiteSolicitud(p)),
  );
  obtener(id: string) {
    return this.solicitudes().find((s) => s.identificador === id);
  }
  pedido(codigo: string) {
    return this.pedidos.obtener(codigo);
  }
  pendientes(codigo: string, sku: string) {
    const p = this.pedido(codigo);
    return Math.max(
      0,
      (p?.articulos.find((a) => a.sku === sku)?.cantidad ?? 0) -
        cantidadAtendida(this.solicitudes(), codigo, sku),
    );
  }
  private unidadesLibres(codigo: string, sku: string) {
    const a = this.pedido(codigo)?.articulos.find((a) => a.sku === sku);
    const ocupadas = new Set(
      this.solicitudes()
        .filter((s) => s.pedido === codigo && s.articulo.sku === sku && s.estado !== 'rechazada')
        .flatMap((s) => s.unidades),
    );
    return Array.from({ length: a?.cantidad ?? 0 }, (_, i) => i).filter((i) => !ocupadas.has(i));
  }
  variantes(sku: string): readonly (VarianteCambio & { disponible: number })[] {
    const p = this.productos.productos().find((p) => p.variantes.some((v) => v.sku === sku));
    if (!p || p.estado !== 'publicado') return [];
    return p.variantes
      .filter((v) => v.habilitada && v.sku !== sku)
      .map((v) => {
        const c = p.colores.find((c) => c.codigo === v.codigoColor)!;
        return {
          sku: v.sku,
          productoId: p.identificador,
          nombre: p.nombre,
          color: c.nombre,
          talla: v.talla,
          imagen: c.imagenes[0] ?? p.imagenes[0],
          disponible: Math.max(0, v.existencias - v.cantidadReservada),
        };
      });
  }
  importe(datos: Pick<NuevaSolicitud, 'pedido' | 'sku' | 'cantidad'>) {
    const p = this.pedido(datos.pedido);
    return p && Number.isInteger(datos.cantidad) && datos.cantidad > 0
      ? importeReferenciaSolicitud(
          p,
          datos.sku,
          datos.cantidad,
          this.unidadesLibres(datos.pedido, datos.sku).slice(0, datos.cantidad),
        )
      : 0;
  }
  validar(datos: NuevaSolicitud) {
    if (this.pedido(datos.pedido)?.remoto)
      return { pedido: 'La posventa de pedidos reales aún no está habilitada.' };
    return erroresNuevaSolicitud(
      datos,
      this.pedido(datos.pedido),
      this.solicitudes(),
      this.variantes(datos.sku),
    );
  }
  crear(datos: NuevaSolicitud): {
    ok: boolean;
    errores: Record<string, string>;
    identificador?: string;
  } {
    const errores = this.validar(datos);
    if (Object.keys(errores).length) return { ok: false, errores };
    const p = this.pedido(datos.pedido)!,
      a = p.articulos.find((a) => a.sku === datos.sku)!;
    const fecha = new Date().toISOString(),
      identificador = 'CD-' + String(++this.secuencia).padStart(6, '0');
    const v = this.variantes(datos.sku).find((v) => v.sku === datos.variante);
    const nuevo: SolicitudAdmin = Object.freeze({
      identificador,
      pedido: p.codigo,
      cliente: p.cliente,
      fecha,
      tipo: datos.tipo,
      estado: 'evaluacion',
      articulo: a,
      cantidad: datos.cantidad,
      unidades: Object.freeze(
        this.unidadesLibres(datos.pedido, datos.sku).slice(0, datos.cantidad),
      ),
      importeReferencia: this.importe(datos),
      motivo: datos.motivo as SolicitudAdmin['motivo'],
      descripcion: datos.descripcion.trim(),
      ...(datos.tipo === 'cambio' && v
        ? {
            variante: Object.freeze({
              sku: v.sku,
              productoId: v.productoId,
              nombre: v.nombre,
              color: v.color,
              talla: v.talla,
              imagen: v.imagen,
            }),
          }
        : {}),
      evidencias: Object.freeze(datos.evidencias.map((e) => Object.freeze({ ...e }))),
      revision: 1,
      notas: Object.freeze([]),
      eventos: Object.freeze([
        Object.freeze({
          fecha,
          titulo: 'Solicitud registrada · simulación',
          descripcion:
            'Admin Demo registró el caso. No se modificaron pedidos, pagos, inventario ni reservas.',
          autor: 'Admin Demo',
        }),
      ]),
    });
    this.registros.update((todos) => Object.freeze([nuevo, ...todos]));
    return { ok: true, errores: {}, identificador };
  }
  acciones(s: SolicitudAdmin): readonly DecisionSolicitud['accion'][] {
    if (!pedidoAdmiteSolicitud(this.pedido(s.pedido))) return [];
    return s.estado === 'evaluacion'
      ? ['rechazar', 'aprobar']
      : s.estado === 'retorno'
        ? ['recibir']
        : s.estado === 'aprobada' && s.recepcion
          ? [s.tipo === 'cambio' ? 'cerrar-cambio' : 'reembolso']
          : [];
  }
  decidir(id: string, datos: DecisionSolicitud): { ok: boolean; error?: string } {
    const s = this.obtener(id);
    if (!s || s.revision !== datos.revision)
      return {
        ok: false,
        error: 'El caso cambió. Cierra la ventana y revisa la información actual.',
      };
    if (!this.acciones(s).includes(datos.accion))
      return {
        ok: false,
        error:
          'Esta acción no corresponde al estado actual o el pedido ya no está entregado con pago aprobado.',
      };
    if (!datos.confirmado) return { ok: false, error: 'Confirma que la acción es una simulación.' };
    if (
      datos.accion === 'rechazar' &&
      (datos.motivo.trim().length < 10 || datos.motivo.trim().length > 500)
    )
      return { ok: false, error: 'Explica el rechazo con entre 10 y 500 caracteres.' };
    if (datos.accion === 'recibir' && !['bueno', 'defecto'].includes(datos.condicion))
      return { ok: false, error: 'Indica el estado del par recibido.' };
    if (
      ['cerrar-cambio', 'reembolso'].includes(datos.accion) &&
      (datos.referencia.trim().length < 5 || datos.referencia.trim().length > 100)
    )
      return {
        ok: false,
        error: 'Introduce una referencia de ejemplo de entre 5 y 100 caracteres.',
      };
    if (
      s.tipo === 'cambio' &&
      ['aprobar', 'cerrar-cambio'].includes(datos.accion) &&
      !this.variantes(s.articulo.sku).some(
        (v) => v.sku === s.variante?.sku && v.disponible >= s.cantidad,
      )
    )
      return {
        ok: false,
        error:
          'La variante solicitada ya no está disponible. Coordina otra opción antes de continuar.',
      };
    const fecha = this.fecha(s),
      cambios: { -readonly [P in keyof SolicitudAdmin]?: SolicitudAdmin[P] } = {};
    let titulo = '',
      descripcion = '';
    switch (datos.accion) {
      case 'aprobar':
        cambios.estado = 'retorno';
        titulo = 'Solicitud aprobada · simulación';
        descripcion =
          'Esperando el retorno físico del producto. La aprobación no mueve existencias ni reserva una variante.';
        break;
      case 'rechazar':
        cambios.estado = 'rechazada';
        titulo = 'Solicitud rechazada · simulación';
        descripcion = datos.motivo.trim();
        break;
      case 'recibir':
        cambios.estado = 'aprobada';
        cambios.recepcion = Object.freeze({
          fecha,
          condicion: datos.condicion as 'bueno' | 'defecto',
        });
        titulo = 'Retorno recibido · simulación';
        descripcion =
          datos.condicion === 'bueno'
            ? 'Par recibido en buen estado. No se reincorpora inventario en esta demostración.'
            : 'Par recibido con defecto o daño. No se reincorpora al inventario.';
        break;
      case 'cerrar-cambio':
        cambios.estado = 'cerrada';
        cambios.cierre = Object.freeze({ fecha, referencia: datos.referencia.trim() });
        titulo = 'Cambio cerrado · simulación';
        descripcion = `Envío de ejemplo: ${datos.referencia.trim()}. No se generó un envío ni una salida de inventario real.`;
        break;
      case 'reembolso':
        cambios.estado = 'cerrada';
        cambios.cierre = Object.freeze({ fecha, referencia: datos.referencia.trim() });
        titulo = 'Reembolso registrado · simulación';
        descripcion = `Referencia de ejemplo: ${datos.referencia.trim()}. No se transfirió dinero ni se modificó el pago original.`;
        break;
    }
    this.reemplazar(
      Object.freeze({
        ...s,
        ...cambios,
        revision: s.revision + 1,
        eventos: Object.freeze([
          ...s.eventos,
          Object.freeze({ fecha, titulo, descripcion, autor: 'Admin Demo' }),
        ]),
      }),
    );
    return { ok: true };
  }
  guardarNota(id: string, texto: string): { ok: boolean; error?: string } {
    const s = this.obtener(id),
      nota = texto.trim();
    if (!s) return { ok: false, error: 'Solicitud no encontrada.' };
    if (nota.length < 3 || nota.length > 500)
      return { ok: false, error: 'Escribe una nota de entre 3 y 500 caracteres.' };
    const fecha = this.fecha(s);
    this.reemplazar(
      Object.freeze({
        ...s,
        revision: s.revision + 1,
        notas: Object.freeze([
          ...s.notas,
          Object.freeze({ fecha, texto: nota, autor: 'Admin Demo' }),
        ]),
      }),
    );
    return { ok: true };
  }
  restablecer() {
    this.secuencia = 2;
    this.registros.set(SOLICITUDES_ADMIN_DEMO);
  }
  private fecha(s: SolicitudAdmin) {
    return new Date(
      Math.max(
        Date.now(),
        ...s.eventos.map((e) => Date.parse(e.fecha) + 1),
        ...s.notas.map((n) => Date.parse(n.fecha) + 1),
      ),
    ).toISOString();
  }
  private reemplazar(s: SolicitudAdmin) {
    this.registros.update((todos) =>
      Object.freeze(todos.map((a) => (a.identificador === s.identificador ? s : a))),
    );
  }
}
