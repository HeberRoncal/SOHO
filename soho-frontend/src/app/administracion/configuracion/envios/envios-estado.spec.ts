import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { EnviosEstado, ZonaEnvioApi } from './envios-estado';
import { EstadoAutenticacion } from '../../../tienda/cuenta/servicios/estado-autenticacion';
import { autenticacionInterceptor } from '../../../tienda/cuenta/servicios/autenticacion-interceptor';

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
const usuario = {
  id: 'admin',
  nombres: 'Ana',
  apellidos: 'Prueba',
  correo: 'ana@soho.test',
  rol: 'ADMIN' as const,
  correoVerificado: true,
};
export const zonasPrueba = (): ZonaEnvioApi[] =>
  codigos.map((codigo, orden) => ({
    codigo,
    nombre: codigo,
    tarifa: orden === 0 ? '0.00' : null,
    plazo: null,
    habilitada: !['moche', 'trujillo'].includes(codigo),
    orden,
    cotizable: orden === 0,
  }));
describe('Envíos desde Administración con API', () => {
  let estado: EnviosEstado, http: HttpTestingController, sesion: EstadoAutenticacion;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        EnviosEstado,
        provideHttpClient(withInterceptors([autenticacionInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    sesion = TestBed.inject(EstadoAutenticacion);
    sesion.aceptar(usuario);
    estado = TestBed.inject(EnviosEstado);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  const cargar = async () => {
    const p = estado.cargar();
    http.expectOne(ruta).flush({ zonas: zonasPrueba(), version: 'a'.repeat(64) });
    await p;
  };
  const csrf = () => http.expectOne('/api/auth/csrf').flush({ csrfToken: 'b'.repeat(64) });
  it('muestra tarifas pendientes vacías y conserva Moche desactivado y los siete códigos', async () => {
    await cargar();
    expect(estado.borrador().map((z) => z.codigo)).toEqual(codigos);
    expect(estado.borrador()[1].tarifa).toBe('');
    expect(estado.borrador()[6].habilitada).toBe(false);
    expect(estado.cambios()).toBe(false);
  });
  it('guarda los siete distritos con versión y CSRF, sin enviar nombres ni identidades', async () => {
    await cargar();
    estado.zona('trujillo', { tarifa: '7.25', plazo: ' Dos días ' });
    const p = estado.guardar();
    csrf();
    const req = http.expectOne(ruta);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.headers.get('X-CSRF-Token')).toBe('b'.repeat(64));
    expect(req.request.body.version).toBe('a'.repeat(64));
    expect(req.request.body.zonas[1]).toEqual({
      codigo: 'trujillo',
      tarifa: '7.25',
      plazo: 'Dos días',
      habilitada: false,
    });
    expect(req.request.body.zonas[2].tarifa).toBeNull();
    expect(estado.guardando()).toBe(true);
    expect(estado.cambios()).toBe(true);
    const zonas = zonasPrueba();
    Object.assign(zonas[1], { tarifa: '7.25', plazo: 'Dos días', cotizable: true });
    req.flush({ zonas, version: 'c'.repeat(64) });
    await p;
    expect(estado.cambios()).toBe(false);
    expect(estado.mensaje()).toContain('guardadas correctamente');
  });
  it('bloquea doble guardado y edición mientras espera la respuesta', async () => {
    await cargar();
    estado.zona('trujillo', { tarifa: '7.25' });
    const p = estado.guardar();
    csrf();
    const req = http.expectOne(ruta);
    await estado.guardar();
    estado.zona('trujillo', { tarifa: '8.50' });
    expect(estado.borrador()[1].tarifa).toBe('7.25');
    http.expectNone(ruta);
    req.flush({ zonas: zonasPrueba(), version: 'c'.repeat(64) });
    await p;
  });
  it.each(['-1', '1.234', '1e2', '1000000', 'NaN'])(
    'valida la tarifa %s sin enviar una escritura',
    async (tarifa) => {
      await cargar();
      estado.zona('trujillo', { tarifa });
      await estado.guardar();
      http.expectNone('/api/auth/csrf');
      http.expectNone(ruta);
      expect(estado.errorCampo('trujillo', 'tarifa')).toBeTruthy();
    },
  );
  it('conserva la gratuidad de La Esperanza y permite pendiente con zona habilitada', async () => {
    await cargar();
    estado.zona('la-esperanza', { tarifa: '9' });
    expect(estado.borrador()[0].tarifa).toBe('0.00');
    estado.zona('trujillo', { plazo: 'Mañana' });
    expect(estado.errores()).toEqual({});
  });
  it('descarta hasta el último estado confirmado sin hacer peticiones', async () => {
    await cargar();
    estado.zona('trujillo', { tarifa: '7.25' });
    estado.descartar();
    expect(estado.cambios()).toBe(false);
    expect(estado.borrador()[1].tarifa).toBe('');
    http.expectNone(ruta);
  });
  it.each([400, 403, 409, 503])(
    'conserva el borrador ante error %s y no repite la escritura',
    async (status) => {
      await cargar();
      estado.zona('trujillo', { tarifa: '7.25' });
      const p = estado.guardar();
      csrf();
      http.expectOne(ruta).flush({ message: 'SQL privado' }, { status, statusText: 'Error' });
      await p;
      expect(estado.borrador()[1].tarifa).toBe('7.25');
      expect(estado.cambios()).toBe(true);
      expect(estado.mensaje()).not.toContain('SQL');
      expect(estado.recargaNecesaria()).toBe([409, 503].includes(status));
      http.expectNone(ruta);
    },
  );
  it('un conflicto exige actualizar antes de guardar otra vez y adopta la versión vigente', async () => {
    await cargar();
    estado.zona('trujillo', { tarifa: '7.25' });
    const p = estado.guardar();
    csrf();
    http.expectOne(ruta).flush({}, { status: 409, statusText: 'Conflict' });
    await p;
    await estado.guardar();
    http.expectNone(ruta);
    const actualizacion = estado.cargar();
    const zonas = zonasPrueba();
    zonas[1].tarifa = '8.50';
    http.expectOne(ruta).flush({ zonas, version: 'd'.repeat(64) });
    await actualizacion;
    expect(estado.borrador()[1].tarifa).toBe('8.50');
    expect(estado.recargaNecesaria()).toBe(false);
    expect(estado.cambios()).toBe(false);
  });
  it('distingue error inicial de carga y permite reintentar sin mostrar datos ficticios', async () => {
    const p = estado.cargar();
    http.expectOne(ruta).flush({}, { status: 503, statusText: 'Unavailable' });
    await p;
    expect(estado.cargada()).toBe(false);
    expect(estado.borrador()).toEqual([]);
    expect(estado.errorCarga()).toBeTruthy();
    await cargar();
    expect(estado.cargada()).toBe(true);
  });
  it('ignora una carga tardía si la cuenta cambia y retira los datos al vencer la sesión', async () => {
    const p = estado.cargar();
    const req = http.expectOne(ruta);
    sesion.invalidar();
    sesion.aceptar({ ...usuario, id: 'otra' });
    req.flush({ zonas: zonasPrueba(), version: 'a'.repeat(64) });
    await p;
    expect(estado.borrador()).toEqual([]);
    expect(estado.cargada()).toBe(false);
    await cargar();
    sesion.invalidar();
    expect(estado.borrador()).toEqual([]);
  });
  it('una confirmación tardía no adopta el borrador en otra cuenta', async () => {
    await cargar();
    estado.zona('trujillo', { tarifa: '7.25' });
    const p = estado.guardar();
    csrf();
    const req = http.expectOne(ruta);
    sesion.invalidar();
    req.flush({ zonas: zonasPrueba(), version: 'c'.repeat(64) });
    await p;
    expect(estado.cargada()).toBe(false);
    expect(estado.borrador()).toEqual([]);
    expect(estado.mensaje()).not.toContain('guardadas correctamente');
  });
  it('rechaza una respuesta incompleta sin adoptarla como configuración vacía', async () => {
    const p = estado.cargar();
    http.expectOne(ruta).flush({ zonas: [], version: 'a'.repeat(64) });
    await p;
    expect(estado.cargada()).toBe(false);
    expect(estado.errorCarga()).toBeTruthy();
  });
  it('bloquea tarifas y plazos de zonas habilitadas incluso al intentar deshabilitar localmente', async () => {
    await cargar();
    estado.zona('el-porvenir', { tarifa: '9.00', plazo: 'Mañana', habilitada: false });
    expect(estado.borrador()[2]).toMatchObject({ tarifa: '', plazo: '', habilitada: true });
    expect(estado.editable('el-porvenir')).toBe(false);
    expect(estado.cambios()).toBe(false);
  });
  it('guarda la deshabilitación antes de permitir editar', async () => {
    await cargar();
    const p = estado.cambiarHabilitada('el-porvenir');
    csrf();
    const req = http.expectOne(ruta);
    expect(req.request.body.zonas[2]).toMatchObject({
      habilitada: false,
      tarifa: null,
      plazo: null,
    });
    expect(estado.editable('el-porvenir')).toBe(false);
    const zonas = zonasPrueba();
    zonas[2].habilitada = false;
    req.flush({ zonas, version: 'c'.repeat(64) });
    await p;
    expect(estado.editable('el-porvenir')).toBe(true);
    estado.zona('el-porvenir', { tarifa: '9.00' });
    expect(estado.borrador()[2].tarifa).toBe('9.00');
  });
  it('habilitar guarda solo esa zona y conserva los cambios locales de otra', async () => {
    await cargar();
    estado.zona('trujillo', { tarifa: '7.25', plazo: 'Mañana' });
    estado.zona('moche', { tarifa: '8.50' });
    const p = estado.cambiarHabilitada('trujillo');
    csrf();
    const req = http.expectOne(ruta);
    expect(req.request.body.zonas[1]).toMatchObject({ habilitada: true, tarifa: '7.25' });
    expect(req.request.body.zonas[6].tarifa).toBeNull();
    const zonas = zonasPrueba();
    Object.assign(zonas[1], { habilitada: true, tarifa: '7.25', plazo: 'Mañana', cotizable: true });
    req.flush({ zonas, version: 'c'.repeat(64) });
    await p;
    expect(estado.editable('trujillo')).toBe(false);
    expect(estado.borrador()[6].tarifa).toBe('8.50');
    expect(estado.cambios()).toBe(true);
  });
  it('una deshabilitación incierta exige consultar el estado guardado sin repetirla', async () => {
    await cargar();
    const p = estado.cambiarHabilitada('el-porvenir');
    csrf();
    http.expectOne(ruta).flush({}, { status: 503, statusText: 'Error' });
    await p;
    expect(estado.recargaNecesaria()).toBe(true);
    expect(estado.editable('el-porvenir')).toBe(false);
    await estado.cambiarHabilitada('el-porvenir');
    http.expectNone(ruta);
    const lectura = estado.cargar();
    const zonas = zonasPrueba();
    zonas[2].habilitada = false;
    http.expectOne(ruta).flush({ zonas, version: 'c'.repeat(64) });
    await lectura;
    expect(estado.editable('el-porvenir')).toBe(true);
  });
});
