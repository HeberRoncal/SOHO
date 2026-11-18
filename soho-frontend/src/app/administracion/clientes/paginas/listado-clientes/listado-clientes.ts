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
import { ClientesAdministracionApi } from '../../servicios/clientes-administracion-api';
import { fechaClienteAdmin, inicialesClienteAdmin } from '../../modelos/cliente-admin';
import { Icono } from '../../../../compartido/componentes/icono/icono';
import { PaginacionClientes } from '../../componentes/paginacion-clientes/paginacion-clientes';
export function paginaClienteRuta(v: string | null) {
  return v && /^[1-9]\d{0,5}$/.test(v) && Number(v) <= 100000 ? Number(v) : 1;
}
@Component({
  selector: 'app-listado-clientes',
  imports: [RouterLink, Icono, PaginacionClientes],
  templateUrl: './listado-clientes.html',
  styleUrls: ['../../clientes-admin.css', './listado-clientes.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListadoClientes {
  protected readonly fuente = inject(ClientesAdministracionApi);
  private readonly ruta = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly parametros = toSignal(this.ruta.queryParamMap, {
    initialValue: this.ruta.snapshot.queryParamMap,
  });
  protected readonly busqueda = computed(() =>
    (this.parametros().get('busqueda') ?? '').slice(0, 120),
  );
  protected readonly tipo = computed(() => {
    const t = this.parametros().get('tipo');
    return t === 'registrado' || t === 'invitado' ? t : '';
  });
  protected readonly orden = computed(() => {
    const o = this.parametros().get('orden');
    return o === 'nombre' || o === 'pedidos' ? o : 'recientes';
  });
  protected readonly pagina = computed(() => paginaClienteRuta(this.parametros().get('pagina')));
  protected readonly fecha = fechaClienteAdmin;
  protected readonly iniciales = inicialesClienteAdmin;
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
      tipo: this.tipo(),
      orden: this.orden(),
      pagina: String(this.pagina()),
    };
  }
  protected reintentar() {
    void this.fuente.cargarListado(this.filtros());
  }
  protected actualizar(campo: 'busqueda' | 'orden', e: Event) {
    this.cambiar(campo, (e.target as HTMLInputElement).value);
  }
  protected cambiar(campo: string, valor: string) {
    void this.router.navigate([], {
      relativeTo: this.ruta,
      queryParams: {
        [campo]: valor === 'recientes' ? null : valor || null,
        pagina: null,
        vista: null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: campo === 'busqueda',
    });
  }
  protected cambiarPagina(pagina: number) {
    void this.router.navigate([], {
      relativeTo: this.ruta,
      queryParams: { pagina: pagina === 1 ? null : pagina, vista: null },
      queryParamsHandling: 'merge',
    });
  }
  protected limpiar() {
    void this.router.navigate([], {
      relativeTo: this.ruta,
      queryParams: { busqueda: null, tipo: null, orden: null, pagina: null, vista: null },
      queryParamsHandling: 'merge',
    });
  }
}
