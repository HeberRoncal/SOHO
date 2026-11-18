import { proveerAdministracionPrueba } from '../pedidos/pruebas/administracion.fixture';
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [proveerAdministracionPrueba()] });
});
import { TestBed } from '@angular/core/testing';
import { PagosAdministracionPrueba as PagosAdministracion } from '../pagos/pruebas/pagos-administracion.fixture';
import {
  ProductosAdministracionPrueba as ProductosAdministracion,
  proveerProductosAdministracionPrueba,
} from '../productos/pruebas/productos-administracion.fixture';
import { PAGOS_ADMIN_DEMO } from '../pagos/pruebas/pagos.fixtures';
import { PEDIDOS_ADMIN_DEMO } from '../cambios/datos/pedidos-posventa-demo';
import { PRODUCTOS_ADMIN_PRUEBA } from '../productos/pruebas/productos.fixtures';
import { PagoAdmin } from '../pagos/modelos/pago-admin';
import { diaPedidoAdmin } from '../pedidos/modelos/pedido-admin';
import { DashboardDatos } from './dashboard-datos';
import { alertasInventario, desplazarDia, errorPeriodo, ventasDiarias } from './resumen-dashboard';

const venta = (codigo: string, total: number, fecha: string): PagoAdmin => ({
  pedido: { ...PEDIDOS_ADMIN_DEMO[4], codigo, total },
  comprobantes: [{ ...PAGOS_ADMIN_DEMO[4].comprobantes[0], revisadoEn: fecha }],
});
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [proveerProductosAdministracionPrueba()] });
});

