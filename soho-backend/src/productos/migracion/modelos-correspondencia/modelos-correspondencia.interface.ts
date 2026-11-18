export interface ImagenAnteriorCorrespondencia {
  id: string;
  ruta: string;
  textoAlternativo: string;
  orden: number;
}

export interface VarianteAnteriorCorrespondencia {
  id: string;
  sku: string;
  tallaId: string;
  talla: { valor: string };
  existencias: number;
  cantidadReservada: number;
  habilitada: boolean;
  productoId: string | null;
  actualizadoEn: string;
}

export interface ColorAnteriorCorrespondencia {
  actualizadoEn?: string;
  id: string;
  codigo: string;
  nombre: string;
  hexadecimal: string;
  orden: number;
  imagenes: ImagenAnteriorCorrespondencia[];
  variantes: VarianteAnteriorCorrespondencia[];
}

export interface ProductoAnteriorCorrespondencia {
  id: string;
  slug: string;
  codigoInterno: string;
  codigoModelo: string | null;
  modelo: string | null;
  nombre: string;
  estado: 'BORRADOR' | 'PUBLICADO' | 'ARCHIVADO';
  precio: string | null;
  precioAnterior: string | null;
  marcaId: string | null;
  marca: { codigo: string } | null;
  grupoModeloId: string | null;
  actualizadoEn: string;
  imagenes: ImagenAnteriorCorrespondencia[];
  colores: ColorAnteriorCorrespondencia[];
}

export interface EntradaCorrespondencia {
  version: 1;
  productos: ProductoAnteriorCorrespondencia[];
}

export interface DestinoCorrespondencia {
  productoAnteriorId: string;
  colorAnteriorId: string | null;
  grupoModeloId: string;
  productoDestinoId: string;
  conservaIdentidad: boolean;
  codigoInterno: string;
  slug: string;
  nombre: string;
  codigoColor: string | null;
  colorNombre: string | null;
  colorHexadecimal: string | null;
  ordenColor: number;
  precio: string | null;
  precioAnterior: string | null;
  variantes: (VarianteAnteriorCorrespondencia & {
    productoDestinoId: string;
  })[];
  galeria: (ImagenAnteriorCorrespondencia & {
    imagenAnteriorId: string;
    archivoId: string;
  })[];
}

export interface PlanCorrespondencia {
  version: 1;
  tipo: 'SOLO_PLAN_SIN_ESCRITURAS';
  huellaOrigen: string;
  aptoParaRevision: boolean;
  incidencias: { codigo: string; productoId: string; detalle: string }[];
  advertencias: { codigo: string; productoId: string }[];
  ultimoNumeroExistente: number;
  ultimoNumeroPropuesto: number;
  grupos: {
    id: string;
    productoAnteriorId: string;
    marcaId: string | null;
    codigoModelo: string | null;
    modelo: string | null;
    slugCarpeta: string;
  }[];
  productos: DestinoCorrespondencia[];
  alias: {
    slugAnterior: string;
    codigoColor: string;
    productoDestinoId: string;
  }[];
}
