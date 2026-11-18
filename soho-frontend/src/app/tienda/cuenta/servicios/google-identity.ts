import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { DesafioGoogle, GoogleIdApi } from '../modelos/google';

@Injectable({ providedIn: 'root' })
export class GoogleIdentity {
  private readonly documento = inject(DOCUMENT);
  private carga?: Promise<GoogleIdApi>;
  private propietario?: object;
  private sdk() {
    return (
      this.documento.defaultView as
        (Window & { google?: { accounts?: { id?: GoogleIdApi } } }) | null
    )?.google?.accounts?.id;
  }
  cargar(): Promise<GoogleIdApi> {
    const actual = this.sdk();
    if (actual) return Promise.resolve(actual);
    if (this.carga) return this.carga;
    this.carga = new Promise<GoogleIdApi>((resolve, reject) => {
      const script = this.documento.createElement('script');
      const terminar = (error?: Error) => {
        clearTimeout(reloj);
        script.onload = null;
        script.onerror = null;
        const sdk = this.sdk();
        if (error || !sdk) {
          this.carga = undefined;
          script.remove();
          reject(error ?? new Error('Google no está disponible.'));
        } else resolve(sdk);
      };
      const reloj = setTimeout(() => terminar(new Error('Google no respondió.')), 10000);
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = () => terminar();
      script.onerror = () => terminar(new Error('No se pudo cargar Google.'));
      this.documento.head.appendChild(script);
    });
    return this.carga;
  }

  async montar(
    elemento: HTMLElement,
    desafio: DesafioGoogle,
    recibir: (credential: string) => void,
    informar: (estado: 'cargando' | 'listo' | 'error') => void = () => {},
  ) {
    const sdk = await this.cargar();
    const propietario = {};
    this.propietario = propietario;
    sdk.initialize({
      client_id: desafio.clientId,
      nonce: desafio.nonce,
      auto_select: false,
      ux_mode: 'popup',
      callback: (respuesta) => {
        if (
          this.propietario === propietario &&
          (!respuesta.state || respuesta.state === desafio.nonce) &&
          typeof respuesta.credential === 'string'
        )
          recibir(respuesta.credential);
      },
    });
    let anchoAnterior = -1;
    let listo = false;
    let estable = 0;
    let fotograma = 0;
    let reloj: ReturnType<typeof setTimeout> | undefined;
    let cerrado = false;
    let observador: ResizeObserver | undefined;
    const mutaciones = new MutationObserver(() => programarRevision());
    const liberar = () => {
      if (cerrado) return;
      cerrado = true;
      cancelAnimationFrame(fotograma);
      clearTimeout(reloj);
      mutaciones.disconnect();
      observador?.disconnect();
      elemento.removeEventListener('load', programarRevision, true);
      if (this.propietario === propietario) this.propietario = undefined;
      elemento.replaceChildren();
    };
    const revisar = () => {
      fotograma = 0;
      if (cerrado || listo || this.propietario !== propietario) return;
      const iframe = elemento.querySelector('iframe');
      const provisional = elemento.querySelector<HTMLElement>('[role="button"]');
      const marco = iframe?.getBoundingClientRect();
      // El SDK crea primero un botón provisional y luego un iframe. Esperamos
      // a que el marco tenga tamaño y el provisional deje de ocupar espacio.
      if (!marco?.width || !marco.height || provisional?.getClientRects().length) {
        estable = 0;
        return;
      }
      if (++estable < 2) {
        programarRevision();
        return;
      }
      listo = true;
      clearTimeout(reloj);
      elemento.style.opacity = '';
      informar('listo');
    };
    function programarRevision() {
      if (!cerrado && !fotograma) fotograma = requestAnimationFrame(revisar);
    }
    const dibujar = () => {
      if (cerrado || this.propietario !== propietario) return;
      const ancho = Math.min(
        400,
        Math.max(200, Math.floor(elemento.getBoundingClientRect().width || 320)),
      );
      if (ancho === anchoAnterior) return;
      anchoAnterior = ancho;
      listo = false;
      estable = 0;
      elemento.style.opacity = '0';
      informar('cargando');
      clearTimeout(reloj);
      reloj = setTimeout(() => {
        liberar();
        informar('error');
      }, 10000);
      elemento.replaceChildren();
      sdk.renderButton(elemento, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        locale: 'es',
        width: ancho,
        state: desafio.nonce,
      });
      programarRevision();
    };
    mutaciones.observe(elemento, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'width', 'height', 'hidden'],
    });
    elemento.addEventListener('load', programarRevision, true);
    try {
      dibujar();
      observador = typeof ResizeObserver === 'function' ? new ResizeObserver(dibujar) : undefined;
      observador?.observe(elemento);
      return liberar;
    } catch (error) {
      liberar();
      throw error;
    }
  }
}
