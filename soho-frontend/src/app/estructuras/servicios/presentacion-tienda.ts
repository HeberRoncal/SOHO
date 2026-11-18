import { DOCUMENT } from '@angular/common';
import { inject, Injectable, InjectionToken, signal } from '@angular/core';
import { Producto } from '../../tienda/catalogo/modelos/producto';
import { FiltrosCatalogo } from '../../tienda/catalogo/modelos/filtros-catalogo';
import { Router } from '@angular/router';
import { NavegacionCatalogo } from '../../tienda/catalogo/servicios/navegacion-catalogo';

export type PanelTienda =
  { tipo: 'menu'; titulo: string } | { tipo: 'informacion'; titulo: string; contenido: string };

// Inyectable para poder comprobar navegadores sin almacenamiento y aislar las pruebas.
export const ALMACENAMIENTO_FAVORITOS = new InjectionToken<Pick<
  Storage,
  'getItem' | 'setItem'
> | null>('ALMACENAMIENTO_FAVORITOS', {
  providedIn: 'root',
  factory: () => {
    const documento = inject(DOCUMENT);
    try {
      return documento.defaultView?.localStorage ?? null;
    } catch {
      return null;
    }
  },
});

const CLAVE_FAVORITOS = 'soho:favoritos';

// Gestiona las ventanas de presentación y los favoritos locales del visitante.
// Este servicio no autentica, registra pedidos ni procesa pagos.
@Injectable({ providedIn: 'root' })
export class PresentacionTienda {
  private readonly router = inject(Router);
  private readonly navegacionCatalogo = inject(NavegacionCatalogo);
  private readonly almacenamiento = inject(ALMACENAMIENTO_FAVORITOS);
  private readonly panelActual = signal<PanelTienda | null>(null);
  private readonly identificadoresFavoritos = signal<readonly string[]>(this.recuperarFavoritos());
  readonly panel = this.panelActual.asReadonly();
  readonly favoritos = this.identificadoresFavoritos.asReadonly();
  irAlCatalogo(filtros: FiltrosCatalogo = {}) {
    this.cerrar();
    const destino = this.navegacionCatalogo.crearDestino(filtros);
    void this.router.navigate([destino.ruta], {
      queryParams: destino.parametros,
    });
  }
  irAlProducto(producto: Producto) {
    this.cerrar();
    void this.router.navigate(['/producto', producto.identificador]);
  }
  abrir(tipo: 'menu') {
    const titulos = {
      menu: 'Explora SOHO',
    };
    this.panelActual.set({ tipo, titulo: titulos[tipo] });
  }
  informar(titulo: string, contenido: string) {
    this.panelActual.set({ tipo: 'informacion', titulo, contenido });
  }
  cerrar() {
    this.panelActual.set(null);
  }
  alternarFavorito(identificador: string) {
    this.identificadoresFavoritos.update((actuales) =>
      actuales.includes(identificador)
        ? actuales.filter((actual) => actual !== identificador)
        : [...actuales, identificador],
    );
    try {
      this.almacenamiento?.setItem(
        CLAVE_FAVORITOS,
        JSON.stringify(this.identificadoresFavoritos()),
      );
    } catch {
      // Si el navegador bloquea el guardado, la lista sigue funcionando durante la visita.
    }
  }

  private recuperarFavoritos(): readonly string[] {
    try {
      const datos: unknown = JSON.parse(this.almacenamiento?.getItem(CLAVE_FAVORITOS) ?? '[]');
      if (!Array.isArray(datos)) return [];
      return [
        ...new Set(
          datos.filter(
            (valor): valor is string => typeof valor === 'string' && valor.trim().length > 0,
          ),
        ),
      ];
    } catch {
      return [];
    }
  }
}
