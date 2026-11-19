import { UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { IdentidadProducto } from '../borradores/identidad-producto.js';

export const INCLUIR_PUBLICACION = {
  grupoModelo: { include: { marca: true } },
  categoria: true,
  colores: { include: { variantes: { select: { id: true } } } },
  variantesDirectas: { include: { talla: true } },
  imagenes: { orderBy: { orden: 'asc' }, include: { archivo: true } },
} satisfies Prisma.ProductoInclude;
export type ProductoPublicable = Prisma.ProductoGetPayload<{
  include: typeof INCLUIR_PUBLICACION;
}>;

export class RequisitosPublicacion {
  static comprobar(p: ProductoPublicable): void {
    const incidencias: Array<{ codigo: string; campo: string }> = [];
    const falta = (codigo: string, campo: string) =>
      incidencias.push({ codigo, campo });
    const grupo = p.grupoModelo;
    const marca = grupo?.marca;
    const texto = (v: string | null | undefined) =>
      typeof v === 'string' &&
      v.trim().length > 0 &&
      !/[\p{Cc}\p{Cf}]/u.test(v);
    const identidad = !!(
      grupo &&
      marca &&
      texto(grupo.modelo) &&
      /^[A-Z0-9]{1,60}$/.test(grupo.codigoModelo ?? '') &&
      /^[A-Z0-9]{1,12}$/.test(marca.codigo) &&
      /^[A-Z]{2}$/.test(p.codigoColor ?? '') &&
      texto(p.colorNombre) &&
      /^#[a-f0-9]{6}$/i.test(p.colorHexadecimal ?? '')
    );
    if (!identidad || !texto(p.nombre))
      falta('IDENTIDAD_INCOMPLETA', 'producto');
    if (!marca?.activa) falta('MARCA_NO_ACTIVA', 'marca');
    if (!p.categoria?.activa) falta('CATEGORIA_NO_ACTIVA', 'categoria');
    if (
      grupo &&
      (p.marcaId !== grupo.marcaId ||
        p.modelo !== grupo.modelo ||
        p.codigoModelo !== grupo.codigoModelo)
    )
      falta('DATOS_MODELO_INCOHERENTES', 'grupoModelo');
    if (
      !p.precio ||
      p.precio.lte(0) ||
      p.precio.gt('999999.99') ||
      (p.precioAnterior && p.precioAnterior.lte(p.precio))
    )
      falta('PRECIO_INVALIDO', 'precio');

    const variantes = p.variantesDirectas;
    if (!variantes.some((v) => v.habilitada))
      falta('VARIANTE_HABILITADA_REQUERIDA', 'variantes');
    const puente = p.colores.length === 1 ? p.colores[0] : null;
    if (
      !puente ||
      puente.codigo !== p.codigoColor ||
      puente.nombre !== p.colorNombre ||
      puente.hexadecimal.toUpperCase() !== p.colorHexadecimal?.toUpperCase() ||
      puente.variantes.length !== variantes.length ||
      puente.variantes.some((v) => !variantes.some((d) => d.id === v.id))
    )
      falta('RELACIONES_COLOR_INCOHERENTES', 'color');
    let variantesCoherentes = identidad;
    for (const v of variantes) {
      if (
        v.productoId !== p.id ||
        v.productoColorId !== puente?.id ||
        v.talla.sistema !== 'EU'
      )
        variantesCoherentes = false;
      if (identidad) {
        try {
          if (
            v.sku !==
            IdentidadProducto.sku(
              marca!.codigo,
              grupo!.codigoModelo!,
              p.codigoColor!,
              v.talla.valor.toString(),
            )
          )
            variantesCoherentes = false;
        } catch {
          variantesCoherentes = false;
        }
      }
    }
    if (variantes.length && !variantesCoherentes)
      falta('SKU_O_TALLA_INCOHERENTES', 'variantes');

    const imagenes = p.imagenes;
    if (
      !imagenes.length ||
      imagenes.length > 10 ||
      imagenes.some((i, n) => i.orden !== n) ||
      new Set(imagenes.map((i) => i.archivoId)).size !== imagenes.length
    )
      falta('GALERIA_INCOMPLETA', 'imagenes');
    if (
      imagenes.some(
        (i) =>
          !i.archivo ||
          i.archivo.productoOrigenId !== p.id ||
          i.archivo.estado !== 'DISPONIBLE' ||
          !texto(i.archivo.urlEntrega) ||
          i.ruta !== i.archivo.urlEntrega,
      )
    )
      falta('FOTOGRAFIA_NO_DISPONIBLE', 'imagenes');
    if (incidencias.length)
      throw new UnprocessableEntityException({
        codigo: 'PRODUCTO_NO_PUBLICABLE',
        message:
          'Completa o corrige los requisitos del producto antes de publicarlo.',
        incidencias,
      });
  }
}
