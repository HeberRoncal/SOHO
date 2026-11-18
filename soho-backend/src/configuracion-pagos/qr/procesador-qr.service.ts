import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfiguracionCloudinary } from '../../productos/fotografias/configuracion-cloudinary.js';
import { MantenimientoQrService } from './mantenimiento-qr.service.js';

@Injectable()
export class ProcesadorQrService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(ProcesadorQrService.name);
  private temporizador?: ReturnType<typeof setTimeout>;
  private trabajo?: Promise<void>;
  private detenido = false;
  constructor(
    @Inject(ConfiguracionCloudinary)
    private readonly config: ConfiguracionCloudinary,
    @Inject(MantenimientoQrService)
    private readonly mantenimiento: MantenimientoQrService,
  ) {}
  onApplicationBootstrap() {
    if (this.config.procesadorActivo) this.programar(0);
  }
  private programar(ms: number) {
    this.temporizador = setTimeout(() => {
      this.trabajo = this.ejecutar();
    }, ms);
    this.temporizador.unref();
  }
  private async ejecutar() {
    try {
      await this.mantenimiento.procesarLote();
    } catch {
      this.logger.error(
        'No se pudo consultar el mantenimiento de QR de pago; se reintentará.',
      );
    } finally {
      if (!this.detenido) this.programar(60_000);
    }
  }
  async onModuleDestroy() {
    this.detenido = true;
    clearTimeout(this.temporizador);
    this.mantenimiento.detener();
    await this.trabajo;
  }
}
