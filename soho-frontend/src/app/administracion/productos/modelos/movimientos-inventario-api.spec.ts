import {
  listaVariantesInventario,
  resultadoMovimiento,
  solicitudMovimiento,
  varianteInventario,
} from './movimientos-inventario-api';
import {
  datosMovimientoFixture,
  ID_ADMIN_MOVIMIENTO,
  respuestaMovimientoFixture,
  varianteMovimientoFixture,
} from './movimientos-inventario.fixtures';
describe('Contratos del inventario remoto', () => {
  it('conserva UUID, SKU decimal y contadores de reservas', () => {
    expect(varianteInventario(varianteMovimientoFixture())).toEqual(varianteMovimientoFixture());
  });
  it.each([
    { versionExistencias: 0 },
    { versionExistencias: '1' },
    { existencias: -1 },
    { disponible: 4 },
    { faltante: 1 },
    { habilitada: 'true' },
    { talla: '40.3' },
    { talla: '48.5' },
    { sistemaTallas: 'US' },
  ])('rechaza variante incoherente %j', (c) => {
    expect(() => varianteInventario({ ...varianteMovimientoFixture(), ...c })).toThrow();
  });
  it('admite deficit parcial y variantes deshabilitadas', () => {
    expect(
      varianteInventario({
        ...varianteMovimientoFixture(),
        existencias: 1,
        disponible: 0,
        faltante: 1,
      }),
    ).toMatchObject({ cantidadReservada: 2, faltante: 1 });
    expect(
      varianteInventario({ ...varianteMovimientoFixture(), habilitada: false, disponible: 0 }),
    ).toMatchObject({ disponible: 0, existencias: 5 });
  });
  it.each([
    ['entrada', 'sumar', 2],
    ['salida', 'sumar', -2],
    ['ajuste', 'sumar', 2],
    ['ajuste', 'restar', -2],
  ] as const)('convierte %s/%s al delta %s', (tipo, sentido, cantidad) => {
    const r = solicitudMovimiento(varianteMovimientoFixture(), {
      ...datosMovimientoFixture(),
      tipo,
      sentido,
    });
    expect(r).toMatchObject({
      cantidad,
      tipo: tipo.toUpperCase(),
      reservadoEsperado: 2,
      versionExistencias: 1,
      referencia: '00123',
    });
    expect(r).not.toHaveProperty('sku');
    expect(r).not.toHaveProperty('saldo');
  });
  it('rechaza páginas o listados incoherentes', () => {
    expect(() =>
      listaVariantesInventario({
        variantes: [varianteMovimientoFixture(), varianteMovimientoFixture()],
        paginacion: { pagina: 1, limite: 20, total: 2, paginas: 1 },
      }),
    ).toThrow();
  });
  it('valida el resultado contra solicitud e identidad del responsable', () => {
    const v = varianteMovimientoFixture(),
      cuerpo = solicitudMovimiento(v, datosMovimientoFixture()),
      p = { varianteId: v.id, cuerpo, incierto: false },
      r = respuestaMovimientoFixture(cuerpo);
    expect(resultadoMovimiento(r, p, ID_ADMIN_MOVIMIENTO).movimiento.saldo).toBe(7);
    expect(() =>
      resultadoMovimiento(
        { ...r, operacion: { ...r.operacion, claveSolicitud: crypto.randomUUID() } },
        p,
        ID_ADMIN_MOVIMIENTO,
      ),
    ).toThrow();
    expect(() => resultadoMovimiento(r, p, crypto.randomUUID())).toThrow();
    expect(() =>
      resultadoMovimiento(
        { ...r, variante: { ...r.variante, versionExistencias: 1 } },
        p,
        ID_ADMIN_MOVIMIENTO,
      ),
    ).toThrow();
  });
});
