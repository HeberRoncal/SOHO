import { TestBed } from '@angular/core/testing';
import { ALMACENAMIENTO_PEDIDOS } from '../../pedidos/servicios/acceso-pedidos';
import { AccesoCompras, nuevaClaveCompra } from './acceso-compras';
describe('Recuperación durable de compras por pestaña', () => {
  let datos: Map<string, string>;
  const iniciar = (bloquear = false) => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ALMACENAMIENTO_PEDIDOS,
          useValue: {
            getItem: (k: string) => datos.get(k) ?? null,
            setItem: (k: string, v: string) => {
              if (bloquear) throw Error();
              datos.set(k, v);
            },
          },
        },
      ],
    });
    return TestBed.inject(AccesoCompras);
  };
  beforeEach(() => (datos = new Map()));
  afterEach(() => TestBed.resetTestingModule());
  it('conserva claves y secreto antes del envío, sin imágenes o datos de contacto', () => {
    const s = iniciar(),
      r = s.preparar(null);
    expect(r.acceso).toMatch(/^[a-f0-9]{64}$/);
    expect(s.preparar(null)).toEqual(r);
    expect([...datos.values()].join()).not.toMatch(/contenidoBase64|direccion|correo|vistaPrevia/);
    TestBed.resetTestingModule();
    const nuevo = iniciar();
    nuevo.sincronizar(null);
    expect(nuevo.actual()).toEqual(r);
  });
  it('impide empezar si no puede verificar el guardado', () => {
    const s = iniciar(true);
    expect(() => s.preparar(null)).toThrow(/almacenamiento/);
    expect(s.actual()).toBeNull();
  });
  it('separa cuentas y no usa secreto invitado para la cuenta', () => {
    const s = iniciar(),
      invitado = s.preparar(null),
      ana = s.preparar('ana');
    expect(ana.acceso).toBeUndefined();
    expect(s.intentos()).toEqual([ana]);
    s.sincronizar('otro');
    expect(s.actual()).toBeNull();
    s.sincronizar(null);
    expect(s.actual()).toEqual(invitado);
  });
  it('retiene accesos anteriores al empezar una compra nueva', () => {
    const s = iniciar(),
      r = s.preparar(null);
    s.nueva();
    const otro = s.preparar(null);
    expect(otro.clave).not.toBe(r.clave);
    expect(s.intentos()).toHaveLength(2);
    expect(s.seleccionar(r.clave)).toEqual(r);
  });
  it('no acepta referencias dañadas ni propietarios falsificados', () => {
    const s = iniciar(),
      r = s.preparar(null);
    expect(() => s.guardar({ ...r, dueno: 'otro' })).toThrow();
    datos.set(
      'soho:compras:v1:invitado',
      JSON.stringify({ version: 1, actual: r.clave, intentos: [{ ...r, acceso: 'no' }] }),
    );
    TestBed.resetTestingModule();
    const nuevo = iniciar();
    nuevo.sincronizar(null);
    expect(nuevo.actual()).toBeNull();
    expect(nuevo.persistente()).toBe(false);
  });
  it('consultar y actualizar el historial conserva la compra en curso al recargar', () => {
    const s = iniciar(),
      anterior = s.preparar(null);
    s.nueva();
    const actual = s.preparar(null);
    s.seleccionar(anterior.clave);
    s.guardar({ ...anterior, codigo: 'SOHO-ANTERIOR' });
    s.finalizar(anterior.clave);
    expect(s.enCurso()).toEqual(actual);
    TestBed.resetTestingModule();
    const recargado = iniciar();
    recargado.sincronizar(null);
    expect(recargado.actual()).toEqual(actual);
    expect(recargado.intentos()).toHaveLength(2);
  });
  it('un pedido anterior sin indicador de cesta se considera ya atendido', () => {
    const s = iniciar(),
      r = s.preparar(null);
    const { carritoAtendido, ...anterior } = r;
    datos.set(
      'soho:compras:v1:invitado',
      JSON.stringify({
        version: 1,
        actual: r.clave,
        intentos: [{ ...anterior, codigo: 'SOHO-ANTERIOR' }],
      }),
    );
    TestBed.resetTestingModule();
    const recargado = iniciar();
    recargado.sincronizar(null);
    expect(recargado.actual()?.carritoAtendido).toBe(true);
    expect(recargado.actual()?.acceso).toBe(r.acceso);
  });
  it('no elimina intentos inciertos para hacer espacio', () => {
    const s = iniciar();
    for (let n = 0; n < 20; n++) {
      s.preparar(null);
      s.nueva();
    }
    expect(() => s.preparar(null)).toThrow(/veinte/);
    expect(s.intentos()).toHaveLength(20);
  });
  it('genera claves independientes y con bits de UUID v4', () => {
    expect(new Set(Array.from({ length: 50 }, () => nuevaClaveCompra())).size).toBe(50);
  });
});
