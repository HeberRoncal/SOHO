import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  OnInit,
  inject,
  input,
  output,
  signal,
  afterNextRender,
  effect,
  untracked,
} from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CampoFormulario } from '../../../../compartido/componentes/campo-formulario/campo-formulario';
import { Icono } from '../../../../compartido/componentes/icono/icono';
import { PrecioProducto } from '../../../../compartido/componentes/precio-producto/precio-producto';
import { DatosEntrega as DireccionEntrega } from '../../modelos/datos-entrega';
import { CampoEntrega, ErroresEntrega, ValidacionEntrega } from '../../modelos/validacion-entrega';
import { FACTURACION_INICIAL, Facturacion, erroresFacturacion } from '../../modelos/facturacion';
import { CoberturaEntrega } from '../../servicios/cobertura-entrega';
import { ZonaEntrega } from '../../modelos/zona-entrega';

@Component({
  imports: [ReactiveFormsModule, CampoFormulario, Icono, PrecioProducto],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-datos-entrega',
  styleUrl: './datos-entrega.css',
  templateUrl: './datos-entrega.html',
})
export class DatosEntrega implements OnInit {
  readonly iniciales = input<DireccionEntrega | null>(null);
  readonly ocupado = input(false);
  readonly cambiados = output<DireccionEntrega>();
  readonly confirmado = output<DireccionEntrega>();
  private readonly constructorFormulario = inject(FormBuilder).nonNullable;
  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  protected readonly cobertura = inject(CoberturaEntrega);
  protected readonly intentado = signal(false);
  protected readonly formulario = this.constructorFormulario.group(
    {
      nombres: '',
      apellidos: '',
      correo: '',
      celular: '',
      distrito: '',
      direccion: '',
      referencia: '',
      destinatario: '',
      facturacion: this.constructorFormulario.group({ ...FACTURACION_INICIAL }),
    },
    {
      validators: (grupo: AbstractControl) => {
        const datos = grupo.getRawValue() as DireccionEntrega;
        const errores = ValidacionEntrega.errores(datos);
        if (datos.distrito && !this.cobertura.cotizar(datos.distrito))
          errores.distrito =
            this.cobertura.mensajeCotizacion() || 'Confirma el costo de envío para este distrito.';
        return Object.keys(errores).length ? { datos: errores } : null;
      },
    },
  );
  protected readonly zonaExiste = (zona: ZonaEntrega) =>
    zona.codigo === this.formulario.controls.distrito.value;
  constructor() {
    this.formulario.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.cambiados.emit(this.formulario.getRawValue()));
    effect(() => {
      const iniciales = this.iniciales();
      if (!iniciales) return;
      untracked(() => {
        this.formulario.patchValue(
          {
            ...iniciales,
            destinatario: iniciales.destinatario ?? '',
            facturacion: iniciales.facturacion ?? { ...FACTURACION_INICIAL },
          },
          { emitEvent: false },
        );
        this.tipoComprobante(this.formulario.controls.facturacion.controls.tipo.value, false);
      });
    });
    effect(() => {
      this.cobertura.estado();
      this.cobertura.cotizando();
      this.cobertura.mensajeCotizacion();
      untracked(() => this.formulario.updateValueAndValidity({ emitEvent: false }));
    });
  }
  ngOnInit() {
    const datos = this.iniciales();
    if (datos) this.formulario.patchValue(datos, { emitEvent: false });
    this.tipoComprobante(this.formulario.controls.facturacion.controls.tipo.value, false);
  }
  protected error(campo: CampoEntrega) {
    const errores = this.formulario.errors?.['datos'] as ErroresEntrega | undefined;
    return this.intentado() || this.formulario.controls[campo].touched
      ? (errores?.[campo] ?? '')
      : '';
  }
  protected errorFiscal(campo: keyof Facturacion) {
    const control = this.formulario.controls.facturacion.controls[campo];
    return this.intentado() || control.touched
      ? (erroresFacturacion(this.formulario.controls.facturacion.getRawValue())[campo] ?? '')
      : '';
  }
  protected tipoComprobante(tipo: 'boleta' | 'factura', emitir = true) {
    const controles = this.formulario.controls.facturacion.controls;
    controles.tipo.setValue(tipo, { emitEvent: false });
    // Los controles ocultos conservan sus valores, pero no bloquean el otro comprobante.
    for (const campo of ['documento', 'numero'] as const) {
      if (tipo === 'boleta') controles[campo].enable({ emitEvent: false });
      else controles[campo].disable({ emitEvent: false });
    }
    for (const campo of ['ruc', 'razonSocial', 'domicilioFiscal'] as const) {
      if (tipo === 'factura') controles[campo].enable({ emitEvent: false });
      else controles[campo].disable({ emitEvent: false });
    }
    this.formulario.updateValueAndValidity({ emitEvent: emitir });
  }
  protected enviar() {
    if (this.ocupado() || this.cobertura.cotizando()) return;
    this.intentado.set(true);
    this.formulario.markAllAsTouched();
    this.formulario.updateValueAndValidity({ emitEvent: false });
    if (this.formulario.invalid) {
      afterNextRender(
        () =>
          this.elemento.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
        { injector: this.injector },
      );
      return;
    }
    const datos = ValidacionEntrega.normalizar(this.formulario.getRawValue());
    this.cambiados.emit(datos);
    this.confirmado.emit(datos);
  }
  protected async reintentarCobertura() {
    if (this.cobertura.estado() !== 'lista') await this.cobertura.cargar();
    await this.cobertura.confirmar(this.formulario.controls.distrito.value);
  }
}
