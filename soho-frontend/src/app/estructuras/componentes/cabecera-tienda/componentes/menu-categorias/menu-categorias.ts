import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { NavigationStart, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Icono } from '../../../../../compartido/componentes/icono/icono';
import { NavegacionTienda } from '../../../../servicios/navegacion-tienda';

@Component({
  imports: [RouterLink, Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-menu-categorias',
  styleUrl: './menu-categorias.css',
  templateUrl: './menu-categorias.html',
  host: { '(document:pointerdown)': 'cerrarExterior($event)', '(window:resize)': 'cerrar()' },
})
export class MenuCategorias {
  readonly movil = input(false);
  readonly identificador = input('navegacion-escritorio');
  readonly navegado = output<void>();
  private readonly navegacion = inject(NavegacionTienda);
  protected get grupos() {
    return this.navegacion.grupos;
  }
  protected readonly abierto = signal<string | null>(null);
  private readonly elemento = inject(ElementRef<HTMLElement>);
  private cierrePendiente: ReturnType<typeof setTimeout> | undefined;
  private focoPendiente: ReturnType<typeof setTimeout> | undefined;
  private restaurandoFoco = false;

  constructor() {
    inject(Router)
      .events.pipe(takeUntilDestroyed())
      .subscribe((evento) => {
        if (evento instanceof NavigationStart) this.cerrar();
      });
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.cierrePendiente);
      clearTimeout(this.focoPendiente);
    });
  }

  protected entrar(evento: PointerEvent, grupo: string) {
    if (!this.movil() && evento.pointerType === 'mouse') this.abrir(grupo);
  }

  protected salir(evento: PointerEvent, grupo: string) {
    if (this.movil() || evento.pointerType !== 'mouse') return;
    const contenedor = evento.currentTarget as HTMLElement;
    if (contenedor.querySelector(':focus-visible')) return;
    clearTimeout(this.cierrePendiente);
    this.cierrePendiente = setTimeout(() => {
      if (this.abierto() === grupo) this.cerrar();
    }, 150);
  }

  protected enfocar(evento: FocusEvent, grupo: string) {
    if (
      !this.movil() &&
      !this.restaurandoFoco &&
      (evento.target as HTMLElement).matches(':focus-visible')
    )
      this.abrir(grupo);
  }

  protected desenfocar(evento: FocusEvent, grupo: string) {
    if (
      !this.movil() &&
      this.abierto() === grupo &&
      !(evento.currentTarget as HTMLElement).contains(evento.relatedTarget as Node | null)
    )
      this.cerrar();
  }

  protected alternar(grupo: string) {
    if (this.abierto() === grupo) this.cerrar();
    else this.abrir(grupo);
  }

  protected teclado(evento: KeyboardEvent, grupo: string) {
    if (this.grupos.find((actual) => actual.identificador === grupo)?.enlaceDirecto) return;
    const contenedor = evento.currentTarget as HTMLElement;
    if (evento.key === 'Escape' && this.abierto() === grupo) {
      evento.preventDefault();
      evento.stopPropagation();
      this.cerrar();
      this.restaurandoFoco = true;
      contenedor
        .querySelector<HTMLElement>(this.movil() ? '.activador-movil' : '.titulo-seccion')
        ?.focus();
      this.restaurandoFoco = false;
    } else if (!this.movil() && (evento.key === 'ArrowDown' || evento.key === 'ArrowUp')) {
      evento.preventDefault();
      this.abrir(grupo);
      const enlaces = [
        ...contenedor.querySelectorAll<HTMLAnchorElement>('.enlace-titulo, .enlaces a'),
      ];
      const actual = enlaces.indexOf(evento.target as HTMLAnchorElement);
      const indice =
        evento.key === 'ArrowDown'
          ? (actual + 1) % enlaces.length
          : actual <= 0
            ? enlaces.length - 1
            : actual - 1;
      clearTimeout(this.focoPendiente);
      this.focoPendiente = setTimeout(() => {
        if (this.abierto() === grupo && enlaces[indice]?.isConnected) enlaces[indice].focus();
      }, 0);
    }
  }

  protected navegar() {
    this.cerrar();
    this.navegado.emit();
  }

  protected cerrarExterior(evento: PointerEvent) {
    if (!this.elemento.nativeElement.contains(evento.target as Node)) this.cerrar();
  }

  protected cerrar() {
    clearTimeout(this.cierrePendiente);
    clearTimeout(this.focoPendiente);
    this.abierto.set(null);
  }

  private abrir(grupo: string) {
    if (this.grupos.find((actual) => actual.identificador === grupo)?.enlaceDirecto) {
      this.cerrar();
      return;
    }
    clearTimeout(this.cierrePendiente);
    this.abierto.set(grupo);
  }
}
