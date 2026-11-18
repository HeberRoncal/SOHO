import { Logger } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { EscrituraPedidoService } from '../seguridad/escritura-pedido.service.js';
import type { InventarioReservadoService } from '../../inventario/reservas/inventario-reservado.service.js';
import { VencimientosReservasService } from './vencimientos-reservas.service.js';

describe('Lotes de vencimiento', () => {
  const buscar = vi.fn();
  let servicio: VencimientosReservasService;
  const candidata = (id: string, codigo: string) => ({
    id,
    venceEn: new Date('2026-01-01'),
    articulo: { pedido: { codigo } },
  });
  beforeEach(() => {
    buscar.mockReset();
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    servicio = new VencimientosReservasService(
      { reservaInventario: { findMany: buscar } } as unknown as PrismaService,
      {} as EscrituraPedidoService,
      {} as InventarioReservadoService,
    );
  });
  afterEach(() => vi.restoreAllMocks());
  it('agrupa artículos del mismo pedido y continúa después de una inconsistencia', async () => {
    buscar.mockResolvedValue([
      candidata('1', 'A'),
      candidata('2', 'A'),
      candidata('3', 'B'),
    ]);
    const atender = vi
      .spyOn(servicio, 'procesarPedido')
      .mockRejectedValueOnce(Error('inconsistente'))
      .mockResolvedValueOnce(1);
    expect(await servicio.procesarLote()).toEqual({
      atendidas: 1,
      fallidas: 1,
    });
    expect(atender.mock.calls).toEqual([['A'], ['B']]);
  });
  it('avanza por fecha e id y vuelve al inicio al terminar para reintentar fallos', async () => {
    buscar
      .mockResolvedValueOnce([candidata('1', 'A')])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    vi.spyOn(servicio, 'procesarPedido').mockRejectedValue(Error('fallo'));
    await servicio.procesarLote();
    await servicio.procesarLote();
    await servicio.procesarLote();
    expect(buscar.mock.calls[1][0].where.OR).toEqual([
      { venceEn: { gt: new Date('2026-01-01') } },
      { venceEn: new Date('2026-01-01'), id: { gt: '1' } },
    ]);
    expect(buscar.mock.calls[2][0].where.OR).toBeUndefined();
  });
  it('no oculta fallos al consultar candidatas ni avanza su cursor', async () => {
    buscar
      .mockRejectedValueOnce(Error('sin conexión'))
      .mockResolvedValueOnce([]);
    await expect(servicio.procesarLote()).rejects.toThrow('sin conexión');
    await servicio.procesarLote();
    expect(buscar.mock.calls[1][0].where.OR).toBeUndefined();
  });
});
