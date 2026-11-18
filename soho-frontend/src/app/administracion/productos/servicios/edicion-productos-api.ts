import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Cuenta } from '../../../tienda/cuenta/servicios/cuenta';
import { EstadoAutenticacion } from '../../../tienda/cuenta/servicios/estado-autenticacion';
import { registro } from '../../../tienda/pedidos/modelos/contrato-pedidos';
import {
  archivoProducto,
  galeriaProducto,
  OperacionProducto,
  opcionesEdicion,
  productoEdicion,
  uuid,
  operacionProductoGuardada,
  rutaOperacionProducto,
} from '../modelos/edicion-productos-api';

export class ErrorEdicionProducto extends Error {
  constructor(
    message: string,
    readonly estado = 0,
    readonly incierto = false,
    readonly incidencias: string[] = [],
  ) {
    super(message);
  }
}
const BASE = '/api/admin/productos';
@Injectable({ providedIn: 'root' })
export class EdicionProductosApi {
  private readonly http = inject(HttpClient);
  private readonly cuenta = inject(Cuenta);
  private readonly auth = inject(EstadoAutenticacion);
  private readonly enCurso = new Set<string>();
  private leerGuardada() {
    this.identidad();
    const texto = sessionStorage.getItem(this.almacenamiento());
    return texto === null ? null : (JSON.parse(texto) as unknown);
  }
  private identidad() {
    if (this.cuenta.perfil()?.rol !== 'ADMIN')
      throw new ErrorEdicionProducto('Inicia sesión como administrador.', 403);
    return `${this.cuenta.perfil()!.id}:${this.auth.revision}`;
  }
  private vigente(i: string) {
    if (i !== this.identidad())
      throw new ErrorEdicionProducto('La sesión cambió. Vuelve a abrir el formulario.', 403);
  }
  private almacenamiento() {
    return 'soho:operacion-producto:' + this.cuenta.perfil()?.id;
  }
  pendiente(): OperacionProducto | null {
    this.identidad();
    try {
      const v = this.leerGuardada();
      return v === null ? null : operacionProductoGuardada(v);
    } catch {
      throw new ErrorEdicionProducto(
        'No podemos interpretar la solicitud pendiente. Sus datos se conservan; consulta el resultado antes de guardar otro cambio.',
        0,
        true,
      );
    }
  }
  private async get<T>(ruta: string, adaptar: (v: unknown) => T): Promise<T> {
    const i = this.identidad();
    try {
      const r = await firstValueFrom(this.http.get<unknown>(ruta, { timeout: 15000 }));
      this.vigente(i);
      return adaptar(r);
    } catch (e) {
      throw this.error(e);
    }
  }
  opciones() {
    return this.get(BASE + '/opciones', opcionesEdicion);
  }
  detalle(id: string) {
    uuid(id);
    return this.get(`${BASE}/${id}`, (v) => {
      const f = productoEdicion(registro(v)['producto']);
      if (f.producto.identificador !== id) throw Error('Producto incoherente.');
      return f;
    });
  }
  fotografias(id: string) {
    uuid(id);
    return this.get(`${BASE}/${id}/fotografias`, galeriaProducto);
  }
  configuracion() {
    return this.get(BASE + '/fotografias/configuracion', (v) => {
      const r = registro(v);
      if (typeof r['configurada'] !== 'boolean') throw Error();
      return {
        configurada: r['configurada'],
        maximoBytes: Number(r['maximoBytes']),
        maximoImagenes: Number(r['maximoImagenes']),
      };
    });
  }
  async escribir(
    tipo: OperacionProducto['tipo'],
    id: string | null,
    version: number | null,
    datos: Record<string, unknown>,
    contexto?: 'borrador' | 'publicado',
  ) {
    if (this.pendiente())
      throw new ErrorEdicionProducto('Consulta primero la operación pendiente.', 0, true);
    if (id !== null) uuid(id);
    const claveSolicitud = crypto.randomUUID(),
      crear = tipo === 'CREAR';
    const p: OperacionProducto = {
      claveSolicitud,
      productoId: id,
      tipo,
      metodo: ['CREAR', 'PUBLICAR', 'ARCHIVAR', 'RESTAURAR'].includes(tipo) ? 'POST' : 'PATCH',
      ruta: rutaOperacionProducto({ tipo, productoId: id, contexto }),
      cuerpo: { ...datos, claveSolicitud, ...(crear ? {} : { version }) },
      ...(contexto ? { contexto } : {}),
      incierto: false,
    };
    try {
      operacionProductoGuardada(p);
    } catch {
      throw new ErrorEdicionProducto('Revisa los datos de la operación antes de guardar.', 400);
    }
    // Conservar la solicitud exacta antes del POST permite recuperar un COMMIT tras recargar.
    this.identidad();
    try {
      sessionStorage.setItem(this.almacenamiento(), JSON.stringify(p));
    } catch {
      throw new ErrorEdicionProducto(
        'Habilita el almacenamiento de esta pestaña para guardar con recuperación.',
      );
    }
    return this.enviar(p);
  }
  async recuperar(reintentar = false) {
    let p: OperacionProducto | null;
    try {
      p = this.pendiente();
    } catch (e) {
      if (reintentar) throw e;
      try {
        p = operacionProductoGuardada(this.leerGuardada(), true);
      } catch {
        throw new ErrorEdicionProducto(
          'No podemos identificar con seguridad la solicitud guardada. Conservamos el registro y bloqueamos nuevos cambios; requiere revisión técnica.',
          0,
          true,
        );
      }
    }
    if (!p) throw new ErrorEdicionProducto('No hay una operación pendiente.');
    if (reintentar) return this.enviar(p, true);
    const i = this.identidad();
    if (this.enCurso.has(i))
      throw new ErrorEdicionProducto('Espera a que termine la operación.', 0, true);
    this.enCurso.add(i);
    try {
      const r = await firstValueFrom(
        this.http.get<unknown>(`${BASE}/operaciones/${p.claveSolicitud}`, { timeout: 15000 }),
      );
      this.vigente(i);
      return await this.confirmar(r, p);
    } catch (e) {
      throw this.error(e, true);
    } finally {
      this.enCurso.delete(i);
    }
  }
  private async enviar(p: OperacionProducto, reintento = false) {
    const i = this.identidad(),
      almacenamiento = this.almacenamiento();
    if (this.enCurso.has(i))
      throw new ErrorEdicionProducto('Espera a que termine la operación.', 0, true);
    this.enCurso.add(i);
    try {
      const r = await firstValueFrom(
        this.http.request<unknown>(p.metodo, p.ruta, { body: p.cuerpo, timeout: 30000 }),
      );
      this.vigente(i);
      return await this.confirmar(r, p);
    } catch (e) {
      const error = this.error(e, true);
      if (!error.incierto && !reintento && !p.incierto) {
        try {
          if (i === this.identidad()) sessionStorage.removeItem(almacenamiento);
        } catch {
          /* Conservar el registro de otra sesión. */
        }
      }
      throw error;
    } finally {
      this.enCurso.delete(i);
    }
  }
  private async confirmar(v: unknown, p: OperacionProducto) {
    const identidad = this.identidad(),
      almacenamiento = this.almacenamiento();
    const r = registro(v),
      o = registro(r['operacion']),
      producto = productoEdicion(r['producto']);
    if (
      o['claveSolicitud'] !== p.claveSolicitud ||
      o['tipo'] !== p.tipo ||
      o['versionPosterior'] !== producto.version ||
      (p.tipo === 'CREAR' && producto.version !== 1) ||
      (p.productoId && producto.producto.identificador !== p.productoId) ||
      o['versionAnterior'] !== (p.tipo === 'CREAR' ? null : p.cuerpo['version']) ||
      (p.tipo !== 'CREAR' && producto.version !== Number(p.cuerpo['version']) + 1) ||
      producto.producto.estado !==
        (p.tipo === 'ARCHIVAR'
          ? 'archivado'
          : ['CREAR', 'RESTAURAR'].includes(p.tipo)
            ? 'borrador'
            : p.tipo === 'PUBLICAR' || (p.tipo === 'ACTUALIZAR' && p.contexto === 'publicado')
              ? 'publicado'
              : p.tipo === 'ACTUALIZAR'
                ? 'borrador'
                : producto.producto.estado) ||
      (p.tipo === 'ACTUALIZAR_GALERIA' && producto.producto.estado === 'archivado')
    )
      throw Error('Operación incoherente.');
    // La respuesta recuperada es histórica. Consultar siempre la ficha vigente antes de editar.
    try {
      const actual = await this.detalle(producto.producto.identificador);
      this.vigente(identidad);
      sessionStorage.removeItem(almacenamiento);
      return actual;
    } catch (e) {
      // El COMMIT está confirmado; un fallo de la lectura posterior no debe perder su clave.
      const error = this.error(e);
      throw new ErrorEdicionProducto(error.message, error.estado, true, error.incidencias);
    }
  }
  async subir(id: string, version: number, clave: string, archivo: File) {
    uuid(id);
    uuid(clave);
    const i = this.identidad(),
      datos = new FormData();
    datos.append('datos', JSON.stringify({ claveCarga: clave, version }));
    datos.append('archivo', archivo);
    try {
      const r = await firstValueFrom(
        this.http.post<unknown>(`${BASE}/${id}/fotografias`, datos, { timeout: 60000 }),
      );
      this.vigente(i);
      return archivoProducto(registro(r)['archivo']);
    } catch (e) {
      throw this.error(e, true);
    }
  }
  carga(id: string, clave: string) {
    uuid(id);
    uuid(clave);
    return this.get(`${BASE}/${id}/cargas/${clave}`, (v) =>
      archivoProducto(registro(v)['archivo']),
    );
  }
  private error(e: unknown, escritura = false): ErrorEdicionProducto {
    if (e instanceof ErrorEdicionProducto) return e;
    const estado = e instanceof HttpErrorResponse ? e.status : 0;
    const incierto = escritura && ![400, 401, 403, 409, 413, 415, 422, 429].includes(estado);
    const codigos =
      e instanceof HttpErrorResponse && Array.isArray(e.error?.incidencias)
        ? e.error.incidencias.map((x: { codigo?: string }) => String(x.codigo ?? ''))
        : [];
    const mensajes: Record<number, string> = {
      400: 'Revisa los datos del formulario.',
      401: 'Tu sesión venció. Inicia sesión nuevamente.',
      403: 'Tu sesión no autoriza esta operación.',
      404: 'No encontramos el recurso. Si hay una operación pendiente, consulta o reintenta la misma solicitud.',
      409: 'La ficha o el grupo cambió. Tus cambios se conservan; carga la versión actual antes de guardar.',
      413: 'La fotografía supera el tamaño permitido.',
      415: 'Selecciona una fotografía JPEG, PNG, WebP o AVIF.',
      422: 'Faltan datos válidos para completar esta operación.',
      429: 'Espera un minuto antes de volver a intentarlo.',
    };
    return new ErrorEdicionProducto(
      incierto
        ? 'No pudimos confirmar el resultado. Consulta la operación o reintenta la misma solicitud; tus cambios se conservan.'
        : (mensajes[estado] ?? 'No se pudo completar la consulta. Inténtalo nuevamente.'),
      estado,
      incierto,
      codigos,
    );
  }
}
