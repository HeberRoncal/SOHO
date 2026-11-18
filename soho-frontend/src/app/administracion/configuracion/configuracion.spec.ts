import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { Cuenta } from '../../tienda/cuenta/servicios/cuenta';
import { EstadoAutenticacion } from '../../tienda/cuenta/servicios/estado-autenticacion';
import { Tienda } from './tienda/tienda';
import { datosTiendaApi, tiendaVacia } from './tienda/contrato-tienda';
import { Inventario } from './inventario/inventario';
import { reservasFixture, usuarioReservas } from './inventario/reservas.fixtures';

@Component({ template: 'Fuera de Configuración' })
class DestinoPrueba {}

describe('Configuración con protección propia de cada formulario real', () => {
  it('protege los cambios entre pestañas y al salir, sin una guarda global duplicada', async () => {
    const configuracion = routes
      .find((r) => r.path === 'admin')!
      .children!.find((r) => r.path === 'configuracion')!;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([configuracion, { path: 'salida', component: DestinoPrueba }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: Cuenta,
          useFactory: () => {
            const auth = TestBed.inject(EstadoAutenticacion);
            return { perfil: auth.perfil, remoto: true };
          },
        },
      ],
    });
    const auth = TestBed.inject(EstadoAutenticacion);
    auth.aceptar(usuarioReservas);
    const http = TestBed.inject(HttpTestingController),
      harness = await RouterTestingHarness.create();
    const navegarTienda = harness.navigateByUrl('/configuracion/tienda');
    const consulta = await vi.waitFor(() => http.expectOne('/api/admin/configuracion/tienda'));
    consulta.flush({
      configuracion: {
        version: 0,
        tienda: datosTiendaApi(tiendaVacia()),
        actualizadoEn: null,
        actualizadoPor: null,
      },
    });
    await navegarTienda;
    const tienda = harness.fixture.debugElement.query(By.directive(Tienda))
      .componentInstance as Tienda;
    tienda.estado.actualizar({ correo: 'contacto@soho.test' });
    harness.detectChanges();
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);
    try {
      await harness.navigateByUrl('/configuracion/inventario');
      expect(TestBed.inject(Router).url).toBe('/configuracion/tienda');
      expect(confirmar).toHaveBeenCalledTimes(1);
      expect(tienda.estado.borrador().correo).toBe('contacto@soho.test');
      http.expectNone('/api/admin/configuracion/reservas');
      const recarga = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(recarga);
      expect(recarga.defaultPrevented).toBe(true);
      confirmar.mockReturnValue(true);
      const navegarInventario = harness.navigateByUrl('/configuracion/inventario');
      (await vi.waitFor(() => http.expectOne('/api/admin/configuracion/reservas'))).flush(
        reservasFixture(),
      );
      await navegarInventario;
      expect(confirmar).toHaveBeenCalledTimes(2);
      const inventario = harness.fixture.debugElement.query(By.directive(Inventario))
        .componentInstance as Inventario;
      await vi.waitFor(() => expect(inventario.estado.bloqueado()).toBe(false));
      inventario.estado.cambiar({ accionCancelacion: 'PREGUNTAR' });
      expect(inventario.estado.cambios()).toBe(true);
      confirmar.mockReturnValue(false);
      await harness.navigateByUrl('/salida');
      expect(TestBed.inject(Router).url).toBe('/configuracion/inventario');
      expect(confirmar).toHaveBeenCalledTimes(3);
      inventario.estado.descartar();
      await harness.navigateByUrl('/salida');
      expect(TestBed.inject(Router).url).toBe('/salida');
      expect(confirmar).toHaveBeenCalledTimes(3);
      const salida = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(salida);
      expect(salida.defaultPrevented).toBe(false);
      http.verify();
    } finally {
      confirmar.mockRestore();
    }
  });
});
