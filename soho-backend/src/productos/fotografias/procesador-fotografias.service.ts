import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfiguracionCloudinary } from './configuracion-cloudinary.js';
import { MantenimientoFotografiasService } from './mantenimiento-fotografias.service.js';

@Injectable()
export class ProcesadorFotografiasService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(ProcesadorFotografiasService.name);
  private temporizador?: ReturnType<typeof setTimeout>;
  private trabajo?: Promise<void>;
  private detenido = false;
  constructor(
    @Inject(ConfiguracionCloudinary)
    private readonly config: ConfiguracionCloudinary,
    @Inject(MantenimientoFotografiasService)
    private readonly mantenimiento: MantenimientoFotografiasService,
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
        'No se pudo consultar el mantenimiento de fotografías; se reintentará.',
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
