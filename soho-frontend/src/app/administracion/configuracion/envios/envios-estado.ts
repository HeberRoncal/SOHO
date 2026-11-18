import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { EstadoAutenticacion } from '../../../tienda/cuenta/servicios/estado-autenticacion';

export interface ZonaEnvioApi {
  codigo: string;
  nombre: string;
  tarifa: string | null;
  plazo: string | null;
  habilitada: boolean;
  orden: number;
  cotizable: boolean;
}
export interface BorradorZonaEnvio extends Omit<ZonaEnvioApi, 'tarifa' | 'plazo'> {
  tarifa: string;
  plazo: string;
}
interface RespuestaCobertura {
  zonas: ZonaEnvioApi[];
  version: string;
}
const ruta = '/api/admin/cobertura';
const codigos = [
  'la-esperanza',
  'trujillo',
  'el-porvenir',
  'florencia-de-mora',
  'victor-larco',
  'huanchaco',
  'moche',
];
const precioValido = (valor: string) => /^(?:0|[1-9][0-9]{0,5})(?:\.[0-9]{1,2})?$/.test(valor);

@Injectable()
export class EnviosEstado {
  private readonly http = inject(HttpClient);
  private readonly sesion = inject(EstadoAutenticacion);
  private readonly dueno = signal<string | null>(null);
  private readonly originales = signal<BorradorZonaEnvio[]>([]);
  private readonly datos = signal<BorradorZonaEnvio[]>([]);
  private version = '';
  readonly cargando = signal(false);
  readonly guardando = signal(false);
  readonly errorCarga = signal('');
  readonly mensaje = signal('');
  readonly esError = signal(false);
  readonly recargaNecesaria = signal(false);
  readonly intentado = signal(false);
  readonly cargada = computed(() => this.dueno() !== null && this.dueno() === this.identidad());
  readonly borrador = computed(() => (this.cargada() ? this.datos() : []));
  readonly cambios = computed(
    () => this.cargada() && JSON.stringify(this.datos()) !== JSON.stringify(this.originales()),
  );
  readonly bloqueado = computed(
    () =>
      this.cargando() ||
      this.guardando() ||
      !this.cargada() ||
      !!this.errorCarga() ||
      this.recargaNecesaria(),
  );
  readonly errores = computed(() =>
    Object.fromEntries(
      this.borrador().flatMap((z) => {
        const errores: [string, string][] = [];
        const tarifa = z.tarifa.trim();
        if (tarifa && !precioValido(tarifa))
          errores.push([
            z.codigo + '-tarifa',
            'Usa un importe de 0 a 999999.99 con hasta dos decimales.',
          ]);
        if (z.codigo === 'la-esperanza' && (!tarifa || Number(tarifa) !== 0))
          errores.push([z.codigo + '-tarifa', 'El envío a La Esperanza es gratuito.']);
        if (Array.from(z.plazo.trim()).length > 80 || /[\p{Cc}\p{Cf}]/u.test(z.plazo))
          errores.push([z.codigo + '-plazo', 'Usa hasta 80 caracteres, sin saltos de línea.']);
        return errores;
      }),
    ),
  );

