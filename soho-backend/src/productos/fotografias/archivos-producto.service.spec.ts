import { ArchivosProductoService } from './archivos-producto.service.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { EscrituraAutorizadaService } from '../../autenticacion/seguridad/escritura-autorizada.service.js';
import type { ContextoAuth } from '../../autenticacion/sesiones/contexto-auth.js';
import type { CloudinaryService } from './cloudinary.service.js';
import { ConfiguracionCloudinary } from './configuracion-cloudinary.js';
import type { PrepararFotografiaService } from './preparar-fotografia.service.js';
describe('Autorización de archivos de productos', () => {
  it('rechaza datos inválidos antes de decodificar o contactar al proveedor', async () => {
    const preparar = { preparar: vi.fn() },
      cloudinary = { modoCarpetas: vi.fn() };
    const service = new ArchivosProductoService(
      {} as PrismaService,
      {} as EscrituraAutorizadaService,
      cloudinary as unknown as CloudinaryService,
      new ConfiguracionCloudinary({}),
      preparar as unknown as PrepararFotografiaService,
    );
    await expect(
      service.subir('id', { datos: '{}' }, undefined, {} as ContextoAuth),
    ).rejects.toThrow();
    expect(preparar.preparar).not.toHaveBeenCalled();
    expect(cloudinary.modoCarpetas).not.toHaveBeenCalled();
  });
  it('conserva la exigencia exclusiva de borrador para publicar', () => {
    const service = new ArchivosProductoService(
      {} as PrismaService,
      {} as EscrituraAutorizadaService,
      {} as CloudinaryService,
      new ConfiguracionCloudinary({}),
      {} as PrepararFotografiaService,
    );
    expect(() =>
      service.exigirBorrador({ estado: 'PUBLICADO', version: 1 }, 1),
    ).toThrow();
    expect(() =>
      service.exigirBorrador({ estado: 'BORRADOR', version: 2 }, 1),
    ).toThrow();
  });
  it('permite fotografías de publicados y borradores con versión vigente, y bloquea archivados', () => {
    const s = new ArchivosProductoService(
      {} as PrismaService,
      {} as EscrituraAutorizadaService,
      {} as CloudinaryService,
      new ConfiguracionCloudinary({}),
      {} as PrepararFotografiaService,
    );
    expect(() =>
      s.exigirEdicion({ estado: 'PUBLICADO', version: 2 }, 2),
    ).not.toThrow();
    expect(() =>
      s.exigirEdicion({ estado: 'BORRADOR', version: 2 }, 2),
    ).not.toThrow();
    expect(() =>
      s.exigirEdicion({ estado: 'PUBLICADO', version: 2 }, 1),
    ).toThrow();
    expect(() =>
      s.exigirEdicion({ estado: 'ARCHIVADO', version: 2 }, 2),
    ).toThrow();
  });
});
