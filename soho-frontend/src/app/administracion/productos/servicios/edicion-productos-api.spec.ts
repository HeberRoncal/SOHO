import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Cuenta } from '../../../tienda/cuenta/servicios/cuenta';
import { EstadoAutenticacion } from '../../../tienda/cuenta/servicios/estado-autenticacion';
import { autenticacionInterceptor } from '../../../tienda/cuenta/servicios/autenticacion-interceptor';
import { EdicionProductosApi } from './edicion-productos-api';
import { ID_PRODUCTO_PRUEBA } from '../modelos/consulta-productos.fixtures';
import { archivoEdicionFixture, fichaEdicionFixture } from '../modelos/edicion-productos.fixtures';

describe('Edición real de productos: solicitudes y recuperación', () => {
  let api: EdicionProductosApi, http: HttpTestingController;
  const perfil = signal<{ id: string; rol: string } | null>({ id: 'admin-a', rol: 'ADMIN' }),
    auth = { revision: 0, invalidar: vi.fn() };
  const base = '/api/admin/productos';
  const micro = async () => {
    await Promise.resolve();
    await Promise.resolve();
  };
  async function iniciar(
    tipo: 'CREAR' | 'ACTUALIZAR' | 'ACTUALIZAR_GALERIA' | 'PUBLICAR' = 'CREAR',
  ) {
    const p = api.escribir(
      tipo,
      tipo === 'CREAR' ? null : ID_PRODUCTO_PRUEBA,
      tipo === 'CREAR' ? null : 1,
      tipo === 'CREAR' || tipo === 'ACTUALIZAR'
        ? { nombre: 'Producto' }
        : tipo === 'ACTUALIZAR_GALERIA'
          ? { imagenes: [] }
          : {},
    );
    http.expectOne('/api/auth/csrf').flush({ csrfToken: 'a'.repeat(64) });
    await micro();
    const ruta =
      tipo === 'CREAR'
        ? base
        : `${base}/${ID_PRODUCTO_PRUEBA}/${tipo === 'PUBLICAR' ? 'publicacion' : tipo === 'ACTUALIZAR' ? 'borrador' : 'galeria'}`;
    return { p, r: http.expectOne(ruta) };
  }
  beforeEach(() => {
    sessionStorage.clear();
    perfil.set({ id: 'admin-a', rol: 'ADMIN' });
    auth.revision = 0;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([autenticacionInterceptor])),
        provideHttpClientTesting(),
        { provide: Cuenta, useValue: { perfil } },
        { provide: EstadoAutenticacion, useValue: auth },
      ],
    });
    api = TestBed.inject(EdicionProductosApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    http.verify();
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });
  it('envía JSON con CSRF y cookies; asigna una clave sin fabricar códigos o SKU', async () => {
    const { p, r } = await iniciar();
    const c = r.request.body.claveSolicitud;
    expect(r.request.headers.get('X-CSRF-Token')).toBe('a'.repeat(64));
    expect(r.request.withCredentials).toBe(true);
    expect(r.request.body).toEqual({ nombre: 'Producto', claveSolicitud: c });
    expect(api.pendiente()?.claveSolicitud).toBe(c);
    r.flush({
      producto: fichaEdicionFixture(),
      operacion: { claveSolicitud: c, tipo: 'CREAR', versionAnterior: null, versionPosterior: 1 },
    });
    await micro();
    http.expectOne(base + '/' + ID_PRODUCTO_PRUEBA).flush({ producto: fichaEdicionFixture(2) });
    expect((await p).version).toBe(2);
    expect(api.pendiente()).toBeNull();
  });
  it.each([400, 403, 409, 422, 429])(
    'conserva el formulario y libera la solicitud tras rechazo definitivo %s',
    async (estado) => {
      const { p, r } = await iniciar();
      const resultado = expect(p).rejects.toMatchObject({ estado, incierto: false });
      r.flush({}, { status: estado, statusText: 'Rejected' });
      await resultado;
      expect(api.pendiente()).toBeNull();
    },
  );
  it.each([0, 404, 500, 503])(
    'retiene la misma solicitud ante resultado incierto %s',
    async (estado) => {
      const { p, r } = await iniciar();
      const c = r.request.body.claveSolicitud;
      const resultado = expect(p).rejects.toMatchObject({ incierto: true });
      if (estado === 0) r.error(new ProgressEvent('error'));
      else r.flush({}, { status: estado, statusText: 'Lost' });
      await resultado;
      expect(api.pendiente()?.claveSolicitud).toBe(c);
      await expect(api.escribir('CREAR', null, null, { nombre: 'Otro' })).rejects.toMatchObject({
        incierto: true,
      });
      http.expectNone(base);
    },
  );
  it('un 404 al recuperar no permite crear otra solicitud ni afirmar que no hubo COMMIT', async () => {
    const { p, r } = await iniciar();
    const fallo = expect(p).rejects.toMatchObject({ incierto: true });
    r.error(new ProgressEvent('error'));
    await fallo;
    const clave = api.pendiente()!.claveSolicitud,
      q = api.recuperar(),
      rechazo = expect(q).rejects.toMatchObject({ incierto: true });
    http
      .expectOne(base + '/operaciones/' + clave)
      .flush({}, { status: 404, statusText: 'Not Found' });
    await rechazo;
    expect(api.pendiente()?.claveSolicitud).toBe(clave);
  });
  it('reintenta el cuerpo y la clave originales después de perder la respuesta', async () => {
    const { p, r } = await iniciar('ACTUALIZAR');
    const original = structuredClone(r.request.body),
      fallo = expect(p).rejects.toMatchObject({ incierto: true });
    r.error(new ProgressEvent('error'));
    await fallo;
    const q = api.recuperar(true);
    const retry = http.expectOne(`${base}/${ID_PRODUCTO_PRUEBA}/borrador`);
    expect(retry.request.body).toEqual(original);
    retry.flush({
      producto: fichaEdicionFixture(2),
      operacion: {
        claveSolicitud: original.claveSolicitud,
        tipo: 'ACTUALIZAR',
        versionAnterior: 1,
        versionPosterior: 2,
      },
    });
    await micro();
    http.expectOne(base + '/' + ID_PRODUCTO_PRUEBA).flush({ producto: fichaEdicionFixture(3) });
    expect((await q).version).toBe(3);
  });
  it('rechaza respuestas de otra operación y mantiene su clave recuperable', async () => {
    const { p, r } = await iniciar();
    const fallo = expect(p).rejects.toMatchObject({ incierto: true });
    r.flush({
      producto: fichaEdicionFixture(),
      operacion: {
        claveSolicitud: crypto.randomUUID(),
        tipo: 'CREAR',
        versionAnterior: null,
        versionPosterior: 1,
      },
    });
    await fallo;
    expect(api.pendiente()).not.toBeNull();
  });
  it('conserva la clave si el POST se confirma pero falla la lectura vigente', async () => {
    const { p, r } = await iniciar();
    const clave = r.request.body.claveSolicitud;
    const fallo = expect(p).rejects.toMatchObject({ incierto: true });
    r.flush({
      producto: fichaEdicionFixture(),
      operacion: {
        claveSolicitud: clave,
        tipo: 'CREAR',
        versionAnterior: null,
        versionPosterior: 1,
      },
    });
    await micro();
    http
      .expectOne(base + '/' + ID_PRODUCTO_PRUEBA)
      .flush({}, { status: 503, statusText: 'Unavailable' });
    await fallo;
    expect(api.pendiente()?.claveSolicitud).toBe(clave);
  });
  it('envía fotografías multipart sin fijar Content-Type y conserva cookies/CSRF', async () => {
    const clave = crypto.randomUUID(),
      file = new File(['png'], 'foto.png', { type: 'image/png' }),
      p = api.subir(ID_PRODUCTO_PRUEBA, 1, clave, file);
    http.expectOne('/api/auth/csrf').flush({ csrfToken: 'a'.repeat(64) });
    await micro();
    const r = http.expectOne(`${base}/${ID_PRODUCTO_PRUEBA}/fotografias`);
    expect(r.request.body).toBeInstanceOf(FormData);
    expect(r.request.headers.has('Content-Type')).toBe(false);
    expect(r.request.headers.get('X-CSRF-Token')).toBe('a'.repeat(64));
    expect(r.request.body.get('datos')).toBe(JSON.stringify({ claveCarga: clave, version: 1 }));
    expect(r.request.body.get('archivo')).toBe(file);
    r.flush({ archivo: archivoEdicionFixture() });
    expect((await p).estado).toBe('DISPONIBLE');
  });
  it('no incorpora una consulta que llega después de cambiar de administrador', async () => {
    const p = api.detalle(ID_PRODUCTO_PRUEBA),
      fallo = expect(p).rejects.toMatchObject({ estado: 403 });
    perfil.set({ id: 'admin-b', rol: 'ADMIN' });
    http.expectOne(base + '/' + ID_PRODUCTO_PRUEBA).flush({ producto: fichaEdicionFixture() });
    await fallo;
  });
  it('aísla las solicitudes pendientes por cuenta', async () => {
    const { p, r } = await iniciar();
    const fallo = expect(p).rejects.toMatchObject({ incierto: true });
    r.error(new ProgressEvent('error'));
    await fallo;
    perfil.set({ id: 'admin-b', rol: 'ADMIN' });
    expect(api.pendiente()).toBeNull();
    perfil.set({ id: 'admin-a', rol: 'ADMIN' });
    expect(api.pendiente()).not.toBeNull();
  });
  it('rechaza lecturas y escrituras sin ADMIN', async () => {
    perfil.set({ id: 'cliente', rol: 'CLIENTE' });
    await expect(api.detalle(ID_PRODUCTO_PRUEBA)).rejects.toMatchObject({ estado: 403 });
    await expect(api.escribir('CREAR', null, null, { nombre: 'Producto' })).rejects.toMatchObject({
      estado: 403,
    });
    http.expectNone(base);
  });
  it('dirige una actualización publicada a su ruta y conserva el contexto fuera del cuerpo', async () => {
    const p = api.escribir('ACTUALIZAR', ID_PRODUCTO_PRUEBA, 1, { precio: '120.00' }, 'publicado');
    http.expectOne('/api/auth/csrf').flush({ csrfToken: 'a'.repeat(64) });
    await micro();
    const r = http.expectOne(`${base}/${ID_PRODUCTO_PRUEBA}/publicado`),
      key = r.request.body.claveSolicitud;
    expect(r.request.method).toBe('PATCH');
    expect(r.request.body).not.toHaveProperty('contexto');
    expect(api.pendiente()?.contexto).toBe('publicado');
    r.flush({
      producto: { ...fichaEdicionFixture(2), estado: 'publicado' },
      operacion: {
        claveSolicitud: key,
        tipo: 'ACTUALIZAR',
        versionAnterior: 1,
        versionPosterior: 2,
      },
    });
    await micro();
    http
      .expectOne(base + '/' + ID_PRODUCTO_PRUEBA)
      .flush({ producto: { ...fichaEdicionFixture(3), estado: 'archivado' } });
    expect((await p).producto.estado).toBe('archivado');
    expect(api.pendiente()).toBeNull();
  });
  it.each([
    ['ARCHIVAR', 'archivo', 'archivado'],
    ['RESTAURAR', 'restauracion', 'borrador'],
  ] as const)('%s utiliza POST, versión, clave y estado confirmado', async (tipo, ruta, estado) => {
    const p = api.escribir(tipo, ID_PRODUCTO_PRUEBA, 1, {});
    http.expectOne('/api/auth/csrf').flush({ csrfToken: 'a'.repeat(64) });
    await micro();
    const r = http.expectOne(`${base}/${ID_PRODUCTO_PRUEBA}/${ruta}`),
      key = r.request.body.claveSolicitud;
    expect(r.request.method).toBe('POST');
    expect(r.request.body).toEqual({ claveSolicitud: key, version: 1 });
    r.flush({
      producto: { ...fichaEdicionFixture(2), estado },
      operacion: { claveSolicitud: key, tipo, versionAnterior: 1, versionPosterior: 2 },
    });
    await micro();
    http
      .expectOne(base + '/' + ID_PRODUCTO_PRUEBA)
      .flush({ producto: { ...fichaEdicionFixture(2), estado } });
    expect((await p).producto.estado).toBe(estado);
  });
  it('no pierde la clave original si un reintento de resultado incierto recibe 409', async () => {
    const { p, r } = await iniciar('ACTUALIZAR');
    const fallo = expect(p).rejects.toMatchObject({ incierto: true });
    r.error(new ProgressEvent('error'));
    await fallo;
    const clave = api.pendiente()!.claveSolicitud;
    const q = api.recuperar(true),
      rechazo = expect(q).rejects.toMatchObject({ estado: 409 });
    http
      .expectOne(`${base}/${ID_PRODUCTO_PRUEBA}/borrador`)
      .flush({}, { status: 409, statusText: 'Conflict' });
    await rechazo;
    expect(api.pendiente()?.claveSolicitud).toBe(clave);
  });
  it('bloquea recuperación y segundo envío durante una escritura en curso', async () => {
    const { p, r } = await iniciar();
    await expect(api.recuperar()).rejects.toMatchObject({ incierto: true });
    await expect(api.escribir('ARCHIVAR', ID_PRODUCTO_PRUEBA, 1, {})).rejects.toMatchObject({
      incierto: true,
    });
    const rechazo = expect(p).rejects.toMatchObject({ estado: 422 });
    r.flush({}, { status: 422, statusText: 'Rejected' });
    await rechazo;
    http.expectNone(base + '/operaciones/' + r.request.body.claveSolicitud);
  });
  it('no envía si sessionStorage no puede guardar la solicitud', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw Error('No disponible');
    });
    try {
      await expect(api.escribir('ARCHIVAR', ID_PRODUCTO_PRUEBA, 1, {})).rejects.toThrow(
        'almacenamiento',
      );
      http.expectNone(base);
    } finally {
      spy.mockRestore();
    }
  });
  it.each([
    '{malformado',
    JSON.stringify({
      claveSolicitud: crypto.randomUUID(),
      ruta: 'https://otra.test',
      tipo: 'ARCHIVAR',
    }),
  ])(
    'conserva registros ilegibles y bloquea nuevas escrituras sin inventar otra clave',
    async (registro) => {
      sessionStorage.setItem('soho:operacion-producto:admin-a', registro);
      expect(() => api.pendiente()).toThrow();
      await expect(api.escribir('CREAR', null, null, { nombre: 'Otro' })).rejects.toMatchObject({
        incierto: true,
      });
      await expect(api.recuperar(true)).rejects.toMatchObject({ incierto: true });
      expect(sessionStorage.getItem('soho:operacion-producto:admin-a')).toBe(registro);
      http.expectNone(base);
    },
  );
  it('un cuerpo dañado admite consulta por metadatos seguros, pero nunca se reenvía', async () => {
    const key = crypto.randomUUID();
    sessionStorage.setItem(
      'soho:operacion-producto:admin-a',
      JSON.stringify({
        claveSolicitud: key,
        productoId: ID_PRODUCTO_PRUEBA,
        tipo: 'ACTUALIZAR',
        contexto: 'publicado',
        metodo: 'PATCH',
        ruta: `${base}/${ID_PRODUCTO_PRUEBA}/publicado`,
        cuerpo: { claveSolicitud: key, version: 1, nombre: 123 },
      }),
    );
    expect(() => api.pendiente()).toThrow();
    const p = api.recuperar();
    http.expectOne(base + '/operaciones/' + key).flush({
      producto: { ...fichaEdicionFixture(2), estado: 'publicado' },
      operacion: {
        claveSolicitud: key,
        tipo: 'ACTUALIZAR',
        versionAnterior: 1,
        versionPosterior: 2,
      },
    });
    await micro();
    http
      .expectOne(base + '/' + ID_PRODUCTO_PRUEBA)
      .flush({ producto: { ...fichaEdicionFixture(2), estado: 'publicado' } });
    expect((await p).version).toBe(2);
    expect(api.pendiente()).toBeNull();
  });
  it('mantiene compatibilidad con una solicitud antigua de borrador sin contexto', async () => {
    const key = crypto.randomUUID();
    const cuerpo = { claveSolicitud: key, version: 1, nombre: 'Borrador anterior' };
    sessionStorage.setItem(
      'soho:operacion-producto:admin-a',
      JSON.stringify({
        claveSolicitud: key,
        productoId: ID_PRODUCTO_PRUEBA,
        tipo: 'ACTUALIZAR',
        metodo: 'PATCH',
        ruta: `${base}/${ID_PRODUCTO_PRUEBA}/borrador`,
        cuerpo,
      }),
    );
    const p = api.recuperar(true);
    http.expectOne('/api/auth/csrf').flush({ csrfToken: 'a'.repeat(64) });
    await micro();
    const r = http.expectOne(`${base}/${ID_PRODUCTO_PRUEBA}/borrador`);
    expect(r.request.body).toEqual(cuerpo);
    r.flush({
      producto: fichaEdicionFixture(2),
      operacion: {
        claveSolicitud: key,
        tipo: 'ACTUALIZAR',
        versionAnterior: 1,
        versionPosterior: 2,
      },
    });
    await micro();
    http.expectOne(base + '/' + ID_PRODUCTO_PRUEBA).flush({ producto: fichaEdicionFixture(2) });
    expect((await p).version).toBe(2);
  });
  it('no acepta el estado equivocado de una confirmación de archivo', async () => {
    const p = api.escribir('ARCHIVAR', ID_PRODUCTO_PRUEBA, 1, {}),
      rechazo = expect(p).rejects.toMatchObject({ incierto: true });
    http.expectOne('/api/auth/csrf').flush({ csrfToken: 'a'.repeat(64) });
    await micro();
    const r = http.expectOne(`${base}/${ID_PRODUCTO_PRUEBA}/archivo`);
    r.flush({
      producto: fichaEdicionFixture(2),
      operacion: {
        claveSolicitud: r.request.body.claveSolicitud,
        tipo: 'ARCHIVAR',
        versionAnterior: 1,
        versionPosterior: 2,
      },
    });
    await rechazo;
    expect(api.pendiente()).not.toBeNull();
  });
  it('rechaza una lectura de detalle que corresponde a otro UUID', async () => {
    const p = api.detalle(ID_PRODUCTO_PRUEBA),
      rechazo = expect(p).rejects.toThrow();
    http
      .expectOne(base + '/' + ID_PRODUCTO_PRUEBA)
      .flush({ producto: { ...fichaEdicionFixture(), id: crypto.randomUUID() } });
    await rechazo;
  });
});
