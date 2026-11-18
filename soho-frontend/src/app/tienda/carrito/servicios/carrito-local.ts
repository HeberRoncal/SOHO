import { DOCUMENT } from '@angular/common';
import { Injectable, InjectionToken, computed, inject, signal } from '@angular/core';
import { FUENTE_CATALOGO } from '../../catalogo/modelos/fuente-catalogo';
import { ArticuloCarrito } from '../modelos/articulo-carrito';
import { LineaCarrito } from '../modelos/linea-carrito';
import { GestorCarrito } from '../modelos/gestor-carrito';
import { ResultadoCarrito } from '../modelos/resultado-carrito';

export const ALMACENAMIENTO_CARRITO = new InjectionToken<Pick<
  Storage,
  'getItem' | 'setItem'
> | null>('ALMACENAMIENTO_CARRITO', {
  providedIn: 'root',
  factory: () => {
    try {
      return inject(DOCUMENT).defaultView?.localStorage ?? null;
    } catch {
      return null;
    }
  },
});
const CLAVE_CARRITO = 'soho:carrito:demostracion';

// Carrito de invitado: no registra pedidos, reserva existencias ni procesa pagos.
// Solo persiste SKU y cantidad; los nombres, precios y stock proceden del catálogo.
@Injectable({ providedIn: 'root' })
export class CarritoLocal implements GestorCarrito {
  private readonly catalogo = inject(FUENTE_CATALOGO);
  private readonly almacenamiento = inject(ALMACENAMIENTO_CARRITO);
  private readonly permiteGuardar = signal(this.almacenamiento !== null);
  readonly guardadoLocal = this.permiteGuardar.asReadonly();
  private readonly articulos = signal<readonly ArticuloCarrito[]>(this.recuperar());
  readonly lineas = computed<readonly LineaCarrito[]>(() =>
    this.articulos().map((articulo) => this.resolver(articulo)),
  );
  readonly unidades = computed(() =>
    this.articulos().reduce((total, articulo) => total + articulo.cantidad, 0),
  );
  readonly subtotal = computed(
    () =>
      this.lineas().reduce((total, linea) => total + Math.round((linea.importe ?? 0) * 100), 0) /
      100,
  );
  readonly puedeContinuar = computed(
    () => this.lineas().length > 0 && this.lineas().every((linea) => !linea.incidencia),
  );

  constructor() {
    this.catalogo.cargarSkus?.(this.articulos().map((articulo) => articulo.sku));
  }

  agregar(sku: string, cantidad: number): ResultadoCarrito {
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
    this.actualizar(this.articulos().filter((articulo) => articulo.sku !== sku));
  }
  vaciar() {
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
    return typeof cantidad === 'number' && Number.isSafeInteger(cantidad) && cantidad > 0;
  }
  private recuperar(): readonly ArticuloCarrito[] {
    let contenido: string | null;
    try {
      contenido = this.almacenamiento?.getItem(CLAVE_CARRITO) ?? null;
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
    try {
      this.almacenamiento?.setItem(CLAVE_CARRITO, JSON.stringify({ version: 1, articulos }));
    } catch {
      this.permiteGuardar.set(false);
    }
  }
}
