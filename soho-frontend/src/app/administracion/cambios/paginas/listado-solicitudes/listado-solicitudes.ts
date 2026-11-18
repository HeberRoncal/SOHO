import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { SolicitudesAdministracion } from '../../servicios/solicitudes-administracion';
import {
  ESTADOS_SOLICITUD,
  MOTIVOS_SOLICITUD,
  solicitudAbierta,
} from '../../modelos/solicitud-admin';
import { normalizarBusquedaAdmin } from '../../../productos/modelos/producto-administracion';
import { fechaClienteAdmin } from '../../../clientes/modelos/cliente-admin';
import { EstadoSolicitudComponent } from '../../componentes/estado-solicitud/estado-solicitud';
import { NuevaSolicitudComponent } from '../../componentes/nueva-solicitud/nueva-solicitud';
import { Icono } from '../../../../compartido/componentes/icono/icono';

@Component({
  selector: 'app-listado-solicitudes',
  imports: [RouterLink, EstadoSolicitudComponent, NuevaSolicitudComponent, Icono],
  templateUrl: './listado-solicitudes.html',
  styleUrls: ['../../cambios-admin.css', './listado-solicitudes.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListadoSolicitudes {
  protected readonly fuente = inject(SolicitudesAdministracion);
  private readonly ruta = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly parametros = toSignal(this.ruta.queryParamMap, {
    initialValue: this.ruta.snapshot.queryParamMap,
  });
  protected readonly nuevo = signal(false);
  protected readonly mensaje = signal('');
  protected readonly motivos = MOTIVOS_SOLICITUD;
  protected readonly estados = Object.entries(ESTADOS_SOLICITUD);
  protected readonly fecha = fechaClienteAdmin;
  protected readonly busqueda = computed(() =>
    (this.parametros().get('busqueda') ?? '').slice(0, 120),
  );
  protected readonly estado = computed(() => {
    const e = this.parametros().get('estado') ?? '';
    return Object.hasOwn(ESTADOS_SOLICITUD, e) ? e : '';
  });
  protected readonly tipo = computed(() => {
    const t = this.parametros().get('tipo');
    return t === 'cambio' || t === 'devolucion' ? t : '';
  });
  protected readonly grupo = computed(() => {
    const g = this.parametros().get('grupo') ?? '';
    return ['abiertas', 'evaluacion', 'cerradas'].includes(g) ? g : '';
  });
  protected readonly vista = computed(() => {
    const v = this.parametros().get('vista') ?? 'normal';
    return ['normal', 'vacio', 'cargando', 'error'].includes(v) ? v : 'normal';
  });
  protected readonly resumen = computed(() =>
    this.vista() === 'vacio'
      ? { total: 0, abiertas: 0, evaluacion: 0, cerradas: 0 }
      : this.fuente.resumen(),
  );
  protected readonly hayFiltros = computed(
    () => !!(this.busqueda() || this.estado() || this.tipo() || this.grupo()),
  );
  protected readonly resultados = computed(() => {
    const q = normalizarBusquedaAdmin(this.busqueda());
    return this.fuente
      .solicitudes()
      .filter(
        (s) =>
          (!this.tipo() || s.tipo === this.tipo()) &&
          (!this.estado() || s.estado === this.estado()) &&
          (!this.grupo() ||
            (this.grupo() === 'abiertas'
              ? solicitudAbierta(s)
              : this.grupo() === 'evaluacion'
                ? s.estado === 'evaluacion'
                : s.estado === 'cerrada')) &&
          (!q ||
            normalizarBusquedaAdmin(
              [
                s.identificador,
                s.pedido,
                s.cliente.nombre,
                s.cliente.correo,
                s.articulo.sku,
                MOTIVOS_SOLICITUD[s.motivo],
              ].join(' '),
            ).includes(q)),
      )
      .sort(
        (a, b) => b.fecha.localeCompare(a.fecha) || b.identificador.localeCompare(a.identificador),
      );
  });
  protected actualizar(campo: string, evento: Event) {
    this.cambiar(campo, (evento.target as HTMLInputElement).value);
  }
  protected cambiar(campo: string, valor: string) {
    void this.router.navigate([], {
      relativeTo: this.ruta,
      queryParams: { [campo]: valor === 'normal' ? null : valor || null },
      queryParamsHandling: 'merge',
      replaceUrl: campo === 'busqueda',
    });
  }
  protected limpiar() {
    void this.router.navigate([], {
      relativeTo: this.ruta,
      queryParams: { busqueda: null, estado: null, tipo: null, grupo: null },
      queryParamsHandling: 'merge',
    });
  }
  protected registrado(id: string) {
    this.nuevo.set(false);
    void this.router.navigate(['/admin/cambios', id], {
      queryParams: this.ruta.snapshot.queryParams,
    });
  }
  protected restablecer() {
    this.fuente.restablecer();
    this.mensaje.set(
      'Se restablecieron las solicitudes de ejemplo. Los pedidos, pagos e inventario conservan sus datos actuales.',
    );
  }
}
