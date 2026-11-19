export const ID_PRODUCTO_PRUEBA = '12345678-1234-1234-1234-123456789abc';
export const ID_VARIANTE_PRUEBA = '22345678-1234-1234-1234-123456789abc';
export function productoAdminFixture() {
  return {
    id: ID_PRODUCTO_PRUEBA,
    slug: 'zapatilla-real',
    codigoInterno: 'SHO-0001',
    nombre: 'Zapatilla real',
    modelo: null,
    codigoModelo: null,
    descripcion: '',
    genero: 'Unisex',
    estado: 'borrador',
    precio: null,
    precioAnterior: null,
    esNovedad: false,
    esDestacado: false,
    marca: null,
    categoria: null,
    imagenes: ['/imagenes/productos/af1.png'],
    colores: [{ codigo: 'NG', nombre: 'Negro', hexadecimal: '#000000', imagenes: [] }],
    variantes: [
      {
        id: ID_VARIANTE_PRUEBA,
        sku: 'NK-AF107-NG-40',
        codigoColor: 'NG',
        talla: '40',
        sistemaTallas: 'EU',
        habilitada: true,
        existencias: 5,
        cantidadReservada: 3,
        disponible: 2,
        faltante: 0,
      },
    ],
    inventario: {
      fisico: 5,
      reservado: 3,
      disponible: 2,
      bajo: 1,
      agotadas: 0,
      activas: 1,
      faltante: 0,
    },
  };
}
export function listadoProductosFixture() {
  return {
    productos: [productoAdminFixture()],
    paginacion: { pagina: 1, limite: 20, total: 30, paginas: 2 },
    resumen: { publicados: 10, borradores: 20, archivados: 3, variantes: 80 },
    capacidades: { escrituraDisponible: false },
  };
}
export function resumenInventarioFixture() {
  return {
    resumen: { publicados: 10, borradores: 20, archivados: 3, variantes: 80 },
    alertasTotal: 30,
    agotadasTotal: 20,
    faltantesTotal: 1,
    alertas: [
      {
        producto: { id: ID_PRODUCTO_PRUEBA, nombre: 'Zapatilla real' },
        variante: {
          id: ID_VARIANTE_PRUEBA,
          sku: 'NK-AF107-NG-40',
          talla: '40',
          existencias: 5,
          cantidadReservada: 3,
        },
        disponible: 2,
        faltante: 0,
        color: 'Negro',
        imagen: null,
      },
    ],
    capacidades: { escrituraDisponible: false },
  };
}
