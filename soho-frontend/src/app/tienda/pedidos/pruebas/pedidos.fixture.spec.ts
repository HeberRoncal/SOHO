import { proveerCoberturaPrueba } from '../../finalizar-compra/pruebas/cobertura.fixture';
import { proveerCatalogoPrueba } from '../../catalogo/pruebas/catalogo.fixture';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { PedidosPrueba as PedidosDemostracion } from './pedidos.fixture';
import { Carrito } from '../../carrito/servicios/carrito';
import { ALMACENAMIENTO_CARRITO } from '../../carrito/servicios/carrito-local';
import { CoberturaEntrega } from '../../finalizar-compra/servicios/cobertura-entrega';
import { DatosEntrega } from '../../finalizar-compra/modelos/datos-entrega';
import { ComprobantePago } from '../modelos/comprobante-pago';
import { Cuenta } from '../../cuenta/servicios/cuenta';
import { PerfilCuenta } from '../../cuenta/modelos/cuenta';

// La vista elige sus datos de prueba; la fuente predeterminada de la app es la API.
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [proveerCatalogoPrueba()] });
});

// Las tarifas de esta vista son fixtures; la cobertura de la app siempre procede de la API.
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [proveerCoberturaPrueba()] });
});

describe('PedidosDemostracion', () => {
  let servicio: PedidosDemostracion;
  const perfil = signal<PerfilCuenta | null>(null);

  beforeEach(() => {
    perfil.set(null);
    TestBed.configureTestingModule({
      providers: [
        { provide: ALMACENAMIENTO_CARRITO, useValue: null },
        { provide: Cuenta, useValue: { perfil } },
      ],
    });
    servicio = TestBed.inject(PedidosDemostracion);
  });

  it('debe estar disponible', () => {
    expect(servicio).toBeTruthy();
  });
  it('Mi cuenta solo lista los pedidos creados con la sesión de ese cliente', () => {
    TestBed.inject(Carrito).agregar('NK-AF107-BL-40', 1);
    const invitado = servicio.registrar(datos, 'Yape', comprobante);
    expect(invitado.correcto).toBe(true);
    perfil.set({
      id: 'cliente-prueba',
      nombres: 'Ana',
      apellidos: 'Prueba',
      correo: 'ana@example.test',
      celular: '',
      verificado: true,
      proveedor: 'correo',
    });
    expect(servicio.listarMios()).toEqual([]);
    const propio = servicio.registrar(
      { ...datos, correo: 'ana@example.test' },
      'Plin',
      comprobante,
    );
    expect(propio.correcto).toBe(true);
    expect(servicio.listarMios()).toHaveLength(1);
    perfil.set(null);
    expect(servicio.listarMios()).toEqual([]);
    if (propio.correcto) {
      expect(servicio.obtener(propio.pedido.codigo)).toBeUndefined();
      expect(servicio.obtenerVistaPrevia(propio.pedido.codigo)).toBeUndefined();
    }
  });
  const datos: DatosEntrega = {
    nombres: 'Ana',
    apellidos: 'Pérez',
    correo: 'ana@ejemplo.com',
    celular: '987654321',
    distrito: 'trujillo',
    direccion: 'Calle Los Pinos 123',
    referencia: '',
  };
  const comprobante: ComprobantePago = {
    nombreArchivo: 'prueba.png',
    tipoArchivo: 'image/png',
    tamanoBytes: 70,
    vistaPrevia: 'data:image/png;base64,prueba',
  };

  it('debe conservar el distrito, la dirección, los importes y los dos estados separados', () => {
    const carrito = TestBed.inject(Carrito);
    carrito.agregar('NK-AF107-BL-40', 2);
    const resultado = servicio.registrar(datos, 'Yape', comprobante);
    expect(resultado.correcto).toBe(true);
    if (!resultado.correcto) throw new Error(resultado.mensaje);
    const pedido = resultado.pedido;
    expect(pedido.subtotal).toBe(1059.8);
    expect(pedido.total).toBe(1065.8);
    expect(pedido.entrega.costo).toBe(6);
    expect(pedido.datos.direccion).toBe(datos.direccion);
    expect(pedido.estadoPago).toBe('pendiente');
    expect(pedido.estadoPreparacion).toBe('pendiente');
    expect(carrito.unidades()).toBe(2);
    expect(servicio.obtener(pedido.codigo)).toBe(pedido);
    expect(pedido.comprobante).not.toHaveProperty('vistaPrevia');
    vi.spyOn(TestBed.inject(CoberturaEntrega), 'cotizar').mockReturnValue({
      distrito: 'trujillo',
      nombreDistrito: 'Trujillo',
      costo: 30,
    });
    carrito.cambiarCantidad('NK-AF107-BL-40', 1);
    expect(pedido.total).toBe(1065.8);
    expect(pedido.articulos[0].cantidad).toBe(2);
    expect(pedido.entrega.costo).toBe(6);
    expect(Object.isFrozen(pedido.articulos[0])).toBe(true);
  });

  it('debe conservar gratis La Esperanza y bloquear una cobertura inválida al registrar', () => {
    TestBed.inject(Carrito).agregar('NK-AF107-BL-40', 1);
    const gratuito = servicio.registrar(
      { ...datos, distrito: 'la-esperanza' },
      'Plin',
      comprobante,
    );
    expect(gratuito.correcto && gratuito.pedido.total).toBe(529.9);
    expect(servicio.registrar({ ...datos, distrito: 'moche' }, 'Yape', comprobante).correcto).toBe(
      false,
    );
    expect(
      servicio.registrar({ ...datos, distrito: 'desconocido' }, 'Yape', comprobante).correcto,
    ).toBe(false);
  });

  it('debe rechazar un carrito vacío o con stock insuficiente, datos inválidos y comprobantes no permitidos', () => {
    expect(servicio.registrar(datos, 'Yape', comprobante).correcto).toBe(false);
    const carrito = TestBed.inject(Carrito);
    carrito.agregar('NK-AF107-BL-40', 1);
    expect(servicio.registrar({ ...datos, celular: '1' }, 'Yape', comprobante).correcto).toBe(
      false,
    );
    expect(
      servicio.registrar(datos, 'Yape', { ...comprobante, tipoArchivo: 'application/pdf' })
        .correcto,
    ).toBe(false);
    expect(
      servicio.registrar(datos, 'Yape', { ...comprobante, tamanoBytes: 6 * 1024 * 1024 }).correcto,
    ).toBe(false);
    expect(servicio.registrar(datos, 'Yape', { ...comprobante, vistaPrevia: '' }).correcto).toBe(
      false,
    );
    vi.spyOn(carrito, 'puedeContinuar').mockReturnValue(false);
    expect(servicio.registrar(datos, 'Yape', comprobante).correcto).toBe(false);
  });
  it('aplica el cupón al producto y conserva la tarifa del distrito y el envío gratuito', () => {
    TestBed.inject(Carrito).agregar('NK-AF107-BL-40', 1);
    const pago = { ...comprobante, numeroOperacion: '12345678' };
    const local = servicio.registrar(datos, 'Yape', pago, 'DEMO10');
    expect(local.correcto).toBe(true);
    if (!local.correcto) throw new Error(local.mensaje);
    expect(local.pedido.descuento).toBe(52.99);
    expect(local.pedido.entrega.costo).toBe(6);
    expect(local.pedido.total).toBe(482.91);
    expect(local.pedido.comprobante.numeroOperacion).toBe('12345678');
    expect(servicio.obtenerVistaPrevia(local.pedido.codigo)).toBe(comprobante.vistaPrevia);
    const gratis = servicio.registrar(
      { ...datos, distrito: 'la-esperanza' },
      'Plin',
      pago,
      'DEMO10',
    );
    expect(gratis.correcto && gratis.pedido.total).toBe(476.91);
    expect(servicio.registrar(datos, 'Yape', pago, 'OTRO').correcto).toBe(false);
    expect(servicio.registrar(datos, 'Yape', { ...pago, numeroOperacion: 'abc' }).correcto).toBe(
      false,
    );
  });
  it('conserva la factura sin permitir que el formulario cambie el pedido registrado', () => {
    TestBed.inject(Carrito).agregar('NK-AF107-BL-40', 1);
    const facturacion = {
      tipo: 'factura' as const,
      documento: 'DNI' as const,
      numero: '',
      ruc: '20123456789',
      razonSocial: 'Empresa SAC',
      domicilioFiscal: 'Av. Perú 123',
    };
    const resultado = servicio.registrar({ ...datos, facturacion }, 'Yape', comprobante);
    expect(resultado.correcto).toBe(true);
    if (!resultado.correcto) throw new Error(resultado.mensaje);
    facturacion.razonSocial = 'Otra empresa';
    expect(resultado.pedido.datos.facturacion?.razonSocial).toBe('Empresa SAC');
    expect(Object.isFrozen(resultado.pedido.datos.facturacion)).toBe(true);
    expect(
      servicio.registrar(
        { ...datos, facturacion: { ...facturacion, ruc: '123' } },
        'Yape',
        comprobante,
      ).correcto,
    ).toBe(false);
  });
});
