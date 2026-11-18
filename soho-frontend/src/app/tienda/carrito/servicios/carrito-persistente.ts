import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { EstadoAutenticacion } from '../../cuenta/servicios/estado-autenticacion';
import { ALMACENAMIENTO_CARRITO } from './carrito-local';
export { ALMACENAMIENTO_CARRITO } from './carrito-local';
import { FUENTE_CATALOGO } from '../../catalogo/modelos/fuente-catalogo';
import { ArticuloCarrito } from '../modelos/articulo-carrito';
import { LineaCarrito } from '../modelos/linea-carrito';
import { GestorCarrito } from '../modelos/gestor-carrito';
import { ResultadoCarrito } from '../modelos/resultado-carrito';

const CLAVE_CARRITO = 'soho:carrito:invitado';
const CLAVE_ANTIGUA = 'soho:carrito:demostracion';
interface EstadoCarrito {
  version: number;
  articulos: readonly ArticuloCarrito[];
}
interface EscrituraCarrito {
  clave: string;
  version: number;
  tipo: 'GUARDAR' | 'COMBINAR';
  articulos: readonly ArticuloCarrito[];
}

// El invitado conserva SKU/cantidad localmente. La cuenta persiste en MySQL.
@Injectable({ providedIn: 'root' })
export class CarritoPersistente implements GestorCarrito {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(EstadoAutenticacion);
  private readonly destruccion = inject(DestroyRef);
  readonly sincronizando = signal(false);
  readonly errorSincronizacion = signal('');
  private usuario = '';
  private turno = 0;
  private version = 0;
  private pendiente: EscrituraCarrito | null = null;
  private readonly catalogo = inject(FUENTE_CATALOGO);
  private readonly almacenamiento = inject(ALMACENAMIENTO_CARRITO);
  private readonly permiteGuardar = signal(this.almacenamiento !== null);
  readonly guardadoLocal = computed(() => !!this.usuarioActual() || this.permiteGuardar());
  private readonly articulos = signal<readonly ArticuloCarrito[]>(this.recuperar());
  readonly lineas = computed<readonly LineaCarrito[]>(() =>
    this.usuarioActual() !== this.usuario
      ? []
      : this.articulos().map((articulo) => this.resolver(articulo)),
  );
  readonly unidades = computed(() =>
    this.lineas().reduce((total, articulo) => total + articulo.cantidad, 0),
  );
  readonly subtotal = computed(
    () =>
      this.lineas().reduce((total, linea) => total + Math.round((linea.importe ?? 0) * 100), 0) /
      100,
  );
  readonly puedeContinuar = computed(
    () =>
      !this.bloqueado() &&
      this.lineas().length > 0 &&
      this.lineas().every((linea) => !linea.incidencia),
  );

  constructor() {
    this.catalogo.cargarSkus?.(this.articulos().map((articulo) => articulo.sku));
    effect(() => {
      const usuario = this.usuarioActual();
      const estado = this.auth.estado();
      if (estado === 'inicial' || estado === 'cargando') return;
      untracked(() => {
        if (usuario === this.usuario) return;
        this.usuario = usuario;
        this.turno++;
        this.pendiente = null;
        this.errorSincronizacion.set('');
        this.articulos.set(usuario ? [] : this.recuperar());
        if (usuario) void this.cargarCuenta();
        else this.sincronizando.set(false);
      });
    });
    const ventana = inject(DOCUMENT).defaultView;
    const refrescar = () => {
      if (this.usuario && !this.sincronizando() && !this.pendiente) void this.cargarCuenta();
    };
    ventana?.addEventListener('focus', refrescar);
    this.destruccion.onDestroy(() => {
      this.turno++;
      ventana?.removeEventListener('focus', refrescar);
    });
  }

