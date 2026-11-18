import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { OperacionCarritoDto } from './dto/operacion-carrito.dto/operacion-carrito.dto.js';

@Injectable()
export class CarritoService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  async obtener(usuarioId: string) {
    const carrito = await this.prisma.carritoUsuario.findUnique({
      where: { usuarioId },
    });
    return {
      version: carrito?.version ?? 0,
      articulos: carrito?.articulos ?? [],
    };
  }
  guardar(usuarioId: string, datos: OperacionCarritoDto) {
    const hash = createHash('sha256')
      .update(JSON.stringify(datos))
      .digest('hex');
    return this.prisma.$transaction(
      async (tx) => {
        const usuarios = await tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT id FROM usuarios WHERE id = ${usuarioId} AND activo = TRUE FOR UPDATE`;
        if (!usuarios.length) throw new UnauthorizedException();
        const actual = await tx.carritoUsuario.findUnique({
          where: { usuarioId },
        });
        const version = actual?.version ?? 0;
        const anterior = await tx.operacionCarrito.findUnique({
          where: { usuarioId_clave: { usuarioId, clave: datos.clave } },
        });
        if (anterior) {
          if (anterior.hash !== hash)
            throw new ConflictException(
              'La clave ya pertenece a otra operación.',
            );
          return { version, articulos: actual?.articulos ?? [] };
        }
        if (datos.tipo === 'GUARDAR' && datos.version !== version)
          throw new ConflictException(
            'El carrito cambió en otro dispositivo. Recarga antes de editar.',
          );
        let articulos = datos.articulos;
        if (datos.tipo === 'COMBINAR') {
          const combinados = new Map<
            string,
            { sku: string; cantidad: number }
          >();
          for (const a of (actual?.articulos ?? []) as Array<{
            sku: string;
            cantidad: number;
          }>)
            combinados.set(a.sku, a);
          for (const a of datos.articulos)
            combinados.set(a.sku, {
              sku: a.sku,
              cantidad: Math.max(
                a.cantidad,
                combinados.get(a.sku)?.cantidad ?? 0,
              ),
            });
          articulos = [...combinados.values()];
        }
        if (articulos.length > 100)
          throw new ConflictException('El carrito admite hasta 100 variantes.');
        await tx.carritoUsuario.upsert({
          where: { usuarioId },
          create: { usuarioId, articulos, version: version + 1 },
          update: { articulos, version: version + 1 },
        });
        await tx.operacionCarrito.create({
          data: { usuarioId, clave: datos.clave, hash },
        });
        return { version: version + 1, articulos };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }
}
