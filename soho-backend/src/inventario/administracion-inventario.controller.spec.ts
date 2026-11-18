import { AdministracionInventarioController } from './administracion-inventario.controller.js';
import type { ConsultaInventarioService } from './consulta-inventario.service.js';
import type { MovimientosInventarioService } from './movimientos-inventario.service.js';
import type { PeticionAuth } from '../autenticacion/sesiones/contexto-auth.js';
const id = '12345678-1234-1234-1234-123456789ABC';
describe('Rutas de inventario', () => {
  const consulta = { listar: vi.fn(), detalle: vi.fn() },
    movimientos = { registrar: vi.fn(), operacion: vi.fn() },
    req = { autenticacion: { sesionId: 's' } } as PeticionAuth;
  const c = new AdministracionInventarioController(
    consulta as unknown as ConsultaInventarioService,
    movimientos as unknown as MovimientosInventarioService,
  );
  beforeEach(() => vi.clearAllMocks());
  it('normaliza UUID y utiliza la sesión del guard', async () => {
    await c.registrar(id, {}, { datos: 1 }, req);
    expect(movimientos.registrar).toHaveBeenCalledWith(
      id.toLowerCase(),
      { datos: 1 },
      req.autenticacion,
    );
  });
  it('valida la búsqueda', async () => {
    await c.listar({ pagina: '2' }, req);
    expect(consulta.listar).toHaveBeenCalledWith(
      expect.objectContaining({ pagina: 2 }),
      req.autenticacion,
    );
  });
  it.each([
    () => c.registrar(id, { extra: 'x' }, {}, req),
    () => c.detalle(id, { extra: 'x' }, req),
    () => c.operacion(id, { extra: 'x' }, req),
    () => c.detalle('SHO-001', {}, req),
  ])('rechaza parámetros antes de ejecutar', (fn) => {
    expect(fn).toThrow();
    expect(consulta.detalle).not.toHaveBeenCalled();
    expect(movimientos.operacion).not.toHaveBeenCalled();
    expect(movimientos.registrar).not.toHaveBeenCalled();
  });
});