  private usuarioActual() {
    return this.auth.estado() === 'autenticado' ? (this.auth.perfil()?.id ?? '') : '';
  }
  private bloqueado() {
    return (
      this.sincronizando() ||
      !!this.errorSincronizacion() ||
      ['inicial', 'cargando', 'error'].includes(this.auth.estado()) ||
      this.usuarioActual() !== this.usuario
    );
  }
  private validarRespuesta(r: EstadoCarrito): EstadoCarrito {
    if (
      !r ||
      !Number.isSafeInteger(r.version) ||
      r.version < 0 ||
      !Array.isArray(r.articulos) ||
      r.articulos.length > 100 ||
      r.articulos.some(
        (a) =>
          !a ||
          typeof a.sku !== 'string' ||
          !/^[A-Za-z0-9_-]{1,100}$/.test(a.sku) ||
          !this.cantidadValida(a.cantidad),
      ) ||
      new Set(r.articulos.map((a) => a.sku)).size !== r.articulos.length
    )
      throw Error('Respuesta inválida del carrito.');
    return r;
  }
  private aceptar(r: EstadoCarrito) {
    this.validarRespuesta(r);
    this.version = r.version;
    this.articulos.set(r.articulos);
    this.catalogo.cargarSkus?.(r.articulos.map((a) => a.sku));
  }
  private clavePendiente() {
    return 'soho:carrito:pendiente:' + this.usuario;
  }
  private guardarPendiente() {
    try {
      this.almacenamiento?.setItem(this.clavePendiente(), JSON.stringify(this.pendiente));
    } catch {
      /* El reintento sigue disponible durante la visita. */
    }
  }
  private async cargarCuenta() {
    const turno = ++this.turno,
      usuario = this.usuario;
    this.sincronizando.set(true);
    this.errorSincronizacion.set('');
    try {
      const r = await firstValueFrom(
        this.http.get<EstadoCarrito>('/api/carrito', { timeout: 15000 }),
      );
      if (turno !== this.turno || usuario !== this.usuarioActual()) return;
      this.aceptar(r);
      let guardada: EscrituraCarrito | null = null;
      try {
        guardada = JSON.parse(this.almacenamiento?.getItem(this.clavePendiente()) ?? 'null');
      } catch {
        /* Sin operación recuperable. */
      }
      if (
        guardada &&
        typeof guardada.clave === 'string' &&
        ['GUARDAR', 'COMBINAR'].includes(guardada.tipo)
      ) {
        this.validarRespuesta(guardada);
        this.pendiente = guardada;
        this.sincronizando.set(false);
        this.errorSincronizacion.set(
          'Hay un cambio pendiente de confirmar. Reintenta para recuperar su resultado.',
        );
        return;
      }
      const invitados = this.recuperar();
      if (invitados.length) {
        this.pendiente = {
          clave: crypto.randomUUID(),
          version: this.version,
          tipo: 'COMBINAR',
          articulos: invitados,
        };
        this.guardarPendiente();
        await this.enviar(turno, usuario);
      }
    } catch {
      if (turno === this.turno)
        this.errorSincronizacion.set('No pudimos recuperar tu carrito. Reintenta para continuar.');
    } finally {
      if (turno === this.turno) this.sincronizando.set(false);
    }
  }
  private async enviar(turno: number, usuario: string) {
    const datos = this.pendiente;
    if (!datos) return;
    this.sincronizando.set(true);
    this.errorSincronizacion.set('');
    try {
      const r = await firstValueFrom(
        this.http.put<EstadoCarrito>('/api/carrito', datos, { timeout: 15000 }),
      );
      if (turno !== this.turno || usuario !== this.usuarioActual()) return;
      this.aceptar(r);
      if (datos.tipo === 'COMBINAR') this.guardarInvitado([]);
      this.pendiente = null;
      this.guardarPendiente();
    } catch (e) {
      if (turno !== this.turno) return;
      if (e instanceof HttpErrorResponse && e.status === 409) {
        this.pendiente = null;
        this.guardarPendiente();
        // Una edición de otro dispositivo se conserva. Nunca se reenvía una copia antigua.
        this.errorSincronizacion.set(
          'El carrito cambió en otro dispositivo. Reintenta para cargarlo y vuelve a realizar tu cambio.',
        );
      } else
        this.errorSincronizacion.set(
          'No pudimos confirmar el guardado. Reintenta antes de continuar; tu cambio sigue pendiente.',
        );
    } finally {
      if (turno === this.turno) this.sincronizando.set(false);
    }
  }
  reintentar() {
    if (this.sincronizando() || !this.usuario || this.usuario !== this.usuarioActual()) return;
    if (this.pendiente) void this.enviar(this.turno, this.usuario);
    else void this.cargarCuenta();
  }

  agregar(sku: string, cantidad: number): ResultadoCarrito {
    if (this.bloqueado())
      return {
        correcto: false,
        mensaje: 'Espera a que se sincronice el carrito o reintenta desde Tu carrito.',
      };
    if (!this.articulos().some((a) => a.sku === sku) && this.articulos().length >= 100)
      return { correcto: false, mensaje: 'El carrito admite hasta 100 variantes.' };
    const existente = this.articulos().find((articulo) => articulo.sku === sku);
    const total = (existente?.cantidad ?? 0) + cantidad;
    if (!this.cantidadValida(cantidad) || !this.cantidadValida(total))
      return { correcto: false, mensaje: 'Elige una cantidad válida.' };
    const linea = this.resolver({ sku, cantidad: total });
    if (linea.incidencia) return { correcto: false, mensaje: linea.incidencia };
    this.actualizar(
      existente
        ? this.articulos().map((articulo) =>
            articulo.sku === sku ? { sku, cantidad: total } : articulo,
          )
        : [...this.articulos(), { sku, cantidad }],
    );
    return {
      correcto: true,
      mensaje:
        cantidad === 1
          ? 'Agregaste un producto al carrito.'
          : 'Agregaste ' + cantidad + ' productos al carrito.',
    };
  }
  cambiarCantidad(sku: string, cantidad: number): ResultadoCarrito {
    if (this.bloqueado())
      return {
        correcto: false,
        mensaje: 'Espera a que se sincronice el carrito o reintenta desde Tu carrito.',
      };
    if (
      !this.articulos().some((articulo) => articulo.sku === sku) ||
      !this.cantidadValida(cantidad)
    )
      return { correcto: false, mensaje: 'Elige una cantidad válida.' };
    const linea = this.resolver({ sku, cantidad });
    if (linea.incidencia) return { correcto: false, mensaje: linea.incidencia };
    this.actualizar(
      this.articulos().map((articulo) => (articulo.sku === sku ? { sku, cantidad } : articulo)),
    );
    return { correcto: true, mensaje: 'Cantidad actualizada.' };
  }
  eliminar(sku: string) {
    if (this.bloqueado()) return;
    this.actualizar(this.articulos().filter((articulo) => articulo.sku !== sku));
  }
  vaciar() {
    if (this.bloqueado()) return;
    this.actualizar([]);
  }

