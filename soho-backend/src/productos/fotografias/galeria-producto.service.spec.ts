import { GaleriaProductoService } from './galeria-producto.service.js';
import type { ArchivosProductoService } from './archivos-producto.service.js';
import type { ContextoAuth } from '../../autenticacion/sesiones/contexto-auth.js';
describe('Guardado de galerías', () => {
  it('rechaza galerías inválidas sin abrir transacciones', async () => {
    const archivos = { escritura: { transaccion: vi.fn() } };
    await expect(
      new GaleriaProductoService(
        archivos as unknown as ArchivosProductoService,
      ).actualizar('id', { imagenes: [] }, {} as ContextoAuth),
    ).rejects.toThrow();
    expect(archivos.escritura.transaccion).not.toHaveBeenCalled();
  });
});
