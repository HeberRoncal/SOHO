import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { PedidosAdministracion } from './pedidos-administracion';
import { EnviosAdministracionApi } from './envios-administracion-api';
import { CancelacionesAdministracionApi } from './cancelaciones-administracion-api';
import { PagosAdministracion } from '../../pagos/servicios/pagos-administracion';

describe('Pedidos administrativos sin alternativas locales', () => {
  it('consulta y guarda mediante las API y conserva un fallo sin simular éxito', async () => {
    const error = { ok: false, errores: { estado: 'La sesión cambió.' }, requiereActualizar: true };
    const envios = {
      actualizar: vi.fn().mockResolvedValue({ ok: true }),
      guardar: vi.fn().mockResolvedValue(error),
    };
    const cancelaciones = {
      cancelar: vi.fn().mockResolvedValue(error),
      liberar: vi.fn().mockResolvedValue(error),
      actualizar: vi.fn().mockResolvedValue({ ok: true }),
    };
    const cargarListado = vi.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: PagosAdministracion,
          useValue: { pedidos: signal([]), resultados: signal([]), cargarListado },
        },
        { provide: EnviosAdministracionApi, useValue: envios },
        { provide: CancelacionesAdministracionApi, useValue: cancelaciones },
      ],
    });
    const fuente = TestBed.inject(PedidosAdministracion);
    await fuente.cargarListado({ busqueda: 'SOHO-TEST0001' });
    expect(cargarListado).toHaveBeenCalledWith({ busqueda: 'SOHO-TEST0001' }, 'pedidos');
    await fuente.cargarDetalle('SOHO-TEST0001');
    expect(envios.actualizar).toHaveBeenCalledWith('SOHO-TEST0001');
    const cambio = {
      accion: 'preparar' as const,
      estadoEsperado: 'confirmado' as const,
      empresa: '',
      seguimiento: '',
      nota: '',
      confirmado: false,
      versionPedido: 2,
    };
    expect(await fuente.guardarEntrega('SOHO-TEST0001', cambio)).toBe(error);
    expect(envios.guardar).toHaveBeenCalledWith('SOHO-TEST0001', cambio);
    const solicitud = {
      motivo: 'Solicitud del cliente',
      confirmado: true,
      estadoEntregaEsperado: 'confirmado' as const,
      estadoPagoEsperado: 'aprobado' as const,
      versionPedido: 2,
      versionPago: 1,
    };
    expect(await fuente.guardarCancelacion('SOHO-TEST0001', solicitud)).toBe(error);
    expect(cancelaciones.cancelar).toHaveBeenCalledWith('SOHO-TEST0001', solicitud);
    expect('registrarEntrega' in fuente).toBe(false);
    expect('cancelar' in fuente).toBe(false);
    expect('restablecerEnvios' in fuente).toBe(false);
  });
});
