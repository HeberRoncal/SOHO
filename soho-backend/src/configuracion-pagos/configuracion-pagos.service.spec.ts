import { ConfiguracionPagosService } from './configuracion-pagos.service.js';
import type { EscrituraAutorizadaService } from '../autenticacion/seguridad/escritura-autorizada.service.js';
import type { ConfiguracionCloudinary } from '../productos/fotografias/configuracion-cloudinary.js';
import type { ContextoAuth } from '../autenticacion/sesiones/contexto-auth.js';
import { DatosPagos } from './dto/datos-pagos.js';

const sesion = {
  usuario: { id: '11111111-1111-4111-8111-111111111111' },
} as ContextoAuth;
const qr = '33333333-3333-4333-8333-333333333333';
function entorno(activo = true) {
  const metodos = [
    {
      metodo: 'YAPE',
      activo,
      celular: '987654321',
      titular: 'SOHO pruebas',
      archivoQrId: null,
      archivoQr: null,
    },
    {
      metodo: 'PLIN',
      activo: false,
      celular: null,
      titular: null,
      archivoQrId: null,
      archivoQr: null,
    },
  ];
  const control = {
    versionActual: {
      numero: 1,
      creadoEn: new Date('2026-11-17T12:00:00Z'),
      responsable: {
        id: sesion.usuario.id,
        nombres: 'Ana',
        apellidos: 'Prueba',
      },
      metodos,
    },
  };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    configuracionPagos: {
      findUnique: vi.fn().mockImplementation(async () => control),
      update: vi.fn().mockResolvedValue({}),
    },
    archivoQrPago: { findUnique: vi.fn() },
    versionConfiguracionPagos: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(async (args) => {
        control.versionActual = {
          ...control.versionActual,
          numero: args.data.numero,
          metodos: args.data.metodos.create.map((m: object) => ({
            ...m,
            archivoQr: null,
          })),
        };
        return { id: 'version-nueva' };
      }),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  const escritura = {
    transaccion: (fn: (tx: unknown) => unknown) => fn(tx),
    comprobarSesion: vi.fn().mockResolvedValue(undefined),
  };
  const servicio = new ConfiguracionPagosService(
    escritura as unknown as EscrituraAutorizadaService,
    { habilitada: false } as ConfiguracionCloudinary,
  );
  const cuerpo = {
    claveSolicitud: '44444444-4444-4444-8444-444444444444',
    versionEsperada: 1,
    confirmado: true,
    metodos: metodos.map((m) => ({
      metodo: m.metodo,
      activo: m.activo,
      celular: m.celular,
      titular: m.titular,
      qrId: null as string | null,
    })),
  };
  return { servicio, cuerpo, tx };
}
describe('Pagos: desactivar antes de editar los receptores', () => {
  it('consulta la configuración con un bloqueo compatible con TiDB', async () => {
    const { servicio, tx } = entorno();

    await servicio.consultar(sesion);

    expect(tx.$queryRaw).toHaveBeenCalledWith(
      expect.arrayContaining([
        'SELECT id FROM configuracion_pagos WHERE id=1 FOR UPDATE',
      ]),
    );
  });

  it.each(['celular', 'titular', 'qrId'] as const)(
    'rechaza cambiar %s mientras Yape sigue activo',
    async (campo) => {
      const { servicio, cuerpo, tx } = entorno();
      Object.assign(cuerpo.metodos[0], {
        [campo]:
          campo === 'celular'
            ? '999888777'
            : campo === 'titular'
              ? 'Otro receptor'
              : qr,
      });
      await expect(servicio.actualizar(cuerpo, sesion)).rejects.toThrow(
        'Desactiva primero',
      );
      expect(tx.versionConfiguracionPagos.create).not.toHaveBeenCalled();
    },
  );
  it('también rechaza editar y desactivar en una sola solicitud', async () => {
    const { servicio, cuerpo, tx } = entorno();
    cuerpo.metodos[0].activo = false;
    cuerpo.metodos[0].titular = 'Otro receptor';
    await expect(servicio.actualizar(cuerpo, sesion)).rejects.toThrow(
      'Desactiva primero',
    );
    expect(tx.versionConfiguracionPagos.create).not.toHaveBeenCalled();
  });
  it('permite desactivar conservando los receptores existentes', async () => {
    const { servicio, cuerpo, tx } = entorno();
    cuerpo.metodos[0].activo = false;
    await expect(servicio.actualizar(cuerpo, sesion)).resolves.toMatchObject({
      configuracion: {
        version: 2,
        metodos: expect.arrayContaining([
          expect.objectContaining({
            metodo: 'YAPE',
            activo: false,
            titular: 'SOHO pruebas',
          }),
        ]),
      },
    });
    expect(tx.versionConfiguracionPagos.create).toHaveBeenCalledOnce();
  });
  it('permite editar y activar un método que ya estaba desactivado', async () => {
    const { servicio, cuerpo } = entorno(false);
    cuerpo.metodos[0].titular = 'Nuevo titular';
    cuerpo.metodos[0].activo = true;
    await expect(servicio.actualizar(cuerpo, sesion)).resolves.toMatchObject({
      configuracion: {
        metodos: expect.arrayContaining([
          expect.objectContaining({
            metodo: 'YAPE',
            activo: true,
            titular: 'Nuevo titular',
          }),
        ]),
      },
    });
  });
  it('recupera una repetición confirmada antes de aplicar las reglas al estado vigente', async () => {
    const { servicio, cuerpo, tx } = entorno();
    cuerpo.metodos[0].titular = 'Receptor histórico';
    const respuesta = { configuracion: { version: 1 } };
    tx.versionConfiguracionPagos.findUnique.mockResolvedValue({
      responsableId: sesion.usuario.id,
      solicitudHash: DatosPagos.huella({
        contexto: 'configuracion-pagos-v1',
        ...DatosPagos.guardar(cuerpo),
      }),
      respuesta,
    });
    await expect(servicio.actualizar(cuerpo, sesion)).resolves.toEqual(
      respuesta,
    );
    expect(tx.versionConfiguracionPagos.create).not.toHaveBeenCalled();
  });
});
