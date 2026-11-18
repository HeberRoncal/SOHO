import {
  DestroyRef,
  Directive,
  ElementRef,
  NgZone,
  effect,
  inject,
  input,
  output,
} from '@angular/core';

@Directive({
  selector: '[appZoomImagen]',
})
export class ZoomImagen {
  readonly fuente = input.required<string>({ alias: 'appZoomImagen' });
  readonly desactivado = input(false, { alias: 'zoomDesactivado' });
  readonly activacion = input<'cursor' | 'clic'>('cursor', { alias: 'activacionZoom' });
  readonly cambioZoom = output<boolean>();
  private readonly elemento = inject(ElementRef<HTMLImageElement>);
  private readonly zona = inject(NgZone);
  private readonly destruccion = inject(DestroyRef);

  constructor() {
    effect((limpiar) => {
      this.fuente();
      const porClic = this.activacion() === 'clic';
      if (this.desactivado()) return;
      const imagen = this.elemento.nativeElement;
      const contenedor = imagen.parentElement;
      const ventana = imagen.ownerDocument.defaultView;
      if (!contenedor || !ventana) return;
      let fotograma: number | undefined;
      let animacion: Animation | undefined;
      let activo = false;
      let posicionX = 0;
      let posicionY = 0;
      let puntero: number | undefined;
      let inicioX = 0;
      let inicioY = 0;
      let origenX = 0;
      let origenY = 0;
      let arrastrado = false;
      let ignorarClic = false;

      const cancelarAnimacion = () => {
        if (animacion) {
          animacion.onfinish = null;
          animacion.cancel();
          animacion = undefined;
        }
      };
      const restablecer = () => {
        if (fotograma !== undefined) ventana.cancelAnimationFrame(fotograma);
        fotograma = undefined;
        cancelarAnimacion();
        activo = false;
        if (!this.destruccion.destroyed) this.cambioZoom.emit(false);
        puntero = undefined;
        arrastrado = false;
        ignorarClic = false;
        imagen.style.removeProperty('transform');
        imagen.style.removeProperty('transform-origin');
      };
      const animar = (escala: number, alFinalizar?: () => void) => {
        const transformacionActual = ventana.getComputedStyle(imagen).transform;
        cancelarAnimacion();
        imagen.style.transform = `scale(${escala})`;
        if (ventana.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          alFinalizar?.();
          return;
        }
        const nueva = imagen.animate(
          [{ transform: transformacionActual }, { transform: `scale(${escala})` }],
          { duration: 900, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
        );
        animacion = nueva;
        nueva.onfinish = () => {
          if (animacion !== nueva) return;
          cancelarAnimacion();
          alFinalizar?.();
        };
      };
      const salir = () => {
        if (fotograma !== undefined) ventana.cancelAnimationFrame(fotograma);
        fotograma = undefined;
        if (!activo) return;
        activo = false;
        this.cambioZoom.emit(false);
        // Conserva el último origen mientras regresa suavemente al tamaño normal.
        animar(1, restablecer);
      };
      const programar = (x: number, y: number) => {
        if (!imagen.complete || !imagen.naturalWidth) return;
        posicionX = x;
        posicionY = y;
        if (fotograma !== undefined) return;
        fotograma = ventana.requestAnimationFrame(() => {
          fotograma = undefined;
          if (!imagen.isConnected) return;
          const limites = contenedor.getBoundingClientRect();
          if (!limites.width || !limites.height) return;
          const x = Math.min(limites.width, Math.max(0, posicionX - limites.left));
          const y = Math.min(limites.height, Math.max(0, posicionY - limites.top));
          // El origen sigue al cursor sin reiniciar el aumento progresivo.
          imagen.style.transformOrigin = `${x}px ${y}px`;
          if (activo) return;
          activo = true;
          this.cambioZoom.emit(true);
          animar(2);
        });
      };
      const actualizar = (evento: PointerEvent) => {
        if (porClic) {
          if (evento.pointerId === puntero) {
            const desplazamientoX = evento.clientX - inicioX;
            const desplazamientoY = evento.clientY - inicioY;
            if (Math.hypot(desplazamientoX, desplazamientoY) > 6) arrastrado = true;
            if (activo && arrastrado)
              programar(origenX - desplazamientoX, origenY - desplazamientoY);
          } else if (activo && evento.pointerType === 'mouse') {
            programar(evento.clientX, evento.clientY);
          }
          return;
        }
        if (
          evento.pointerType === 'mouse' &&
          ventana.matchMedia('(any-hover: hover) and (any-pointer: fine)').matches
        )
          programar(evento.clientX, evento.clientY);
      };
      const alternar = (evento: MouseEvent) => {
        if (
          evento.type === 'click' &&
          (('pointerType' in evento && evento.pointerType === 'touch') ||
            (ignorarClic && evento.detail > 0))
        ) {
          ignorarClic = false;
          return;
        }
        if (arrastrado) {
          arrastrado = false;
          return;
        }
        if (activo) {
          salir();
          return;
        }
        const limites = contenedor.getBoundingClientRect();
        const porTeclado = evento.type === 'click' && evento.detail === 0;
        programar(
          porTeclado ? limites.left + limites.width / 2 : evento.clientX,
          porTeclado ? limites.top + limites.height / 2 : evento.clientY,
        );
      };
      const iniciarArrastre = (evento: PointerEvent) => {
        ignorarClic = false;
        arrastrado = false;
        if (evento.pointerType === 'mouse') {
          return;
        }
        if (!evento.isPrimary) return;
        puntero = evento.pointerId;
        inicioX = evento.clientX;
        inicioY = evento.clientY;
        const limites = contenedor.getBoundingClientRect();
        const origen = ventana.getComputedStyle(imagen).transformOrigin.split(' ').map(parseFloat);
        origenX = limites.left + origen[0];
        origenY = limites.top + origen[1];
        // La captura táctil implícita conserva el recorrido sobre la imagen.
      };
      const terminarArrastre = (evento: PointerEvent) => {
        if (evento.pointerId !== puntero) return;
        puntero = undefined;
        // El toque se resuelve al levantar el dedo. Su clic de compatibilidad
        // se ignora para no alternar el zoom dos veces ni depender del navegador.
        if (!arrastrado) alternar(evento);
        ignorarClic = true;
      };

      this.zona.runOutsideAngular(() => {
        if (porClic) {
          contenedor.addEventListener('click', alternar);
          contenedor.addEventListener('pointerdown', iniciarArrastre);
          contenedor.addEventListener('pointerup', terminarArrastre);
        } else {
          contenedor.addEventListener('pointerenter', actualizar);
          contenedor.addEventListener('pointerleave', salir);
        }
        contenedor.addEventListener('pointermove', actualizar);
        contenedor.addEventListener('pointercancel', restablecer);
        ventana.addEventListener('blur', restablecer);
        ventana.addEventListener('resize', restablecer);
      });
      limpiar(() => {
        restablecer();
        contenedor.removeEventListener('pointerenter', actualizar);
        contenedor.removeEventListener('click', alternar);
        contenedor.removeEventListener('pointerdown', iniciarArrastre);
        contenedor.removeEventListener('pointerup', terminarArrastre);
        contenedor.removeEventListener('pointermove', actualizar);
        contenedor.removeEventListener('pointerleave', salir);
        contenedor.removeEventListener('pointercancel', restablecer);
        ventana.removeEventListener('blur', restablecer);
        ventana.removeEventListener('resize', restablecer);
      });
    });
  }
}
