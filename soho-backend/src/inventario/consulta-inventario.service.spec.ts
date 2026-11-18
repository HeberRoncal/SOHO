import { ConsultaInventarioService } from './consulta-inventario.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { EscrituraAutorizadaService } from '../autenticacion/seguridad/escritura-autorizada.service.js';
import type { ContextoAuth } from '../autenticacion/sesiones/contexto-auth.js';
import { ConsultaVariantes } from './dto/consulta-variantes.js';
describe('Consulta de variantes', () => {
  it('pagina y autoriza antes de leer', async () => {
    const orden: string[] = [],
      tx = {
        variante: {
          count: vi.fn(async (_q: unknown) => {
            orden.push('leer');
            return 30;
          }),
          findMany: vi.fn(async () => []),
        },
      };
    const prisma = {
        $transaction: vi.fn(async (fn: (v: unknown) => Promise<unknown>) =>
          fn(tx),
        ),
      },
      escritura = {
        comprobarSesion: vi.fn(async () => {
          orden.push('autorizar');
        }),
      };
    const c = new ConsultaInventarioService(
      prisma as unknown as PrismaService,
      escritura as unknown as EscrituraAutorizadaService,
    );
    expect(
      await c.listar(
        ConsultaVariantes.leer({
          pagina: '2',
          limite: '10',
          busqueda: '100%_',
        }),
        {} as ContextoAuth,
      ),
    ).toEqual({
      variantes: [],
      paginacion: { pagina: 2, limite: 10, total: 30, paginas: 3 },
    });
    expect(orden).toEqual(['autorizar', 'leer']);
    expect(tx.variante.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
    expect(tx.variante.count.mock.calls[0][0]).toMatchObject({
      where: {
        AND: [
          { OR: expect.arrayContaining([{ sku: { contains: '100\\%\\_' } }]) },
        ],
      },
    });
  });
});
