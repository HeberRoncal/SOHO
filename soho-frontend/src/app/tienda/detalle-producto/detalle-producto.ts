import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';

import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, scan, startWith, switchMap } from 'rxjs';
import { Title } from '@angular/platform-browser';
import { Producto } from '../catalogo/modelos/producto';
import { FUENTE_CATALOGO } from '../catalogo/modelos/fuente-catalogo';
import { PresentacionTienda } from '../../estructuras/servicios/presentacion-tienda';
import { Icono } from '../../compartido/componentes/icono/icono';
import { BotonFavorito } from '../../compartido/componentes/boton-favorito/boton-favorito';
import { PrecioProducto } from '../../compartido/componentes/precio-producto/precio-producto';
import { ControlCantidad } from '../../compartido/componentes/control-cantidad/control-cantidad';
import { TarjetaProducto } from '../catalogo/componentes/tarjeta-producto/tarjeta-producto';
import { GaleriaProducto } from './componentes/galeria-producto/galeria-producto';
import { SelectorVariantes } from './componentes/selector-variantes/selector-variantes';
import { GuiaTallas } from './componentes/guia-tallas/guia-tallas';
import { Carrito } from '../carrito/servicios/carrito';

interface ConsultaFicha {
  estado: 'cargando' | 'error' | 'listo';
  slug: string;
  datos?: Producto;
  anterior?: Producto;
}

