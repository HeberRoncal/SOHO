import { Prisma } from '../../generated/prisma/client.js';
import { productoAdmin, type ProductoAdmin } from './respuesta-productos.js';
const producto = (): ProductoAdmin => ({
  id: 'producto-uuid',
  version: 1,
  grupoModeloId: null,
  grupoModelo: null,
  codigoColor: null,
  colorNombre: null,
  colorHexadecimal: null,
  variantesDirectas: [],
  slug: 'producto-publico',
  codigoInterno: 'SHO-0001',
  codigoModelo: null,
  nombre: 'Producto pendiente',
  modelo: null,
  descripcion: '',
  genero: 'UNISEX',
  precio: null,
  precioAnterior: null,
  esNovedad: false,
  estado: 'BORRADOR',
  ordenCatalogo: 0,
  ordenColor: 0,
  actualizadoEn: new Date('2026-11-14T12:00:00Z'),
  marca: null,
  categoria: null,
  imagenes: [],
  colores: [
    {
      id: 'color',
      codigo: 'NG',
      nombre: 'Negro',
      hexadecimal: '#000000',
      imagenes: [],
      variantes: [
        {
          id: 'variante-uuid',
          sku: 'NK-AF107-NG-40',
          habilitada: true,
          existencias: 1,
          cantidadReservada: 3,
          talla: { valor: new Prisma.Decimal(40), sistema: 'EU' },
        },
        {
          id: 'deshabilitada',
          sku: 'NK-AF107-NG-41',
          habilitada: false,
          existencias: 9,
          cantidadReservada: 1,
          talla: { valor: new Prisma.Decimal(41), sistema: 'EU' },
        },
      ],
    },
  ],
});
describe('Respuesta administrativa de productos', () => {
  it('conserva precio y referencias pendientes sin inventar cero', () => {
    expect(productoAdmin(producto())).toMatchObject({
      precio: null,
      modelo: null,
      codigoModelo: null,
      marca: null,
      categoria: null,
    });
  });
  it('conserva existencias, reservas y faltantes también en variantes deshabilitadas', () => {
    const r = productoAdmin(producto());
    expect(r.inventario).toEqual({
      fisico: 10,
      reservado: 4,
      disponible: 0,
      bajo: 0,
      agotadas: 1,
      activas: 1,
      faltante: 2,
    });
    expect(r.variantes[0]).toMatchObject({
      id: 'variante-uuid',
      sku: 'NK-AF107-NG-40',
      existencias: 1,
      cantidadReservada: 3,
      disponible: 0,
      faltante: 2,
    });
    expect(r.variantes[1]).toMatchObject({
      existencias: 9,
      cantidadReservada: 1,
      disponible: 0,
    });
  });
  it('envía decimales exactos y no propaga propiedades internas ajenas al contrato', () => {
    const p = {
      ...producto(),
      precio: new Prisma.Decimal('999999.99'),
      secreto: 'privado',
    };
    const r = productoAdmin(p);
    expect(r.precio).toBe('999999.99');
    expect(r).not.toHaveProperty('secreto');
  });
});
