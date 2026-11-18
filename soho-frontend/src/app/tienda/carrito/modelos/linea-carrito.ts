import { Producto } from '../../catalogo/modelos/producto';
import { VarianteProducto } from '../../catalogo/modelos/variante-producto';
import { ColorProducto } from '../../catalogo/modelos/color-producto';
import { ArticuloCarrito } from './articulo-carrito';

export interface LineaCarrito extends ArticuloCarrito {
  readonly producto: Producto | undefined;
  readonly variante: VarianteProducto | undefined;
  readonly color: ColorProducto | undefined;
  readonly stockDisponible: number;
  readonly importe: number | null;
  readonly incidencia: string | null;
}
