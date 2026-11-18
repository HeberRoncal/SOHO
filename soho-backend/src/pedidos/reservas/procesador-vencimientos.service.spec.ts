import { Logger } from '@nestjs/common';
import { ConfiguracionPedidos } from '../configuracion-pedidos.js';
import { ProcesadorVencimientosService } from './procesador-vencimientos.service.js';
import type { VencimientosReservasService } from './vencimientos-reservas.service.js';

describe('Procesador automático de vencimientos', () => {
  const registrarError = vi.fn();
  let procesar: ReturnType<typeof vi.fn>,
    servicio: ProcesadorVencimientosService;
  beforeEach(() => {
    vi.useFakeTimers();
    registrarError.mockClear();
    vi.spyOn(Logger.prototype, 'error').mockImplementation(registrarError);
    procesar = vi.fn().mockResolvedValue({ atendidas: 0, fallidas: 0 });
    servicio = new ProcesadorVencimientosService(
      { procesarLote: procesar } as unknown as VencimientosReservasService,
      new ConfiguracionPedidos({ NODE_ENV: 'development' }),
    );
  });
  afterEach(async () => {
    await servicio.onModuleDestroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  it('recupera vencimientos al arrancar y repite cada minuto', async () => {
    servicio.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(0);
    expect(procesar).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(procesar).toHaveBeenCalledTimes(2);
  });
  it('espera el lote anterior sin solaparlo ni perder la siguiente ejecución', async () => {
    let terminar!: () => void;
    procesar.mockReturnValueOnce(
      new Promise<void>((r) => {
        terminar = r;
      }),
    );
    servicio.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(300_000);
    expect(procesar).toHaveBeenCalledTimes(1);
    terminar();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(procesar).toHaveBeenCalledTimes(2);
  });
  it('reintenta tras un fallo de consulta sin registrar el error privado', async () => {
    procesar.mockRejectedValueOnce(Error('secreto de conexión'));
    servicio.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(procesar).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(registrarError.mock.calls)).not.toContain('secreto');
  });
  it('no programa trabajo en el entorno de pruebas', async () => {
    servicio = new ProcesadorVencimientosService(
      { procesarLote: procesar } as unknown as VencimientosReservasService,
      new ConfiguracionPedidos({ NODE_ENV: 'test' }),
    );
    servicio.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(procesar).not.toHaveBeenCalled();
  });
  it('retira el temporizador al cerrar antes de arrancar el lote', async () => {
    servicio.onApplicationBootstrap();
    await servicio.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(procesar).not.toHaveBeenCalled();
  });
  it('espera el lote en curso durante el cierre y no vuelve a programar', async () => {
    let terminar!: () => void;
    procesar.mockReturnValueOnce(
      new Promise<void>((r) => {
        terminar = r;
      }),
    );
    servicio.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(0);
    let cerrado = false;
    const cierre = servicio.onModuleDestroy().then(() => {
      cerrado = true;
    });
    await Promise.resolve();
    expect(cerrado).toBe(false);
    terminar();
    await cierre;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(procesar).toHaveBeenCalledTimes(1);
  });
});
