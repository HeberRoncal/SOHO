import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GoogleCuentaApi } from '../../servicios/google-cuenta-api';
import { CampoClave } from '../../../../compartido/componentes/campo-clave/campo-clave';
import { BotonGoogle } from '../boton-google/boton-google';

@Component({
  selector: 'app-vincular-google',
  imports: [FormsModule, CampoClave, BotonGoogle],
  templateUrl: './vincular-google.html',
  styleUrl: './vincular-google.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VincularGoogle implements OnInit {
  private readonly api = inject(GoogleCuentaApi);
  protected readonly estado = signal<
    'cargando' | 'vinculado' | 'disponible' | 'deshabilitado' | 'error'
  >('cargando');
  protected readonly ocupado = signal(false);
  protected readonly clave = signal('');
  protected readonly errorClave = computed(() =>
    Array.from(this.clave()).length > 128 ? 'Usa como máximo 128 caracteres.' : '',
  );
  ngOnInit() {
    void this.comprobar();
  }
  protected async comprobar() {
    this.estado.set('cargando');
    try {
      const [config, estado] = await Promise.all([this.api.configuracion(), this.api.estado()]);
      this.estado.set(
        estado.vinculado ? 'vinculado' : config.habilitado ? 'disponible' : 'deshabilitado',
      );
    } catch {
      this.estado.set('error');
    }
  }
  protected vinculado() {
    this.clave.set('');
    this.estado.set('vinculado');
  }
}
