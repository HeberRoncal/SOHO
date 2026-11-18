import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';

import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { PresentacionTienda } from '../../servicios/presentacion-tienda';
import { Icono } from '../../../compartido/componentes/icono/icono';

interface ContactoTienda {
  correo: string | null;
  whatsapp: string | null;
  horario: string | null;
}

@Component({
  selector: 'app-pie-tienda',
  imports: [RouterLink, Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pie-tienda.html',
  styleUrl: './pie-tienda.css',
})
export class PieTienda {
  private readonly http = inject(HttpClient);
  private readonly destruccion = inject(DestroyRef);
  protected readonly contacto = signal<ContactoTienda | null>(null);
  protected readonly errorContacto = signal(false);
  private cargandoContacto = false;
  constructor() {
    this.cargarContacto();
  }
  protected cargarContacto() {
    if (this.cargandoContacto) return;
    this.cargandoContacto = true;
    this.errorContacto.set(false);
    this.http
      .get<ContactoTienda>('/api/configuracion/tienda')
      .pipe(takeUntilDestroyed(this.destruccion))
      .subscribe({
        next: (datos) => {
          this.contacto.set(datos);
          this.cargandoContacto = false;
        },
        error: () => {
          this.errorContacto.set(true);
          this.cargandoContacto = false;
        },
      });
  }
  protected readonly presentacion = inject(PresentacionTienda);
  protected readonly anio = new Date().getFullYear();
  protected readonly ayuda = [
    {
      titulo: 'Envíos y cobertura',
      contenido:
        'SOHO opera exclusivamente online desde La Esperanza, Trujillo, La Libertad, Perú. El envío es gratuito dentro de La Esperanza. Los demás distritos habilitados de Trujillo tendrán una tarifa según el destino, visible antes de confirmar la compra. No contamos con recojo en tienda.',
    },
    {
      titulo: 'Métodos de pago',
      contenido:
        'Los métodos e instrucciones disponibles se muestran al finalizar la compra. Comprueba el titular y el importe antes de transferir por Yape o Plin y adjunta el comprobante. El equipo de SOHO revisará el abono antes de aprobar el pago.',
    },
    {
      titulo: 'Guía de tallas',
      contenido:
        'Cada marca y modelo puede usar equivalencias distintas. Las tallas de las fichas se muestran en sistema EU (europeo). Consulta la equivalencia de tu modelo con el equipo de SOHO.',
    },
    {
      titulo: 'Cambios y devoluciones',
      contenido:
        'Consulta con el equipo de SOHO las condiciones aplicables antes de solicitar un cambio o una devolución.',
    },
  ];
}
