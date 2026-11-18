import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Icono } from '../../../../compartido/componentes/icono/icono';

@Component({
  imports: [Icono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-fotografias-producto',
  styleUrl: './fotografias-producto.css',
  templateUrl: './fotografias-producto.html',
})
export class FotografiasProducto {
  readonly imagenes = input<readonly string[]>([]);
  readonly bloqueado = input(false);
  readonly error = input('');
  readonly cambio = output<readonly string[]>();
  readonly procesando = output<boolean>();
  private readonly destruccion = inject(DestroyRef);
  protected readonly cargando = signal(false);
  protected readonly errorArchivo = signal('');
  protected readonly aviso = signal('');
  protected quitar(indice: number) {
    this.cambio.emit(this.imagenes().filter((_, i) => i !== indice));
    this.aviso.set('Fotografía eliminada.');
  }
  protected portada(indice: number) {
    this.cambio.emit([this.imagenes()[indice], ...this.imagenes().filter((_, i) => i !== indice)]);
    this.aviso.set('Portada actualizada.');
  }
  protected async subir(evento: Event) {
    const entrada = evento.target as HTMLInputElement;
    const archivos = [...(entrada.files ?? [])];
    entrada.value = '';
    if (!archivos.length || this.cargando()) return;
    this.errorArchivo.set('');
    this.aviso.set('');
    if (this.imagenes().length + archivos.length > 8) {
      this.errorArchivo.set('Puedes guardar hasta 8 fotografías. Quita una antes de agregar más.');
      return;
    }
    this.cargando.set(true);
    this.procesando.emit(true);
    try {
      const nuevas: string[] = [];
      for (const archivo of archivos) {
        if (
          !['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(archivo.type) ||
          !archivo.size ||
          archivo.size > 5 * 1024 * 1024
        )
          throw Error('Elige imágenes JPG, PNG o WebP de hasta 5 MB cada una.');
        const contenido = await new Promise<string>((resolve, reject) => {
          const lector = new FileReader();
          lector.onload = () => resolve(String(lector.result));
          lector.onerror = () =>
            reject(Error('No se pudo leer la fotografía. Vuelve a seleccionarla.'));
          lector.readAsDataURL(archivo);
        });
        await new Promise<void>((resolve, reject) => {
          const imagen = new Image();
          imagen.onload = () =>
            imagen.naturalWidth && imagen.naturalHeight
              ? resolve()
              : reject(Error('La imagen está dañada. Elige otro archivo.'));
          imagen.onerror = () => reject(Error('La imagen está dañada. Elige otro archivo.'));
          imagen.src = contenido;
        });
        nuevas.push(contenido);
      }
      if (this.destruccion.destroyed) return;
      this.cambio.emit([...this.imagenes(), ...nuevas]);
      this.aviso.set(nuevas.length === 1 ? 'Fotografía agregada.' : 'Fotografías agregadas.');
    } catch (error) {
      if (!this.destruccion.destroyed)
        this.errorArchivo.set(
          error instanceof Error
            ? error.message
            : 'No se pudieron agregar las fotografías. Inténtalo de nuevo.',
        );
    } finally {
      if (!this.destruccion.destroyed) {
        this.cargando.set(false);
        this.procesando.emit(false);
      }
    }
  }
}
