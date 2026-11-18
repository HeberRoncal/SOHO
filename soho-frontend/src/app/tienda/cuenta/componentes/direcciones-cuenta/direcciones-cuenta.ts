import { ChangeDetectionStrategy, Component, inject, signal, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Cuenta } from '../../servicios/cuenta';
import { DireccionCuenta } from '../../modelos/cuenta';
import { nombreValido } from '../../modelos/validacion-cuenta';
import { CoberturaEntrega } from '../../../finalizar-compra/servicios/cobertura-entrega';
import { CampoFormulario } from '../../../../compartido/componentes/campo-formulario/campo-formulario';
import { Icono } from '../../../../compartido/componentes/icono/icono';
import { VentanaDialogo } from '../../../../compartido/componentes/ventana-dialogo/ventana-dialogo';

@Component({
  imports: [ReactiveFormsModule, CampoFormulario, Icono, VentanaDialogo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-direcciones-cuenta',
  styleUrl: './direcciones-cuenta.css',
  templateUrl: './direcciones-cuenta.html',
})
export class DireccionesCuenta implements OnInit {
  protected readonly cuenta = inject(Cuenta);
  protected readonly cobertura = inject(CoberturaEntrega);
  protected readonly editando = signal(false);
  protected readonly identificador = signal<string | null>(null);
  protected readonly eliminando = signal<DireccionCuenta | null>(null);
  protected readonly intentado = signal(false);
  protected readonly mensaje = signal('');
  protected readonly esError = signal(false);
  protected readonly cargando = signal(true);
  protected readonly ocupado = signal(false);
  protected readonly errorCarga = signal('');
  protected readonly formulario = inject(FormBuilder).nonNullable.group({
    etiqueta: '',
    destinatario: '',
    celular: '',
    distrito: '',
    direccion: '',
    referencia: '',
    predeterminada: false,
  });
  ngOnInit() {
    void this.cargar();
  }
  protected async cargar() {
    if (this.ocupado()) return;
    this.cargando.set(true);
    this.errorCarga.set('');
    const resultado = await this.cuenta.cargarDirecciones();
    if (!resultado.correcto) this.errorCarga.set(resultado.mensaje);
    this.cargando.set(false);
  }
  protected editar(direccion: DireccionCuenta | null) {
    if (this.ocupado() || this.cargando() || this.errorCarga()) return;
    const perfil = this.cuenta.perfil();
    this.identificador.set(direccion?.id ?? null);
    this.formulario.reset(
      direccion ?? {
        etiqueta: '',
        destinatario: perfil ? perfil.nombres + ' ' + perfil.apellidos : '',
        celular: perfil?.celular ?? '',
        distrito: '',
        direccion: '',
        referencia: '',
        predeterminada: !this.cuenta.direcciones().length,
      },
    );
    this.intentado.set(false);
    this.mensaje.set('');
    this.editando.set(true);
  }
  protected error(
    campo: 'etiqueta' | 'destinatario' | 'celular' | 'distrito' | 'direccion' | 'referencia',
  ): string {
    const control = this.formulario.controls[campo];
    if (!this.intentado() && !control.touched) return '';
    const valor = control.value;
    if (campo === 'etiqueta' && !nombreValido(valor, 40))
      return 'Ingresa un nombre para esta dirección (máximo 40 caracteres).';
    if (campo === 'destinatario' && !nombreValido(valor, 140))
      return 'Ingresa el nombre de quien recibirá tu pedido.';
    if (campo === 'celular' && !/^9\d{8}$/.test(valor))
      return 'Ingresa un celular de 9 dígitos que empiece con 9.';
    if (campo === 'distrito' && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(valor))
      return 'Selecciona un distrito.';
    if (campo === 'direccion' && (valor.trim().length < 6 || valor.length > 180))
      return 'Incluye calle o avenida y número.';
    if (campo === 'referencia' && valor.length > 200) return 'Usa como máximo 200 caracteres.';
    return '';
  }
  protected async guardar() {
    if (this.ocupado()) return;
    this.intentado.set(true);
    if (
      (
        ['etiqueta', 'destinatario', 'celular', 'distrito', 'direccion', 'referencia'] as const
      ).some((campo) => this.error(campo))
    )
      return;
    this.ocupado.set(true);
    this.formulario.disable();
    try {
      const resultado = await this.cuenta.guardarDireccion({
        ...this.formulario.getRawValue(),
        id: this.identificador() ?? undefined,
      });
      this.esError.set(!resultado.correcto);
      this.mensaje.set(resultado.mensaje);
      if (resultado.correcto) this.editando.set(false);
    } finally {
      this.ocupado.set(false);
      this.formulario.enable();
    }
  }
  protected async eliminar() {
    if (this.ocupado()) return;
    const direccion = this.eliminando();
    if (!direccion) return;
    this.ocupado.set(true);
    try {
      const resultado = await this.cuenta.eliminarDireccion(direccion.id);
      this.esError.set(!resultado.correcto);
      this.mensaje.set(resultado.mensaje);
      if (resultado.correcto) this.eliminando.set(null);
    } finally {
      this.ocupado.set(false);
    }
  }
  protected async predeterminar(id: string) {
    if (this.ocupado()) return;
    this.ocupado.set(true);
    try {
      const resultado = await this.cuenta.predeterminarDireccion(id);
      this.esError.set(!resultado.correcto);
      this.mensaje.set(resultado.mensaje);
    } finally {
      this.ocupado.set(false);
    }
  }
  protected cerrarDialogo() {
    if (!this.ocupado()) this.eliminando.set(null);
  }
  protected nombreDistrito(codigo: string) {
    return this.cobertura.zonas.find((zona) => zona.codigo === codigo)?.nombre ?? codigo;
  }
}
