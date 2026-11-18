import { ColorProducto } from '../../../tienda/catalogo/modelos/color-producto';
import { VarianteProducto } from '../../../tienda/catalogo/modelos/variante-producto';
import { ProductoAdministracion, normalizarBusquedaAdmin } from './producto-administracion';

export interface EdicionVariantes {
  readonly colores: readonly ColorProducto[];
  readonly variantes: readonly VarianteProducto[];
}
export const TALLAS_EU_ADMIN = Array.from({ length: 27 }, (_, i) => String(35 + i / 2));
export const COLORES_VARIANTES: readonly ColorProducto[] = [
  ['BL', 'Blanco', '#ffffff'],
  ['NG', 'Negro', '#181818'],
  ['GR', 'Gris', '#8c8c8c'],
  ['AZ', 'Azul', '#2767a8'],
  ['RJ', 'Rojo', '#c82c36'],
  ['CR', 'Crema', '#e4d8bf'],
  ['VD', 'Verde', '#426b4a'],
  ['RS', 'Rosa', '#d18caa'],
  ['BN', 'Blanco/Negro', '#f2f2f0'],
].map(([codigo, nombre, hexadecimal]) => ({ codigo, nombre, hexadecimal, imagenes: [] }));
export const skuVariante = (codigo: string, color: string, talla: string) =>
  `${codigo}-${color}-${talla.replace('.', 'P')}`;
export function errorColores(colores: readonly ColorProducto[]): string {
  if (!colores.length) return 'Agrega y selecciona al menos un color.';
  if (colores.some((c) => !c.nombre.trim() || c.nombre.length > 50))
    return 'Cada color necesita un nombre de hasta 50 caracteres.';
  if (colores.some((c) => !/^[A-Z]{2}$/.test(c.codigo)))
    return 'El código de cada color debe tener dos letras de A a Z.';
  if (new Set(colores.map((c) => c.codigo)).size !== colores.length)
    return 'Hay códigos de color repetidos. Usa un código distinto para cada color.';
  if (new Set(colores.map((c) => normalizarBusquedaAdmin(c.nombre))).size !== colores.length)
    return 'Hay nombres de color repetidos.';
  if (colores.some((c) => !/^#[a-fA-F0-9]{6}$/.test(c.hexadecimal)))
    return 'Selecciona un tono válido para cada color.';
  return '';
}
export function planVariantes(
  codigo: string,
  colores: readonly ColorProducto[],
  tallas: readonly string[],
  variantes: readonly VarianteProducto[],
  ocupados: readonly string[] = [],
) {
  return colores.flatMap((color) =>
    tallas.map((talla) => {
      const existente = variantes.find(
        (v) => v.codigoColor === color.codigo && v.talla === talla && v.sistemaTallas === 'EU',
      );
      const sku = existente?.sku ?? skuVariante(codigo, color.codigo, talla);
      return {
        color,
        talla,
        sku,
        existe: !!existente,
        colision: !existente && (ocupados.includes(sku) || variantes.some((v) => v.sku === sku)),
      };
    }),
  );
}
export function validarVariantes(
  edicion: EdicionVariantes,
  codigo: string,
  productos: readonly ProductoAdministracion[],
  original?: ProductoAdministracion,
): string {
  const { colores, variantes } = edicion;
  const errorColor = colores.length
    ? errorColores(colores)
    : variantes.length
      ? 'Agrega los colores de las variantes.'
      : '';
  if (errorColor) return errorColor;
  for (const color of original?.colores ?? []) {
    const nuevo = colores.find((c) => c.codigo === color.codigo);
    if (
      !nuevo ||
      nuevo.nombre !== color.nombre ||
      nuevo.hexadecimal !== color.hexadecimal ||
      nuevo.imagenes.length !== color.imagenes.length ||
      nuevo.imagenes.some((imagen, i) => imagen !== color.imagenes[i])
    )
      return 'Los colores guardados conservan su código, nombre e imágenes. Agrega un color nuevo para otra combinación.';
  }
  for (const variante of original?.variantes ?? []) {
    const nueva = variantes.find((v) => v.sku === variante.sku);
    if (
      !nueva ||
      nueva.identificador !== variante.identificador ||
      nueva.codigoColor !== variante.codigoColor ||
      nueva.talla !== variante.talla ||
      nueva.sistemaTallas !== variante.sistemaTallas ||
      nueva.existencias !== variante.existencias ||
      nueva.cantidadReservada !== variante.cantidadReservada
    )
      return 'No se pueden quitar ni cambiar los SKU, tallas o existencias guardados. Los cambios de stock requieren movimientos.';
  }
  const skus = new Set<string>(),
    pares = new Set<string>(),
    ids = new Set<string>();
  const ocupados = new Set(
    productos
      .filter((p) => p.identificador !== original?.identificador)
      .flatMap((p) => p.variantes.map((v) => v.sku)),
  );
  for (const v of variantes) {
    if (
      skus.has(v.sku) ||
      ids.has(v.identificador) ||
      pares.has(`${v.codigoColor}:${v.talla}`) ||
      ocupados.has(v.sku)
    )
      return 'Hay SKU o combinaciones de color y talla repetidos.';
    skus.add(v.sku);
    ids.add(v.identificador);
    pares.add(`${v.codigoColor}:${v.talla}`);
    if (
      !colores.some((c) => c.codigo === v.codigoColor) ||
      v.sistemaTallas !== 'EU' ||
      typeof v.habilitada !== 'boolean'
    )
      return 'Revisa el color, la talla EU y el estado de las variantes.';
    if (!original?.variantes.some((anterior) => anterior.sku === v.sku)) {
      if (
        !TALLAS_EU_ADMIN.includes(v.talla) ||
        v.sku !== skuVariante(codigo, v.codigoColor, v.talla) ||
        v.identificador !== v.sku ||
        v.cantidadReservada !== 0
      )
        return 'Una variante nueva debe usar el SKU generado y una talla EU válida, sin reservas iniciales.';
      if (!Number.isInteger(v.existencias) || v.existencias < 0 || v.existencias > 99999)
        return 'El stock inicial debe ser un entero entre 0 y 99,999 en cada variante nueva.';
    }
  }
  return '';
}
