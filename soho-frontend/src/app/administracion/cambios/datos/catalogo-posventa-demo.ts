import { Producto } from '../../../tienda/catalogo/modelos/producto';
import { SISTEMA_TALLAS } from '../../../tienda/catalogo/modelos/variante-producto';
// Datos ilustrativos del prototipo: no representan precios ni inventario comercial.
// Tallas EU ilustrativas para revisar las interfaces; no son conversiones desde US.
const TALLAS_EU_DEMOSTRACION = [
  '36',
  '37',
  '38',
  '39',
  '40',
  '41',
  '42',
  '43',
  '44',
  '45',
  '46',
  '47',
] as const;
const productosBase: readonly (Omit<Producto, 'variantes'> & {
  readonly codigoMarca: string;
  readonly tallasAgotadas: readonly string[];
})[] = [
  {
    identificador: 'af1',
    nombre: "Nike Air Force 1 '07",
    marca: 'Nike',
    modelo: "Air Force 1 '07",
    codigoModelo: 'AF107',
    descripcion:
      'Un ícono de cancha que se quedó en la calle. Capellada de cuero, suela de goma y una silueta limpia que combina con todo.',
    categoria: 'Urbano',
    genero: 'Unisex',
    precio: 529.9,
    precioAnterior: null,
    esNovedad: true,
    imagenes: ['/imagenes/productos/af1.png', '/imagenes/campanas/estilo-clasicos.jpg'],
    colores: [
      {
        codigo: 'BL',
        nombre: 'Blanco',
        hexadecimal: '#F2F2F0',
        imagenes: ['/imagenes/productos/af1.png'],
      },
    ],
    publicado: true,
    codigoMarca: 'NK',
    tallasAgotadas: ['36', '47'],
  },
  {
    identificador: 'samba',
    nombre: 'adidas Samba OG',
    marca: 'adidas',
    modelo: 'Samba OG',
    codigoModelo: 'SAMBAOG',
    descripcion:
      'Perfil bajo, puntera en T y suela de caucho color goma. Un clásico de terraza que funciona de lunes a domingo.',
    categoria: 'Clásicos',
    genero: 'Unisex',
    precio: 499.9,
    precioAnterior: null,
    esNovedad: true,
    imagenes: ['/imagenes/productos/samba.png', '/imagenes/productos/samba_b.png'],
    colores: [
      {
        codigo: 'BL',
        nombre: 'Blanco',
        hexadecimal: '#F2F2F0',
        imagenes: ['/imagenes/productos/samba.png'],
      },
      {
        codigo: 'NG',
        nombre: 'Negro',
        hexadecimal: '#151515',
        imagenes: ['/imagenes/productos/samba_b.png'],
      },
    ],
    publicado: true,
    codigoMarca: 'AD',
    tallasAgotadas: ['38', '45'],
  },
  {
    identificador: 'chuck70',
    nombre: 'Converse Chuck 70 Hi',
    marca: 'Converse',
    modelo: 'Chuck 70 Hi',
    codigoModelo: 'CHUCK70',
    descripcion:
      'Lona resistente, puntera brillante y una plantilla con más amortiguación. La bota de lona de siempre, mejor construida.',
    categoria: 'Clásicos',
    genero: 'Unisex',
    precio: 349.9,
    precioAnterior: null,
    esNovedad: true,
    imagenes: ['/imagenes/productos/chuck_p.png', '/imagenes/productos/chuck.png'],
    colores: [
      {
        codigo: 'CR',
        nombre: 'Crema',
        hexadecimal: '#EFE8D8',
        imagenes: ['/imagenes/productos/chuck_p.png'],
      },
      {
        codigo: 'NG',
        nombre: 'Negro',
        hexadecimal: '#151515',
        imagenes: ['/imagenes/productos/chuck.png'],
      },
    ],
    publicado: true,
    codigoMarca: 'CV',
    tallasAgotadas: ['42'],
  },
  {
    identificador: 'nb990v6',
    nombre: 'New Balance 990v6',
    marca: 'New Balance',
    modelo: '990v6',
    codigoModelo: '990V6',
    descripcion:
      'Gamuza y malla sobre una media suela FuelCell. Comodidad para todo el día con la estética técnica de la serie 990.',
    categoria: 'Uso diario',
    genero: 'Hombre',
    precio: 1049.9,
    precioAnterior: null,
    esNovedad: true,
    imagenes: ['/imagenes/productos/nb.png'],
    colores: [
      {
        codigo: 'NG',
        nombre: 'Negro',
        hexadecimal: '#151515',
        imagenes: ['/imagenes/productos/nb.png'],
      },
    ],
    publicado: true,
    codigoMarca: 'NB',
    tallasAgotadas: ['36', '37', '46'],
  },
  {
    identificador: 'oldskool',
    nombre: 'Vans Skate Old Skool',
    marca: 'Vans',
    modelo: 'Skate Old Skool',
    codigoModelo: 'OLDSKOOL',
    descripcion:
      'La franja lateral que nació en el skate. Gamuza y lona reforzadas, cuello acolchado y suela waffle de agarre firme.',
    categoria: 'Patineta',
    genero: 'Unisex',
    precio: 329.9,
    precioAnterior: null,
    esNovedad: false,
    imagenes: [
      '/imagenes/productos/vans_os.png',
      '/imagenes/productos/vans_navy.png',
      '/imagenes/campanas/hero-vans.jpg',
    ],
    colores: [
      {
        codigo: 'NG',
        nombre: 'Negro',
        hexadecimal: '#151515',
        imagenes: ['/imagenes/productos/vans_os.png'],
      },
      {
        codigo: 'AZ',
        nombre: 'Azul',
        hexadecimal: '#24395E',
        imagenes: ['/imagenes/productos/vans_navy.png'],
      },
    ],
    publicado: true,
    codigoMarca: 'VN',
    tallasAgotadas: ['40'],
  },
  {
    identificador: 'suede',
    nombre: 'Puma Suede Classic',
    marca: 'Puma',
    modelo: 'Suede Classic',
    codigoModelo: 'SUEDE',
    descripcion:
      'Gamuza suave, formstrip lateral y suela de goma. Un básico del streetwear desde hace décadas.',
    categoria: 'Urbano',
    genero: 'Unisex',
    precio: 279.9,
    precioAnterior: 349.9,
    esNovedad: false,
    imagenes: ['/imagenes/productos/suede.png', '/imagenes/campanas/hero-puma.jpg'],
    colores: [
      {
        codigo: 'NG',
        nombre: 'Negro',
        hexadecimal: '#151515',
        imagenes: ['/imagenes/productos/suede.png'],
      },
    ],
    publicado: true,
    codigoMarca: 'PM',
    tallasAgotadas: ['44', '47'],
  },
  {
    identificador: 'peg',
    nombre: 'Nike Pegasus Premium',
    marca: 'Nike',
    modelo: 'Pegasus Premium',
    codigoModelo: 'PEGASUS',
    descripcion:
      'Amortiguación reactiva para rodajes diarios. Malla transpirable y una pisada suave desde el primer kilómetro.',
    categoria: 'Para correr',
    genero: 'Hombre',
    precio: 559.9,
    precioAnterior: 699.9,
    esNovedad: false,
    imagenes: ['/imagenes/productos/peg.png'],
    colores: [
      {
        codigo: 'GR',
        nombre: 'Gris',
        hexadecimal: '#B9BEC6',
        imagenes: ['/imagenes/productos/peg.png'],
      },
    ],
    publicado: true,
    codigoMarca: 'NK',
    tallasAgotadas: ['39', '40'],
  },
  {
    identificador: 'ub5',
    nombre: 'adidas Ultraboost 5X',
    marca: 'adidas',
    modelo: 'Ultraboost 5X',
    codigoModelo: 'UB5X',
    descripcion:
      'Retorno de energía y un tejido que se adapta al pie. Para correr en ciudad o para el día a día.',
    categoria: 'Para correr',
    genero: 'Mujer',
    precio: 799.9,
    precioAnterior: null,
    esNovedad: false,
    imagenes: ['/imagenes/productos/ub5.png'],
    colores: [
      {
        codigo: 'BL',
        nombre: 'Blanco',
        hexadecimal: '#F2F2F0',
        imagenes: ['/imagenes/productos/ub5.png'],
      },
    ],
    publicado: true,
    codigoMarca: 'AD',
    tallasAgotadas: ['46', '47'],
  },
  {
    identificador: 'ub1',
    nombre: 'adidas Ultraboost 1.0',
    marca: 'adidas',
    modelo: 'Ultraboost 1.0',
    codigoModelo: 'UB10',
    descripcion:
      'El modelo que cambió el running urbano. Tejido Primeknit y media suela Boost en un total black.',
    categoria: 'Para correr',
    genero: 'Hombre',
    precio: 599.9,
    precioAnterior: 749.9,
    esNovedad: false,
    imagenes: ['/imagenes/productos/ub.png'],
    colores: [
      {
        codigo: 'NG',
        nombre: 'Negro',
        hexadecimal: '#151515',
        imagenes: ['/imagenes/productos/ub.png'],
      },
    ],
    publicado: true,
    codigoMarca: 'AD',
    tallasAgotadas: ['36', '43'],
  },
  {
    identificador: 'nb990v5',
    nombre: 'New Balance 990v5',
    marca: 'New Balance',
    modelo: '990v5',
    codigoModelo: '990V5',
    descripcion:
      'El gris que define a la serie. Gamuza y malla, estabilidad y un look que no pasa de moda.',
    categoria: 'Uso diario',
    genero: 'Unisex',
    precio: 949.9,
    precioAnterior: null,
    esNovedad: false,
    imagenes: ['/imagenes/productos/nb_g.png'],
    colores: [
      {
        codigo: 'GR',
        nombre: 'Gris',
        hexadecimal: '#A7A9AC',
        imagenes: ['/imagenes/productos/nb_g.png'],
      },
    ],
    publicado: true,
    codigoMarca: 'NB',
    tallasAgotadas: ['47'],
  },
  {
    identificador: 'suedexl',
    nombre: 'Puma Suede XL',
    marca: 'Puma',
    modelo: 'Suede XL',
    codigoModelo: 'SUEDEXL',
    descripcion:
      'Proporciones amplias, cordones gruesos y gamuza en tono arena. El Suede, en versión skate de los noventa.',
    categoria: 'Urbano',
    genero: 'Mujer',
    precio: 399.9,
    precioAnterior: null,
    esNovedad: true,
    imagenes: ['/imagenes/productos/suedexl.png'],
    colores: [
      {
        codigo: 'BE',
        nombre: 'Beige',
        hexadecimal: '#D9C3A0',
        imagenes: ['/imagenes/productos/suedexl.png'],
      },
    ],
    publicado: true,
    codigoMarca: 'PM',
    tallasAgotadas: ['36', '37'],
  },
];

// Las combinaciones y los SKU se generan solo para los escenarios visuales.
// La generación comercial y sus restricciones corresponderán al backend.
export const PRODUCTOS_DEMOSTRACION: readonly Producto[] = productosBase.map(
  ({ codigoMarca, tallasAgotadas, ...producto }) => ({
    ...producto,
    variantes: producto.colores.flatMap((color) =>
      TALLAS_EU_DEMOSTRACION.map((talla) => {
        const sku = [
          codigoMarca,
          producto.codigoModelo,
          color.codigo,
          talla.replace('.', 'P'),
        ].join('-');
        return {
          identificador: sku,
          sku,
          codigoColor: color.codigo,
          talla,
          sistemaTallas: SISTEMA_TALLAS,
          existencias: tallasAgotadas.includes(talla) ? 0 : 5,
          cantidadReservada: 0,
          habilitada: true,
        };
      }),
    ),
  }),
);