describe('Ventas y alertas del Dashboard', () => {
  it('cuenta por fecha de aprobación en Lima, sin usar la creación del pedido', () => {
    const pago = venta('P1', 150, '2026-11-08T03:30:00Z');
    expect(ventasDiarias([pago], '2026-11-07', '2026-11-08')).toEqual([
      { dia: '2026-11-07', importe: 150, pedidos: 1 },
      { dia: '2026-11-08', importe: 0, pedidos: 0 },
    ]);
  });
  it('acumula céntimos y cuenta un pedido una sola vez aunque haya varios comprobantes', () => {
    const a = venta('P1', 0.1, '2026-11-07T18:00Z');
    const b = venta('P2', 0.2, '2026-11-07T18:00Z');
    expect(
      ventasDiarias(
        [{ ...a, comprobantes: [...a.comprobantes, ...a.comprobantes] }, b],
        '2026-11-07',
        '2026-11-07',
      ),
    ).toEqual([{ dia: '2026-11-07', importe: 0.3, pedidos: 2 }]);
  });
  it('excluye pagos pendientes y aprobaciones sin fecha verificable', () => {
    const a = venta('P1', 150, '2026-11-07T18:00Z');
    expect(
      ventasDiarias(
        [
          { ...a, pedido: { ...a.pedido, estadoPago: 'pendiente' } },
          { ...a, comprobantes: [{ ...a.comprobantes[0], revisadoEn: undefined }] },
        ],
        '2026-11-07',
        '2026-11-07',
      )[0].importe,
    ).toBe(0);
  });
  it('respeta ambos límites del rango personalizado y rellena los días sin ventas', () => {
    const ventas = [
      venta('P1', 10, '2026-10-02T18:00Z'),
      venta('P2', 20, '2026-10-04T18:00Z'),
      venta('P3', 30, '2026-11-04T18:00Z'),
    ];
    const serie = ventasDiarias(ventas, '2026-10-02', '2026-10-04');
    expect(serie.map((p) => p.importe)).toEqual([10, 0, 20]);
    expect(ventasDiarias([], '2026-10-01', '2026-11-01')).toHaveLength(32);
  });
  it('valida fechas reales, orden, futuro y límite, incluyendo un año bisiesto', () => {
    expect(errorPeriodo('2026-02-30', '2026-03-01', '2026-11-11')).toBeTruthy();
    expect(errorPeriodo('2026-11-09', '2026-11-08', '2026-11-11')).toBeTruthy();
    expect(errorPeriodo('2026-11-08', '2026-11-12', '2026-11-11')).toBeTruthy();
    expect(errorPeriodo('2024-01-01', '2024-12-31', '2026-11-11')).toBe('');
    expect(errorPeriodo('2024-01-01', '2025-01-01', '2026-11-11')).toBeTruthy();
    expect(ventasDiarias([], 'invalida', '2026-11-11')).toEqual([]);
    expect(desplazarDia('2026-01-01', -1)).toBe('2025-12-31');
  });
  it('considera reservas y descarta variantes deshabilitadas y productos archivados', () => {
    const p = PRODUCTOS_ADMIN_PRUEBA[0];
    const variantes = [
      { ...p.variantes[0], sku: 'bajo', existencias: 3, cantidadReservada: 2 },
      { ...p.variantes[1], sku: 'falta', existencias: 0, cantidadReservada: 1 },
      { ...p.variantes[2], sku: 'oculta', existencias: 0, habilitada: false },
    ];
    const alertas = alertasInventario([
      { ...p, variantes },
      { ...p, estado: 'archivado', variantes },
    ]);
    expect(alertas.map((a) => a.variante.sku)).toEqual(['falta', 'bajo']);
    expect(alertas[0].disponible).toBe(0);
    expect(alertas[0].faltante).toBe(1);
  });
});
describe('Dashboard conectado a la demostración administrativa', () => {
  beforeEach(() => TestBed.configureTestingModule({}));
  it('actualiza ventas, cola y preparación al aprobar un pago en el servicio compartido', () => {
    const datos = TestBed.inject(DashboardDatos),
      pagos = TestBed.inject(PagosAdministracion);
    const pendientes = datos.pendientes().length,
      preparar = datos.porPreparar().length;
    const p = datos.pendientes()[0];
    expect(
      pagos.revisar(p.pedido.codigo, {
        accion: 'aprobado',
        comprobanteId: p.comprobantes[0].id,
        confirmado: true,
        motivo: '',
        mensaje: '',
        solicitud: 'legible',
      }).ok,
    ).toBe(true);
    expect(datos.pendientes()).toHaveLength(pendientes - 1);
    expect(datos.porPreparar()).toHaveLength(preparar + 1);
    const actualizado = pagos.obtener(p.pedido.codigo)!;
    const dia = diaPedidoAdmin(actualizado.comprobantes[0].revisadoEn!);
    expect(ventasDiarias(datos.pagos(), dia, dia)[0].importe).toBe(p.pedido.total);
  });
  it('actualiza las alertas cuando se registra una entrada de stock, sin modificar pedidos', () => {
    const datos = TestBed.inject(DashboardDatos),
      productos = TestBed.inject(ProductosAdministracion);
    const a = datos.alertas()[0],
      cantidad = datos.alertas().length,
      pedidos = datos.pedidos();
    expect(
      productos.registrarMovimiento({
        sku: a.variante.sku,
        tipo: 'entrada',
        sentido: 'sumar',
        cantidad: String(a.faltante + 5),
        motivo: 'Entrada para comprobar el Dashboard',
        referencia: '',
      }).movimiento,
    ).toBeTruthy();
    expect(datos.alertas()).toHaveLength(cantidad - 1);
    expect(datos.pedidos()).toBe(pedidos);
  });
  it('mantiene conteos actuales independientes del período y ordena pedidos recientes', () => {
    const datos = TestBed.inject(DashboardDatos);
    expect(datos.pendientes()).toHaveLength(2);
    expect(datos.observados()).toHaveLength(1);
    expect(datos.porPreparar()).toHaveLength(2);
    expect(datos.incidencias()).toHaveLength(1);
    expect(datos.recientes()).toHaveLength(7);
    expect(datos.recientes()[0].codigo).toBe('SOHO-000128');
  });
});
