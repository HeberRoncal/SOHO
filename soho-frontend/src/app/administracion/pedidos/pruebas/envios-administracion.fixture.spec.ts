import { TestBed } from '@angular/core/testing';
import { EnviosAdministracionPrueba as EnviosAdministracion } from './envios-administracion.fixture';
import { PedidosAdministracionPrueba as PedidosAdministracion } from './pedidos-administracion.fixture';
import { PagosAdministracionPrueba as PagosAdministracion } from '../../pagos/pruebas/pagos-administracion.fixture';
import {
  ProductosAdministracionPrueba as ProductosAdministracion,
  proveerProductosAdministracionPrueba,
} from '../../productos/pruebas/productos-administracion.fixture';
import { CambioEntregaAdmin } from '../modelos/entrega-admin';
import { PEDIDOS_ADMIN_DEMO } from '../../cambios/datos/pedidos-posventa-demo';

beforeEach(() => {
  TestBed.configureTestingModule({ providers: [proveerProductosAdministracionPrueba()] });
});

describe('Preparación y envíos administrativos de demostración', () => {
  let pedidos: PedidosAdministracion, pagos: PagosAdministracion, envios: EnviosAdministracion;
  const cambio = (valores: Partial<CambioEntregaAdmin> = {}): CambioEntregaAdmin => ({
    accion: 'preparar',
    estadoEsperado: 'confirmado',
    empresa: '',
    seguimiento: '',
    nota: '',
    confirmado: false,
    ...valores,
  });
  beforeEach(() => {
    TestBed.configureTestingModule({});
    pedidos = TestBed.inject(PedidosAdministracion);
    pagos = TestBed.inject(PagosAdministracion);
    envios = TestBed.inject(EnviosAdministracion);
  });
  it('conserva los ejemplos originales hasta registrar un cambio', () => {
    expect(pedidos.obtener('SOHO-000124')).toBe(PEDIDOS_ADMIN_DEMO[4]);
    expect(pedidos.hayCambiosEnvio()).toBe(false);
    expect(pedidos.registrarEntrega('DEM-no-existe', cambio()).ok).toBe(false);
    expect(pedidos.pedidos).toHaveLength(12);
  });
  it('registra el recorrido completo, seguimiento e historial sin duplicados ni cambios en inventario', () => {
    const inventario = TestBed.inject(ProductosAdministracion);
    const stock = JSON.stringify(inventario.productos());
    const original = pedidos.obtener('SOHO-000124')!;
    expect(
      pedidos.registrarEntrega(original.codigo, cambio({ nota: '  Pares revisados.  ' })).ok,
    ).toBe(true);
    expect(pedidos.obtener(original.codigo)!.estadoEntrega).toBe('en-preparacion');
    expect(
      pedidos.registrarEntrega(
        original.codigo,
        cambio({
          accion: 'enviar',
          estadoEsperado: 'en-preparacion',
          empresa: ' Courier de ejemplo ',
          seguimiento: ' DEMO-124 ',
        }),
      ).ok,
    ).toBe(true);
    const enviado = pedidos.obtener(original.codigo)!;
    expect(enviado.seguimiento).toEqual({ empresa: 'Courier de ejemplo', codigo: 'DEMO-124' });
    expect(
      pedidos.registrarEntrega(
        original.codigo,
        cambio({
          accion: 'entregar',
          estadoEsperado: 'enviado',
          confirmado: true,
          nota: 'Entrega de demostración.',
        }),
      ).ok,
    ).toBe(true);
    const final = pedidos.obtener(original.codigo)!;
    expect(final.estadoEntrega).toBe('entregado');
    expect(final.estadoPago).toBe('aprobado');
    expect(final.articulos).toBe(original.articulos);
    expect(final.total).toBe(original.total);
    expect(final.envio).toBe(0);
    expect(final.eventos).toHaveLength(original.eventos.length + 3);
    expect(final.eventos.at(-3)?.descripcion).toContain('Pares revisados.');
    const nuevos = final.eventos.slice(-3);
    expect(nuevos.map((e) => e.titulo)).toEqual([
      'En preparación · simulación',
      'Enviado · simulación',
      'Entregado · simulación',
    ]);
    expect(nuevos.every((e, i) => !i || e.fecha > nuevos[i - 1].fecha)).toBe(true);
    expect(Object.isFrozen(final)).toBe(true);
    expect(Object.isFrozen(final.seguimiento)).toBe(true);
    expect(JSON.stringify(inventario.productos())).toBe(stock);
    expect(original.estadoEntrega).toBe('confirmado');
    expect(original.seguimiento).toBeUndefined();
  });
  it('impide saltos, estados antiguos y dobles registros', () => {
    expect(pedidos.registrarEntrega('SOHO-000124', cambio({ accion: 'enviar' })).ok).toBe(false);
    expect(pedidos.registrarEntrega('SOHO-000124', cambio()).ok).toBe(true);
    expect(pedidos.registrarEntrega('SOHO-000124', cambio()).ok).toBe(false);
    expect(
      pedidos.registrarEntrega(
        'SOHO-000124',
        cambio({ accion: 'enviar', empresa: 'Courier', seguimiento: 'DEMO' }),
      ).ok,
    ).toBe(false);
    expect(
      pedidos
        .obtener('SOHO-000124')!
        .eventos.filter((e) => e.titulo === 'En preparación · simulación'),
    ).toHaveLength(1);
  });
  it('valida transportista, seguimiento y longitud de notas antes de cambiar estado', () => {
    const original = pedidos.obtener('SOHO-000123')!;
    const enviar = cambio({ accion: 'enviar', estadoEsperado: 'en-preparacion' });
    const resultado = pedidos.registrarEntrega(original.codigo, enviar);
    expect(Object.keys(resultado.errores)).toEqual(['empresa', 'seguimiento']);
    for (const invalido of [
      { empresa: ' ', seguimiento: 'DEMO' },
      { empresa: 'a'.repeat(81), seguimiento: 'DEMO' },
      { empresa: 'Courier', seguimiento: ' x ' },
      { empresa: 'Courier', seguimiento: 'x'.repeat(81) },
      { empresa: 'Courier', seguimiento: 'DEMO', nota: 'x'.repeat(301) },
    ])
      expect(pedidos.registrarEntrega(original.codigo, { ...enviar, ...invalido }).ok).toBe(false);
    expect(pedidos.obtener(original.codigo)).toBe(original);
    expect(pedidos.hayCambiosEnvio()).toBe(false);
  });
  it('exige confirmación para entregar y conserva el seguimiento del envío', () => {
    const original = pedidos.obtener('SOHO-000121')!;
    const entregar = cambio({ accion: 'entregar', estadoEsperado: 'enviado' });
    expect(pedidos.registrarEntrega(original.codigo, entregar).errores['confirmado']).toBeTruthy();
    expect(pedidos.registrarEntrega(original.codigo, { ...entregar, confirmado: true }).ok).toBe(
      true,
    );
    const final = pedidos.obtener(original.codigo)!;
    expect(final.seguimiento).toBe(original.seguimiento);
    expect(pedidos.registrarEntrega(original.codigo, { ...entregar, confirmado: true }).ok).toBe(
      false,
    );
    expect(final.eventos).toHaveLength(original.eventos.length + 1);
  });
  it('bloquea pagos no aprobados, incidencias, cancelados y entregados', () => {
    for (const codigo of [
      'SOHO-000128',
      'SOHO-000126',
      'SOHO-000125',
      'SOHO-000122',
      'SOHO-000117',
      'SOHO-000118',
      'SOHO-000120',
    ]) {
      const original = pedidos.obtener(codigo)!;
      expect(
        pedidos.registrarEntrega(codigo, cambio({ estadoEsperado: original.estadoEntrega })).ok,
      ).toBe(false);
      expect(pedidos.obtener(codigo)).toBe(original);
    }
    expect(pedidos.hayCambiosEnvio()).toBe(false);
  });
  it('refleja la preparación y el envío en Pagos y en los contadores del listado', () => {
    expect(pedidos.resumen.porPreparar).toBe(2);
    pedidos.registrarEntrega('SOHO-000124', cambio());
    expect(pagos.obtener('SOHO-000124')!.pedido.estadoEntrega).toBe('en-preparacion');
    expect(pedidos.resumen.porPreparar).toBe(2);
    pedidos.registrarEntrega(
      'SOHO-000124',
      cambio({
        accion: 'enviar',
        estadoEsperado: 'en-preparacion',
        empresa: 'Courier',
        seguimiento: 'DEMO-124',
      }),
    );
    expect(pagos.obtener('SOHO-000124')!.pedido).toBe(pedidos.obtener('SOHO-000124'));
    expect(pagos.obtener('SOHO-000124')!.pedido.estadoEntrega).toBe('enviado');
    expect(pedidos.resumen.porPreparar).toBe(1);
    const actual = pedidos.obtener('SOHO-000124')!;
    expect(envios.proyectar(envios.proyectar(actual)).eventos).toHaveLength(actual.eventos.length);
  });
  it('prepara un pago recién aprobado y restablece solo envíos sin perder su aprobación', () => {
    pagos.revisar('SOHO-000128', {
      accion: 'aprobado',
      comprobanteId: 'SOHO-000128-v1',
      confirmado: true,
      motivo: '',
      mensaje: '',
      solicitud: 'legible',
    });
    const aprobado = pedidos.obtener('SOHO-000128')!;
    expect(pedidos.registrarEntrega(aprobado.codigo, cambio()).ok).toBe(true);
    pedidos.restablecerEnvios();
    expect(pedidos.obtener(aprobado.codigo)!.estadoPago).toBe('aprobado');
    expect(pedidos.obtener(aprobado.codigo)!.estadoEntrega).toBe('confirmado');
    expect(pedidos.obtener(aprobado.codigo)!.eventos).toEqual(aprobado.eventos);
    expect(pedidos.hayCambiosEnvio()).toBe(false);
  });
  it('el restablecimiento global de pagos también elimina los envíos simulados', () => {
    pedidos.registrarEntrega('SOHO-000124', cambio());
    pagos.restablecer();
    expect(pedidos.obtener('SOHO-000124')).toBe(PEDIDOS_ADMIN_DEMO[4]);
    expect(pedidos.hayCambiosEnvio()).toBe(false);
    expect(new EnviosAdministracion().hayCambios()).toBe(false);
  });
});
