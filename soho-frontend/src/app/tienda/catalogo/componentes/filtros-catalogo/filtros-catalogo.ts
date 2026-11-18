import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';

import { FiltrosCatalogo as CriteriosCatalogo } from '../../modelos/filtros-catalogo';
import { FUENTE_CATALOGO } from '../../modelos/fuente-catalogo';
import { Icono } from '../../../../compartido/componentes/icono/icono';
import { FiltroPrecio } from './componentes/filtro-precio/filtro-precio';
import { SISTEMA_TALLAS } from '../../modelos/variante-producto';
import { GeneroProducto } from '../../modelos/producto';

@Component({
  selector: 'app-filtros-catalogo',
  imports: [Icono, FiltroPrecio],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './filtros-catalogo.html',
  styleUrl: './filtros-catalogo.css',
})
export class FiltrosCatalogo {
  protected readonly sistemaTallas = SISTEMA_TALLAS;
  readonly criterios = input<CriteriosCatalogo>({});
  readonly identificador = input('filtros');
  readonly abiertosInicialmente = input(true);
  readonly cambiados = output<CriteriosCatalogo>();
  private readonly catalogo = inject(FUENTE_CATALOGO);
  protected readonly marcas = computed(() => this.catalogo.marcas);
  protected readonly categorias = computed(
    () =>
      this.catalogo.opciones?.categorias ??
      [...new Set(this.catalogo.productos.map((producto) => producto.categoria))].sort(),
  );
  protected readonly colores = computed(
    () =>
      this.catalogo.opciones?.colores ?? [
        ...new Map(
          this.catalogo.productos
            .flatMap((producto) => producto.colores)
            .map((color) => [color.codigo, color]),
        ).values(),
      ],
  );
  protected readonly tallas = computed(
    () =>
      this.catalogo.opciones?.tallas ??
      [
        ...new Set(
          this.catalogo.productos.flatMap((producto) =>
            producto.variantes.map((variante) => variante.talla),
          ),
        ),
      ].sort((a, b) => Number(a) - Number(b)),
  );
  protected readonly generos = ['Hombre', 'Mujer', 'Unisex'] as const;
  protected readonly generosSeleccionados = computed(() => {
    const criterios = this.criterios();
    return criterios.generos ?? (criterios.genero ? [criterios.genero] : []);
  });
  private readonly precios = computed(() =>
    this.catalogo.productos
      .filter((producto) => producto.publicado)
      .map((producto) => producto.precio),
  );
  protected readonly precioInferior = computed(() =>
    this.catalogo.opciones
      ? Math.floor(Number(this.catalogo.opciones.precioMinimo))
      : this.precios().length
        ? Math.floor(Math.min(...this.precios()))
        : 0,
  );
  protected readonly precioSuperior = computed(() =>
    this.catalogo.opciones
      ? Math.ceil(Number(this.catalogo.opciones.precioMaximo))
      : this.precios().length
        ? Math.ceil(Math.max(...this.precios()))
        : 0,
  );

  protected alternar(campo: 'marcas' | 'categorias' | 'colores' | 'tallas', valor: string) {
    const actuales = this.criterios()[campo] ?? [];
    this.cambiados.emit({
      ...this.criterios(),
      [campo]: actuales.includes(valor)
        ? actuales.filter((actual) => actual !== valor)
        : [...actuales, valor],
    });
  }
  protected alternarGenero(genero: GeneroProducto) {
    const actuales = this.generosSeleccionados();
    this.cambiados.emit({
      ...this.criterios(),
      genero: undefined,
      generos: actuales.includes(genero)
        ? actuales.filter((actual) => actual !== genero)
        : [...actuales, genero],
    });
  }
  protected seleccionarTodosLosGeneros(seleccionados: boolean) {
    this.cambiados.emit({
      ...this.criterios(),
      genero: undefined,
      generos: seleccionados ? [...this.generos] : [],
    });
  }
  protected cambiarPrecio(campo: 'precioMinimo' | 'precioMaximo', valor: number | undefined) {
    this.cambiados.emit({ ...this.criterios(), [campo]: valor });
  }
  protected cambiarEspecial(campo: 'soloNovedades' | 'soloOfertas', valor: boolean) {
    this.cambiados.emit({ ...this.criterios(), [campo]: valor });
  }
}
