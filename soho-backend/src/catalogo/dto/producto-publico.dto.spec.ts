import { Prisma } from '../../generated/prisma/client.js';
import {
  productoPublico,
  type ProductoSeleccionado,
} from './producto-publico.dto.js';

function producto(): ProductoSeleccionado {
  return {
    id: 'actual',
    grupoModeloId: 'grupo',
    slug: 'samba-blanco',
    nombre: 'Samba OG',
    codigoColor: 'BL',
    colorNombre: 'Blanco',
    colorHexadecimal: '#ffffff',
    grupoModelo: {
      codigoModelo: 'SAMBAOG',
      modelo: 'Samba OG',
      marca: { nombre: 'adidas' },
      productos: [
        {
          id: 'actual',
          slug: 'samba-blanco',
          codigoColor: 'BL',
          colorNombre: 'Blanco',
          colorHexadecimal: '#ffffff',
          imagenes: [],
        },
        {
          id: 'otro',
          slug: 'samba-negro',
          codigoColor: 'NG',
          colorNombre: 'Negro',
          colorHexadecimal: '#000000',
          imagenes: [
            {
              ruta: '/imagenes/negro.webp',
              archivo: {
                urlEntrega: 'https://res.cloudinary.com/prueba/negro.webp',
              },
            },
          ],
        },
      ],
    },
    modelo: null,
    codigoModelo: null,
    descripcion: '',
    genero: 'UNISEX',
    precio: new Prisma.Decimal('100'),
    precioAnterior: null,
    esNovedad: false,
    marca: null,
    categoria: { nombre: 'Clásicos' },
    imagenes: [],
    variantesDirectas: [],
    colores: [],
  };
}
describe('Miniaturas públicas de otros colores', () => {
  it('incluye la imagen de entrega y conserva la identidad del otro color sin exponer el archivo', () => {
    const respuesta = productoPublico(producto());
    expect(respuesta.otrosColores).toEqual([
      {
        slug: 'samba-negro',
        codigo: 'NG',
        nombre: 'Negro',
        hexadecimal: '#000000',
        imagen: 'https://res.cloudinary.com/prueba/negro.webp',
      },
    ]);
  });
  it('usa la ruta de imagen disponible cuando no hay URL de entrega', () => {
    const p = producto();
    p.grupoModelo!.productos[1].imagenes[0].archivo = null;
    expect(productoPublico(p).otrosColores![0].imagen).toBe(
      '/imagenes/negro.webp',
    );
  });
});
