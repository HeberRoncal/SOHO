import { MantenimientoFotografiasService } from './mantenimiento-fotografias.service.js';
import type { ArchivosProductoService } from './archivos-producto.service.js';
import { ConfiguracionCloudinary } from './configuracion-cloudinary.js';
import { ProcesadorFotografiasService } from './procesador-fotografias.service.js';
describe('Mantenimiento de fotografías', () => {
  it('no consulta ni modifica archivos cuando Cloudinary está desconfigurado', async () => {
    const archivos = { prisma: { archivoImagen: { findMany: vi.fn() } } };
    expect(
      await new MantenimientoFotografiasService(
        archivos as unknown as ArchivosProductoService,
        new ConfiguracionCloudinary({}),
      ).procesarLote(),
    ).toEqual({ conciliadas: 0, retiradas: 0, pendientes: 0, fallidas: 0 });
    expect(archivos.prisma.archivoImagen.findMany).not.toHaveBeenCalled();
  });
  it('detiene el trabajo antes de consultar otro lote', async () => {
    const archivos = { prisma: { archivoImagen: { findMany: vi.fn() } } },
      c = new ConfiguracionCloudinary({
        CLOUDINARY_CLOUD_NAME: 'sintetico',
        CLOUDINARY_API_KEY: '123',
        CLOUDINARY_API_SECRET: 'secreto',
        NODE_ENV: 'test',
      });
    const service = new MantenimientoFotografiasService(
      archivos as unknown as ArchivosProductoService,
      c,
    );
    service.detener();
    await service.procesarLote();
    expect(archivos.prisma.archivoImagen.findMany).not.toHaveBeenCalled();
  });
  it('ejecuta automáticamente, espera entre lotes y detiene el temporizador al cerrar', async () => {
    vi.useFakeTimers();
    try {
      const config = new ConfiguracionCloudinary({
          CLOUDINARY_CLOUD_NAME: 'sintetico',
          CLOUDINARY_API_KEY: '123',
          CLOUDINARY_API_SECRET: 'secreto',
          NODE_ENV: 'production',
        }),
        mantenimiento = {
          procesarLote: vi.fn().mockResolvedValue({}),
          detener: vi.fn(),
        };
      const servicio = new ProcesadorFotografiasService(
        config,
        mantenimiento as unknown as MantenimientoFotografiasService,
      );
      servicio.onApplicationBootstrap();
      await vi.advanceTimersByTimeAsync(0);
      expect(mantenimiento.procesarLote).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(60000);
      expect(mantenimiento.procesarLote).toHaveBeenCalledTimes(2);
      await servicio.onModuleDestroy();
      await vi.advanceTimersByTimeAsync(60000);
      expect(mantenimiento.procesarLote).toHaveBeenCalledTimes(2);
      expect(mantenimiento.detener).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
