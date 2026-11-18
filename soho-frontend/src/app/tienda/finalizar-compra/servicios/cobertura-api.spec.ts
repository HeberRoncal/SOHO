import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CoberturaApi } from './cobertura-api';

const zonas = [
  { codigo: 'la-esperanza', nombre: 'La Esperanza', tarifa: '0.00', habilitada: true, plazo: null },
  { codigo: 'trujillo', nombre: 'Trujillo', tarifa: '7.25', habilitada: true, plazo: '24 horas' },
  { codigo: 'huanchaco', nombre: 'Huanchaco', tarifa: null, habilitada: true, plazo: null },
  { codigo: 'moche', nombre: 'Moche', tarifa: '8.00', habilitada: false, plazo: null },
];
const respuesta = (distrito = 'trujillo', costo: unknown = '7.25') => ({
  cotizacion: { distrito, nombreDistrito: 'Trujillo', costo, plazo: null, moneda: 'PEN' },
});

describe('CoberturaApi', () => {
  let api: CoberturaApi;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(CoberturaApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  async function cargar() {
    const p = api.cargar();
    http.expectOne('/api/cobertura').flush({ zonas });
    await p;
  }
  it('distingue tarifa cero, pendiente y distrito deshabilitado; comparte la carga en curso', async () => {
    const p = api.cargar();
    expect(api.cargar()).toBe(p);
    http.expectOne('/api/cobertura').flush({ zonas });
    await p;
    expect(api.zonas.map((z) => z.tarifa)).toEqual([0, 7.25, null, 8]);
    expect(api.zonas[3].habilitada).toBe(false);
    expect(api.cotizar('trujillo')).toBeNull();
  });
  it('conserva el costo exacto y el envío gratis confirmado', async () => {
    await cargar();
    let p = api.confirmar('trujillo');
    http.expectOne('/api/cobertura/trujillo/cotizacion').flush(respuesta());
    expect((await p)?.costo).toBe(7.25);
    p = api.confirmar('la-esperanza');
    expect(api.cotizar('trujillo')).toBeNull();
    expect(api.cotizando()).toBe(true);
    http
      .expectOne('/api/cobertura/la-esperanza/cotizacion')
      .flush(respuesta('la-esperanza', '0.00'));
    expect((await p)?.costo).toBe(0);
  });
  it('ignora una cotización anterior que termina después de la última selección', async () => {
    await cargar();
    const vieja = api.confirmar('trujillo'),
      nueva = api.confirmar('la-esperanza');
    http
      .expectOne('/api/cobertura/la-esperanza/cotizacion')
      .flush(respuesta('la-esperanza', '0.00'));
    await nueva;
    http.expectOne('/api/cobertura/trujillo/cotizacion').flush(respuesta());
    expect(await vieja).toBeNull();
    expect(api.cotizar('la-esperanza')?.costo).toBe(0);
    expect(api.mensajeCotizacion()).toBe('');
  });
  it('descarta respuestas al invalidar la selección', async () => {
    await cargar();
    const p = api.confirmar('trujillo');
    api.invalidar();
    http.expectOne('/api/cobertura/trujillo/cotizacion').flush(respuesta());
    expect(await p).toBeNull();
    expect(api.cotizar('trujillo')).toBeNull();
  });
  it.each([
    [422, 'COBERTURA_DESHABILITADA', 'deshabilitada'],
    [422, 'COBERTURA_TARIFA_PENDIENTE', 'pendiente'],
    [404, '', 'no está disponible'],
    [503, '', 'Reintenta'],
  ])('no usa tarifas de ejemplo ni cero ante HTTP %s %s', async (status, codigo, mensaje) => {
    await cargar();
    const p = api.confirmar('trujillo');
    http
      .expectOne('/api/cobertura/trujillo/cotizacion')
      .flush({ codigo, message: 'detalle interno' }, { status, statusText: 'Error' });
    expect(await p).toBeNull();
    expect(api.cotizar('trujillo')).toBeNull();
    expect(api.mensajeCotizacion()).toContain(mensaje);
    expect(api.mensajeCotizacion()).not.toContain('interno');
  });
  it.each([null, 0, '7.2', '-1.00', '7.25\n', '1000000.00'])(
    'rechaza un importe fuera del contrato: %s',
    async (costo) => {
      await cargar();
      const p = api.confirmar('trujillo');
      http.expectOne('/api/cobertura/trujillo/cotizacion').flush(respuesta('trujillo', costo));
      expect(await p).toBeNull();
    },
  );
  it('rechaza una respuesta de otro distrito', async () => {
    await cargar();
    const p = api.confirmar('trujillo');
    http.expectOne('/api/cobertura/trujillo/cotizacion').flush(respuesta('moche'));
    expect(await p).toBeNull();
  });
  it('permite recuperar un listado fallido sin fuentes de demostración', async () => {
    const p = api.cargar();
    http.expectOne('/api/cobertura').flush({}, { status: 503, statusText: 'Error' });
    await p;
    expect(api.estado()).toBe('error');
    expect(api.zonas).toEqual([]);
    await cargar();
    expect(api.estado()).toBe('lista');
  });
  it('rechaza códigos repetidos en el listado', async () => {
    const p = api.cargar();
    http.expectOne('/api/cobertura').flush({ zonas: [zonas[0], zonas[0]] });
    await p;
    expect(api.estado()).toBe('error');
  });
});
