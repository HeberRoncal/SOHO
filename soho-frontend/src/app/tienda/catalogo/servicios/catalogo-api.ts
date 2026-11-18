import { DestroyRef, Injectable, inject, signal, untracked } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  Observable,
  catchError,
  concatMap,
  forkJoin,
  from,
  map,
  of,
  shareReplay,
  tap,
  throwError,
  timeout,
} from 'rxjs';
import type { FuenteCatalogo } from '../modelos/fuente-catalogo';
import { OpcionesCatalogo, PaginaApi, PaginaCatalogo, ProductoApi } from '../modelos/catalogo-api';
import { FiltrosCatalogo, OrdenCatalogo } from '../modelos/filtros-catalogo';
import { Producto } from '../modelos/producto';
import { logotipoMarca } from '../datos/logotipos-marcas';
import { VarianteProducto } from '../modelos/variante-producto';
import { consultarCatalogo, varianteDisponible } from '../modelos/consulta-catalogo';

export function adaptarProducto(p: ProductoApi): Producto {
  if (
    p.otrosColores?.some(
      (c) =>
        !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(c.slug) ||
        c.slug.length > 160 ||
        !/^[A-Z]{2}$/.test(c.codigo) ||
        !/^#[0-9a-f]{6}$/i.test(c.hexadecimal) ||
        !c.nombre.trim(),
    )
  )
    throw new Error('Enlace de color no válido.');
  const precio = (valor: string) => {
    if (!/^\d{1,6}\.\d{2}$/.test(valor) || Number(valor) <= 0)
      throw new Error('Importe del catálogo no válido.');
    return Number(valor);
  };
  return {
    identificador: p.slug,
    nombre: p.nombre,
    marca: p.marca,
    modelo: p.modelo,
    codigoModelo: p.codigoModelo,
    descripcion: p.descripcion,
    categoria: p.categoria,
    genero: p.genero,
    precio: precio(p.precio),
    precioAnterior: p.precioAnterior === null ? null : precio(p.precioAnterior),
    esNovedad: p.esNovedad,
    publicado: true,
    imagenes: p.imagenes,
    colores: p.colores,
    ...(p.otrosColores !== undefined ? { otrosColores: p.otrosColores } : {}),
    variantes: p.variantes.map((v) => {
      if (!Number.isInteger(v.disponible) || v.disponible < 0 || v.disponible > 99999)
        throw new Error('Disponibilidad no válida.');
      return {
        identificador: v.sku,
        sku: v.sku,
        codigoColor: v.codigoColor,
        talla: v.talla,
        sistemaTallas: v.sistemaTallas,
        habilitada: v.habilitada,
        existencias: v.disponible,
        cantidadReservada: 0,
      };
    }),
  };
}

@Injectable({ providedIn: 'root' })
export class CatalogoApi implements FuenteCatalogo {
  private readonly http = inject(HttpClient);
  private readonly destruccion = inject(DestroyRef);
  private readonly registros = signal<ReadonlyMap<string, Producto>>(new Map());
  private readonly opcionesActuales = signal<OpcionesCatalogo | undefined>(undefined);
  private iniciado = false;
  private readonly opciones$ = this.http.get<OpcionesCatalogo>('/api/catalogo/filtros').pipe(
    timeout(15000),
    map((opciones) => ({
      ...opciones,
      marcas: opciones.marcas.map((m) => ({
        ...m,
        logotipo: logotipoMarca(m.nombre, m.logotipo ?? ''),
        altoLogotipo: m.altoLogotipo ?? 24,
      })),
    })),
    tap((opciones) => this.opcionesActuales.set(opciones)),
    shareReplay({ bufferSize: 1, refCount: true }),
  );
  get productos(): readonly Producto[] {
    return [...this.registros().values()];
  }
  get marcas() {
    return this.opcionesActuales()?.marcas ?? [];
  }
  get opciones() {
    return this.opcionesActuales();
  }

