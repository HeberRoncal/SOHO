import { readFileSync } from 'node:fs';

export interface MarcaSeed {
  nombre: string;
  codigo: string;
  logotipo: string;
  altoLogotipo: number;
}

export interface ProductoSeed {
  identificador: string;
  codigoInterno: string;
  nombre: string;
  marca: string;
  modelo: string;
  codigoModelo: string;
  descripcion: string;
  categoria: string;
  genero: 'Hombre' | 'Mujer' | 'Unisex';
  precio: string;
  precioAnterior: string | null;
  esNovedad: boolean;
  publicado: boolean;
  imagenes: string[];
  colores: {
    codigo: string;
    nombre: string;
    hexadecimal: string;
    imagenes: string[];
  }[];
  variantes: {
    sku: string;
    codigoColor: string;
    talla: string;
    sistemaTallas: 'EU';
    existencias: number;
    cantidadReservada: number;
    habilitada: boolean;
  }[];
}

export interface CatalogoSeed {
  version: number;
  origen: string;
  marcas: MarcaSeed[];
  productos: ProductoSeed[];
}

// Copia local de datos de prueba. El seed no depende del proyecto Angular.
export const CATALOGO_SEED: CatalogoSeed = JSON.parse(
  readFileSync(
    new URL('./catalogo-demostracion.json', import.meta.url),
    'utf8',
  ),
);
