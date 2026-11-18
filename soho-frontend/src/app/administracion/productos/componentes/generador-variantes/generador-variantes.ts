import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { ColorProducto } from '../../../../tienda/catalogo/modelos/color-producto';
import { VarianteProducto } from '../../../../tienda/catalogo/modelos/variante-producto';
import { Icono } from '../../../../compartido/componentes/icono/icono';
import {
  COLORES_VARIANTES,
  EdicionVariantes,
  TALLAS_EU_ADMIN,
  errorColores,
  planVariantes,
} from '../../modelos/edicion-variantes';
interface ColorGenerador extends ColorProducto {
  seleccionado: boolean;
  bloqueado: boolean;
}

@Component({
  imports: [Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-generador-variantes',
  styleUrl: './generador-variantes.css',
  templateUrl: './generador-variantes.html',
})
export class GeneradorVariantes {
  readonly codigo = input('');
  readonly colores = input<readonly ColorProducto[]>([]);
  readonly variantes = input<readonly VarianteProducto[]>([]);
  readonly ocupados = input<readonly string[]>([]);
  readonly generado = output<EdicionVariantes>();
  readonly pendiente = output<boolean>();
  protected readonly filas = signal<readonly ColorGenerador[]>([]);
  protected readonly tallas = signal<readonly string[]>([]);
  protected readonly opcionesTallas = TALLAS_EU_ADMIN;
  protected readonly etapa = signal(0);
  protected readonly error = signal('');
  protected readonly modificado = signal(false);
  protected readonly confirmando = signal(false);
  protected readonly disponibles = computed(() =>
    COLORES_VARIANTES.filter((c) => !this.filas().some((f) => f.codigo === c.codigo)),
  );
  protected readonly plan = computed(() =>
    planVariantes(
      this.codigo(),
      this.filas().filter((c) => c.seleccionado),
      this.tallas(),
      this.variantes(),
      this.ocupados(),
    ),
  );
  protected readonly nuevas = computed(() => this.plan().filter((f) => !f.existe && !f.colision));
  protected readonly existentes = computed(() => this.plan().filter((f) => f.existe).length);
  protected readonly colisiones = computed(() => this.plan().some((f) => f.colision));
  protected readonly etapas = ['Colores y códigos', 'Tallas EU', 'Revisar SKU'];
  private iniciado = false;
  constructor() {
    effect(() => {
      const colores = this.colores();
      untracked(() => {
        if (!this.iniciado) {
          this.filas.set(colores.map((c) => ({ ...c, seleccionado: true, bloqueado: true })));
          this.iniciado = true;
        }
      });
    });
    effect(() => this.pendiente.emit(this.modificado()));
  }
  protected agregarCatalogo(evento: Event) {
    const entrada = evento.target as HTMLSelectElement;
    const color = COLORES_VARIANTES.find((c) => c.codigo === entrada.value);
    if (color && this.disponibles().some((c) => c.codigo === color.codigo)) this.agregar(color);
    entrada.value = '';
  }
  protected agregar(
    color: ColorProducto = { codigo: '', nombre: '', hexadecimal: '#808080', imagenes: [] },
  ) {
    this.filas.update((f) => [...f, { ...color, seleccionado: true, bloqueado: false }]);
    this.modificado.set(true);
    this.error.set('');
  }
  protected editar(indice: number, campo: 'nombre' | 'codigo' | 'hexadecimal', evento: Event) {
    const valor = (evento.target as HTMLInputElement).value;
    this.filas.update((f) =>
      f.map((c, i) =>
        i === indice && !c.bloqueado
          ? { ...c, [campo]: campo === 'codigo' ? valor.toUpperCase() : valor }
          : c,
      ),
    );
    this.modificado.set(true);
    this.error.set('');
  }
  protected seleccionar(indice: number) {
    this.filas.update((f) =>
      f.map((c, i) => (i === indice ? { ...c, seleccionado: !c.seleccionado } : c)),
    );
    this.modificado.set(true);
    this.error.set('');
  }
  protected quitar(indice: number) {
    this.filas.update((f) => f.filter((c, i) => i !== indice || c.bloqueado));
    this.modificado.set(true);
    this.error.set('');
  }
  protected talla(valor: string) {
    this.tallas.update((t) =>
      t.includes(valor)
        ? t.filter((x) => x !== valor)
        : [...t, valor].sort((a, b) => Number(a) - Number(b)),
    );
    this.modificado.set(true);
    this.error.set('');
  }
  protected enteras() {
    this.tallas.set(TALLAS_EU_ADMIN.filter((t) => !t.includes('.')));
    this.modificado.set(true);
    this.error.set('');
  }
  protected ninguna() {
    this.tallas.set([]);
    this.modificado.set(true);
  }
  protected evitarEnvio(evento: Event) {
    if (evento.target instanceof HTMLInputElement || evento.target instanceof HTMLSelectElement)
      evento.preventDefault();
  }
  protected ir(etapa: number) {
    this.etapa.set(etapa);
    this.error.set('');
  }
  protected continuar() {
    const error =
      this.etapa() === 0
        ? errorColores(this.filas()) ||
          (!this.filas().some((c) => c.seleccionado) ? 'Selecciona al menos un color.' : '')
        : !this.tallas().length
          ? 'Selecciona al menos una talla EU.'
          : '';
    this.error.set(error);
    if (!error) this.etapa.update((e) => e + 1);
  }
  protected generar() {
    if (this.confirmando() || !this.nuevas().length || this.colisiones()) return;
    this.confirmando.set(true);
    const nuevas = this.nuevas();
    const colores = [
      ...this.colores(),
      ...this.filas()
        .filter(
          (c) =>
            nuevas.some((n) => n.color.codigo === c.codigo) &&
            !this.colores().some((actual) => actual.codigo === c.codigo),
        )
        .map((c) => ({
          codigo: c.codigo,
          nombre: c.nombre.trim(),
          hexadecimal: c.hexadecimal,
          imagenes: [],
        })),
    ];
    this.generado.emit({
      colores,
      variantes: [
        ...this.variantes(),
        ...nuevas.map((f) => ({
          identificador: f.sku,
          sku: f.sku,
          codigoColor: f.color.codigo,
          talla: f.talla,
          sistemaTallas: 'EU' as const,
          existencias: 0,
          cantidadReservada: 0,
          habilitada: true,
        })),
      ],
    });
  }
}
