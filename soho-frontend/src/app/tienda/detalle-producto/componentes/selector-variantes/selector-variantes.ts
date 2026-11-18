import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { Icono } from '../../../../compartido/componentes/icono/icono';

import { Producto } from '../../../catalogo/modelos/producto';
import { SISTEMA_TALLAS } from '../../../catalogo/modelos/variante-producto';
import { ColorProducto } from '../../../catalogo/modelos/color-producto';
import { FUENTE_CATALOGO } from '../../../catalogo/modelos/fuente-catalogo';

@Component({
  selector: 'app-selector-variantes',
  imports: [Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './selector-variantes.html',
  styleUrl: './selector-variantes.css',
})
export class SelectorVariantes {
  protected readonly sistemaTallas = SISTEMA_TALLAS;
  readonly producto = input.required<Producto>();
  readonly codigoColor = input('');
  readonly talla = input('');
  readonly bloqueado = input(false);
  readonly colorCambiado = output<string>();
  readonly tallaCambiada = output<string>();
  readonly guiaSolicitada = output<void>();
  readonly fichaColorCambiada = output<string>();
  protected readonly catalogo = inject(FUENTE_CATALOGO);
  protected readonly color = computed<ColorProducto | undefined>(
    () =>
      this.producto().colores.find((color) => color.codigo === this.codigoColor()) ??
      this.producto().colores[0],
  );
  protected readonly variantes = computed(() =>
    this.producto().variantes.filter((variante) => variante.codigoColor === this.color()?.codigo),
  );
  protected readonly opcionesColor = computed(() =>
    [
      ...this.producto().colores.map((color) => ({
        codigo: color.codigo,
        nombre: color.nombre,
        hexadecimal: color.hexadecimal,
        imagen: color.imagenes[0] ?? this.producto().imagenes[0],
        slug: null as string | null,
      })),
      ...(this.producto().otrosColores ?? []).map((color) => ({
        ...color,
        imagen: color.imagen ?? this.catalogo.obtener(color.slug)?.imagenes[0],
      })),
    ].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es-PE')),
  );
  protected seleccionarTalla(talla: string) {
    if (this.bloqueado()) return;
    const variante = this.variantes().find((variante) => variante.talla === talla);
    if (variante && this.catalogo.estaDisponible(variante)) this.tallaCambiada.emit(talla);
  }
  protected enlaceColor(slug: string) {
    return (
      '/producto/' +
      encodeURIComponent(slug) +
      (this.talla() ? '?talla=' + encodeURIComponent(this.talla()) : '')
    );
  }
  protected abrirFichaColor(evento: MouseEvent, slug: string) {
    if (evento.button !== 0 || evento.ctrlKey || evento.metaKey || evento.shiftKey || evento.altKey)
      return;
    evento.preventDefault();
    this.fichaColorCambiada.emit(slug);
  }
}
