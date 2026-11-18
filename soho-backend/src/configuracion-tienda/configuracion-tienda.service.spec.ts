import { ConfiguracionTiendaService } from './configuracion-tienda.service.js';
import type { EscrituraAutorizadaService } from '../autenticacion/seguridad/escritura-autorizada.service.js';
import type { ContextoAuth } from '../autenticacion/sesiones/contexto-auth.js';

describe('ConfiguracionTiendaService', () => {
  it('consulta la configuración con un bloqueo compatible con TiDB', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      configuracionTienda: {
        findUnique: vi.fn().mockResolvedValue({ versionActual: null }),
      },
    };
    const escritura = {
      transaccion: (operacion: (tx: unknown) => unknown) => operacion(tx),
      comprobarSesion: vi.fn().mockResolvedValue(undefined),
    };
    const servicio = new ConfiguracionTiendaService(
      escritura as unknown as EscrituraAutorizadaService,
    );
    const sesion: ContextoAuth = {
      sesionId: '22222222-2222-4222-8222-222222222222',
      usuario: {
        id: '11111111-1111-4111-8111-111111111111',
        nombres: 'Prueba',
        apellidos: 'Admin',
        correo: 'admin@soho.test',
        rol: 'ADMIN',
        correoVerificado: true,
      },
    };

    await servicio.consultar(sesion);

    expect(tx.$queryRaw).toHaveBeenCalledWith(
      expect.arrayContaining([
        'SELECT id FROM configuracion_tienda WHERE id=1 FOR UPDATE',
      ]),
    );
  });
});
