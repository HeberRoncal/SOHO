import { TestBed } from '@angular/core/testing';
import { ALMACENAMIENTO_FAVORITOS, PresentacionTienda } from './presentacion-tienda';
import { provideRouter } from '@angular/router';

beforeEach(() => {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
});
describe('Presentación de la tienda', () => {
  let presentacion: PresentacionTienda;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: ALMACENAMIENTO_FAVORITOS, useValue: null }],
    });
    presentacion = TestBed.inject(PresentacionTienda);
  });
  it('debe alternar favoritos sin duplicarlos', () => {
    presentacion.alternarFavorito('samba');
    presentacion.alternarFavorito('af1');
    expect(presentacion.favoritos()).toEqual(['samba', 'af1']);
    presentacion.alternarFavorito('samba');
    expect(presentacion.favoritos()).toEqual(['af1']);
  });
  it('debe conservar los favoritos al cerrar una vista previa', () => {
    presentacion.alternarFavorito('samba');
    presentacion.informar('Información', 'Texto informativo');
    expect(presentacion.panel()).toEqual({
      tipo: 'informacion',
      titulo: 'Información',
      contenido: 'Texto informativo',
    });
    presentacion.cerrar();
    expect(presentacion.panel()).toBeNull();
    expect(presentacion.favoritos()).toEqual(['samba']);
  });
});

describe('Guardado local de favoritos', () => {
  it('debe recuperar identificadores válidos sin duplicados', () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ALMACENAMIENTO_FAVORITOS,
          useValue: {
            getItem: () => '["samba","samba",7,null,"","af1"]',
            setItem: () => undefined,
          },
        },
      ],
    });
    expect(TestBed.inject(PresentacionTienda).favoritos()).toEqual(['samba', 'af1']);
  });

  for (const contenido of ['json dañado', '{"producto":"samba"}']) {
    it('debe comenzar con una lista vacía si el formato guardado es inválido: ' + contenido, () => {
      TestBed.configureTestingModule({
        providers: [
          {
            provide: ALMACENAMIENTO_FAVORITOS,
            useValue: { getItem: () => contenido, setItem: () => undefined },
          },
        ],
      });
      expect(TestBed.inject(PresentacionTienda).favoritos()).toEqual([]);
    });
  }

  it('debe conservar altas y eliminaciones cuando se vuelve a crear el servicio', () => {
    const datos = new Map<string, string>();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ALMACENAMIENTO_FAVORITOS,
          useValue: {
            getItem: (clave: string) => datos.get(clave) ?? null,
            setItem: (clave: string, valor: string) => datos.set(clave, valor),
          },
        },
      ],
    });
    const presentacion = TestBed.inject(PresentacionTienda);
    presentacion.alternarFavorito('samba');
    const recargada = TestBed.runInInjectionContext(() => new PresentacionTienda());
    expect(recargada.favoritos()).toEqual(['samba']);
    recargada.alternarFavorito('samba');
    expect(TestBed.runInInjectionContext(() => new PresentacionTienda()).favoritos()).toEqual([]);
  });

  it('debe seguir funcionando si el navegador bloquea la lectura o el guardado', () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ALMACENAMIENTO_FAVORITOS,
          useValue: {
            getItem: () => {
              throw new Error('Lectura bloqueada');
            },
            setItem: () => {
              throw new Error('Guardado bloqueado');
            },
          },
        },
      ],
    });
    const presentacion = TestBed.inject(PresentacionTienda);
    expect(() => presentacion.alternarFavorito('samba')).not.toThrow();
    expect(presentacion.favoritos()).toEqual(['samba']);
  });
});