  constructor() {
    effect(() => {
      const perfil = this.sesion.perfil();
      if (!perfil || perfil.rol !== 'ADMIN') {
        this.dueno.set(null);
        this.datos.set([]);
        this.originales.set([]);
        this.version = '';
      }
    });
  }
  private identidad(): string | null {
    const perfil = this.sesion.perfil();
    return perfil?.rol === 'ADMIN' ? `${perfil.id}:${this.sesion.revision}` : null;
  }
  private adoptar(respuesta: RespuestaCobertura, identidad: string) {
    if (
      typeof respuesta.version !== 'string' ||
      !/^[0-9a-f]{64}$/.test(respuesta.version) ||
      !Array.isArray(respuesta.zonas) ||
      respuesta.zonas.length !== 7 ||
      new Set(respuesta.zonas.map((z) => z.codigo)).size !== 7 ||
      !respuesta.zonas.every(
        (z) =>
          codigos.includes(z.codigo) &&
          typeof z.nombre === 'string' &&
          (z.tarifa === null || (typeof z.tarifa === 'string' && precioValido(z.tarifa))) &&
          (z.plazo === null || typeof z.plazo === 'string') &&
          typeof z.habilitada === 'boolean' &&
          Number.isInteger(z.orden) &&
          typeof z.cotizable === 'boolean',
      )
    )
      throw new Error('Respuesta de cobertura no válida.');
    const zonas = respuesta.zonas.map((z) => ({
      ...z,
      tarifa: z.tarifa ?? '',
      plazo: z.plazo ?? '',
    }));
    this.dueno.set(identidad);
    this.version = respuesta.version;
    this.originales.set(zonas.map((z) => ({ ...z })));
    this.datos.set(zonas);
    this.recargaNecesaria.set(false);
    this.intentado.set(false);
  }
  async cargar() {
    if (this.cargando() || this.guardando()) return;
    const identidad = this.identidad();
    if (!identidad) return;
    this.cargando.set(true);
    this.errorCarga.set('');
    this.mensaje.set('');
    try {
      const r = await firstValueFrom(this.http.get<RespuestaCobertura>(ruta, { timeout: 15000 }));
      if (this.identidad() !== identidad) return;
      this.adoptar(r, identidad);
    } catch (error) {
      if (this.identidad() === identidad) this.errorCarga.set(this.error(error));
    } finally {
      this.cargando.set(false);
    }
  }
  zona(
    codigo: string,
    cambio: Partial<Pick<BorradorZonaEnvio, 'tarifa' | 'plazo' | 'habilitada'>>,
  ) {
    if (!this.editable(codigo) || cambio.habilitada !== undefined) return;
    this.datos.update((zonas) =>
      zonas.map((z) =>
        z.codigo !== codigo
          ? z
          : {
              ...z,
              ...cambio,
              tarifa: codigo === 'la-esperanza' ? z.tarifa : (cambio.tarifa ?? z.tarifa),
            },
      ),
    );
    this.mensaje.set('');
  }
  editable(codigo: string) {
    return (
      !this.bloqueado() && this.originales().find((z) => z.codigo === codigo)?.habilitada === false
    );
  }
  async cambiarHabilitada(codigo: string) {
    if (this.bloqueado()) return;
    const actual = this.originales().find((z) => z.codigo === codigo);
    const local = this.datos().find((z) => z.codigo === codigo);
    if (!actual || !local) return;
    this.intentado.set(true);
    if (!actual.habilitada && Object.keys(this.errores()).some((k) => k.startsWith(codigo + '-'))) {
      this.esError.set(true);
      this.mensaje.set('Revisa la tarifa y el tiempo estimado antes de habilitar la zona.');
      return;
    }
    const zonas = this.originales().map((z) =>
      z.codigo !== codigo
        ? z
        : actual.habilitada
          ? { ...actual, habilitada: false }
          : { ...local, habilitada: true },
    );
    await this.persistir(zonas, codigo);
  }
  descartar() {
    if (this.bloqueado()) return;
    this.datos.set(this.originales().map((z) => ({ ...z })));
    this.intentado.set(false);
    this.esError.set(false);
    this.mensaje.set('Cambios descartados.');
  }
  errorCampo(codigo: string, campo: 'tarifa' | 'plazo') {
    return this.intentado() ? (this.errores()[codigo + '-' + campo] ?? '') : '';
  }
  async guardar() {
    if (this.bloqueado() || this.recargaNecesaria() || !this.cambios()) return;
    this.intentado.set(true);
    this.mensaje.set('');
    this.esError.set(false);
    if (Object.keys(this.errores()).length) {
      this.esError.set(true);
      this.mensaje.set('Revisa los campos marcados antes de guardar.');
      return;
    }
    await this.persistir(this.datos());
  }
  private async persistir(zonas: readonly BorradorZonaEnvio[], codigo?: string) {
    const identidad = this.identidad();
    if (!identidad) return;
    const locales = this.datos();
    const cuerpo = {
      version: this.version,
      zonas: zonas.map((z) => ({
        codigo: z.codigo,
        tarifa: z.tarifa.trim() || null,
        plazo: z.plazo.trim() || null,
        habilitada: z.habilitada,
      })),
    };
    this.guardando.set(true);
    this.mensaje.set('');
    this.esError.set(false);
    try {
      const r = await firstValueFrom(
        this.http.patch<RespuestaCobertura>(ruta, cuerpo, { timeout: 15000 }),
      );
      if (this.identidad() !== identidad) return;
      this.adoptar(r, identidad);
      if (codigo)
        this.datos.update((zonas) =>
          zonas.map((z) => (z.codigo === codigo ? z : locales.find((l) => l.codigo === z.codigo)!)),
        );
      this.mensaje.set('Cobertura y tarifas guardadas correctamente.');
    } catch (error) {
      if (this.identidad() !== identidad) return;
      this.esError.set(true);
      this.mensaje.set(this.error(error));
      if (!(error instanceof HttpErrorResponse) || ![400, 403].includes(error.status))
        this.recargaNecesaria.set(true);
    } finally {
      this.guardando.set(false);
    }
  }
  private error(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 401) return 'Tu sesión venció. Inicia sesión nuevamente.';
      if (error.status === 403)
        return 'No se pudo autorizar la operación. Comprueba tu sesión de administrador y vuelve a intentarlo.';
      if (error.status === 400)
        return 'Revisa las tarifas, los plazos y los distritos antes de guardar.';
      if (error.status === 409)
        return 'La cobertura cambió. Conservamos tus campos; revisa el estado guardado antes de continuar.';
    }
    return 'No pudimos confirmar la operación. Conservamos tus campos; consulta el estado guardado antes de reintentar.';
  }
}
