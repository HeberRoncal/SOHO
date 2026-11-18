import {
  detalleRecepcion,
  listadoRecepciones,
  resultadoRecepcion,
  recepcionAdmin,
  decisionRecepcionGuardada,
  uuidRecepcion,
} from './recepcion-admin';
import {
  ID_COMPROBANTE,
  ID_OPERACION,
  ID_RECEPCION,
  detalleRecepcionFixture,
  listadoRecepcionesFixture,
  recepcionFixture,
  resultadoRecepcionFixture,
} from './recepciones.fixtures';

describe('Contrato administrativo de recepciones', () => {
  it('admite el límite de cien unidades del contrato compartido', () => {
    const r = recepcionFixture(),
      a = r.instruccion.verificacion.articulos[0];
    a.cantidad = 100;
    a.importe = '9999.00';
    r.instruccion.importeReferencia = '9999.00';
    r.instruccion.verificacion.subtotal = '9999.00';
    r.instruccion.verificacion.total = '9999.00';
    expect(recepcionAdmin(r).articulos[0].cantidad).toBe(100);
  });
  it('conserva importes decimales, ceros del número y gratuidad de La Esperanza', () => {
    const r = recepcionAdmin(recepcionFixture());
    expect(r.total).toBe('199.98');
    expect(r.costoEnvio).toBe('0.00');
    expect(r.plazoEntrega).toBeNull();
    expect(r.comprobante.numeroOperacion).toBe('001234');
    expect(r.articulos[0].sku).toBe('NK-AF107-BL-40P5');
  });
  it('usa los conteos globales independientemente de la página filtrada', () => {
    const r = listadoRecepciones(listadoRecepcionesFixture());
    expect(r.filas.length).toBe(1);
    expect(r.resumen.REQUIERE_ATENCION).toBe(9);
  });
  it.each(['id', 'estado', 'version', 'creadoEn'])(
    'rechaza un campo de recepción inválido: %s',
    (campo) => {
      const r: Record<string, unknown> = recepcionFixture();
      r[campo] = null;
      expect(() => recepcionAdmin(r)).toThrow();
    },
  );
  it('rechaza dinero enviado como número y totales incoherentes', () => {
    const r = recepcionFixture();
    r.instruccion.verificacion.total = '1.00';
    expect(() => recepcionAdmin(r)).toThrow();
    expect(() =>
      recepcionAdmin({
        ...recepcionFixture(),
        instruccion: { ...recepcionFixture().instruccion, importeReferencia: 199.98 },
      }),
    ).toThrow();
  });
  it('no habilita acciones sobre capacidades contradictorias', () => {
    const d = detalleRecepcionFixture();
    d.diagnostico.condicionesOriginales.apto = false;
    d.diagnostico.condicionesOriginales.motivos = ['STOCK_INSUFICIENTE'];
    expect(() => detalleRecepcion(d)).toThrow();
  });
  it('rechaza versiones repetidas o un comprobante actual que falta', () => {
    const d = detalleRecepcionFixture();
    d.comprobantes.push(d.comprobantes[0]);
    expect(() => detalleRecepcion(d)).toThrow();
    d.comprobantes = [];
    expect(() => detalleRecepcion(d)).toThrow();
  });
  it('rechaza paginación incoherente y estados desconocidos', () => {
    const d = listadoRecepcionesFixture();
    d.paginacion.paginas = 2;
    expect(() => listadoRecepciones(d)).toThrow();
    d.paginacion.paginas = 1;
    d.recepciones[0].estado = 'PAGADO';
    expect(() => listadoRecepciones(d)).toThrow();
  });
  it('no admite otra recepción ni otra clave en una operación recuperada', () => {
    const r = resultadoRecepcionFixture(ID_OPERACION);
    expect(() =>
      resultadoRecepcion(r, ID_COMPROBANTE, ID_OPERACION, 'REGISTRAR_PEDIDO', false),
    ).toThrow();
    expect(() =>
      resultadoRecepcion(r, ID_RECEPCION, ID_COMPROBANTE, 'REGISTRAR_PEDIDO', false),
    ).toThrow();
  });
  it('distingue 202 de confirmación y valida la acción recuperada', () => {
    const r = resultadoRecepcionFixture(ID_OPERACION);
    expect(() =>
      resultadoRecepcion(r, ID_RECEPCION, ID_OPERACION, 'REGISTRAR_PEDIDO', true),
    ).toThrow();
    expect(() =>
      resultadoRecepcion(r, ID_RECEPCION, ID_OPERACION, 'SOLICITAR_CORRECCION', false),
    ).toThrow();
  });
  it('valida el pedido duplicado en la respuesta de registro', () => {
    const r = resultadoRecepcionFixture(ID_OPERACION);
    r.pedido = null;
    expect(() =>
      resultadoRecepcion(r, ID_RECEPCION, ID_OPERACION, 'REGISTRAR_PEDIDO', false),
    ).toThrow();
  });
  it('solo recupera cuerpos completos sin campos ni rutas alternativas', () => {
    const cuerpo = {
      claveSolicitud: ID_OPERACION,
      versionEsperada: 3,
      comprobanteActualId: ID_COMPROBANTE,
      motivo: 'Revisado por el equipo',
      confirmado: true,
      aceptarCondicionesOriginales: true,
    };
    expect(Object.isFrozen(decisionRecepcionGuardada(cuerpo, 'REGISTRAR_PEDIDO'))).toBe(true);
    expect(() =>
      decisionRecepcionGuardada({ ...cuerpo, ruta: '/api/otra' }, 'REGISTRAR_PEDIDO'),
    ).toThrow();
    expect(() =>
      decisionRecepcionGuardada(
        { ...cuerpo, aceptarCondicionesOriginales: false },
        'REGISTRAR_PEDIDO',
      ),
    ).toThrow();
  });
  it.each(['../otra', '', '11111111-1111-1111-1111-111111111111'])(
    'rechaza identificador inseguro %s',
    (id) => expect(() => uuidRecepcion(id)).toThrow(),
  );
});
