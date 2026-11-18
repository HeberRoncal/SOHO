import { PRODUCTOS_ADMIN_PRUEBA } from '../pruebas/productos.fixtures';
import {
  FILTROS_ADMIN_INICIALES,
  coincideProductoAdmin,
  resumenInventario,
} from './producto-administracion';

describe('Consulta de productos administrativos', () => {
  const producto = PRODUCTOS_ADMIN_PRUEBA[0];
  it('calcula físico, reservado y disponible por variante habilitada, sin saldos negativos', () => {
    const variante = producto.variantes[0];
    const resumen = resumenInventario({
      ...producto,
      variantes: [
        { ...variante, existencias: 5, cantidadReservada: 2 },
        { ...variante, existencias: 3, cantidadReservada: 5 },
        { ...variante, existencias: 7, cantidadReservada: 1, habilitada: false },
        { ...variante, existencias: 2, cantidadReservada: 0 },
      ],
    });
    expect(resumen).toEqual({
      fisico: 17,
      reservado: 8,
      disponible: 5,
      bajo: 1,
      agotadas: 1,
      activas: 3,
    });
  });
  it('busca nombre, SKU, código interno y modelo sin distinguir mayúsculas o tildes', () => {
    for (const busqueda of ['nike dunk', 'nk-dunklow-bn-38', 'sho-0001', 'dunklow'])
      expect(coincideProductoAdmin(producto, { ...FILTROS_ADMIN_INICIALES, busqueda })).toBe(true);
    const clasico = { ...producto, nombre: 'Zapatilla clásica' };
    expect(
      coincideProductoAdmin(clasico, { ...FILTROS_ADMIN_INICIALES, busqueda: 'CLASICA' }),
    ).toBe(true);
  });
  it('combina filtros y solo muestra archivados cuando se solicitan', () => {
    expect(
      coincideProductoAdmin({ ...producto, estado: 'archivado' }, FILTROS_ADMIN_INICIALES),
    ).toBe(false);
    expect(
      coincideProductoAdmin(
        { ...producto, estado: 'archivado' },
        { ...FILTROS_ADMIN_INICIALES, estado: 'archivado' },
      ),
    ).toBe(true);
    expect(coincideProductoAdmin(producto, { ...FILTROS_ADMIN_INICIALES, marca: 'adidas' })).toBe(
      false,
    );
    expect(
      coincideProductoAdmin(producto, {
        ...FILTROS_ADMIN_INICIALES,
        marca: 'Nike',
        categoria: producto.categoria,
        estado: 'publicado',
        disponibilidad: 'bajo',
      }),
    ).toBe(true);
    expect(
      coincideProductoAdmin(producto, { ...FILTROS_ADMIN_INICIALES, disponibilidad: 'agotado' }),
    ).toBe(false);
  });
});
