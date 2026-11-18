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
import { DireccionesCuenta } from '../../componentes/direcciones-cuenta/direcciones-cuenta';
import { PedidosCuenta } from '../../componentes/pedidos-cuenta/pedidos-cuenta';
import { Icono } from '../../../../compartido/componentes/icono/icono';
import { CoberturaEntrega } from '../../../finalizar-compra/servicios/cobertura-entrega';
import { EstadoVerificacion } from '../../componentes/estado-verificacion/estado-verificacion';

@Component({
  imports: [
    RouterLink,
    RouterLinkActive,
    PerfilCuenta,
    DireccionesCuenta,
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
  protected readonly cargandoDirecciones = signal(false);
  protected readonly errorDirecciones = signal('');
  protected readonly cuenta = inject(Cuenta);
  private readonly ruta = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly pedidos = inject(Pedidos);
  private readonly cobertura = inject(CoberturaEntrega);
  private readonly datos = toSignal(this.ruta.data, { initialValue: this.ruta.snapshot.data });
  protected readonly seccion = computed(() => this.datos()['seccion'] ?? 'resumen');
  protected readonly titulos: Record<string, string> = {
    resumen: 'Mi cuenta',
    pedidos: 'Mis pedidos',
    perfil: 'Mis datos',
    direcciones: 'Mis direcciones',
  };
  protected readonly totalPedidos = computed(() =>
    this.pedidos.remoto ? this.pedidos.paginacion().total : this.pedidos.listarMios().length,
  );
  protected readonly direccion = computed(() =>
    this.cuenta.direcciones().find((d) => d.predeterminada),
  );
  protected readonly distrito = computed(
    () => this.cobertura.zonas.find((z) => z.codigo === this.direccion()?.distrito)?.nombre ?? '',
  );
  async ngOnInit() {
    if (this.pedidos.remoto) void this.pedidos.cargarMios();
    if (this.seccion() !== 'resumen') return;
    this.cargandoDirecciones.set(true);
    const resultado = await this.cuenta.cargarDirecciones();
    if (!resultado.correcto) this.errorDirecciones.set(resultado.mensaje);
    this.cargandoDirecciones.set(false);
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
