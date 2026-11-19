import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  OnInit,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { Cuenta } from '../../servicios/cuenta';
import { Pedidos } from '../../../pedidos/servicios/pedidos';
import { PerfilCuenta } from '../../componentes/perfil-cuenta/perfil-cuenta';
import { PedidosCuenta } from '../../componentes/pedidos-cuenta/pedidos-cuenta';
import { Icono } from '../../../../compartido/componentes/icono/icono';
import { EstadoVerificacion } from '../../componentes/estado-verificacion/estado-verificacion';

@Component({
  imports: [
    RouterLink,
    RouterLinkActive,
    PerfilCuenta,
    PedidosCuenta,
    Icono,
    EstadoVerificacion,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-mi-cuenta',
  styleUrl: './mi-cuenta.css',
  templateUrl: './mi-cuenta.html',
})
export class MiCuenta implements OnInit {
  protected readonly saliendo = signal(false);
  protected readonly errorSalida = signal('');
  protected readonly cuenta = inject(Cuenta);
  private readonly ruta = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly pedidos = inject(Pedidos);
  private readonly datos = toSignal(this.ruta.data, { initialValue: this.ruta.snapshot.data });
  protected readonly seccion = computed(() => this.datos()['seccion'] ?? 'resumen');
  protected readonly titulos: Record<string, string> = {
    resumen: 'Mi cuenta',
    pedidos: 'Mis pedidos',
    perfil: 'Mis datos',
  };
  protected readonly totalPedidos = computed(() =>
    this.pedidos.remoto ? this.pedidos.paginacion().total : this.pedidos.listarMios().length,
  );
  async ngOnInit() {
    if (this.pedidos.remoto) void this.pedidos.cargarMios();
  }
  protected async salir() {
    if (this.saliendo()) return;
    this.saliendo.set(true);
    const resultado = await this.cuenta.cerrarSesion();
    this.saliendo.set(false);
    if (resultado.correcto) await this.router.navigate(['/iniciar-sesion']);
    else this.errorSalida.set(resultado.mensaje);
  }
}
