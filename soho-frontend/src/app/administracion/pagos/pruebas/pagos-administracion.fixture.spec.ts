import { TestBed } from '@angular/core/testing';
import { PagosAdministracionPrueba as PagosAdministracion } from './pagos-administracion.fixture';
import { PedidosAdministracionPrueba as PedidosAdministracion } from '../../pedidos/pruebas/pedidos-administracion.fixture';
import { PEDIDOS_ADMIN_DEMO } from '../../cambios/datos/pedidos-posventa-demo';
import { PAGOS_ADMIN_DEMO } from './pagos.fixtures';
import { DecisionPagoAdmin, coincidePagoAdmin, errorDecisionPago } from '../modelos/pago-admin';

describe('Revisión administrativa de pagos de demostración', () => {
  let pagos: PagosAdministracion;
  let pedidos: PedidosAdministracion;
  const decision = (cambios: Partial<DecisionPagoAdmin> = {}): DecisionPagoAdmin => ({
    accion: 'aprobado',
    comprobanteId: 'SOHO-000128-v1',
    confirmado: true,
    motivo: '',
    mensaje: '',
    solicitud: 'legible',
    ...cambios,
  });
  beforeEach(() => {
    TestBed.configureTestingModule({});
    pagos = TestBed.inject(PagosAdministracion);
    pedidos = TestBed.inject(PedidosAdministracion);
  });
  it('parte de los mismos pedidos y de comprobantes inmutables con estados coherentes', () => {
    expect(pagos.pedidos()).toHaveLength(12);
    expect(pagos.pagos().filter((p) => p.comprobantes.length)).toHaveLength(11);
    for (const pago of pagos.pagos()) {
      expect(pago.pedido).toBe(PEDIDOS_ADMIN_DEMO.find((p) => p.codigo === pago.pedido.codigo));
      expect(Object.isFrozen(pago.comprobantes)).toBe(true);
      if (pago.comprobantes[0]) {
        expect(pago.comprobantes[0].estado).toBe(pago.pedido.estadoPago);
        expect(Object.isFrozen(pago.comprobantes[0])).toBe(true);
        expect(pago.comprobantes[0].operacion).toBe(pago.pedido.operacion);
      }
    }
    expect(pagos.obtener('DEM-99999')).toBeUndefined();
    expect(pagos.obtener('SOHO-000118')?.comprobantes).toEqual([]);
  });
  it('no permite aprobar sin confirmación ni con un comprobante desconocido', () => {
    expect(pagos.revisar('SOHO-000128', decision({ confirmado: false })).ok).toBe(false);
    expect(pagos.revisar('SOHO-000128', decision({ comprobanteId: 'otro' })).ok).toBe(false);
    expect(pagos.revisar('no-existe', decision()).ok).toBe(false);
    expect(pagos.obtener('SOHO-000128')?.pedido.estadoPago).toBe('pendiente');
    expect(pedidos.resumen.pendientesPago).toBe(2);
  });
  it('sincroniza una aprobación y la confirmación simulada con Pedidos sin alterar sus importes', () => {
    const original = pagos.obtener('SOHO-000128')!.pedido;
    expect(pagos.revisar(original.codigo, decision()).ok).toBe(true);
    const actual = pagos.obtener(original.codigo)!;
    expect(actual.pedido.estadoPago).toBe('aprobado');
    expect(actual.pedido.estadoEntrega).toBe('confirmado');
    expect(pedidos.obtener(original.codigo)).toBe(actual.pedido);
    expect(pedidos.resumen).toEqual({ total: 12, pendientesPago: 1, porPreparar: 3 });
    expect(actual.pedido.total).toBe(original.total);
    expect(actual.pedido.articulos).toBe(original.articulos);
    expect(original.estadoPago).toBe('pendiente');
    expect(actual.comprobantes[0].revisadoPor).toBe('Admin Demo');
    expect(actual.pedido.eventos.at(-1)?.titulo).toContain('simulación');
    expect(pagos.revisar(original.codigo, decision()).ok).toBe(false);
  });
  it('exige motivo y mensaje válido para observar y conserva la entrega pendiente', () => {
    const entrada = decision({ accion: 'observado', confirmado: false });
    expect(pagos.revisar('SOHO-000128', entrada).ok).toBe(false);
    expect(
      pagos.revisar('SOHO-000128', { ...entrada, motivo: 'ilegible', mensaje: 'corto' }).ok,
    ).toBe(false);
    expect(
      pagos.revisar('SOHO-000128', { ...entrada, motivo: 'otro', mensaje: 'a'.repeat(501) }).ok,
    ).toBe(false);
    expect(
      pagos.revisar('SOHO-000128', {
        ...entrada,
        motivo: 'ilegible',
        mensaje: '  Adjunta una captura completa y legible.  ',
      }).ok,
    ).toBe(true);
    const actual = pagos.obtener('SOHO-000128')!;
    expect(actual.pedido.estadoPago).toBe('observado');
    expect(actual.pedido.estadoEntrega).toBe('pendiente');
    expect(actual.comprobantes[0].mensaje).toBe('Adjunta una captura completa y legible.');
    expect(actual.pedido.observacion).toBe(actual.comprobantes[0].mensaje);
  });
  it('agrega una corrección al mismo pedido y bloquea decisiones sobre versiones anteriores', () => {
    const anterior = pagos.obtener('SOHO-000126')!.comprobantes[0];
    expect(pagos.simularCorreccion('SOHO-000126', anterior.id)).toBe(true);
    const actual = pagos.obtener('SOHO-000126')!;
    expect(actual.comprobantes).toHaveLength(2);
    expect(actual.comprobantes[1]).toBe(anterior);
    expect(actual.comprobantes[1].estado).toBe('observado');
    expect(actual.comprobantes[0].corregido).toBe(true);
    expect(actual.comprobantes[0].monto).toBe(actual.pedido.total);
    expect(actual.pedido.estadoPago).toBe('pendiente');
    expect(actual.pedido.observacion).toBeUndefined();
    expect(pagos.pedidos()).toHaveLength(12);
    expect(pagos.simularCorreccion('SOHO-000126', anterior.id)).toBe(false);
    expect(pagos.revisar('SOHO-000126', decision({ comprobanteId: anterior.id })).ok).toBe(false);
    expect(
      pagos.revisar('SOHO-000126', decision({ comprobanteId: actual.comprobantes[0].id })).ok,
    ).toBe(true);
    expect(pagos.obtener('SOHO-000126')!.comprobantes[1]).toBe(anterior);
  });
  it('el rechazo requiere confirmación y conserva el pedido y sus artículos', () => {
    const original = pagos.obtener('SOHO-000127')!.pedido;
    const entrada = decision({
      accion: 'rechazado',
      comprobanteId: 'SOHO-000127-v2',
      motivo: 'monto',
      mensaje: 'El monto no corresponde al pedido de ejemplo.',
      confirmado: false,
    });
    expect(pagos.revisar(original.codigo, entrada).ok).toBe(false);
    expect(pagos.revisar(original.codigo, { ...entrada, confirmado: true }).ok).toBe(true);
    const actual = pagos.obtener(original.codigo)!;
    expect(actual.pedido.estadoPago).toBe('rechazado');
    expect(actual.pedido.estadoEntrega).toBe('pendiente');
    expect(actual.pedido.total).toBe(original.total);
    expect(actual.comprobantes).toHaveLength(2);
    expect(pagos.simularCorreccion(original.codigo, actual.comprobantes[0].id)).toBe(false);
  });
  it('conserva las decisiones finales y pedidos cancelados al consultar', () => {
    for (const codigo of [
      'SOHO-000125',
      'SOHO-000124',
      'SOHO-000122',
      'SOHO-000117',
      'SOHO-000118',
    ]) {
      const original = pagos.obtener(codigo)!;
      expect(
        pagos.revisar(codigo, decision({ comprobanteId: original.comprobantes[0]?.id ?? '' })).ok,
      ).toBe(false);
      expect(pagos.obtener(codigo)!.pedido).toBe(original.pedido);
    }
    expect(pagos.obtener('SOHO-000117')!.pedido.estadoEntrega).toBe('cancelado');
    expect(pagos.obtener('SOHO-000122')!.pedido.estadoEntrega).toBe('incidencia');
  });
  it('restablece estados e historial sin modificar las fuentes originales', () => {
    pagos.revisar('SOHO-000128', decision());
    pagos.simularCorreccion('SOHO-000126', 'SOHO-000126-v1');
    pagos.restablecer();
    expect(pagos.obtener('SOHO-000128')!.pedido).toBe(PEDIDOS_ADMIN_DEMO[0]);
    expect(pagos.obtener('SOHO-000126')!.comprobantes).toBe(PAGOS_ADMIN_DEMO[2].comprobantes);
    expect(pedidos.resumen).toEqual({ total: 12, pendientesPago: 2, porPreparar: 2 });
    expect(
      TestBed.runInInjectionContext(() => new PagosAdministracion()).obtener('SOHO-000128')!.pedido
        .estadoPago,
    ).toBe('pendiente');
  });
  it('busca sin acentos y combina método, correo y operación actual', () => {
    const lucia = pagos.obtener('SOHO-000127')!;
    expect(coincidePagoAdmin(lucia, 'LUCIA FERNANDEZ', 'Yape')).toBe(true);
    expect(coincidePagoAdmin(lucia, ' DEMO-127 ', 'Yape')).toBe(true);
    expect(coincidePagoAdmin(lucia, 'cliente3@soho.example', '')).toBe(true);
    expect(coincidePagoAdmin(lucia, 'lucia', 'Plin')).toBe(false);
    expect(errorDecisionPago(lucia, decision({ comprobanteId: 'SOHO-000127-v1' }))).toContain(
      'más reciente',
    );
  });
});
