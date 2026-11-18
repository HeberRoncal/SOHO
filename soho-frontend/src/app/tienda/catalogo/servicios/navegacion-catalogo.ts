import { Injectable } from '@angular/core';
import { ParamMap, Params } from '@angular/router';
import { FiltrosCatalogo, OrdenCatalogo } from '../modelos/filtros-catalogo';
import { SeccionCatalogo } from '../modelos/seccion-catalogo';
import { GeneroProducto } from '../modelos/producto';

export const SECCIONES_CATALOGO: readonly SeccionCatalogo[] = [
  { ruta: 'zapatillas', filtros: {}, titulo: 'Zapatillas' },
  { ruta: 'zapatillas-hombre', filtros: { genero: 'Hombre' }, titulo: 'Zapatillas hombre' },
  { ruta: 'zapatillas-mujer', filtros: { genero: 'Mujer' }, titulo: 'Zapatillas mujer' },
  { ruta: 'zapatillas-unisex', filtros: { genero: 'Unisex' }, titulo: 'Zapatillas unisex' },
  { ruta: 'zapatillas-novedades', filtros: { soloNovedades: true }, titulo: 'Novedades' },
  { ruta: 'zapatillas-ofertas', filtros: { soloOfertas: true }, titulo: 'Ofertas' },
];

const lista = (valores: readonly string[]) => [
  ...new Set(valores.map((valor) => valor.trim()).filter(Boolean)),
];
const numero = (valor: string | null): number | undefined => {
  if (valor === null || valor.trim() === '') return undefined;
  const resultado = Number(valor);
  return Number.isFinite(resultado) && resultado >= 0 ? resultado : undefined;
};

@Injectable({ providedIn: 'root' })
export class NavegacionCatalogo {
  obtenerSeccion(ruta: unknown): SeccionCatalogo {
    return SECCIONES_CATALOGO.find((actual) => actual.ruta === ruta) ?? SECCIONES_CATALOGO[0];
  }

  leerConSeccion(parametros: ParamMap, ruta: unknown) {
    const actual = this.leer(parametros);
    const base = this.obtenerSeccion(ruta).filtros;
    return {
      ...actual,
      filtros: {
        ...actual.filtros,
        ...base,
        generos: base.genero ? undefined : actual.filtros.generos,
      },
    };
  }

  crearDestino(
    filtros: FiltrosCatalogo = {},
    orden: OrdenCatalogo = 'relevancia',
    rutaActual?: string,
  ) {
    const generos = filtros.generos ?? (filtros.genero ? [filtros.genero] : []);
    const genero = generos.length === 1 ? generos[0] : undefined;
    const actual = this.obtenerSeccion(rutaActual);
    const conservarSeccion =
      Object.keys(actual.filtros).length > 0 &&
      (!actual.filtros.genero || actual.filtros.genero === genero) &&
      (!actual.filtros.soloNovedades || filtros.soloNovedades) &&
      (!actual.filtros.soloOfertas || filtros.soloOfertas);
    const ruta = filtros.soloOfertas
      ? 'zapatillas-ofertas'
      : filtros.soloNovedades
        ? 'zapatillas-novedades'
        : SECCIONES_CATALOGO.find((seccion) => genero && seccion.filtros.genero === genero)?.ruta;
    const seccion = conservarSeccion ? actual : this.obtenerSeccion(ruta);
    return {
      ruta: '/' + seccion.ruta,
      parametros: this.crearParametros(
        {
          ...filtros,
          genero: undefined,
          generos: seccion.filtros.genero ? [] : generos,
          soloNovedades: seccion.filtros.soloNovedades ? undefined : filtros.soloNovedades,
          soloOfertas: seccion.filtros.soloOfertas ? undefined : filtros.soloOfertas,
        },
        orden,
      ),
    };
  }

  leer(parametros: ParamMap): { filtros: FiltrosCatalogo; orden: OrdenCatalogo } {
    const generos = lista(parametros.getAll('genero')).filter(
      (genero): genero is GeneroProducto =>
        genero === 'Hombre' || genero === 'Mujer' || genero === 'Unisex',
    );
    const orden = parametros.get('orden');
    return {
      filtros: {
        busqueda: parametros.get('busqueda')?.trim() || undefined,
        marcas: lista(parametros.getAll('marca')),
        genero: generos.length === 1 ? generos[0] : undefined,
        generos: generos.length > 1 ? generos : undefined,
        categorias: lista(parametros.getAll('categoria')),
        colores: lista(parametros.getAll('color')),
        tallas: lista(parametros.getAll('talla')),
        precioMinimo: numero(parametros.get('desde')),
        precioMaximo: numero(parametros.get('hasta')),
        soloNovedades: parametros.get('novedades') === '1',
        soloOfertas: parametros.get('ofertas') === '1',
      },
      orden:
        orden === 'precio-ascendente' || orden === 'precio-descendente' || orden === 'novedades'
          ? orden
          : 'relevancia',
    };
  }

  crearParametros(filtros: FiltrosCatalogo = {}, orden: OrdenCatalogo = 'relevancia'): Params {
    const marcas = lista([...(filtros.marcas ?? []), ...(filtros.marca ? [filtros.marca] : [])]);
    const generos = lista(filtros.generos ?? (filtros.genero ? [filtros.genero] : []));
    return {
      busqueda: filtros.busqueda?.trim() || null,
      marca: marcas.length ? marcas : null,
      genero: generos.length > 1 ? generos : (generos[0] ?? null),
      categoria: filtros.categorias?.length ? [...filtros.categorias] : null,
      color: filtros.colores?.length ? [...filtros.colores] : null,
      talla: filtros.tallas?.length ? [...filtros.tallas] : null,
      desde: filtros.precioMinimo !== undefined ? String(filtros.precioMinimo) : null,
      hasta: filtros.precioMaximo !== undefined ? String(filtros.precioMaximo) : null,
      novedades: filtros.soloNovedades ? '1' : null,
      ofertas: filtros.soloOfertas ? '1' : null,
      orden: orden === 'relevancia' ? null : orden,
    };
  }
}
