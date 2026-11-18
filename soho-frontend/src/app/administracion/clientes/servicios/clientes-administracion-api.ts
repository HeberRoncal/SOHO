import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Subject, firstValueFrom, takeUntil, timeout } from 'rxjs';
import { Cuenta } from '../../../tienda/cuenta/servicios/cuenta';
import { EstadoAutenticacion } from '../../../tienda/cuenta/servicios/estado-autenticacion';
import {
  CompraCliente,
  DetalleCliente,
  DireccionCliente,
  EstadoClientes,
  FilaCliente,
  PAGINA_CLIENTES,
  RESUMEN_CLIENTES,
  comprasCliente,
  detalleCliente,
  direccionesCliente,
  identificadorCliente,
  listadoClientes,
} from '../modelos/consulta-clientes-api';

type Canal = 'listado' | 'detalle' | 'pedidos' | 'direcciones';
const canales: readonly Canal[] = ['listado', 'detalle', 'pedidos', 'direcciones'];
@Injectable({ providedIn: 'root' })
export class ClientesAdministracionApi {
  private readonly http = inject(HttpClient);
  private readonly cuenta = inject(Cuenta);
  private readonly auth = inject(EstadoAutenticacion);
  private propietario = '';
  private fichaId = '';
  private readonly bloqueado = signal(false);
  private readonly filas = signal<readonly FilaCliente[]>([]);
  private readonly ficha = signal<DetalleCliente | null>(null);
  private readonly compras = signal<readonly CompraCliente[]>([]);
  private readonly domicilios = signal<readonly DireccionCliente[]>([]);
  private readonly conteos = signal({ ...RESUMEN_CLIENTES });
  readonly clientes = computed(() => (this.autorizado() ? this.filas() : []));
  readonly cliente = computed(() => (this.autorizado() ? this.ficha() : null));
  readonly pedidos = computed(() => (this.autorizado() ? this.compras() : []));
  readonly direcciones = computed(() => (this.autorizado() ? this.domicilios() : []));
  readonly resumen = computed(() => (this.autorizado() ? this.conteos() : null));
  private readonly paginas = {
    listado: signal({ ...PAGINA_CLIENTES }),
    pedidos: signal({ ...PAGINA_CLIENTES }),
    direcciones: signal({ ...PAGINA_CLIENTES }),
  };
  readonly paginaListado = computed(() =>
    this.autorizado() ? this.paginas.listado() : PAGINA_CLIENTES,
  );
  readonly paginaPedidos = computed(() =>
    this.autorizado() ? this.paginas.pedidos() : PAGINA_CLIENTES,
  );
  readonly paginaDirecciones = computed(() =>
    this.autorizado() ? this.paginas.direcciones() : PAGINA_CLIENTES,
  );
  readonly estados = {
    listado: signal<EstadoClientes>('inicial'),
    detalle: signal<EstadoClientes>('inicial'),
    pedidos: signal<EstadoClientes>('inicial'),
    direcciones: signal<EstadoClientes>('inicial'),
  };
  readonly mensajes = {
    listado: signal(''),
    detalle: signal(''),
    pedidos: signal(''),
    direcciones: signal(''),
  };
  private readonly turnos = { listado: 0, detalle: 0, pedidos: 0, direcciones: 0 };
  private readonly cancelar = {
    listado: new Subject<void>(),
    detalle: new Subject<void>(),
    pedidos: new Subject<void>(),
    direcciones: new Subject<void>(),
  };
  constructor() {
    effect(() => {
      this.cuenta.perfil();
      this.cuenta.estadoSesion();
      untracked(() => this.sincronizar());
    });
    inject(DestroyRef).onDestroy(() => this.limpiar());
  }
  private identidad() {
    return `${this.cuenta.perfil()?.id ?? ''}:${this.cuenta.perfil()?.rol ?? ''}:${this.auth.revision}`;
  }
  private autorizado() {
    return (
      !this.bloqueado() &&
      this.cuenta.perfil()?.rol === 'ADMIN' &&
      this.propietario === this.identidad()
    );
  }
  private sincronizar() {
    const id = this.identidad();
    if (id !== this.propietario) {
      this.limpiar();
      this.propietario = id;
      this.bloqueado.set(false);
      if (this.cuenta.perfil()?.rol !== 'ADMIN') {
        for (const canal of canales) {
          this.estados[canal].set('sin-permiso');
          this.mensajes[canal].set(
            'Tu sesión ya no permite consultar Clientes. Vuelve a iniciar sesión.',
          );
        }
      }
    }
  }
  private detener(canal: Canal) {
    this.turnos[canal]++;
    this.cancelar[canal].next();
  }
  private limpiar() {
    for (const canal of canales) {
      this.detener(canal);
      this.estados[canal].set('inicial');
      this.mensajes[canal].set('');
    }
    this.filas.set([]);
    this.conteos.set({ ...RESUMEN_CLIENTES });
    this.ficha.set(null);
    this.fichaId = '';
    this.compras.set([]);
    this.domicilios.set([]);
    this.paginas.listado.set({ ...PAGINA_CLIENTES });
    this.paginas.pedidos.set({ ...PAGINA_CLIENTES });
    this.paginas.direcciones.set({ ...PAGINA_CLIENTES });
  }
  salirListado() {
    this.detener('listado');
    this.filas.set([]);
  }
  salirDetalle() {
    for (const c of ['detalle', 'pedidos', 'direcciones'] as const) {
      this.detener(c);
      this.estados[c].set('inicial');
      this.mensajes[c].set('');
    }
    this.ficha.set(null);
    this.fichaId = '';
    this.compras.set([]);
    this.domicilios.set([]);
    this.paginas.pedidos.set({ ...PAGINA_CLIENTES });
    this.paginas.direcciones.set({ ...PAGINA_CLIENTES });
  }
  private async consultar(
    canal: Canal,
    ruta: string,
    filtros: Record<string, string>,
    recibir: (v: unknown) => void,
  ) {
    this.sincronizar();
    this.detener(canal);
    const turno = this.turnos[canal],
      dueno = this.propietario;
    this.estados[canal].set('cargando');
    this.mensajes[canal].set('');
    try {
      if (!this.autorizado()) {
        this.estados[canal].set('sin-permiso');
        this.mensajes[canal].set('Tu sesión no permite consultar Clientes.');
        return;
      }
      const params = new HttpParams({
        fromObject: Object.fromEntries(Object.entries(filtros).filter(([, v]) => v)),
      });
      const r = await firstValueFrom(
        this.http
          .get<unknown>(ruta, { params })
          .pipe(timeout(15000), takeUntil(this.cancelar[canal])),
      );
      if (turno !== this.turnos[canal] || dueno !== this.identidad() || !this.autorizado()) return;
      recibir(r);
      this.estados[canal].set('lista');
    } catch (e) {
      if (turno !== this.turnos[canal] || dueno !== this.identidad()) return;
      if (e instanceof HttpErrorResponse && [401, 403].includes(e.status)) {
        this.limpiar();
        this.bloqueado.set(true);
        for (const c of canales) {
          this.estados[c].set('sin-permiso');
          this.mensajes[c].set(
            'Tu sesión ya no permite consultar Clientes. Vuelve a iniciar sesión.',
          );
        }
        return;
      }
      if (e instanceof HttpErrorResponse && e.status === 404 && canal !== 'listado') {
        this.salirDetalle();
        this.estados.detalle.set('ausente');
        return;
      }
      this.estados[canal].set('error');
      this.mensajes[canal].set(
        e instanceof HttpErrorResponse && e.status === 429
          ? 'Hay demasiadas consultas. Espera un momento y vuelve a intentarlo.'
          : 'No pudimos cargar ' +
              {
                listado: 'los clientes',
                detalle: 'la ficha del cliente',
                pedidos: 'el historial de pedidos',
                direcciones: 'las direcciones históricas',
              }[canal] +
              '. Inténtalo nuevamente.',
      );
    }
  }
  cargarListado(filtros: Record<string, string> = {}) {
    this.sincronizar();
    this.filas.set([]);
    this.conteos.set({ ...RESUMEN_CLIENTES });
    this.paginas.listado.set({ ...PAGINA_CLIENTES });
    return this.consultar('listado', '/api/admin/clientes', filtros, (r) => {
      const v = listadoClientes(r);
      this.filas.set(v.clientes);
      this.conteos.set(v.resumen);
      this.paginas.listado.set(v.paginacion);
    });
  }
  cargarDetalle(id: string) {
    this.sincronizar();
    this.salirDetalle();
    try {
      this.fichaId = identificadorCliente(id);
    } catch {
      this.estados.detalle.set('ausente');
      return Promise.resolve();
    }
    const esperado = this.fichaId;
    return this.consultar(
      'detalle',
      '/api/admin/clientes/' + encodeURIComponent(esperado),
      {},
      (r) => this.ficha.set(detalleCliente(r, esperado)),
    );
  }
  cargarPedidos(id: string, pagina = 1) {
    this.sincronizar();
    this.compras.set([]);
    this.paginas.pedidos.set({ ...PAGINA_CLIENTES });
    if (id !== this.fichaId || this.cliente()?.identificador !== id) return Promise.resolve();
    return this.consultar(
      'pedidos',
      '/api/admin/clientes/' + encodeURIComponent(id) + '/pedidos',
      { pagina: String(pagina) },
      (r) => {
        const v = comprasCliente(r);
        this.compras.set(v.pedidos);
        this.paginas.pedidos.set(v.paginacion);
      },
    );
  }
  cargarDirecciones(id: string, pagina = 1) {
    this.sincronizar();
    this.domicilios.set([]);
    this.paginas.direcciones.set({ ...PAGINA_CLIENTES });
    if (id !== this.fichaId || this.cliente()?.identificador !== id) return Promise.resolve();
    return this.consultar(
      'direcciones',
      '/api/admin/clientes/' + encodeURIComponent(id) + '/direcciones',
      { pagina: String(pagina) },
      (r) => {
        const v = direccionesCliente(r);
        this.domicilios.set(v.direcciones);
        this.paginas.direcciones.set(v.paginacion);
      },
    );
  }
}
