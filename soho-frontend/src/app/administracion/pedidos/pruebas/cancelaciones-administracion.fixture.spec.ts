import { TestBed } from '@angular/core/testing';
import { CancelacionesAdministracionPrueba as CancelacionesAdministracion } from './cancelaciones-administracion.fixture';
import { PedidosAdministracionPrueba as PedidosAdministracion } from './pedidos-administracion.fixture';
import { PagosAdministracionPrueba as PagosAdministracion } from '../../pagos/pruebas/pagos-administracion.fixture';
import {
  ProductosAdministracionPrueba as ProductosAdministracion,
  proveerProductosAdministracionPrueba,
} from '../../productos/pruebas/productos-administracion.fixture';
import { PEDIDOS_ADMIN_DEMO } from '../../cambios/datos/pedidos-posventa-demo';
import { PedidoAdmin } from '../modelos/pedido-admin';
import { SolicitudCancelacionAdmin } from '../modelos/cancelacion-admin';

beforeEach(() => {
  TestBed.configureTestingModule({ providers: [proveerProductosAdministracionPrueba()] });
});

describe('Cancelación administrativa de pedidos de demostración', () => {
  let pedidos: PedidosAdministracion,
    pagos: PagosAdministracion,
    cancelaciones: CancelacionesAdministracion;
  const solicitud = (
    pedido: PedidoAdmin,
    cambios: Partial<SolicitudCancelacionAdmin> = {},
  ): SolicitudCancelacionAdmin => ({
    motivo: 'El cliente de ejemplo solicitó cancelar.',
    confirmado: true,
    estadoEntregaEsperado: pedido.estadoEntrega,
    estadoPagoEsperado: pedido.estadoPago,
    ...cambios,
  });
  beforeEach(() => {
    TestBed.configureTestingModule({});
    pedidos = TestBed.inject(PedidosAdministracion);
    pagos = TestBed.inject(PagosAdministracion);
    cancelaciones = TestBed.inject(CancelacionesAdministracion);
  });
  it('conserva los originales y rechaza códigos desconocidos sin crear registros', () => {
    const original = pedidos.obtener('SOHO-000124')!;
    expect(original).toBe(PEDIDOS_ADMIN_DEMO[4]);
    expect(cancelaciones.hayCambios()).toBe(false);
    expect(pedidos.cancelar('DEM-no-existe', solicitud(original)).ok).toBe(false);
    expect(pedidos.pedidos).toHaveLength(12);
    expect(cancelaciones.hayCambios()).toBe(false);
  });
  it('exige motivo válido y confirmación antes de cancelar', () => {
    const original = pedidos.obtener('SOHO-000124')!;
    for (const valores of [
      { motivo: '' },
      { motivo: '   corto  ' },
      { motivo: 'x'.repeat(301) },
      { confirmado: false },
    ]) {
      expect(pedidos.cancelar(original.codigo, solicitud(original, valores)).ok).toBe(false);
      expect(pedidos.obtener(original.codigo)).toBe(original);
    }
    const errores = pedidos.cancelar(
      original.codigo,
      solicitud(original, { motivo: '', confirmado: false }),
    ).errores;
    expect(Object.keys(errores)).toEqual(['motivo', 'confirmado']);
  });
  it('conserva un pago aprobado, importes, artículos e inventario al cancelar', () => {
    const inventario = TestBed.inject(ProductosAdministracion),
      stock = JSON.stringify(inventario.productos());
    const original = pedidos.obtener('SOHO-000124')!;
    expect(
      pedidos.cancelar(
        original.codigo,
        solicitud(original, { motivo: '  Cancelación solicitada por el cliente de ejemplo.  ' }),
      ).ok,
    ).toBe(true);
    const actual = pedidos.obtener(original.codigo)!;
    expect(actual.estadoEntrega).toBe('cancelado');
    expect(actual.estadoPago).toBe('aprobado');
    expect(actual.cancelacion?.motivo).toBe('Cancelación solicitada por el cliente de ejemplo.');
    expect(actual.cancelacion?.autor).toBe('Admin Demo');
    expect(actual.cancelacion?.estadoEntregaAnterior).toBe('confirmado');
    expect(actual.articulos).toBe(original.articulos);
    expect(actual.total).toBe(original.total);
    expect(actual.envio).toBe(0);
    expect(actual.eventos).toHaveLength(original.eventos.length + 1);
    expect(actual.eventos.at(-1)?.descripcion).toContain('no se realizó un reembolso');
    expect(Object.isFrozen(actual.cancelacion)).toBe(true);
    expect(JSON.stringify(inventario.productos())).toBe(stock);
    expect(original.estadoEntrega).toBe('confirmado');
    expect(pagos.obtener(original.codigo)!.pedido).toBe(actual);
    expect(pedidos.resumen.porPreparar).toBe(1);
  });
  it('muestra como anulado un pago no aprobado y conserva todos sus comprobantes', () => {
    for (const codigo of ['SOHO-000128', 'SOHO-000126', 'SOHO-000125']) {
      const original = pedidos.obtener(codigo)!;
      const comprobantes = pagos.obtener(codigo)!.comprobantes;
      expect(pedidos.cancelar(codigo, solicitud(original)).ok).toBe(true);
      const actual = pagos.obtener(codigo)!;
      expect(actual.pedido.estadoPago).toBe('anulado');
      expect(actual.comprobantes).toHaveLength(comprobantes.length);
      expect(actual.comprobantes[0].estado).toBe('anulado');
      expect(actual.comprobantes[0].nombre).toBe(comprobantes[0].nombre);
      expect(actual.comprobantes[0].monto).toBe(comprobantes[0].monto);
      expect(comprobantes[0].estado).toBe(original.estadoPago);
      expect(
        pagos.revisar(codigo, {
          accion: 'aprobado',
          comprobanteId: comprobantes[0].id,
          confirmado: true,
          motivo: '',
          mensaje: '',
          solicitud: 'legible',
        }).ok,
      ).toBe(false);
      expect(pagos.simularCorreccion(codigo, comprobantes[0].id)).toBe(false);
    }
    expect(
      pagos.pagos().filter((p) => p.pedido.estadoPago === 'anulado' && p.comprobantes.length),
    ).toHaveLength(3);
    expect(pedidos.resumen.pendientesPago).toBe(1);
  });
  it('conserva versiones anteriores al cancelar un comprobante corregido pendiente', () => {
    const original = pagos.obtener('SOHO-000127')!;
    pedidos.cancelar(original.pedido.codigo, solicitud(original.pedido));
    const actual = pagos.obtener(original.pedido.codigo)!;
    expect(actual.comprobantes).toHaveLength(2);
    expect(actual.comprobantes[1]).toBe(original.comprobantes[1]);
    expect(actual.comprobantes[1].estado).toBe('observado');
    expect(actual.pedido.cancelacion?.estadoPagoAnterior).toBe('pendiente');
  });
  it('permite cancelar en preparación o incidencia y bloquea nuevos avances', () => {
    pedidos.registrarEntrega('SOHO-000124', {
      accion: 'preparar',
      estadoEsperado: 'confirmado',
      empresa: '',
      seguimiento: '',
      nota: 'Pares revisados.',
      confirmado: false,
    });
    const preparado = pedidos.obtener('SOHO-000124')!;
    expect(pedidos.cancelar(preparado.codigo, solicitud(preparado)).ok).toBe(true);
    expect(pedidos.obtener(preparado.codigo)!.eventos).toHaveLength(preparado.eventos.length + 1);
    expect(pedidos.obtener(preparado.codigo)!.cancelacion?.estadoEntregaAnterior).toBe(
      'en-preparacion',
    );
    expect(
      pedidos.registrarEntrega(preparado.codigo, {
        accion: 'enviar',
        estadoEsperado: 'en-preparacion',
        empresa: 'Courier demo',
        seguimiento: 'DEMO-124',
        nota: '',
        confirmado: false,
      }).ok,
    ).toBe(false);
    const incidencia = pedidos.obtener('SOHO-000122')!;
    expect(pedidos.cancelar(incidencia.codigo, solicitud(incidencia)).ok).toBe(true);
    expect(pedidos.obtener(incidencia.codigo)!.estadoPago).toBe('aprobado');
  });
  it('bloquea pedidos enviados, entregados, ya cancelados y dobles registros', () => {
    for (const codigo of ['SOHO-000121', 'SOHO-000120', 'SOHO-000117', 'SOHO-000118']) {
      const original = pedidos.obtener(codigo)!;
      expect(pedidos.cancelar(codigo, solicitud(original)).ok).toBe(false);
      expect(pedidos.obtener(codigo)).toBe(original);
    }
    const original = pedidos.obtener('SOHO-000124')!;
    pedidos.cancelar(original.codigo, solicitud(original));
    expect(pedidos.cancelar(original.codigo, solicitud(original)).ok).toBe(false);
    const actual = pedidos.obtener(original.codigo)!;
    expect(actual.eventos.filter((e) => e.titulo === 'Pedido cancelado · simulación')).toHaveLength(
      1,
    );
    expect(cancelaciones.proyectar(cancelaciones.proyectar(actual)).eventos).toHaveLength(
      actual.eventos.length,
    );
  });
  it('rechaza un formulario antiguo cuando cambia el pago o el estado de entrega', () => {
    const original = pedidos.obtener('SOHO-000128')!,
      antigua = solicitud(original);
    pagos.revisar(original.codigo, {
      accion: 'aprobado',
      comprobanteId: 'SOHO-000128-v1',
      confirmado: true,
      motivo: '',
      mensaje: '',
      solicitud: 'legible',
    });
    expect(pedidos.cancelar(original.codigo, antigua).ok).toBe(false);
    const aprobado = pedidos.obtener(original.codigo)!,
      antesDePreparar = solicitud(aprobado);
    pedidos.registrarEntrega(original.codigo, {
      accion: 'preparar',
      estadoEsperado: 'confirmado',
      empresa: '',
      seguimiento: '',
      nota: '',
      confirmado: false,
    });
    expect(pedidos.cancelar(original.codigo, antesDePreparar).ok).toBe(false);
    expect(pedidos.cancelar(original.codigo, solicitud(pedidos.obtener(original.codigo)!)).ok).toBe(
      true,
    );
  });
  it('restablece solo cancelaciones preservando pagos y preparación actuales', () => {
    pagos.revisar('SOHO-000128', {
      accion: 'aprobado',
      comprobanteId: 'SOHO-000128-v1',
      confirmado: true,
      motivo: '',
      mensaje: '',
      solicitud: 'legible',
    });
    pedidos.registrarEntrega('SOHO-000128', {
      accion: 'preparar',
      estadoEsperado: 'confirmado',
      empresa: '',
      seguimiento: '',
      nota: '',
      confirmado: false,
    });
    const preparado = pedidos.obtener('SOHO-000128')!;
    pedidos.cancelar(preparado.codigo, solicitud(preparado));
    pedidos.restablecerCancelaciones();
    const actual = pedidos.obtener(preparado.codigo)!;
    expect(actual.estadoEntrega).toBe('en-preparacion');
    expect(actual.estadoPago).toBe('aprobado');
    expect(actual.cancelacion).toBeUndefined();
    expect(actual.eventos).toEqual(preparado.eventos);
    expect(pedidos.hayCambiosCancelacion()).toBe(false);
    expect(pedidos.hayCambiosEnvio()).toBe(true);
  });
  it('el restablecimiento global recupera pedidos y comprobantes originales', () => {
    const original = pedidos.obtener('SOHO-000128')!;
    pedidos.cancelar(original.codigo, solicitud(original));
    pagos.restablecer();
    expect(pedidos.obtener(original.codigo)).toBe(PEDIDOS_ADMIN_DEMO[0]);
    expect(pagos.obtener(original.codigo)!.comprobantes[0].estado).toBe('pendiente');
    expect(pedidos.hayCambiosCancelacion()).toBe(false);
    expect(pedidos.hayCambiosEnvio()).toBe(false);
    expect(new CancelacionesAdministracion().hayCambios()).toBe(false);
  });
});
