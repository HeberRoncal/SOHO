import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { ConvertirCatalogo, huellaManifiesto } from './convertir-catalogo.js';
import type { PlanCorrespondencia } from './modelos-correspondencia/modelos-correspondencia.interface.js';
import { PlanCorrespondenciaProductos } from './plan-correspondencia-productos/plan-correspondencia-productos.js';

describe('ConvertirCatalogo', () => {
  it('rechaza un formato inválido antes de abrir una transacción', async () => {
    const transaccion = vi.fn();
    const cliente = { $transaction: transaccion } as unknown as PrismaClient;
    await expect(
      new ConvertirCatalogo().aplicar(cliente, {} as PlanCorrespondencia),
    ).rejects.toThrow('Formato');
    expect(transaccion).not.toHaveBeenCalled();
  });
  it('reconoce la misma revisión aunque cambie el orden de claves JSON', () => {
    expect(huellaManifiesto({ b: 2, a: { c: 1 } })).toBe(
      huellaManifiesto({ a: { c: 1 }, b: 2 }),
    );
  });
  it('distingue un destino o un orden de fotos alterado', () => {
    expect(huellaManifiesto({ destino: 'a', fotos: ['a', 'b'] })).not.toBe(
      huellaManifiesto({ destino: 'b', fotos: ['a', 'b'] }),
    );
    expect(huellaManifiesto({ fotos: ['a', 'b'] })).not.toBe(
      huellaManifiesto({ fotos: ['b', 'a'] }),
    );
  });
});

describe('Conversión: aislamiento por motor', () => {
  it.each([
    ['8.0.11-TiDB-v8.5.0', 'RepeatableRead'],
    ['8.4.0', 'Serializable'],
  ])(
    'selecciona el aislamiento compatible con %s',
    async (version, esperado) => {
      const detener = new Error('No ejecutar escrituras en esta prueba');
      const transaccion = vi.fn().mockRejectedValue(detener);
      const prisma = {
        $queryRaw: vi.fn().mockResolvedValue([{ version }]),
        $transaction: transaccion,
      } as unknown as PrismaClient;
      const plan = new PlanCorrespondenciaProductos().crear({
        version: 1,
        productos: [],
      });
      expect(plan.aptoParaRevision).toBe(true);
      expect(plan.ultimoNumeroPropuesto).toBe(0);
      await expect(new ConvertirCatalogo().aplicar(prisma, plan)).rejects.toBe(
        detener,
      );
      expect(transaccion).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: esperado,
        timeout: 120000,
        maxWait: 10000,
      });
    },
  );
});
