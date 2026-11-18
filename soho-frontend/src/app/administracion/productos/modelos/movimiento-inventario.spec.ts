import { TestBed } from '@angular/core/testing';
import {
  ProductosAdministracionPrueba as ProductosAdministracion,
  proveerProductosAdministracionPrueba,
} from '../pruebas/productos-administracion.fixture';
import { CatalogoPrueba } from '../../../tienda/catalogo/pruebas/catalogo.fixture';
import { editarDatosProducto } from './edicion-producto';
import {
  MOVIMIENTO_VACIO,
  DatosMovimiento,
  diaMovimiento,
  evaluarMovimiento,
  sincronizarSaldos,
} from './movimiento-inventario';

beforeEach(() => {
  TestBed.configureTestingModule({ providers: [proveerProductosAdministracionPrueba()] });
});

describe('Movimientos de inventario de demostración', () => {
  let fuente: ProductosAdministracion;
  const sku = 'NK-DUNKLOW-BN-42';
  const datos = (cambios: Partial<DatosMovimiento> = {}): DatosMovimiento => ({
    ...MOVIMIENTO_VACIO,
    sku,
    cantidad: '2',
    motivo: 'Reposición de prueba',
    ...cambios,
  });
  beforeEach(() => {
    TestBed.configureTestingModule({});
    fuente = TestBed.inject(ProductosAdministracion);
  });
  const variante = () => fuente.productos()[0].variantes.find((v) => v.sku === sku)!;
  it('registra entradas, salidas y ajustes con saldos históricos sin modificar reservas ni catálogo público', () => {
    const publico = TestBed.inject(CatalogoPrueba).obtener('af1');
    const entrada = fuente.registrarMovimiento(datos()).movimiento!;
    expect(entrada).toMatchObject({
      cantidad: 2,
      saldoAnterior: 3,
      saldo: 5,
      reservado: 1,
      disponible: 4,
    });
    expect(
      fuente.registrarMovimiento(datos({ tipo: 'salida', cantidad: '4' })).movimiento,
    ).toMatchObject({ cantidad: -4, saldoAnterior: 5, saldo: 1, reservado: 1, disponible: 0 });
    expect(
      evaluarMovimiento(datos({ tipo: 'ajuste', sentido: 'restar', cantidad: '1' }), variante())
        .bajoReservas,
    ).toBe(true);
    const ajuste = fuente.registrarMovimiento(
      datos({ tipo: 'ajuste', sentido: 'restar', cantidad: '1' }),
    ).movimiento!;
    expect(ajuste).toMatchObject({ cantidad: -1, saldo: 0, reservado: 1, disponible: 0 });
    expect(variante().cantidadReservada).toBe(1);
    expect(entrada.saldo).toBe(5);
    expect(fuente.movimientos().map((m) => m.identificador)).toEqual([
      'MOV-00003',
      'MOV-00002',
      'MOV-00001',
    ]);
    expect(TestBed.inject(CatalogoPrueba).obtener('af1')).toBe(publico);
  });
  it('rechaza cantidades inválidas, saldos negativos, SKU inexistentes y motivos vacíos sin mutaciones', () => {
    const productos = fuente.productos();
    for (const cantidad of ['0', '-1', '1.5', 'NaN', 'Infinity', '1e2', '100000'])
      expect(fuente.registrarMovimiento(datos({ cantidad })).movimiento).toBeNull();
    expect(
      fuente.registrarMovimiento(datos({ tipo: 'salida', cantidad: '4' })).movimiento,
    ).toBeNull();
    expect(fuente.registrarMovimiento(datos({ cantidad: '99999' })).movimiento).toBeNull();
    expect(fuente.registrarMovimiento(datos({ sku: 'NO-EXISTE' })).movimiento).toBeNull();
    expect(fuente.registrarMovimiento(datos({ motivo: '  ' })).movimiento).toBeNull();
    expect(fuente.productos()).toBe(productos);
    expect(fuente.movimientos()).toEqual([]);
  });
  it('el disponible de una variante deshabilitada permanece en cero y restablecer elimina el historial', () => {
    const original = fuente.productos()[0];
    fuente.guardar(editarDatosProducto(original), 'borrador', original.identificador, {
      colores: original.colores,
      variantes: original.variantes.map((v) => ({ ...v, habilitada: false })),
    });
    expect(fuente.registrarMovimiento(datos()).movimiento?.disponible).toBe(0);
    expect(variante().existencias).toBe(5);
    fuente.restablecer();
    expect(variante().existencias).toBe(3);
    expect(fuente.movimientos()).toEqual([]);
  });
  it('crea una entrada inicial por variante nueva con stock y no la duplica al volver a guardar', () => {
    const original = fuente.productos()[0],
      codigo = fuente.siguienteCodigo();
    const nuevas = ['40', '41'].map((talla, i) => ({
      ...original.variantes[0],
      identificador: `${codigo}-BN-${talla}`,
      sku: `${codigo}-BN-${talla}`,
      talla,
      cantidadReservada: 0,
      existencias: i === 0 ? 7 : 0,
    }));
    const producto = fuente.guardar(
      {
        ...editarDatosProducto(original),
        nombre: 'Modelo de prueba',
        codigoModelo: 'MODELO-PRUEBA',
      },
      'publicado',
      undefined,
      { colores: original.colores, variantes: nuevas },
    ).producto!;
    expect(fuente.movimientos()).toHaveLength(1);
    expect(fuente.movimientos()[0]).toMatchObject({
      producto: 'Modelo de prueba',
      productoId: producto.identificador,
      origen: 'stock-inicial',
      cantidad: 7,
      saldoAnterior: 0,
      saldo: 7,
    });
    fuente.guardar(
      { ...editarDatosProducto(producto), nombre: 'Modelo renombrado' },
      'borrador',
      producto.identificador,
    );
    expect(fuente.movimientos()).toHaveLength(1);
    expect(fuente.movimientos()[0].producto).toBe('Modelo de prueba');
  });
  it('sincroniza saldos sin descartar la habilitación o variantes pendientes del editor', () => {
    const original = fuente.productos()[0];
    const pendiente = {
      ...original.variantes[0],
      sku: 'NUEVA',
      identificador: 'NUEVA',
      existencias: 9,
    };
    const edicion = {
      colores: original.colores,
      variantes: [...original.variantes.map((v) => ({ ...v, habilitada: false })), pendiente],
    };
    fuente.registrarMovimiento(datos());
    const sincronizada = sincronizarSaldos(edicion, fuente.productos()[0].variantes);
    expect(sincronizada.variantes.find((v) => v.sku === sku)).toMatchObject({
      existencias: 5,
      cantidadReservada: 1,
      habilitada: false,
    });
    expect(sincronizada.variantes.at(-1)).toBe(pendiente);
    expect(diaMovimiento('2026-11-09T02:30:00Z')).toBe('2026-11-08');
  });
});
