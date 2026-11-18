import { productoAdminFixture, ID_PRODUCTO_PRUEBA } from './consulta-productos.fixtures';
export const ID_MARCA_EDICION = '32345678-1234-1234-1234-123456789abc';
export const ID_CATEGORIA_EDICION = '42345678-1234-1234-1234-123456789abc';
export const ID_GRUPO_EDICION = '52345678-1234-1234-1234-123456789abc';
export const ID_ARCHIVO_EDICION = '62345678-1234-1234-1234-123456789abc';
export function fichaEdicionFixture(version = 1) {
  return {
    ...productoAdminFixture(),
    version,
    grupoModelo: { id: ID_GRUPO_EDICION, version: 1 },
    marca: { id: ID_MARCA_EDICION, slug: 'nike', nombre: 'Nike', activa: true },
    categoria: { id: ID_CATEGORIA_EDICION, slug: 'lifestyle', nombre: 'Lifestyle', activa: true },
    modelo: 'Air Force',
    codigoModelo: 'AF107',
    precio: '100.00',
    ordenCatalogo: 0,
    ordenColor: 0,
  };
}
export function opcionesEdicionFixture() {
  return {
    marcas: [{ id: ID_MARCA_EDICION, codigo: 'NK', nombre: 'Nike', activa: true }],
    categorias: [{ id: ID_CATEGORIA_EDICION, nombre: 'Lifestyle', activa: true }],
    gruposModelo: [
      {
        id: ID_GRUPO_EDICION,
        marcaId: ID_MARCA_EDICION,
        codigoModelo: 'AF107',
        modelo: 'Air Force',
        version: 1,
      },
    ],
    tallas: [
      { sistema: 'EU', valor: '40' },
      { sistema: 'EU', valor: '40.5' },
      { sistema: 'EU', valor: '41' },
    ],
  };
}
export function archivoEdicionFixture() {
  return {
    id: ID_ARCHIVO_EDICION,
    estado: 'DISPONIBLE',
    url: '/imagenes/productos/af1.png',
    nombre: 'foto.png',
  };
}
export function galeriaEdicionFixture(version = 1) {
  return {
    productoId: ID_PRODUCTO_PRUEBA,
    version,
    galeria: [
      {
        archivoId: ID_ARCHIVO_EDICION,
        textoAlternativo: 'Frontal',
        orden: 0,
        ruta: '/imagenes/productos/af1.png',
        archivo: archivoEdicionFixture(),
      },
    ],
    archivos: [archivoEdicionFixture()],
  };
}
