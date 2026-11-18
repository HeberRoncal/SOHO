import { MovimientosInventarioService } from './movimientos-inventario.service.js';
import type { EscrituraAutorizadaService } from '../autenticacion/seguridad/escritura-autorizada.service.js';
import type { InventarioReservadoService } from './reservas/inventario-reservado.service.js';
import type { ContextoAuth } from '../autenticacion/sesiones/contexto-auth.js';
describe('Fronteras de escrituras manuales', () => {
  it('rechaza campos protegidos antes de la transacción', async () => {
    const escritura = { transaccion: vi.fn() };
    const c = new MovimientosInventarioService(
      escritura as unknown as EscrituraAutorizadaService,
      {} as InventarioReservadoService,
    );
    await expect(
      c.registrar('id', { origen: 'ENVIO_PEDIDO' }, {} as ContextoAuth),
    ).rejects.toThrow();
    expect(escritura.transaccion).not.toHaveBeenCalled();
  });
  it('oculta operaciones ajenas', async () => {
    const tx = {
        movimientoInventario: {
          findUnique: vi.fn(async () => ({
            usuarioResponsableId: 'otro',
            respuesta: { dato: 'privado' },
            origen: 'MANUAL',
          })),
        },
      },
      e = {
        transaccion: async (fn: (v: unknown) => Promise<unknown>) => fn(tx),
        comprobarSesion: vi.fn(),
      };
    const c = new MovimientosInventarioService(
      e as unknown as EscrituraAutorizadaService,
      {} as InventarioReservadoService,
    );
    await expect(
      c.operacion('clave', { usuario: { id: 'admin' } } as ContextoAuth),
    ).rejects.toMatchObject({ status: 404 });
    expect(e.comprobarSesion).toHaveBeenCalled();
  });
});
