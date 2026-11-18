import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { VentanaDialogo } from '../../../../compartido/componentes/ventana-dialogo/ventana-dialogo';
import { Icono } from '../../../../compartido/componentes/icono/icono';
@Component({
  selector: 'app-pie-compra',
  imports: [RouterLink, VentanaDialogo, Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<footer>
      <nav aria-label="Ayuda e información de compra">
        <button type="button" (click)="informacion.set('Centro de ayuda')">Centro de ayuda</button>
        <button type="button" (click)="informacion.set('Términos y condiciones')">
          Términos y condiciones
        </button>
        <button type="button" (click)="informacion.set('Política de privacidad')">
          Política de privacidad
        </button>
        <button type="button" (click)="informacion.set('Libro de Reclamaciones')">
          <app-icono nombre="recibo" [tamano]="15" />Libro de Reclamaciones
        </button>
      </nav>
      <span>Precios en soles (S/) · © {{ anio }} SOHO</span>
    </footer>
    <app-ventana-dialogo
      [abierto]="!!informacion()"
      [titulo]="informacion()"
      (cerrado)="informacion.set('')"
    >
      @if (informacion() === 'Centro de ayuda') {
        <p>
          Elige Yape o Plin, comprueba el titular y el importe, y adjunta el comprobante de esa
          transferencia. El equipo de SOHO revisará el abono antes de aprobar el pago.
        </p>
        <p>
          Si ya enviaste un comprobante, conserva esta pestaña y consulta el estado de tu recepción.
          No repitas el pago para recuperar un envío pendiente.
        </p>
        <a class="boton boton-acento" routerLink="/seguimiento-pedido" (click)="informacion.set('')"
          >Consultar mi pedido</a
        >
      } @else {
        <p>
          {{
            informacion() === 'Libro de Reclamaciones'
              ? 'El canal del Libro de Reclamaciones de SOHO todavía no está configurado.'
              : 'Este documento de SOHO todavía no está publicado.'
          }}
        </p>
        <p>
          Los datos de atención y documentos del negocio se incorporarán en esta sección cuando
          estén disponibles.
        </p>
      }
    </app-ventana-dialogo>`,
  styles: `
    footer {
      max-width: 1440px;
      margin: auto;
      padding: 24px var(--margen-pagina);
      border-top: 1px solid var(--color-borde);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 18px;
      font-size: 12px;
      color: var(--color-tenue);
    }
    nav {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 20px;
    }
    button {
      border: 0;
      background: transparent;
      padding: 0;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 44px;
      text-align: left;
      color: var(--color-secundario);
      font-size: 12px;
    }
    button:hover {
      text-decoration: underline;
    }
    p {
      font-size: 14px;
      line-height: 1.6;
    }
    a {
      margin-top: 16px;
    }
    @media (max-width: 600px) {
      footer {
        padding-block: 20px;
      }
      nav {
        gap: 0 16px;
      }
    }
  `,
})
export class PieCompra {
  protected readonly informacion = signal('');
  protected readonly anio = new Date().getFullYear();
}
