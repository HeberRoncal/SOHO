import { RequisitosPublicacion } from './requisitos-publicacion.js';
import type { ProductoPublicable } from './requisitos-publicacion.js';
import { Prisma } from '../../generated/prisma/client.js';

function producto(): ProductoPublicable {
  return {
    id: 'producto',
    nombre: 'Nike Modelo Blanco',
    codigoColor: 'BL',
    colorNombre: 'Blanco',
    colorHexadecimal: '#FFFFFF',
    marcaId: 'marca',
    modelo: 'Modelo',
    codigoModelo: 'MODELO',
    precio: new Prisma.Decimal('100.00'),
    precioAnterior: null,
    categoria: { activa: true },
    grupoModelo: {
      id: 'grupo',
      marcaId: 'marca',
      modelo: 'Modelo',
      codigoModelo: 'MODELO',
      marca: { id: 'marca', activa: true, codigo: 'NK' },
    },
    colores: [
      {
        id: 'color',
        codigo: 'BL',
        nombre: 'Blanco',
        hexadecimal: '#FFFFFF',
        variantes: [{ id: 'variante' }],
      },
    ],
    variantesDirectas: [
      {
        id: 'variante',
        productoId: 'producto',
        productoColorId: 'color',
        habilitada: true,
        sku: 'NK-MODELO-BL-40P5',
        existencias: 0,
        cantidadReservada: 0,
        talla: { sistema: 'EU', valor: new Prisma.Decimal('40.5') },
      },
    ],
    imagenes: [
      {
        id: 'asociacion',
        orden: 0,
        archivoId: 'archivo',
        ruta: '/foto.png',
        archivo: {
          id: 'archivo',
          productoOrigenId: 'producto',
          estado: 'DISPONIBLE',
          urlEntrega: '/foto.png',
          proveedor: 'LEGADO',
        },
      },
    ],
  } as unknown as ProductoPublicable;
}
describe('Requisitos transaccionales de publicación', () => {
  it('permite publicar diez fotos y rechaza once', () => {
    const p = producto();
    const foto = p.imagenes[0];
    p.imagenes = Array.from({ length: 10 }, (_, orden) => ({
      ...foto,
      id: `imagen-${orden}`,
      orden,
      archivoId: `archivo-${orden}`,
      archivo: { ...foto.archivo!, id: `archivo-${orden}` },
    }));
    expect(() => RequisitosPublicacion.comprobar(p)).not.toThrow();
    p.imagenes.push({ ...p.imagenes[0], orden: 10, archivoId: 'archivo-10' });
    expect(() => RequisitosPublicacion.comprobar(p)).toThrow();
  });
  it('admite stock cero y archivos heredados sin exigir Cloudinary', () => {
    expect(() => RequisitosPublicacion.comprobar(producto())).not.toThrow();
  });
  it('acepta déficit preexistente sin modificar ni liberar reservas', () => {
    const p = producto();
    p.variantesDirectas[0].cantidadReservada = 3;
    expect(() => RequisitosPublicacion.comprobar(p)).not.toThrow();
    expect(p.variantesDirectas[0].cantidadReservada).toBe(3);
  });
  it('rechaza precio pendiente y anterior incoherente', () => {
    const p = producto();
    p.precio = null;
    expect(() => RequisitosPublicacion.comprobar(p)).toThrow();
    p.precio = new Prisma.Decimal('100');
    p.precioAnterior = new Prisma.Decimal('100');
    expect(() => RequisitosPublicacion.comprobar(p)).toThrow();
  });
  it('rechaza marca o categoría inactiva y modelo sin identidad completa', () => {
    for (const cambiar of [
      (p: ProductoPublicable) => (p.grupoModelo!.marca!.activa = false),
      (p: ProductoPublicable) => (p.categoria!.activa = false),
      (p: ProductoPublicable) => (p.grupoModelo!.codigoModelo = null),
    ]) {
      const p = producto();
      cambiar(p);
      expect(() => RequisitosPublicacion.comprobar(p)).toThrow();
    }
  });
  it('conserva los SKU y rechaza una identidad incompatible en vez de regenerarla', () => {
    const p = producto();
    p.variantesDirectas[0].sku = 'NK-OTRO-BL-40P5';
    expect(() => RequisitosPublicacion.comprobar(p)).toThrow();
    expect(p.variantesDirectas[0].sku).toBe('NK-OTRO-BL-40P5');
  });
  it('comprueba también variantes deshabilitadas y el puente de color', () => {
    const p = producto();
    p.colores[0].variantes.push({ id: 'otra' });
    p.variantesDirectas.push({
      ...p.variantesDirectas[0],
      id: 'otra',
      habilitada: false,
      productoColorId: 'color-ajeno',
    });
    expect(() => RequisitosPublicacion.comprobar(p)).toThrow();
  });
  it('rechaza una galería vacía, sin portada o con foto no disponible', () => {
    const vacia = producto();
    vacia.imagenes = [];
    expect(() => RequisitosPublicacion.comprobar(vacia)).toThrow();
    const sinPortada = producto();
    sinPortada.imagenes[0].orden = 1;
    expect(() => RequisitosPublicacion.comprobar(sinPortada)).toThrow();
    const eliminando = producto();
    eliminando.imagenes[0].archivo!.estado = 'ELIMINANDO';
    expect(() => RequisitosPublicacion.comprobar(eliminando)).toThrow();
  });
  it('comprueba pertenencia y correspondencia de la URL del archivo', () => {
    const p = producto();
    p.imagenes[0].archivo!.urlEntrega = '/otra.png';
    expect(() => RequisitosPublicacion.comprobar(p)).toThrow();
    p.imagenes[0].archivo!.urlEntrega = '/foto.png';
    p.imagenes[0].archivo!.productoOrigenId = 'ajeno';
    expect(() => RequisitosPublicacion.comprobar(p)).toThrow();
  });
});
