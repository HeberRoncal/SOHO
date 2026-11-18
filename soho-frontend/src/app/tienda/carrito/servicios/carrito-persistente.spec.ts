import { proveerCatalogoPrueba } from '../../catalogo/pruebas/catalogo.fixture';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CarritoPersistente, ALMACENAMIENTO_CARRITO } from './carrito-persistente';
import { EstadoAutenticacion } from '../../cuenta/servicios/estado-autenticacion';

// La vista elige sus datos de prueba; la fuente predeterminada de la app es la API.
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [proveerCatalogoPrueba()] });
});

describe('Carrito persistente por cuenta', () => {
  let carrito: CarritoPersistente;
  let http: HttpTestingController;
  let auth: EstadoAutenticacion;
  let almacen: Map<string, string>;
  const sku = 'NK-AF107-BL-40';
  const esperar = async () => {
    await Promise.resolve();
    await Promise.resolve();
    TestBed.tick();
  };
  function login(id = 'cuenta-a') {
    auth.aceptar({
      id,
      nombres: 'Ana',
      apellidos: 'Prueba',
      correo: 'ana@example.test',
      rol: 'CLIENTE',
      correoVerificado: true,
    });
    TestBed.tick();
  }
  beforeEach(() => {
    almacen = new Map();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ALMACENAMIENTO_CARRITO,
          useValue: {
            getItem: (k: string) => almacen.get(k) ?? null,
            setItem: (k: string, v: string) => almacen.set(k, v),
          },
        },
      ],
    });
    auth = TestBed.inject(EstadoAutenticacion);
    auth.invalidar();
    carrito = TestBed.inject(CarritoPersistente);
    http = TestBed.inject(HttpTestingController);
    TestBed.tick();
  });
  afterEach(() => http.verify());
  it('mantiene al invitado local y migra el formato anterior', () => {
    expect(carrito.agregar(sku, 1).correcto).toBe(true);
    expect(JSON.parse(almacen.get('soho:carrito:invitado')!).articulos).toEqual([
      { sku, cantidad: 1 },
    ]);
    expect(JSON.parse(almacen.get('soho:carrito:demostracion')!).articulos).toEqual([]);
    http.expectNone('/api/carrito');
  });
  it('recupera el carrito guardado desde un dispositivo sin almacenamiento previo', async () => {
    login();
    http.expectOne('/api/carrito').flush({ version: 3, articulos: [{ sku, cantidad: 2 }] });
    await esperar();
    expect(carrito.unidades()).toBe(2);
    expect(carrito.sincronizando()).toBe(false);
  });
  it('combina invitado y cuenta y limpia el invitado solamente al confirmar', async () => {
    carrito.agregar(sku, 2);
    login();
    http.expectOne('/api/carrito').flush({ version: 4, articulos: [] });
    await esperar();
    const escritura = http.expectOne('/api/carrito');
    expect(escritura.request.body.tipo).toBe('COMBINAR');
    expect(JSON.parse(almacen.get('soho:carrito:invitado')!).articulos).toHaveLength(1);
    escritura.flush({ version: 5, articulos: [{ sku, cantidad: 2 }] });
    await esperar();
    expect(JSON.parse(almacen.get('soho:carrito:invitado')!).articulos).toEqual([]);
  });
  it('guarda cantidades y eliminaciones con la versión confirmada', async () => {
    login();
    http.expectOne('/api/carrito').flush({ version: 5, articulos: [{ sku, cantidad: 1 }] });
    await esperar();
    expect(carrito.cambiarCantidad(sku, 2).correcto).toBe(true);
    const guardar = http.expectOne('/api/carrito');
    expect(guardar.request.body.version).toBe(5);
    expect(carrito.puedeContinuar()).toBe(false);
    guardar.flush({ version: 6, articulos: [{ sku, cantidad: 2 }] });
    await esperar();
    carrito.eliminar(sku);
    const eliminar = http.expectOne('/api/carrito');
    expect(eliminar.request.body.articulos).toEqual([]);
    expect(eliminar.request.body.version).toBe(6);
    eliminar.flush({ version: 7, articulos: [] });
    await esperar();
  });
  it('reintenta la misma operación tras una respuesta incierta sin duplicar unidades', async () => {
    login();
    http.expectOne('/api/carrito').flush({ version: 0, articulos: [] });
    await esperar();
    carrito.agregar(sku, 1);
    const primera = http.expectOne('/api/carrito');
    const datos = primera.request.body;
    primera.flush('sin red', { status: 503, statusText: 'Unavailable' });
    await esperar();
    expect(carrito.errorSincronizacion()).not.toBe('');
    expect(carrito.agregar(sku, 1).correcto).toBe(false);
    carrito.reintentar();
    const segunda = http.expectOne('/api/carrito');
    expect(segunda.request.body).toEqual(datos);
    segunda.flush({ version: 1, articulos: [{ sku, cantidad: 1 }] });
    await esperar();
    expect(carrito.unidades()).toBe(1);
  });
  it('ante conflicto consulta la versión nueva y no repite la copia antigua', async () => {
    login();
    http.expectOne('/api/carrito').flush({ version: 1, articulos: [{ sku, cantidad: 1 }] });
    await esperar();
    carrito.eliminar(sku);
    http.expectOne('/api/carrito').flush({}, { status: 409, statusText: 'Conflict' });
    await esperar();
    carrito.reintentar();
    const lectura = http.expectOne('/api/carrito');
    expect(lectura.request.method).toBe('GET');
    lectura.flush({ version: 2, articulos: [{ sku, cantidad: 3 }] });
    await esperar();
    expect(carrito.unidades()).toBe(3);
  });
  it('descarta respuestas antiguas y no transfiere el carrito entre cuentas', async () => {
    login();
    const antigua = http.expectOne('/api/carrito');
    login('cuenta-b');
    const nueva = http.expectOne('/api/carrito');
    antigua.flush({ version: 9, articulos: [{ sku, cantidad: 9 }] });
    await esperar();
    expect(carrito.unidades()).toBe(0);
    nueva.flush({ version: 0, articulos: [] });
    await esperar();
    expect(carrito.unidades()).toBe(0);
    auth.invalidar();
    TestBed.tick();
    expect(carrito.unidades()).toBe(0);
  });
  it('no presenta una carga fallida como un carrito vacío confirmado', async () => {
    login();
    http.expectOne('/api/carrito').flush({}, { status: 503, statusText: 'Unavailable' });
    await esperar();
    expect(carrito.errorSincronizacion()).not.toBe('');
    expect(carrito.puedeContinuar()).toBe(false);
  });
});
