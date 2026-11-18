import { adaptarPedido, adaptarEnvio } from './contrato-pedidos';
import { pedidoApi } from '../servicios/pedidos-api.fixtures';

const envio = () => ({
  preparacionIniciadaEn: '2026-11-14T13:00:00.000Z',
  transportista: 'Reparto SOHO',
  referenciaSeguimiento: '000123',
  despachadoEn: '2026-11-14T14:00:00.000Z',
  entregadoEn: '2026-11-14T15:00:00.000Z',
});
describe('Contrato público del seguimiento', () => {
  it('conserva fechas y ceros y excluye notas y empleados incluso si llegan por error', () => {
    const p = adaptarPedido({
      ...pedidoApi(),
      envio: { ...envio(), nota: 'Privada', despachadoPorId: 'admin' },
      responsablesEnvio: { despacho: { id: 'admin', nombre: 'Sofía' } },
      eventosInternos: [{ descripcion: 'Privada' }],
    });
    expect(p.envio).toEqual(envio());
    expect(Object.isFrozen(p.envio)).toBe(true);
    expect(JSON.stringify(p)).not.toMatch(/Privada|despachadoPorId|responsablesEnvio|Sofía/);
  });
  it('admite un pedido en preparación sin inventar transportista ni fechas', () => {
    expect(
      adaptarEnvio({
        ...envio(),
        transportista: null,
        referenciaSeguimiento: null,
        despachadoEn: null,
        entregadoEn: null,
      }),
    ).toMatchObject({ transportista: null, despachadoEn: null, entregadoEn: null });
    expect(adaptarEnvio(null)).toBeNull();
  });
  it.each([
    { preparacionIniciadaEn: 'inválida' },
    { despachadoEn: '2026-11-14T12:00:00.000Z' },
    { entregadoEn: '2026-11-14T13:30:00.000Z' },
    { transportista: null },
    { referenciaSeguimiento: 123 },
    { referenciaSeguimiento: 'a'.repeat(81) },
    { transportista: 'SO\u0000HO' },
    { despachadoEn: null },
  ])('rechaza seguimiento incompleto o fechas incoherentes: %j', (invalido) => {
    expect(() => adaptarEnvio({ ...envio(), ...invalido })).toThrow();
  });
});
