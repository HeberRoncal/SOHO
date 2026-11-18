import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfiguracionPedidos } from '../configuracion-pedidos.js';
import { VencimientosReservasService } from './vencimientos-reservas.service.js';

@Injectable()
export class ProcesadorVencimientosService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(ProcesadorVencimientosService.name);
  private temporizador?: ReturnType<typeof setTimeout>;
  private trabajo?: Promise<void>;
  private detenido = false;

  constructor(
    @Inject(VencimientosReservasService)
    private readonly vencimientos: VencimientosReservasService,
    @Inject(ConfiguracionPedidos)
    private readonly configuracion: ConfiguracionPedidos,
  ) {}

  onApplicationBootstrap() {
    if (this.configuracion.vencimientosAutomaticos) this.programar(0);
  }
  private programar(ms: number) {
    this.temporizador = setTimeout(() => {
      this.trabajo = this.ejecutar();
    }, ms);
    this.temporizador.unref();
  }
  private async ejecutar() {
    try {
      await this.vencimientos.procesarLote();
    } catch {
      this.logger.error(
        'No se pudo consultar el lote de vencimientos; se reintentará.',
      );
    } finally {
      if (!this.detenido) this.programar(60_000);
    }
  }
  async onModuleDestroy() {
    this.detenido = true;
    clearTimeout(this.temporizador);
    await this.trabajo;
  }
}
