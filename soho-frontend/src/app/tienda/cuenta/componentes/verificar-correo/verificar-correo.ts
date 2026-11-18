import { Location } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Cuenta } from '../../servicios/cuenta';

@Component({
  selector: 'app-verificar-correo',
  imports: [RouterLink],
  templateUrl: './verificar-correo.html',
  styleUrl: './verificar-correo.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VerificarCorreo implements OnInit {
  protected readonly cuenta = inject(Cuenta);
  private readonly ruta = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly destruir = inject(DestroyRef);
  protected readonly estado = signal<
    'comprobando' | 'vigente' | 'invalido' | 'error' | 'confirmado'
  >('comprobando');
  protected readonly ocupado = signal(false);
  protected readonly mensaje = signal('');
  private token = '';
  private revision = 0;
  private limpiando = false;
  constructor() {
    const meta = inject(Meta),
      anterior = meta.getTag('name="referrer"')?.getAttribute('content');
    meta.updateTag({ name: 'referrer', content: 'no-referrer' });
    this.destruir.onDestroy(() => {
      ++this.revision;
      this.token = '';
      if (anterior == null) meta.removeTag('name="referrer"');
      else meta.updateTag({ name: 'referrer', content: anterior });
    });
  }
  ngOnInit() {
    this.ruta.fragment.pipe(takeUntilDestroyed(this.destruir)).subscribe((f) => this.recibir(f));
  }
  private recibir(fragmento: string | null) {
    if (fragmento === null && this.limpiando) {
      this.limpiando = false;
      return;
    }
    const revision = ++this.revision;
    const parametros = new URLSearchParams(fragmento ?? ''),
      token = parametros.get('token') ?? '';
    this.token =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[A-Za-z0-9_-]{43}$/.test(
        token,
      ) && [...parametros.keys()].length === 1
        ? token
        : '';
    this.ocupado.set(false);
    this.mensaje.set('');
    this.location.replaceState('/verificar-correo');
    if (fragmento !== null) {
      this.limpiando = true;
      queueMicrotask(() => {
        if (!this.destruir.destroyed && revision === this.revision)
          void this.router.navigateByUrl('/verificar-correo', { replaceUrl: true });
      });
    }
    void this.comprobar();
  }
  protected async comprobar() {
    if (this.ocupado()) return;
    if (!this.token) {
      this.estado.set('invalido');
      return;
    }
    const revision = this.revision;
    this.ocupado.set(true);
    this.estado.set('comprobando');
    this.mensaje.set('');
    try {
      const r = await this.cuenta.comprobarVerificacion(this.token);
      if (this.destruir.destroyed || revision !== this.revision) return;
      if (!r.correcto && r.codigo !== 'enlace-invalido') {
        this.estado.set('error');
        this.mensaje.set(r.mensaje);
      } else this.estado.set(r.vigente ? 'vigente' : 'invalido');
    } finally {
      if (!this.destruir.destroyed && revision === this.revision) this.ocupado.set(false);
    }
  }
  protected async confirmar() {
    if (this.ocupado() || this.estado() !== 'vigente') return;
    const revision = this.revision;
    this.ocupado.set(true);
    this.mensaje.set('');
    try {
      const r = await this.cuenta.verificar(this.token);
      if (this.destruir.destroyed || revision !== this.revision) return;
      if (r.correcto) {
        this.token = '';
        this.estado.set('confirmado');
      } else if (r.codigo === 'enlace-invalido') {
        this.token = '';
        this.estado.set('invalido');
      } else this.mensaje.set(r.mensaje);
    } finally {
      if (!this.destruir.destroyed && revision === this.revision) this.ocupado.set(false);
    }
  }
}