@Component({
  selector: 'app-detalle-producto',
  imports: [
    RouterLink,
    Icono,
    BotonFavorito,
    PrecioProducto,
    ControlCantidad,
    TarjetaProducto,
    GaleriaProducto,
    SelectorVariantes,
    GuiaTallas,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './detalle-producto.html',
  styleUrl: './detalle-producto.css',
})
export class DetalleProducto {
  private readonly ruta = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly catalogo = inject(FUENTE_CATALOGO);
  protected readonly presentacion = inject(PresentacionTienda);
  private readonly carrito = inject(Carrito);
  private readonly destruccion = inject(DestroyRef);
  private temporizadorCarga: ReturnType<typeof setTimeout> | undefined;
  private temporizadorConfirmacion: ReturnType<typeof setTimeout> | undefined;
  protected readonly estadoCarrito = signal<'listo' | 'cargando' | 'agregado'>('listo');
  protected readonly mensajeCarrito = signal('');
  protected readonly errorCarrito = signal(false);
  private readonly parametros = toSignal(this.ruta.paramMap, {
    initialValue: this.ruta.snapshot.paramMap,
  });
  private readonly consulta = toSignal(this.ruta.queryParamMap, {
    initialValue: this.ruta.snapshot.queryParamMap,
  });
  private readonly tituloPagina = inject(Title);
  private readonly intento = signal(0);
  private readonly solicitud = computed(() => ({
    slug: this.parametros().get('identificador') ?? '',
    intento: this.intento(),
  }));
  protected readonly respuesta = toSignal(
    toObservable(this.solicitud).pipe(
      switchMap(({ slug }) => {
        const consulta = this.catalogo.obtenerProducto
          ? this.catalogo.obtenerProducto(slug)
          : of(this.catalogo.obtener(slug));
        return consulta.pipe(
          map((datos): ConsultaFicha => ({ estado: 'listo', datos, slug })),
          catchError(() => of<ConsultaFicha>({ estado: 'error', slug })),
          startWith<ConsultaFicha>({ estado: 'cargando', slug }),
        );
      }),
      scan(
        (anterior: ConsultaFicha, actual: ConsultaFicha): ConsultaFicha => {
          if (actual.estado === 'listo') return actual;
          const ficha = anterior.datos ?? anterior.anterior;
          const mismoModelo =
            ficha &&
            (ficha.identificador === actual.slug ||
              ficha.otrosColores?.some((color) => color.slug === actual.slug));
          return { ...actual, anterior: mismoModelo ? ficha : undefined };
        },
        { estado: 'cargando', slug: '' },
      ),
    ),
    {
      initialValue: {
        estado: 'cargando',
        slug: this.ruta.snapshot.paramMap.get('identificador') ?? '',
      } as ConsultaFicha,
    },
  );
  protected readonly producto = computed(() => {
    const r = this.respuesta();
    return r.estado === 'listo' ? r.datos : r.anterior;
  });
  protected readonly fichaConfirmada = computed(
    () => this.respuesta().estado === 'listo' && this.respuesta().slug === this.solicitud().slug,
  );
  protected readonly actualizando = computed(
    () => this.respuesta().estado === 'cargando' || this.respuesta().slug !== this.solicitud().slug,
  );
  protected readonly nombreProducto = computed(() => {
    const producto = this.producto();
    if (!producto) return '';
    const nombre = producto.nombre.trim();
    const marca = producto.marca.trim();
    return marca && nombre.toLowerCase().startsWith(marca.toLowerCase() + ' ')
      ? nombre.slice(marca.length).trim()
      : nombre;
  });
  protected reintentar() {
    this.intento.update((n) => n + 1);
  }
  protected readonly color = computed(
    () =>
      this.producto()?.colores.find((color) => color.codigo === this.consulta().get('color')) ??
      this.producto()?.colores[0],
  );
  protected readonly variante = computed(() => {
    const solicitado = this.consulta().get('color');
    if (solicitado && !this.producto()?.colores.some((color) => color.codigo === solicitado))
      return undefined;
    const variante = this.producto()?.variantes.find(
      (variante) =>
        variante.codigoColor === this.color()?.codigo &&
        variante.talla === this.consulta().get('talla'),
    );
    return variante && this.catalogo.estaDisponible(variante) ? variante : undefined;
  });
  protected readonly cantidad = signal(1);
  protected readonly guiaAbierta = signal(false);
  protected readonly existencias = computed(() => {
    const variante = this.variante();
    return variante ? Math.max(0, variante.existencias - variante.cantidadReservada) : 0;
  });
  protected readonly favorito = computed(() =>
    this.presentacion.favoritos().includes(this.producto()?.identificador ?? ''),
  );
  protected readonly seleccionInvalida = computed(
    () => Boolean(this.consulta().get('talla')) && !this.variante(),
  );
  protected readonly imagenes = computed(() => {
    const producto = this.producto();
    if (!producto) return [];
    const fotosColores = new Set(producto.colores.flatMap((color) => color.imagenes));
    return [
      ...new Set([
        ...(this.color()?.imagenes ?? []),
        ...producto.imagenes.filter((imagen) => !fotosColores.has(imagen)),
      ]),
    ];
  });
  protected readonly relacionados = computed(() => {
    const producto = this.producto();
    return producto
      ? this.catalogo
          .consultar()
          .filter(
            (otro) =>
              otro.identificador !== producto.identificador &&
              (otro.marca === producto.marca || otro.categoria === producto.categoria),
          )
          .slice(0, 4)
      : [];
  });
  constructor() {
    effect(() => {
      if (!this.fichaConfirmada()) return;
      const p = this.producto(),
        color = this.consulta().get('color');
      if (!p || p.otrosColores === undefined) return;
      const otro = color ? p.otrosColores.find((c) => c.codigo === color) : undefined;
      const slug = otro?.slug ?? p.identificador;
      if (slug !== this.parametros().get('identificador'))
        void this.router.navigate(['/producto', slug], {
          queryParams: { ...this.ruta.snapshot.queryParams, color: otro ? null : color },
          replaceUrl: true,
        });
    });
    effect(() => {
      const r = this.respuesta();
      this.tituloPagina.setTitle(
        this.producto()
          ? this.producto()!.nombre + ' | SOHO'
          : r.estado === 'listo'
            ? 'Producto no encontrado | SOHO'
            : 'Producto | SOHO',
      );
    });
    effect(() => {
      this.variante();
      this.cantidad.set(1);
      this.restablecerBotonCarrito();
    });
    effect(() => {
      this.producto();
      this.guiaAbierta.set(false);
    });
    this.destruccion.onDestroy(() => this.cancelarConfirmacion());
  }
  protected cambiarFichaColor(slug: string) {
    void this.router.navigate(['/producto', slug], {
      queryParams: { talla: this.variante()?.talla ?? null },
      scroll: 'manual',
    });
  }
  protected cambiarColor(color: string) {
    if (this.producto()?.otrosColores !== undefined) {
      this.cambiarFichaColor(this.producto()!.identificador);
      return;
    }
    void this.router.navigate([], {
      relativeTo: this.ruta,
      queryParams: { color, talla: null },
      queryParamsHandling: 'merge',
      scroll: 'manual',
    });
  }
  protected cambiarTalla(talla: string) {
    if (!this.fichaConfirmada()) return;
    const variante = this.producto()?.variantes.find(
      (variante) => variante.codigoColor === this.color()?.codigo && variante.talla === talla,
    );
    if (variante && this.catalogo.estaDisponible(variante))
      void this.router.navigate([], {
        relativeTo: this.ruta,
        queryParams: { color: variante.codigoColor, talla },
        queryParamsHandling: 'merge',
        scroll: 'manual',
      });
  }
  protected cambiarCantidad(cantidad: number) {
    if (!this.fichaConfirmada()) return;
    if (Number.isInteger(cantidad) && cantidad >= 1 && cantidad <= this.existencias()) {
      this.restablecerBotonCarrito();
      this.cantidad.set(cantidad);
    }
  }
  protected agregarAlCarrito() {
    if (
      !this.fichaConfirmada() ||
      !this.variante() ||
      this.cantidad() > this.existencias() ||
      this.estadoCarrito() !== 'listo'
    )
      return;
    this.estadoCarrito.set('cargando');
    this.errorCarrito.set(false);
    this.mensajeCarrito.set('Agregando al carrito.');
    const resultado = this.carrito.agregar(this.variante()!.sku, this.cantidad());
    if (!resultado.correcto) {
      this.estadoCarrito.set('listo');
      this.mensajeCarrito.set(resultado.mensaje);
      this.errorCarrito.set(true);
      return;
    }
    // Duración de la confirmación visual; el carrito local ya está actualizado.
    this.temporizadorCarga = setTimeout(() => {
      this.temporizadorCarga = undefined;
      this.estadoCarrito.set('agregado');
      this.mensajeCarrito.set(resultado.mensaje);
      this.temporizadorConfirmacion = setTimeout(() => {
        this.temporizadorConfirmacion = undefined;
        this.estadoCarrito.set('listo');
      }, 1500);
    }, 500);
  }
  private cancelarConfirmacion() {
    clearTimeout(this.temporizadorCarga);
    clearTimeout(this.temporizadorConfirmacion);
    this.temporizadorCarga = undefined;
    this.temporizadorConfirmacion = undefined;
  }
  private restablecerBotonCarrito() {
    this.cancelarConfirmacion();
    this.estadoCarrito.set('listo');
    this.mensajeCarrito.set('');
    this.errorCarrito.set(false);
  }
}
