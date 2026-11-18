import type { Prisma, Producto } from '../../generated/prisma/client.js';
import type { ArchivosProductoService } from '../fotografias/archivos-producto.service.js';
import { INCLUIR_PUBLICACION } from './requisitos-publicacion.js';

export class BloqueoProductoPublicable {
  // El llamador ya bloqueó Producto. Compartir este orden con publicación y galería.
  static async bloquear(
    tx: Prisma.TransactionClient,
    producto: Pick<Producto, 'id' | 'grupoModeloId' | 'categoriaId'>,
    archivos: ArchivosProductoService,
    categoriaId: string | null = producto.categoriaId,
    archivosAdicionales: readonly string[] = [],
  ) {
    const id = producto.id;
    if (producto.grupoModeloId) {
      await tx.$queryRaw`SELECT id FROM grupos_modelo WHERE id=${producto.grupoModeloId} FOR SHARE`;
      const grupo = await tx.grupoModelo.findUnique({
        where: { id: producto.grupoModeloId },
        select: { marcaId: true },
      });
      if (grupo?.marcaId)
        await tx.$queryRaw`SELECT id FROM marcas WHERE id=${grupo.marcaId} FOR SHARE`;
    }
    for (const categoria of [
      ...new Set(
        [producto.categoriaId, categoriaId].filter((v): v is string => !!v),
      ),
    ].sort())
      await tx.$queryRaw`SELECT id FROM categorias WHERE id=${categoria} FOR SHARE`;
    await tx.$queryRaw`SELECT id FROM producto_colores WHERE producto_id=${id} ORDER BY id FOR UPDATE`;
    await tx.$queryRaw`SELECT v.id FROM variantes v LEFT JOIN producto_colores c ON c.id=v.producto_color_id WHERE v.producto_id=${id} OR c.producto_id=${id} ORDER BY v.id FOR UPDATE`;
    await tx.$queryRaw`SELECT t.id FROM tallas t INNER JOIN variantes v ON v.talla_id=t.id WHERE v.producto_id=${id} ORDER BY t.id FOR SHARE`;
    await tx.$queryRaw`SELECT id FROM imagenes_producto WHERE producto_id=${id} ORDER BY id FOR UPDATE`;
    const imagenes = await tx.imagenProducto.findMany({
      where: { productoId: id },
      select: { archivoId: true },
    });
    const bloqueados = new Map<
      string,
      Awaited<ReturnType<ArchivosProductoService['bloquearArchivo']>>
    >();
    for (const archivoId of [
      ...new Set([
        ...imagenes.flatMap((i) => (i.archivoId ? [i.archivoId] : [])),
        ...archivosAdicionales,
      ]),
    ].sort())
      bloqueados.set(
        archivoId,
        await archivos.bloquearArchivo(tx, archivoId, id),
      );
    return {
      producto: await tx.producto.findUniqueOrThrow({
        where: { id },
        include: INCLUIR_PUBLICACION,
      }),
      archivos: bloqueados,
    };
  }
}
