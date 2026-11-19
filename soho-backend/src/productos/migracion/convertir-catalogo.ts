import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';
import { LecturaCatalogo } from './lectura-catalogo.js';
import { PlanCorrespondenciaProductos } from './plan-correspondencia-productos/plan-correspondencia-productos.js';
import type { PlanCorrespondencia } from './modelos-correspondencia/modelos-correspondencia.interface.js';

function canonico(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonico);
  if (v && typeof v === 'object')
    return Object.fromEntries(
      Object.entries(v)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, x]) => [k, canonico(x)]),
    );
  return v;
}
export function huellaManifiesto(v: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonico(v)))
    .digest('hex');
}

/** Ejecuta únicamente desde el comando local, con la aplicación en mantenimiento. */
export class ConvertirCatalogo {
  async aplicar(prisma: PrismaClient, manifiesto: PlanCorrespondencia) {
    assert.ok(
      manifiesto &&
        manifiesto.version === 1 &&
        manifiesto.tipo === 'SOLO_PLAN_SIN_ESCRITURAS',
      'Formato de manifiesto inválido.',
    );
    const huella = huellaManifiesto(manifiesto);
    const servidores = await prisma.$queryRaw<Array<{ version: string }>>`
      SELECT VERSION() AS version
    `;
    // TiDB ofrece Snapshot Isolation mediante RepeatableRead, sin Serializable.
    // El mantenimiento, el bloqueo del punto de control y la revisión del plan
    // siguen siendo obligatorios en ambos motores.
    const isolationLevel = /tidb/i.test(servidores[0]?.version ?? '')
      ? 'RepeatableRead'
      : 'Serializable';
    return prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM conversion_catalogo WHERE id=1 FOR UPDATE`;
        const punto = await tx.conversionCatalogo.findUnique({
          where: { id: 1 },
        });
        assert.ok(punto, 'Falta aplicar la migración de conversión.');
        if (punto.realizadaEn) {
          assert.equal(
            huellaManifiesto(punto.manifiesto),
            punto.huellaManifiesto,
            'El punto de control requiere revisión.',
          );
          assert.equal(
            punto.huellaManifiesto,
            huella,
            'Ya se aplicó otro manifiesto.',
          );
          for (const d of manifiesto.productos) {
            const p = await tx.producto.findUnique({
              where: { id: d.productoDestinoId },
            });
            assert.ok(
              p &&
                p.codigoInterno === d.codigoInterno &&
                p.grupoModeloId === d.grupoModeloId,
              'El destino confirmado requiere revisión.',
            );
            const variantes = await tx.variante.findMany({
              where: { id: { in: d.variantes.map((v) => v.id) } },
            });
            assert.equal(variantes.length, d.variantes.length);
            assert.ok(
              variantes.every(
                (v) =>
                  v.productoId === d.productoDestinoId &&
                  d.variantes.some((a) => a.id === v.id && a.sku === v.sku),
              ),
              'Una variante confirmada cambió de identidad.',
            );
          }
          return {
            aplicada: false,
            yaRealizada: true,
            productos: manifiesto.productos.length,
            huellaManifiesto: huella,
          };
        }
        // La aplicación y sus trabajadores deben estar detenidos. Los bloqueos y la
        // huella protegen además contra cambios inesperados y otro ejecutor.
        for (const tabla of [
          'pedidos',
          'pedido_articulos',
          'marcas',
          'categorias',
          'productos',
          'producto_colores',
          'variantes',
          'imagenes_producto',
          'imagenes_producto_color',
        ])
          await tx.$queryRawUnsafe(
            'SELECT id FROM `' + tabla + '` ORDER BY id FOR UPDATE',
          );
        const entrada = await new LecturaCatalogo().leer(tx);
        const calculado = new PlanCorrespondenciaProductos().crear(entrada);
        assert.equal(
          calculado.huellaOrigen,
          manifiesto.huellaOrigen,
          'El catálogo cambió desde la revisión. Genera otro manifiesto.',
        );
        assert.equal(
          huellaManifiesto(calculado),
          huella,
          'El manifiesto no corresponde al plan determinista del origen.',
        );
        assert.ok(
          calculado.aptoParaRevision,
          'El manifiesto tiene incidencias pendientes.',
        );
        for (const total of await Promise.all([
          tx.grupoModelo.count(),
          tx.archivoImagen.count(),
          tx.aliasProducto.count(),
          tx.operacionProducto.count(),
          tx.secuenciaCodigoProducto.count(),
        ]))
          assert.equal(
            total,
            0,
            'Hay datos futuros o una conversión parcial que requieren revisión.',
          );
        const fecha = new Date();
        for (const g of calculado.grupos)
          await tx.grupoModelo.create({
            data: {
              id: g.id,
              marcaId: g.marcaId,
              codigoModelo: g.codigoModelo,
              modelo: g.modelo,
              slugCarpeta: g.slugCarpeta,
              creadoEn: fecha,
              actualizadoEn: fecha,
            },
          });
        // Crear primero los destinos adicionales permite mover cada color y sus FK
        // sin reemplazar la variante o sus referencias históricas.
        for (const d of calculado.productos.filter(
          (p) => !p.conservaIdentidad,
        )) {
          // INSERT SELECT conserva literalmente Decimal y DATETIME del origen,
          // sin reinterpretar las fechas mediante la zona horaria del adaptador.
          const n = await tx.$executeRaw(Prisma.sql`INSERT INTO productos
            (id,slug,codigo_interno,nombre,codigo_modelo,modelo,descripcion,genero,precio,precio_anterior,
             es_novedad,estado,orden_catalogo,marca_id,categoria_id,grupo_modelo_id,codigo_color,
             color_nombre,color_hexadecimal,orden_color,creado_en,actualizado_en,creado_por_id,actualizado_por_id)
            SELECT ${d.productoDestinoId},${d.slug},${d.codigoInterno},${d.nombre},codigo_modelo,modelo,
             descripcion,genero,precio,precio_anterior,es_novedad,estado,orden_catalogo,marca_id,categoria_id,
             ${d.grupoModeloId},${d.codigoColor},${d.colorNombre},${d.colorHexadecimal},${d.ordenColor},
             creado_en,actualizado_en,creado_por_id,actualizado_por_id FROM productos WHERE id=${d.productoAnteriorId}`);
          assert.equal(n, 1, 'No se pudo copiar el producto de origen.');
        }
        for (const d of calculado.productos) {
          if (d.conservaIdentidad) {
            await tx.$executeRaw(Prisma.sql`UPDATE productos SET grupo_modelo_id=${d.grupoModeloId},
              nombre=${d.nombre},codigo_color=${d.codigoColor},color_nombre=${d.colorNombre},
              color_hexadecimal=${d.colorHexadecimal},orden_color=${d.ordenColor} WHERE id=${d.productoDestinoId}`);
          }
          if (d.colorAnteriorId)
            await tx.$executeRaw(
              Prisma.sql`UPDATE producto_colores SET producto_id=${d.productoDestinoId} WHERE id=${d.colorAnteriorId}`,
            );
          for (const v of d.variantes)
            await tx.$executeRaw(
              Prisma.sql`UPDATE variantes SET producto_id=${d.productoDestinoId} WHERE id=${v.id}`,
            );
        }
        const archivos = new Map<string, string>();
        const registrarArchivo = async (productoId: string, ruta: string) => {
          const clave = productoId + '\n' + ruta;
          if (archivos.has(clave)) return archivos.get(clave)!;
          const id = new PlanCorrespondenciaProductos().archivoHeredadoId(
            productoId,
            ruta,
          );
          await tx.archivoImagen.create({
            data: {
              id,
              productoOrigenId: productoId,
              proveedor: 'LEGADO',
              estado: 'DISPONIBLE',
              claveCarga: id,
              solicitudHash: huellaManifiesto({
                productoId,
                ruta,
                proveedor: 'LEGADO',
              }),
              urlEntrega: ruta,
              confirmadoEn: fecha,
              creadoEn: fecha,
              actualizadoEn: fecha,
            },
          });
          archivos.set(clave, id);
          return id;
        };
        await tx.imagenProducto.deleteMany({
          where: { productoId: { in: entrada.productos.map((p) => p.id) } },
        });
        for (const d of calculado.productos)
          for (const i of d.galeria) {
            const archivoId = await registrarArchivo(
              d.productoDestinoId,
              i.ruta,
            );
            assert.equal(archivoId, i.archivoId);
            await tx.imagenProducto.create({
              data: {
                id: i.id,
                productoId: d.productoDestinoId,
                archivoId,
                ruta: i.ruta,
                textoAlternativo: i.textoAlternativo,
                orden: i.orden,
                creadoEn: fecha,
                actualizadoEn: fecha,
              },
            });
          }
        const destinos = new Map(
          calculado.productos.flatMap((d) =>
            d.variantes.map((v) => [v.id, d.productoDestinoId] as const),
          ),
        );
        for (const a of await tx.pedidoArticulo.findMany({
          select: { id: true, varianteId: true, imagen: true },
        })) {
          const destino = destinos.get(a.varianteId);
          assert.ok(destino, 'Artículo histórico sin destino.');
          const archivoImagenId = await registrarArchivo(destino, a.imagen);
          await tx.pedidoArticulo.update({
            where: { id: a.id },
            data: { archivoImagenId },
          });
        }
        for (const a of calculado.alias)
          await tx.aliasProducto.create({ data: a });
        await tx.secuenciaCodigoProducto.create({
          data: { id: 1, ultimoNumero: calculado.ultimoNumeroPropuesto },
        });
        await tx.conversionCatalogo.update({
          where: { id: 1 },
          data: {
            huellaOrigen: calculado.huellaOrigen,
            huellaManifiesto: huella,
            manifiesto: JSON.parse(
              JSON.stringify(calculado),
            ) as Prisma.InputJsonValue,
            realizadaEn: fecha,
          },
        });
        return {
          aplicada: true,
          yaRealizada: false,
          productos: calculado.productos.length,
          variantes: destinos.size,
          huellaManifiesto: huella,
        };
      },
      { isolationLevel, timeout: 120000, maxWait: 10000 },
    );
  }
}