  private resolver(articulo: ArticuloCarrito): LineaCarrito {
    const producto = this.catalogo.productos.find(
      (producto) =>
        producto.publicado && producto.variantes.some((variante) => variante.sku === articulo.sku),
    );
    const variante = producto?.variantes.find((variante) => variante.sku === articulo.sku);
    const color = producto?.colores.find((color) => color.codigo === variante?.codigoColor);
    const stockDisponible = variante?.habilitada
      ? Math.max(0, variante.existencias - variante.cantidadReservada)
      : 0;
    const centimos = producto ? Math.round(producto.precio * 100) * articulo.cantidad : NaN;
    const importe = Number.isSafeInteger(centimos) && centimos >= 0 ? centimos / 100 : null;
    const incidencia =
      !producto || !variante?.habilitada
        ? 'Este producto ya no está disponible. Elimínalo para continuar.'
        : stockDisponible === 0
          ? 'Esta combinación de color y talla está agotada.'
          : articulo.cantidad > stockDisponible
            ? 'Solo hay ' +
              stockDisponible +
              ' ' +
              (stockDisponible === 1 ? 'unidad disponible' : 'unidades disponibles') +
              ' de esta combinación. Revisa la cantidad del carrito.'
            : importe === null
              ? 'Revisa la cantidad de este producto.'
              : null;
    return { ...articulo, producto, variante, color, stockDisponible, importe, incidencia };
  }
  private cantidadValida(cantidad: unknown): cantidad is number {
    return (
      typeof cantidad === 'number' &&
      Number.isSafeInteger(cantidad) &&
      cantidad > 0 &&
      cantidad <= 99
    );
  }
  private recuperar(): readonly ArticuloCarrito[] {
    let contenido: string | null;
    try {
      contenido =
        this.almacenamiento?.getItem(CLAVE_CARRITO) ??
        this.almacenamiento?.getItem(CLAVE_ANTIGUA) ??
        null;
    } catch {
      this.permiteGuardar.set(false);
      return [];
    }
    try {
      const guardado: unknown = JSON.parse(contenido ?? 'null');
      if (
        !guardado ||
        typeof guardado !== 'object' ||
        !('version' in guardado) ||
        guardado.version !== 1 ||
        !('articulos' in guardado) ||
        !Array.isArray(guardado.articulos)
      )
        return [];
      const unicos = new Map<string, ArticuloCarrito>();
      for (const articulo of guardado.articulos) {
        if (
          !articulo ||
          typeof articulo !== 'object' ||
          typeof articulo.sku !== 'string' ||
          !articulo.sku.trim() ||
          !this.cantidadValida(articulo.cantidad)
        )
          continue;
        const cantidad = (unicos.get(articulo.sku)?.cantidad ?? 0) + articulo.cantidad;
        if (this.cantidadValida(cantidad))
          unicos.set(articulo.sku, { sku: articulo.sku, cantidad });
      }
      return [...unicos.values()];
    } catch {
      // JSON dañado o almacenamiento bloqueado: la visita sigue funcionando.
      return [];
    }
  }
  private actualizar(articulos: readonly ArticuloCarrito[]) {
    this.articulos.set(articulos);
    if (this.usuario) {
      this.pendiente = {
        clave: crypto.randomUUID(),
        version: this.version,
        tipo: 'GUARDAR',
        articulos,
      };
      this.guardarPendiente();
      void this.enviar(this.turno, this.usuario);
    } else this.guardarInvitado(articulos);
  }
  private guardarInvitado(articulos: readonly ArticuloCarrito[]) {
    try {
      this.almacenamiento?.setItem(CLAVE_CARRITO, JSON.stringify({ version: 1, articulos }));
      this.almacenamiento?.setItem(CLAVE_ANTIGUA, JSON.stringify({ version: 1, articulos: [] }));
    } catch {
      this.permiteGuardar.set(false);
    }
  }
}
