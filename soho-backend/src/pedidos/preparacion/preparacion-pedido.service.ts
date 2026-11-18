import {
  ConflictException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import type { PreparacionPedido } from './preparacion-pedido.interface.js';

@Injectable()
export class PreparacionPedidoService {
  async verificar(
    tx: Prisma.TransactionClient,
    datos: PreparacionPedido,
    aceptarOriginales = false,
  ) {
    await tx.$queryRaw`SELECT id FROM zonas_entrega WHERE codigo = ${datos.entrega.distrito} FOR SHARE`;
    const zona = await tx.zonaEntrega.findUnique({
      where: { codigo: datos.entrega.distrito },
    });
    if (!zona || !zona.habilitada)
      throw new UnprocessableEntityException({
        codigo: 'COBERTURA_DESHABILITADA',
        message: 'La entrega a este distrito no está habilitada.',
      });
    if (zona.tarifa === null)
      throw new UnprocessableEntityException({
        codigo: 'COBERTURA_TARIFA_PENDIENTE',
        message:
          'La tarifa de este distrito todavía está pendiente de definir.',
      });
    if (
      !aceptarOriginales &&
      (zona.tarifa.toFixed(2) !== datos.cotizacion.costoEnvio ||
        zona.plazo !== datos.cotizacion.plazoEntrega)
    )
      throw new ConflictException({
        codigo: 'COTIZACION_CAMBIADA',
        message:
          'La tarifa o el plazo cambiaron. Actualiza la cotización antes de confirmar.',
      });
    const skus = datos.articulos.map((a) => a.sku).sort();
    // Bloquea inventario y los datos comerciales de la variante antes de volver a leerlos.
    await tx.$queryRaw(Prisma.sql`SELECT v.id FROM variantes v
      INNER JOIN producto_colores c ON c.id = v.producto_color_id
      INNER JOIN productos p ON p.id = COALESCE(v.producto_id,c.producto_id)
      LEFT JOIN grupos_modelo g ON g.id=p.grupo_modelo_id
      LEFT JOIN marcas m ON m.id = COALESCE(g.marca_id,p.marca_id) LEFT JOIN categorias cat ON cat.id = p.categoria_id
      INNER JOIN tallas t ON t.id = v.talla_id
      WHERE v.sku IN (${Prisma.join(skus)}) ORDER BY v.id FOR UPDATE`);
    const variantes = await tx.variante.findMany({
      where: { sku: { in: skus } },
      include: {
        talla: true,
        producto: {
          include: {
            grupoModelo: { include: { marca: true } },
            marca: true,
            categoria: true,
            imagenes: { orderBy: { orden: 'asc' } },
          },
        },
        productoColor: {
          include: {
            imagenes: { orderBy: { orden: 'asc' } },
            producto: {
              include: {
                marca: true,
                grupoModelo: { include: { marca: true } },
                categoria: true,
                imagenes: { orderBy: { orden: 'asc' } },
              },
            },
          },
        },
      },
    });
    const productos = [
      ...new Set(
        variantes.map((v) => v.productoId ?? v.productoColor.productoId),
      ),
    ].sort();
    const colores = [
      ...new Set(variantes.map((v) => v.productoColorId)),
    ].sort();
    if (productos.length)
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM imagenes_producto WHERE producto_id IN (${Prisma.join(productos)}) ORDER BY id FOR SHARE`,
      );
    if (colores.length)
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM imagenes_producto_color WHERE producto_color_id IN (${Prisma.join(colores)}) ORDER BY id FOR SHARE`,
      );
    if (productos.length)
      await tx.$queryRaw(Prisma.sql`SELECT a.id FROM archivos_imagen a
      INNER JOIN imagenes_producto i ON i.archivo_id=a.id
      WHERE i.producto_id IN (${Prisma.join(productos)}) ORDER BY a.id FOR SHARE`);
    // Las fotografías se leen después de bloquearlas, para no conservar una lectura anterior.
    const fotos = productos.length
      ? await tx.imagenProducto.findMany({
          where: { productoId: { in: productos } },
          orderBy: { orden: 'asc' },
          include: { archivo: true },
        })
      : [];
    const fotosColor = colores.length
      ? await tx.imagenProductoColor.findMany({
          where: { productoColorId: { in: colores } },
          orderBy: { orden: 'asc' },
        })
      : [];
    let subtotal = new Prisma.Decimal(0);
    const lineas = datos.articulos.map((a, orden) => {
      const v = variantes.find((v) => v.sku === a.sku);
      const p = v?.producto ?? v?.productoColor.producto;
      const convertido = Boolean(p?.grupoModeloId);
      const fotoActual = convertido
        ? fotos.find(
            (i) => i.productoId === p!.id && i.archivo?.estado === 'DISPONIBLE',
          )
        : undefined;
      const imagen = convertido
        ? (fotoActual?.archivo?.urlEntrega ?? undefined)
        : v &&
          (fotosColor.find((i) => i.productoColorId === v.productoColorId)
            ?.ruta ??
            fotos.find((i) => i.productoId === v.productoColor.productoId)
              ?.ruta);
      if (
        !v ||
        !p ||
        p.estado !== 'PUBLICADO' ||
        !p.precio ||
        !(p.grupoModelo ? p.grupoModelo.modelo : p.modelo) ||
        !(p.grupoModelo ? p.grupoModelo.codigoModelo : p.codigoModelo) ||
        !(p.grupoModelo ? p.grupoModelo.marca?.activa : p.marca?.activa) ||
        (convertido &&
          (v.productoId !== p.id ||
            v.productoColor.productoId !== p.id ||
            !p.codigoColor)) ||
        !p.categoria?.activa ||
        !fotos.some((i) => i.productoId === p.id) ||
        !imagen ||
        !v.habilitada
      )
        throw new UnprocessableEntityException({
          codigo: 'ARTICULO_NO_DISPONIBLE',
          message: 'Uno de los artículos ya no está disponible para la venta.',
        });
      if (
        !aceptarOriginales &&
        p.precio.toFixed(2) !== a.precioUnitarioEsperado
      )
        throw new ConflictException({
          codigo: 'PRECIO_CAMBIADO',
          message:
            'El precio de un artículo cambió. Actualiza el carrito antes de confirmar.',
        });
      if (v.existencias - v.cantidadReservada < a.cantidad)
        throw new ConflictException({
          codigo: 'STOCK_INSUFICIENTE',
          message:
            'Ya no hay suficientes unidades disponibles. Revisa las cantidades.',
        });
      const precioUnitario = aceptarOriginales
        ? new Prisma.Decimal(a.precioUnitarioEsperado)
        : p.precio;
      const bruto = precioUnitario.mul(a.cantidad);
      subtotal = subtotal.add(bruto);
      return {
        orden,
        entrada: a,
        variante: v,
        producto: p,
        convertido,
        fotoActual,
        imagen,
        bruto,
        precioUnitario,
      };
    });
    const costoEnvio = aceptarOriginales
      ? new Prisma.Decimal(datos.cotizacion.costoEnvio)
      : zona.tarifa;
    const total = subtotal.add(costoEnvio);
    if (total.toFixed(2) !== datos.cotizacion.total)
      throw new ConflictException({
        codigo: 'TOTAL_CAMBIADO',
        message: 'El total cambió. Actualiza el carrito y la cotización.',
      });
    return {
      zona: aceptarOriginales
        ? { ...zona, tarifa: costoEnvio, plazo: datos.cotizacion.plazoEntrega }
        : zona,
      subtotal,
      total,
      lineas,
      costoEnvio,
    };
  }
}
