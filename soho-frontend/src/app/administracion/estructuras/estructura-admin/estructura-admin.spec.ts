import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EstructuraAdmin } from './estructura-admin';
import { provideRouter, Router } from '@angular/router';

describe('EstructuraAdmin', () => {
  let component: EstructuraAdmin;
  let fixture: ComponentFixture<EstructuraAdmin>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EstructuraAdmin],
      providers: [provideRouter([{ path: '**', children: [] }])],
    }).compileComponents();

    fixture = TestBed.createComponent(EstructuraAdmin);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
  it.each([
    '/admin/productos?estado=archivado',
    '/admin/productos/nuevo',
    '/admin/clientes',
    '/admin/clientes/invitado:11111111-1111-4111-8111-111111111111?paginaPedidos=2',
  ])('muestra la sesión en el pie lateral en la ruta: %s', async (ruta) => {
    await TestBed.inject(Router).navigateByUrl(ruta);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.pie-lateral .administrador')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.pie-lateral .salir-admin')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.barra-superior .administrador')).toBeNull();
    expect(fixture.nativeElement.querySelector('.barra-superior .salir-admin')).toBeNull();
    expect(fixture.nativeElement.querySelector('.pie-lateral').textContent).not.toContain('DEMO');
  });
  it('ofrece la sesión también en el menú móvil y en posventa', async () => {
    await TestBed.inject(Router).navigateByUrl('/admin/cambios');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.menu-movil .administrador')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.menu-movil .salir-admin')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.pie-lateral').textContent).not.toContain('Datos');
  });
});
