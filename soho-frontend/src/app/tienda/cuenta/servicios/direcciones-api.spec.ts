import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { DireccionesApi } from './direcciones-api';
import { EstadoAutenticacion } from './estado-autenticacion';
import { autenticacionInterceptor } from './autenticacion-interceptor';

const usuario = {
  id: 'cliente',
  nombres: 'Ana',
  apellidos: 'Prueba',
  correo: 'ana@soho.test',
  rol: 'CLIENTE' as const,
  correoVerificado: true,
};
const direccion = {
  id: '12345678-1234-4234-8234-123456789abc',
  etiqueta: 'Casa',
  destinatario: 'Ana Pérez',
  celular: '987654321',
  distrito: 'la-esperanza',
  direccion: 'Av. Perú 123',
  referencia: '',
  predeterminada: true,
};
const ruta = '/api/direcciones';
describe('Direcciones por API', () => {
  let api: DireccionesApi, http: HttpTestingController, estado: EstadoAutenticacion;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([autenticacionInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    api = TestBed.inject(DireccionesApi);
    http = TestBed.inject(HttpTestingController);
    estado = TestBed.inject(EstadoAutenticacion);
    estado.aceptar(usuario);
  });
  afterEach(() => http.verify());
  const csrf = () => http.expectOne('/api/auth/csrf').flush({ csrfToken: 'a'.repeat(64) });
  it('consulta con cookie y adopta únicamente los datos públicos confirmados', async () => {
    const pendiente = api.cargar();
    const r = http.expectOne(ruta);
    expect(r.request.withCredentials).toBe(true);
    expect(r.request.method).toBe('GET');
    r.flush({ direcciones: [{ ...direccion, usuarioId: 'dato-no-publico' }] });
    expect((await pendiente).correcto).toBe(true);
    expect(api.direcciones()).toEqual([direccion]);
  });
  it('crea con CSRF sin enviar id ni propietario y espera la confirmación', async () => {
    const { id: _id, ...datos } = direccion;
    const pendiente = api.guardar({
      ...datos,
      etiqueta: ' Casa ',
      usuarioId: 'otra',
    } as typeof datos);
    csrf();
    const r = http.expectOne(ruta);
    expect(r.request.method).toBe('POST');
    expect(r.request.headers.get('X-CSRF-Token')).toBe('a'.repeat(64));
    expect(r.request.body).toEqual(datos);
    expect(api.direcciones()).toEqual([]);
    r.flush({ direcciones: [direccion] });
    expect((await pendiente).correcto).toBe(true);
    expect(api.direcciones()).toEqual([direccion]);
  });
  it('actualiza con PATCH y conserva la lista completa devuelta por el servidor', async () => {
    const pendiente = api.guardar({ ...direccion, referencia: 'Azul' });
    csrf();
    const r = http.expectOne(`${ruta}/${direccion.id}`);
    expect(r.request.method).toBe('PATCH');
    expect(r.request.body.id).toBeUndefined();
    r.flush({ direcciones: [{ ...direccion, referencia: 'Azul' }] });
    expect((await pendiente).correcto).toBe(true);
    expect(api.direcciones()[0].referencia).toBe('Azul');
  });
  it('elimina y adopta el reemplazo de predeterminada elegido por el servidor', async () => {
    estado.direcciones.set([direccion]);
    const pendiente = api.eliminar(direccion.id);
    csrf();
    const r = http.expectOne(`${ruta}/${direccion.id}`);
    expect(r.request.method).toBe('DELETE');
    expect(api.direcciones()).toHaveLength(1);
    r.flush({ direcciones: [] });
    expect((await pendiente).correcto).toBe(true);
    expect(api.direcciones()).toEqual([]);
  });
  it('selecciona la predeterminada mediante su endpoint y cuerpo vacío', async () => {
    const pendiente = api.predeterminar(direccion.id);
    csrf();
    const r = http.expectOne(`${ruta}/${direccion.id}/predeterminada`);
    expect(r.request.method).toBe('PATCH');
    expect(r.request.body).toEqual({});
    r.flush({ direcciones: [direccion] });
    expect((await pendiente).correcto).toBe(true);
  });
  it.each([400, 403, 404, 409, 503])(
    'conserva la lista ante error %i, oculta detalles y no repite escrituras',
    async (status) => {
      estado.direcciones.set([direccion]);
      const pendiente = api.eliminar(direccion.id);
      csrf();
      http
        .expectOne(`${ruta}/${direccion.id}`)
        .flush({ message: 'SQL privado' }, { status, statusText: 'Error' });
      const resultado = await pendiente;
      expect(resultado.correcto).toBe(false);
      expect(resultado.mensaje).not.toContain('SQL');
      expect(api.direcciones()).toEqual([direccion]);
      http.expectNone(`${ruta}/${direccion.id}`);
    },
  );
  it('limpia las direcciones al vencer la sesión', async () => {
    estado.direcciones.set([direccion]);
    const pendiente = api.cargar();
    http.expectOne(ruta).flush({}, { status: 401, statusText: 'Unauthorized' });
    expect((await pendiente).correcto).toBe(false);
    expect(api.direcciones()).toEqual([]);
    expect(estado.perfil()).toBeNull();
  });
  it('ignora respuestas tardías después de cerrar sesión o cambiar de cuenta', async () => {
    const pendiente = api.cargar();
    const anterior = http.expectOne(ruta);
    estado.invalidar();
    estado.aceptar({ ...usuario, id: 'otra' });
    anterior.flush({ direcciones: [direccion] });
    expect((await pendiente).correcto).toBe(false);
    expect(api.direcciones()).toEqual([]);
  });
  it('una lectura anterior no sobrescribe el resultado de una escritura más reciente', async () => {
    const carga = api.cargar();
    const anterior = http.expectOne(ruta);
    const cambio = api.predeterminar(direccion.id);
    csrf();
    http.expectOne(`${ruta}/${direccion.id}/predeterminada`).flush({ direcciones: [direccion] });
    expect((await cambio).correcto).toBe(true);
    anterior.flush({ direcciones: [] });
    expect((await carga).correcto).toBe(false);
    expect(api.direcciones()).toEqual([direccion]);
  });
  it('rechaza respuestas malformadas sin borrar los datos confirmados', async () => {
    estado.direcciones.set([direccion]);
    const pendiente = api.cargar();
    http.expectOne(ruta).flush({ direcciones: [{ id: 'incompleta' }] });
    expect((await pendiente).correcto).toBe(false);
    expect(api.direcciones()).toEqual([direccion]);
  });
});
