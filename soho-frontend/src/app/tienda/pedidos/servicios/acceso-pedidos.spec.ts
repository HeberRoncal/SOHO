import { TestBed } from '@angular/core/testing';
import { AccesoPedidos, ALMACENAMIENTO_PEDIDOS } from './acceso-pedidos';

describe('Referencias privadas de pedidos por pestaña', () => {
  let datos: Map<string, string>;
  const iniciar = (bloqueado = false) => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ALMACENAMIENTO_PEDIDOS,
          useValue: bloqueado
            ? {
                getItem: () => {
                  throw Error('Bloqueado');
                },
                setItem: () => {
                  throw Error('Bloqueado');
                },
              }
            : {
                getItem: (k: string) => datos.get(k) ?? null,
                setItem: (k: string, v: string) => datos.set(k, v),
              },
        },
      ],
    });
    return TestBed.inject(AccesoPedidos);
  };
  beforeEach(() => {
    datos = new Map();
  });
  afterEach(() => TestBed.resetTestingModule());
  it('genera UUID y secretos con forma válida y mantiene la referencia entre reintentos', () => {
    const s = iniciar(),
      a = s.preparar(null);
    expect(a.clave).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.acceso).toMatch(/^[0-9a-f]{64}$/);
    expect(s.preparar(null)).toEqual(a);
  });
  it('recupera una referencia de invitado después de recargar', () => {
    const a = iniciar().preparar(null);
    TestBed.resetTestingModule();
    const s = iniciar();
    s.sincronizar(null);
    expect(s.referencia()).toEqual(a);
  });
  it('retira referencias y credenciales al cambiar de cuenta', () => {
    const s = iniciar();
    s.preparar(null);
    s.confirmar('SOHO-TEST0001');
    expect(s.acceso('SOHO-TEST0001')).toBeTruthy();
    s.sincronizar('ana');
    expect(s.acceso('SOHO-TEST0001')).toBeUndefined();
    expect(s.referencia()).toBeNull();
  });
  it('no genera credencial de invitado para una cuenta', () => {
    expect(iniciar().preparar('ana').acceso).toBeUndefined();
  });
  it('un almacenamiento bloqueado conserva el funcionamiento en memoria', () => {
    const s = iniciar(true),
      r = s.preparar(null);
    expect(s.persistente()).toBe(false);
    s.confirmar('SOHO-TEST0001');
    expect(s.acceso('SOHO-TEST0001')).toBe(r.acceso);
  });
  it('ignora contenido dañado y secretos con forma inválida', () => {
    datos.set(
      'soho:pedidos:accesos:v1',
      JSON.stringify({
        version: 1,
        dueno: null,
        invitados: [{ codigo: 'SOHO-TEST0001', acceso: 'invalido', vence: Date.now() + 1000 }],
      }),
    );
    expect(iniciar().acceso('SOHO-TEST0001')).toBeUndefined();
  });
  it('vincula el secreto de recepción sin consumir una creación v1 pendiente', () => {
    const s = iniciar(),
      anterior = s.preparar(null),
      acceso = 'ab'.repeat(32);
    s.registrarInvitado('SOHO-REC00001', acceso, new Date(Date.now() - 1000).toISOString());
    expect(s.acceso('SOHO-REC00001')).toBe(acceso);
    expect(s.referencia()).toEqual(anterior);
  });
  it('la recuperación de un pedido no renueva su vencimiento original', () => {
    const s = iniciar(),
      acceso = 'ab'.repeat(32),
      fecha = new Date(Date.now() - 5000).toISOString();
    s.sincronizar(null);
    s.registrarInvitado('SOHO-REC00001', acceso, fecha);
    s.registrarInvitado('SOHO-REC00001', acceso, new Date().toISOString());
    const guardado = JSON.parse(datos.get('soho:pedidos:accesos:v1')!);
    expect(guardado.invitados[0].vence).toBe(Date.parse(fecha) + 30 * 86400000);
  });
  it('rechaza otro secreto o una cuenta al vincular pedidos invitados', () => {
    const s = iniciar(),
      fecha = new Date().toISOString();
    s.sincronizar(null);
    s.registrarInvitado('SOHO-REC00001', 'ab'.repeat(32), fecha);
    expect(() => s.registrarInvitado('SOHO-REC00001', 'cd'.repeat(32), fecha)).toThrow();
    s.sincronizar('ana');
    expect(() => s.registrarInvitado('SOHO-REC00001', 'ab'.repeat(32), fecha)).toThrow();
  });
});
