import { BorradoresProductoService } from './borradores-producto.service.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { EscrituraAutorizadaService } from '../../autenticacion/seguridad/escritura-autorizada.service.js';
import type { ContextoAuth } from '../../autenticacion/sesiones/contexto-auth.js';
describe('Servicio de borradores', () => {
  it('rechaza entradas inválidas antes de abrir una transacción', () => {
    const escritura = { transaccion: vi.fn() };
    const service = new BorradoresProductoService(
      {} as PrismaService,
      escritura as unknown as EscrituraAutorizadaService,
    );
    expect(() =>
      service.crear({ nombre: 'Sin clave' }, {} as ContextoAuth),
    ).toThrow();
    expect(escritura.transaccion).not.toHaveBeenCalled();
  });
  it('no consulta una operación cuando la sesión fue revocada', async () => {
    const tx = { operacionProducto: { findUnique: vi.fn() } },
      escritura = {
        transaccion: (f: (tx: unknown) => unknown) => f(tx),
        comprobarSesion: vi.fn().mockRejectedValue(new Error('Revocada')),
      };
    const service = new BorradoresProductoService(
      {} as PrismaService,
      escritura as unknown as EscrituraAutorizadaService,
    );
    await expect(
      service.consultarOperacion('clave', {} as ContextoAuth),
    ).rejects.toThrow('Revocada');
    expect(tx.operacionProducto.findUnique).not.toHaveBeenCalled();
  });
});
