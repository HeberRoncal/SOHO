import type { PrismaClient } from '../../generated/prisma/client.js';
import { ConvertirCatalogo, huellaManifiesto } from './convertir-catalogo.js';
import type { PlanCorrespondencia } from './modelos-correspondencia/modelos-correspondencia.interface.js';

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
