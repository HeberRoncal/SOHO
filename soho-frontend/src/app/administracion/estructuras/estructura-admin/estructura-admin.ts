import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { Icono } from '../../../compartido/componentes/icono/icono';
import { Cuenta } from '../../../tienda/cuenta/servicios/cuenta';

@Component({
  imports: [RouterLink, RouterLinkActive, RouterOutlet, NgTemplateOutlet, Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-estructura-admin',
  styleUrl: './estructura-admin.css',
  templateUrl: './estructura-admin.html',
})
export class EstructuraAdmin {
  protected readonly cuenta = inject(Cuenta);
  protected readonly saliendo = signal(false);
  protected readonly errorSalida = signal('');
  protected readonly nombreAdmin = computed(() => {
    const perfil = this.cuenta.perfil();
    return perfil ? `${perfil.nombres} ${perfil.apellidos}` : 'Administración';
  });
  protected readonly iniciales = computed(() =>
    this.nombreAdmin()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p.charAt(0))
      .join(''),
  );
  protected async salir() {
    if (this.saliendo()) return;
    this.saliendo.set(true);
    const resultado = await this.cuenta.cerrarSesion();
    this.saliendo.set(false);
    if (resultado.correcto) await this.router.navigate(['/iniciar-sesion']);
    else this.errorSalida.set(resultado.mensaje);
  }
  private readonly router = inject(Router);
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );
  protected readonly titulo = computed(() =>
    this.url().split(/[?#]/)[0].startsWith('/admin/recepciones')
      ? this.url().split(/[?#]/)[0] === '/admin/recepciones'
        ? 'Recepciones'
        : 'Detalle de recepción'
      : this.url().split(/[?#]/)[0] === '/admin/dashboard'
        ? 'Dashboard'
        : this.url().split(/[?#]/)[0].startsWith('/admin/configuracion')
          ? 'Configuración'
          : this.url().split(/[?#]/)[0].startsWith('/admin/cambios')
            ? this.url().split(/[?#]/)[0] === '/admin/cambios'
              ? 'Cambios y devoluciones'
              : 'Detalle de solicitud'
            : this.url().split(/[?#]/)[0].startsWith('/admin/clientes')
              ? this.url().split(/[?#]/)[0] === '/admin/clientes'
                ? 'Clientes'
                : 'Detalle del cliente'
              : this.url().split(/[?#]/)[0].startsWith('/admin/pagos')
                ? this.url().split(/[?#]/)[0] === '/admin/pagos'
                  ? 'Pagos por verificar'
                  : 'Revisión de pago'
                : this.url().split(/[?#]/)[0].startsWith('/admin/pedidos')
                  ? this.url().split(/[?#]/)[0] === '/admin/pedidos'
                    ? 'Pedidos'
                    : 'Detalle del pedido'
                  : this.url().split('?')[0].endsWith('/nuevo')
                    ? 'Nuevo producto'
                    : this.url().split('?')[0].endsWith('/editar')
                      ? 'Editar producto'
                      : 'Productos e inventario',
  );
  private readonly menu = viewChild<ElementRef<HTMLDialogElement>>('menu');
  protected readonly menuAbierto = signal(false);
  protected abrirMenu() {
    this.menu()?.nativeElement.showModal();
    this.menuAbierto.set(true);
  }
  protected cerrarMenu() {
    this.menu()?.nativeElement.close();
    this.menuAbierto.set(false);
  }
  protected cerrarExterior(evento: MouseEvent) {
    const dialogo = this.menu()?.nativeElement;
    if (!dialogo || evento.target !== dialogo) return;
    const r = dialogo.getBoundingClientRect();
    if (
      evento.clientX < r.left ||
      evento.clientX > r.right ||
      evento.clientY < r.top ||
      evento.clientY > r.bottom
    )
      this.cerrarMenu();
  }
}
