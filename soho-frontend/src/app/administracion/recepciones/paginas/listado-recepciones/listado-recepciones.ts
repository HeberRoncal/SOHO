import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { RecepcionesAdministracionApi } from '../../servicios/recepciones-administracion-api';
import {
  ESTADOS_RECEPCION,
  EstadoRecepcion,
  fechaRecepcion,
  importeRecepcion,
} from '../../modelos/recepcion-admin';

@Component({
  selector: 'app-listado-recepciones',
  imports: [RouterLink],
  templateUrl: './listado-recepciones.html',
  styleUrl: '../../recepciones-admin.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListadoRecepciones {
  protected readonly fuente = inject(RecepcionesAdministracionApi);
  private readonly ruta = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly parametros = toSignal(this.ruta.queryParamMap, {
    initialValue: this.ruta.snapshot.queryParamMap,
  });
  protected readonly estados = Object.entries(ESTADOS_RECEPCION) as [EstadoRecepcion, string][];
  protected readonly etiquetas = ESTADOS_RECEPCION;
  protected readonly fecha = fechaRecepcion;
  protected readonly importe = importeRecepcion;
  protected readonly busqueda = computed(() =>
    (this.parametros().get('busqueda') ?? '').slice(0, 100),
  );
  protected readonly estado = computed(() => {
    const e = this.parametros().get('estado');
    return e && Object.hasOwn(ESTADOS_RECEPCION, e) ? e : '';
  });
  protected readonly pagina = computed(() => {
    const p = this.parametros().get('pagina') ?? '';
    return /^[1-9]\d{0,5}$/.test(p) && +p <= 100000 ? +p : 1;
  });
  protected readonly limite = computed(() =>
    this.parametros().get('limite') === '50' ? '50' : '20',
  );
  protected readonly total = computed(() => {
    const r = this.fuente.resumen();
    return r ? Object.values(r).reduce((n, v) => n + v, 0) : null;
  });
  constructor() {
    effect(() => {
      const filtros = this.filtros();
      untracked(() => void this.fuente.cargarListado(filtros));
    });
    inject(DestroyRef).onDestroy(() => this.fuente.salirListado());
  }
  private filtros() {
    return {
      busqueda: this.busqueda().trim(),
      estado: this.estado(),
      pagina: String(this.pagina()),
      limite: this.limite(),
    };
  }
  protected reintentar() {
    void this.fuente.cargarListado(this.filtros());
  }
  protected cambiar(campo: string, valor: string) {
    void this.router.navigate([], {
      relativeTo: this.ruta,
      queryParams: { [campo]: valor || null, pagina: null },
      queryParamsHandling: 'merge',
    });
  }
  protected cambiarPagina(pagina: number) {
    void this.router.navigate([], {
      relativeTo: this.ruta,
      queryParams: { pagina: pagina === 1 ? null : pagina },
      queryParamsHandling: 'merge',
    });
  }
  protected buscar(e: Event, valor: string) {
    e.preventDefault();
    this.cambiar('busqueda', valor.trim());
  }
  protected limpiar() {
    void this.router.navigate([], { relativeTo: this.ruta, queryParams: {} });
  }
}
