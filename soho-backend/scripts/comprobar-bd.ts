import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

async function main(): Promise<void> {
  let app: INestApplicationContext | undefined;
  try {
    app = await NestFactory.createApplicationContext(PrismaModule, {
      logger: false,
      abortOnError: false,
    });
    const prisma = app.get(PrismaService);
    const [
      marcas,
      categorias,
      productos,
      colores,
      tallas,
      variantes,
      imagenesProducto,
      imagenesColor,
      movimientos,
      ejemplo,
    ] = await prisma.$transaction([
      prisma.marca.count(),
      prisma.categoria.count(),
      prisma.producto.count(),
      prisma.productoColor.count(),
      prisma.talla.count(),
      prisma.variante.count(),
      prisma.imagenProducto.count(),
      prisma.imagenProductoColor.count(),
      prisma.movimientoInventario.count(),
      prisma.producto.findFirst({
        where: { estado: 'PUBLICADO' },
        orderBy: [{ ordenCatalogo: 'asc' }, { id: 'asc' }],
        select: { slug: true, nombre: true, precio: true },
      }),
    ]);
    console.log(
      JSON.stringify(
        {
          conexion: 'correcta',
          marcas,
          categorias,
          productos,
          colores,
          tallas,
          variantes,
          imagenesProducto,
          imagenesColor,
          movimientos,
          ejemplo: ejemplo
            ? { ...ejemplo, precio: ejemplo.precio?.toFixed(2) }
            : null,
        },
        null,
        2,
      ),
    );
  } finally {
    await app?.close();
  }
}

main().catch(() => {
  console.error(
    'No se pudo comprobar MySQL desde NestJS. Revisa DATABASE_URL, el servidor y las migraciones.',
  );
  process.exitCode = 1;
});
