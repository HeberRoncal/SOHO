import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { EstadoAutenticacion } from '../../../tienda/cuenta/servicios/estado-autenticacion';
import { TiendaEstado } from './tienda-estado';
import { datosTiendaApi, tiendaVacia } from './contrato-tienda';
const ruta = '/api/admin/configuracion/tienda';
const id = '11111111-1111-4111-8111-111111111111';
const usuario = {
  id,
  nombres: 'Ana',
  apellidos: 'Prueba',
  correo: 'ana@soho.test',
  rol: 'ADMIN' as const,
  correoVerificado: true,
};
const respuesta = (version = 0, tienda = datosTiendaApi(tiendaVacia())) => ({
  configuracion: {
    version,
    tienda,
    actualizadoEn: version ? '2026-11-17T10:00:00.000Z' : null,
    actualizadoPor: version ? { id, nombre: 'Ana Prueba' } : null,
  },
});
describe('Tienda con guardado real', () => {
  let estado: TiendaEstado, http: HttpTestingController;
  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [TiendaEstado, provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(EstadoAutenticacion).aceptar(usuario);
    estado = TestBed.inject(TiendaEstado);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    http.verify();
    sessionStorage.clear();
  });
  const cargar = async () => {
    const p = estado.cargar();
    http.expectOne(ruta).flush(respuesta());
    await p;
  };
  it('carga del servidor y guarda todos los campos; una nueva carga conserva los valores', async () => {
    await cargar();
    estado.actualizar({
      correo: ' CONTACTO@SOHO.TEST ',
      whatsapp: '987 654 321',
      horario: 'Lunes a sábado',
      enlaces: [
        { texto: 'Ayuda', url: 'https://soho.test/ayuda' },
        { texto: 'Cambios', url: 'https://soho.test/cambios' },
      ],
      politicas: {
        cambios: 'Cambios\nSegunda línea',
        privacidad: 'Privacidad',
        terminos: 'Términos',
      },
    });
    const p = estado.guardar(),
      req = http.expectOne(ruta);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body.versionEsperada).toBe(0);
    expect(req.request.body.tienda.correo).toBe('contacto@soho.test');
    const r = respuesta(1, req.request.body.tienda);
    req.flush(r);
    await Promise.resolve();
    http.expectOne(ruta).flush(r);
    await p;
    expect(estado.cambios()).toBe(false);
    expect(estado.mensaje()).toContain('guardados');
    expect(sessionStorage.length).toBe(0);
    const recarga = estado.cargar();
    http.expectOne(ruta).flush(r);
    await recarga;
    expect(estado.borrador().politicas.cambios).toBe('Cambios\nSegunda línea');
    expect(estado.borrador().horario).toBe('Lunes a sábado');
  });
  it('no anuncia éxito si falla el servidor y recupera el mismo envío', async () => {
    await cargar();
    estado.actualizar({ correo: 'contacto@soho.test' });
    const p = estado.guardar(),
      req = http.expectOne(ruta),
      op = req.request.body;
    req.flush({}, { status: 503, statusText: 'Unavailable' });
    await p;
    expect(estado.pendiente()).toBe(true);
    expect(estado.mensaje()).not.toBe('Datos de Tienda guardados.');
    const c = estado.comprobar();
    http.expectOne(ruta + '/operaciones/' + op.claveSolicitud).flush(respuesta(1, op.tienda));
    await Promise.resolve();
    http.expectOne(ruta).flush(respuesta(1, op.tienda));
    await c;
    expect(estado.pendiente()).toBe(false);
    expect(estado.cambios()).toBe(false);
  });
  it('conserva campos ante conflicto y exige cargar la versión actual', async () => {
    await cargar();
    estado.actualizar({ correo: 'nuevo@soho.test' });
    const p = estado.guardar();
    http.expectOne(ruta).flush({}, { status: 409, statusText: 'Conflict' });
    await p;
    expect(estado.borrador().correo).toBe('nuevo@soho.test');
    expect(estado.recargaNecesaria()).toBe(true);
    expect(estado.bloqueado()).toBe(true);
    expect(sessionStorage.length).toBe(0);
  });
  it('rechaza enlaces peligrosos y no envía campos inválidos', async () => {
    await cargar();
    estado.actualizar({
      enlaces: [
        { texto: 'Ayuda', url: 'javascript:alert(1)' },
        { texto: '', url: '' },
      ],
    });
    await estado.guardar();
    http.expectNone(ruta);
    expect(estado.error('enlace-0')).toBeTruthy();
  });
  it('un fallo al cargar no sustituye los datos por una demostración', async () => {
    const p = estado.cargar();
    http.expectOne(ruta).flush({}, { status: 503, statusText: 'Unavailable' });
    await p;
    expect(estado.cargada()).toBe(false);
    expect(estado.errorCarga()).toBeTruthy();
    expect(estado.bloqueado()).toBe(true);
  });
  it('ignora respuestas de la cuenta anterior', async () => {
    const p = estado.cargar();
    TestBed.inject(EstadoAutenticacion).aceptar({ ...usuario, id: 'otro' });
    http.expectOne(ruta).flush(respuesta());
    await p;
    expect(estado.cargada()).toBe(false);
  });
  it('impide escribir si no puede proteger la operación en la sesión', async () => {
    await cargar();
    estado.actualizar({ correo: 'a@soho.test' });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw Error('quota');
    });
    await estado.guardar();
    http.expectNone(ruta);
    expect(estado.cambios()).toBe(true);
    expect(estado.mensaje()).toContain('almacenamiento');
    vi.restoreAllMocks();
  });
});
