import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GoogleCuentaApi } from '../../servicios/google-cuenta-api';
import { GoogleIdentity } from '../../servicios/google-identity';
import { PerfilGoogle, PropositoGoogle } from '../../modelos/google';
import { nombreValido } from '../../modelos/validacion-cuenta';
import { CampoFormulario } from '../../../../compartido/componentes/campo-formulario/campo-formulario';

@Component({
  selector: 'app-boton-google',
  imports: [FormsModule, CampoFormulario],
  templateUrl: './boton-google.html',
  styleUrl: './boton-google.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BotonGoogle implements AfterViewInit {
  readonly proposito = input<PropositoGoogle>('acceso');
  readonly clave = input('');
  readonly bloqueado = input(false);
  readonly acceso = output<void>();
  readonly ocupado = output<boolean>();
  readonly completando = output<boolean>();
  private readonly api = inject(GoogleCuentaApi);
  private readonly identidad = inject(GoogleIdentity);
  private readonly destruir = inject(DestroyRef);
  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('boton');
  protected readonly visible = signal(true);
  protected readonly cargando = signal(true);
  protected readonly procesando = signal(false);
  protected readonly mensaje = signal('');
  protected readonly perfil = signal<(PerfilGoogle & { correo: string }) | null>(null);
  protected readonly intentado = signal(false);
  protected nombres = '';
  protected apellidos = '';
  private credential?: string;
  private liberar?: () => void;
  private generacion = 0;

  ngAfterViewInit() {
    this.destruir.onDestroy(() => {
      this.generacion++;
      this.credential = undefined;
      this.liberar?.();
    });
    void this.preparar();
  }
  protected async preparar() {
    if (this.procesando()) return;
    const generacion = ++this.generacion;
    this.liberar?.();
    this.liberar = undefined;
    this.perfil.set(null);
    this.credential = undefined;
    this.completando.emit(false);
    this.cargando.set(true);
    this.mensaje.set('');
    try {
      const config = await this.api.configuracion();
      if (this.destruir.destroyed || generacion !== this.generacion) return;
      this.visible.set(config.habilitado);
      if (!config.habilitado) {
        this.cargando.set(false);
        return;
      }
      const desafio = await this.api.desafio(this.proposito());
      if (this.destruir.destroyed || generacion !== this.generacion) return;
      const liberar = await this.identidad.montar(
        this.host().nativeElement,
        desafio,
        (credential) => {
          if (
            this.destruir.destroyed ||
            generacion !== this.generacion ||
            this.bloqueado() ||
            this.procesando()
          )
            return;
          this.credential = credential;
          void this.enviar();
        },
        (estado) => {
          if (this.destruir.destroyed || generacion !== this.generacion) return;
          this.cargando.set(estado === 'cargando');
          if (estado === 'error') this.errorCarga();
        },
      );
      if (this.destruir.destroyed || generacion !== this.generacion) liberar();
      else this.liberar = liberar;
    } catch {
      if (!this.destruir.destroyed && generacion === this.generacion) {
        this.visible.set(true);
        this.errorCarga();
      }
    }
  }
  private errorCarga() {
    this.cargando.set(false);
    this.mensaje.set('No pudimos preparar Google. Puedes reintentar o continuar con tu correo.');
  }
  protected errorNombre(valor: string) {
    return this.intentado() && !nombreValido(valor) ? 'Ingresa entre 2 y 80 caracteres.' : '';
  }
  protected completar() {
    this.intentado.set(true);
    if (!nombreValido(this.nombres) || !nombreValido(this.apellidos)) {
      this.enfocar('[aria-invalid="true"]');
      return;
    }
    void this.enviar({ nombres: this.nombres, apellidos: this.apellidos });
  }
  private async enviar(perfil?: PerfilGoogle) {
    if (!this.credential || this.procesando() || this.bloqueado()) return;
    this.procesando.set(true);
    this.ocupado.emit(true);
    this.mensaje.set('');
    try {
      const resultado =
        this.proposito() === 'acceso'
          ? await this.api.ingresar(this.credential, perfil)
          : await this.api.vincular(this.credential, this.clave());
      if (this.destruir.destroyed) return;
      if (resultado.tipo === 'correcto') {
        this.credential = undefined;
        this.completando.emit(false);
        this.acceso.emit();
      } else if (resultado.tipo === 'completar') {
        this.perfil.set(resultado.perfil);
        this.nombres = resultado.perfil.nombres;
        this.apellidos = resultado.perfil.apellidos;
        this.intentado.set(false);
        this.completando.emit(true);
        this.enfocar(!nombreValido(this.nombres) ? '#google-nombres' : '#google-apellidos');
      } else {
        this.mensaje.set(resultado.mensaje);
        this.credential = undefined;
        this.perfil.set(null);
        this.completando.emit(false);
        this.liberar?.();
        this.liberar = undefined;
        this.enfocar('[role="alert"]');
      }
    } finally {
      if (!this.destruir.destroyed) {
        this.procesando.set(false);
        this.ocupado.emit(false);
      }
    }
  }
  private enfocar(selector: string) {
    setTimeout(() => {
      if (!this.destruir.destroyed)
        this.elemento.nativeElement.querySelector<HTMLElement>(selector)?.focus();
    });
  }
}
