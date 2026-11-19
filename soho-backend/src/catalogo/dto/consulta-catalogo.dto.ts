import { BadRequestException } from '@nestjs/common';

export const ORDENES_CATALOGO = [
  'relevancia',
  'precio-ascendente',
  'precio-descendente',
  'novedades',
] as const;
export type OrdenCatalogo = (typeof ORDENES_CATALOGO)[number];
export type GeneroConsulta = 'Hombre' | 'Mujer' | 'Unisex';
export interface ConsultaCatalogoDto {
  busqueda?: string;
  marcas: string[];
  categorias: string[];
  generos: GeneroConsulta[];
  colores: string[];
  tallas: string[];
  slugs: string[];
  skus: string[];
  desde?: string;
  hasta?: string;
  novedades: boolean;
  destacados: boolean;
  ofertas: boolean;
  orden: OrdenCatalogo;
  pagina: number;
  limite: number;
}

export function leerConsultaCatalogo(
  entrada: Record<string, unknown>,
): ConsultaCatalogoDto {
  const permitidos = [
    'busqueda',
    'marca',
    'categoria',
    'genero',
    'color',
    'talla',
    'slug',
    'sku',
    'desde',
    'hasta',
    'novedades',
    'destacados',
    'ofertas',
    'orden',
    'pagina',
    'limite',
  ];
  if (Object.keys(entrada).some((campo) => !permitidos.includes(campo))) {
    throw new BadRequestException(
      'La consulta contiene parámetros no admitidos.',
    );
  }
  function lista(campo: string, maximo = 20): string[] {
    const valor = entrada[campo];
    if (valor === undefined) return [];
    const valores = Array.isArray(valor) ? valor : [valor];
    if (
      valores.length > maximo ||
      valores.some(
        (v) => typeof v !== 'string' || !v.trim() || v.trim().length > 160,
      )
    ) {
      throw new BadRequestException(`Revisa el parámetro ${campo}.`);
    }
    return [...new Set((valores as string[]).map((v) => v.trim()))];
  }
  function unico(campo: string): string | undefined {
    if (Array.isArray(entrada[campo]))
      throw new BadRequestException(`${campo} debe tener un único valor.`);
    return lista(campo, 1)[0];
  }
  function entero(campo: string, defecto: number, maximo: number): number {
    const valor = unico(campo);
    if (valor === undefined) return defecto;
    if (!/^[1-9]\d*$/.test(valor) || Number(valor) > maximo)
      throw new BadRequestException(`Revisa ${campo}.`);
    return Number(valor);
  }
  function precio(campo: string): string | undefined {
    const valor = unico(campo);
    if (
      valor !== undefined &&
      (!/^\d{1,6}(?:\.\d{1,2})?$/.test(valor) || Number(valor) > 999999.99)
    )
      throw new BadRequestException(
        `Revisa ${campo}: usa soles con hasta dos decimales.`,
      );
    return valor;
  }
  function indicador(campo: string): boolean {
    const valor = unico(campo);
    if (valor !== undefined && valor !== '0' && valor !== '1')
      throw new BadRequestException(`${campo} debe ser 0 o 1.`);
    return valor === '1';
  }
  const orden = unico('orden') ?? 'relevancia';
  if (!ORDENES_CATALOGO.includes(orden as OrdenCatalogo))
    throw new BadRequestException('Orden no admitido.');
  const generos = lista('genero');
  if (generos.some((v) => !['Hombre', 'Mujer', 'Unisex'].includes(v)))
    throw new BadRequestException('Género no admitido.');
  const colores = lista('color');
  if (colores.some((v) => !/^[A-Z]{2}$/.test(v)))
    throw new BadRequestException('Código de color no válido.');
  const tallas = lista('talla');
  if (
    tallas.some(
      (v) => !/^\d{2}(?:\.5)?$/.test(v) || Number(v) < 35 || Number(v) > 48,
    )
  )
    throw new BadRequestException(
      'La talla debe estar entre EU 35 y 48, en pasos de 0.5.',
    );
  const desde = precio('desde'),
    hasta = precio('hasta');
  if (
    desde !== undefined &&
    hasta !== undefined &&
    Number(desde) > Number(hasta)
  )
    throw new BadRequestException(
      'El precio mínimo no puede superar el máximo.',
    );
  const busqueda = unico('busqueda');
  if (busqueda && busqueda.length > 120)
    throw new BadRequestException('La búsqueda admite hasta 120 caracteres.');
  return {
    busqueda,
    marcas: lista('marca'),
    categorias: lista('categoria'),
    generos: generos as GeneroConsulta[],
    colores,
    tallas,
    slugs: lista('slug', 100),
    skus: lista('sku', 100),
    desde,
    hasta,
    novedades: indicador('novedades'),
    destacados: indicador('destacados'),
    ofertas: indicador('ofertas'),
    orden: orden as OrdenCatalogo,
    pagina: entero('pagina', 1, 10000),
    limite: entero('limite', 12, 100),
  };
}
