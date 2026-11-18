import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CoberturaEntrega, FUENTE_COBERTURA } from './cobertura-entrega';
import { CoberturaApi } from './cobertura-api';

describe('CoberturaEntrega', () => {
  let servicio: CoberturaEntrega;
  let api: CoberturaApi;
  let http: HttpTestingController;
  const zonas = [
    {
      codigo: 'la-esperanza',
      nombre: 'La Esperanza',
      tarifa: '0.00',
      habilitada: true,
      plazo: null,
    },
    { codigo: 'trujillo', nombre: 'Trujillo', tarifa: '7.25', habilitada: true, plazo: '24 horas' },
    { codigo: 'moche', nombre: 'Moche', tarifa: '8.00', habilitada: false, plazo: null },
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    servicio = TestBed.inject(CoberturaEntrega);
    api = TestBed.inject(CoberturaApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  async function cargar() {
    const p = servicio.cargar();
    http.expectOne('/api/cobertura').flush({ zonas });
    await p;
  }

  it('usa la API por defecto y comparte sus estados sin distritos ni tarifas de ejemplo', () => {
    expect(TestBed.inject(FUENTE_COBERTURA)).toBe(api);
    expect(servicio.remoto).toBe(true);
    expect(servicio.zonas).toEqual([]);
    expect(servicio.estado).toBe(api.estado);
    expect(servicio.mensaje).toBe(api.mensaje);
    expect(servicio.cotizando).toBe(api.cotizando);
    expect(servicio.mensajeCotizacion).toBe(api.mensajeCotizacion);
    expect(servicio.cotizar('la-esperanza')).toBeNull();
  });
  it('solo usa el costo confirmado por el servidor, incluido el envío gratuito', async () => {
    await cargar();
    expect(servicio.cotizar('trujillo')).toBeNull();
    for (const [distrito, costo] of [
      ['trujillo', '7.25'],
      ['la-esperanza', '0.00'],
    ]) {
      const p = servicio.confirmar(distrito);
      expect(servicio.cotizando()).toBe(true);
      http.expectOne(`/api/cobertura/${distrito}/cotizacion`).flush({
        cotizacion: { distrito, nombreDistrito: distrito, costo, plazo: null, moneda: 'PEN' },
      });
      expect((await p)?.costo).toBe(Number(costo));
      expect(servicio.cotizar(distrito)?.costo).toBe(Number(costo));
    }
    servicio.invalidar();
    expect(servicio.cotizar('la-esperanza')).toBeNull();
  });
  it('conserva el bloqueo de zonas deshabilitadas, desconocidas y vacías', async () => {
    await cargar();
    const deshabilitada = servicio.confirmar('moche');
    http
      .expectOne('/api/cobertura/moche/cotizacion')
      .flush({ codigo: 'COBERTURA_DESHABILITADA' }, { status: 422, statusText: 'Deshabilitada' });
    expect(await deshabilitada).toBeNull();
    expect(servicio.mensajeCotizacion()).toContain('deshabilitada');
    const desconocida = servicio.confirmar('fuera-de-cobertura');
    http
      .expectOne('/api/cobertura/fuera-de-cobertura/cotizacion')
      .flush({}, { status: 404, statusText: 'Sin cobertura' });
    expect(await desconocida).toBeNull();
    expect(await servicio.confirmar('')).toBeNull();
    expect(servicio.cotizar('moche')).toBeNull();
  });
  it('un fallo de listado no carga ejemplos y permite recuperar los datos remotos', async () => {
    const p = servicio.cargar();
    http.expectOne('/api/cobertura').flush({}, { status: 503, statusText: 'Sin conexión' });
    await p;
    expect(servicio.estado()).toBe('error');
    expect(servicio.zonas).toEqual([]);
    expect(servicio.cotizar('trujillo')).toBeNull();
    await cargar();
    expect(servicio.estado()).toBe('lista');
    expect(servicio.zonas[1].tarifa).toBe(7.25);
  });
});
