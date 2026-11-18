import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PieTienda } from './pie-tienda';

describe('PieTienda', () => {
  let escenario: ComponentFixture<PieTienda>;
  let http: HttpTestingController;
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PieTienda],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    escenario = TestBed.createComponent(PieTienda);
  });
  afterEach(() => http.verify());
  it('muestra los contactos guardados y retira los textos de presentación', async () => {
    http
      .expectOne('/api/configuracion/tienda')
      .flush({ correo: 'contacto@soho.test', whatsapp: '987654321', horario: 'Lunes a sábado' });
    await escenario.whenStable();
    const pie = escenario.nativeElement as HTMLElement;
    expect(pie.querySelector('.identidad p')).toBeNull();
    expect(pie.querySelector('.identidad img')?.getAttribute('width')).toBe('220');
    expect(pie.querySelector('.contacto h2')?.textContent).toBe('Contáctanos');
    expect(pie.querySelector('a[href="mailto:contacto@soho.test"]')).not.toBeNull();
    expect(pie.querySelector('a[href="https://wa.me/51987654321"]')).not.toBeNull();
    expect(pie.querySelector('.contacto')?.textContent).not.toContain('Lunes a sábado');
  });
  it('no inventa datos si no hay contacto configurado', async () => {
    http
      .expectOne('/api/configuracion/tienda')
      .flush({ correo: null, whatsapp: null, horario: null });
    await escenario.whenStable();
    expect(escenario.nativeElement.querySelector('.contacto a')).toBeNull();
    expect(escenario.nativeElement.querySelector('.contacto').textContent).toContain(
      'Contacto no disponible',
    );
  });
  it('permite recuperar un fallo al cargar los contactos', async () => {
    http
      .expectOne('/api/configuracion/tienda')
      .flush({}, { status: 503, statusText: 'Unavailable' });
    await escenario.whenStable();
    escenario.nativeElement.querySelector('.reintentar-contacto').click();
    http
      .expectOne('/api/configuracion/tienda')
      .flush({ correo: 'ayuda@soho.test', whatsapp: null, horario: null });
    await escenario.whenStable();
    expect(
      escenario.nativeElement.querySelector('a[href="mailto:ayuda@soho.test"]'),
    ).not.toBeNull();
    expect(escenario.nativeElement.querySelector('.reintentar-contacto')).toBeNull();
  });
});