  iniciar(): void {
    if (this.iniciado) return;
    this.iniciado = true;
    forkJoin([this.pagina({}, 'relevancia', 1, 100), this.opciones$])
      .pipe(takeUntilDestroyed(this.destruccion))
      .subscribe({
        error: () => {
          this.iniciado = false;
        },
      });
  }
  private guardar(productos: readonly Producto[]): void {
    this.registros.update((actuales) => {
      const siguiente = new Map(actuales);
      for (const producto of productos) {
        const skus = new Set(producto.variantes.map((v) => v.sku));
        for (const [slug, anterior] of siguiente)
          if (slug !== producto.identificador && anterior.variantes.some((v) => skus.has(v.sku)))
            siguiente.set(slug, {
              ...anterior,
              variantes: anterior.variantes.filter((v) => !skus.has(v.sku)),
            });
        siguiente.set(producto.identificador, producto);
      }
      return siguiente;
    });
  }
  private pagina(
    filtros: FiltrosCatalogo,
    orden: OrdenCatalogo,
    pagina: number,
    limite = 12,
    extra?: { campo: 'sku' | 'slug'; valores: readonly string[] },
  ): Observable<PaginaCatalogo> {
    let parametros = new HttpParams()
      .set('orden', orden)
      .set('pagina', pagina)
      .set('limite', limite);
    const listas = {
      marca: [...(filtros.marcas ?? []), ...(filtros.marca ? [filtros.marca] : [])],
      categoria: filtros.categorias ?? [],
      genero: filtros.generos ?? (filtros.genero ? [filtros.genero] : []),
      color: filtros.colores ?? [],
      talla: filtros.tallas ?? [],
    };
    for (const [campo, valores] of Object.entries(listas))
      for (const valor of new Set(valores)) parametros = parametros.append(campo, valor);
    if (filtros.busqueda) parametros = parametros.set('busqueda', filtros.busqueda);
    if (filtros.precioMinimo !== undefined)
      parametros = parametros.set('desde', filtros.precioMinimo);
    if (filtros.precioMaximo !== undefined)
      parametros = parametros.set('hasta', filtros.precioMaximo);
    if (filtros.soloNovedades) parametros = parametros.set('novedades', '1');
    if (filtros.soloOfertas) parametros = parametros.set('ofertas', '1');
    if (extra)
      for (const valor of extra.valores) parametros = parametros.append(extra.campo, valor);
    return this.http.get<PaginaApi>('/api/productos', { params: parametros }).pipe(
      timeout(15000),
      map((respuesta) => ({ ...respuesta, productos: respuesta.productos.map(adaptarProducto) })),
      tap((respuesta) => this.guardar(respuesta.productos)),
    );
  }
  consultarPagina(
    filtros: FiltrosCatalogo,
    orden: OrdenCatalogo,
    pagina: number,
  ): Observable<PaginaCatalogo> {
    return forkJoin({
      respuesta: this.pagina(filtros, orden, pagina),
      opciones: this.opciones$,
    }).pipe(map(({ respuesta }) => respuesta));
  }
  obtenerProducto(slug: string): Observable<Producto | undefined> {
    return this.http.get<ProductoApi>('/api/productos/' + encodeURIComponent(slug)).pipe(
      timeout(15000),
      map(adaptarProducto),
      tap((p) => this.guardar([p])),
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 404) {
          this.registros.update((registros) => {
            const siguientes = new Map(registros);
            siguientes.delete(slug);
            return siguientes;
          });
          return of(undefined);
        }
        return throwError(() => error);
      }),
    );
  }
  obtener(slug: string): Producto | undefined {
    return this.registros().get(slug);
  }
  estaDisponible(v: VarianteProducto): boolean {
    return varianteDisponible(v);
  }
  consultar(filtros: FiltrosCatalogo = {}, orden: OrdenCatalogo = 'relevancia'): Producto[] {
    return consultarCatalogo(this.productos, filtros, orden);
  }
  cargarSkus(skus: readonly string[]): void {
    this.cargarIdentificadores('sku', skus);
  }
  cargarSlugs(slugs: readonly string[]): void {
    this.cargarIdentificadores('slug', slugs);
  }
  private cargarIdentificadores(campo: 'sku' | 'slug', valores: readonly string[]): void {
    const conocidos = untracked(() => this.productos);
    const pendientes = [...new Set(valores)].filter(
      (v) =>
        v.length > 0 &&
        v.length <= (campo === 'sku' ? 96 : 160) &&
        !conocidos.some((p) =>
          campo === 'slug' ? p.identificador === v : p.variantes.some((s) => s.sku === v),
        ),
    );
    const lotes: string[][] = [];
    for (let i = 0; i < pendientes.length; i += 100) lotes.push(pendientes.slice(i, i + 100));
    from(lotes)
      .pipe(
        concatMap((lote) => this.pagina({}, 'relevancia', 1, 100, { campo, valores: lote })),
        takeUntilDestroyed(this.destruccion),
      )
      .subscribe({ error: () => undefined });
  }
}
