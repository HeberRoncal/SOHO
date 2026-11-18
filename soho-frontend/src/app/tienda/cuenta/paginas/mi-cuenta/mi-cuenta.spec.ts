import { proveerCoberturaPrueba } from '../../../finalizar-compra/pruebas/cobertura.fixture';
import { proveerCatalogoPrueba } from '../../../catalogo/pruebas/catalogo.fixture';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MiCuenta } from './mi-cuenta';
import { provideRouter } from '@angular/router';
import { EstadoAutenticacion } from '../../servicios/estado-autenticacion';

// La vista elige sus datos de prueba; la fuente predeterminada de la app es la API.
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [proveerCatalogoPrueba()] });
});

// Las tarifas de esta vista son fixtures; la cobertura de la app siempre procede de la API.
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [proveerCoberturaPrueba()] });
});

describe('MiCuenta', () => {
  let component: MiCuenta;
  let fixture: ComponentFixture<MiCuenta>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MiCuenta],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(MiCuenta);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('muestra el acceso con icono a administración solo para ADMIN', async () => {
    const estado = TestBed.inject(EstadoAutenticacion);
    estado.perfil.set({
      id: 'admin-1',
      nombres: 'Admin',
      apellidos: 'SOHO',
      correo: 'admin@soho.test',
      celular: '',
      verificado: true,
      proveedor: 'correo',
      rol: 'ADMIN',
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Ir a administración');
    const enlaceAdmin = Array.from(
      fixture.nativeElement.querySelectorAll('a') as NodeListOf<HTMLAnchorElement>,
    ).find((enlace) => enlace.textContent?.includes('Ir a administración'));
    expect(enlaceAdmin?.textContent).toContain('Ir a administración');
    expect(enlaceAdmin?.querySelector('app-icono')).toBeTruthy();

    estado.perfil.update((perfil) => (perfil ? { ...perfil, rol: 'CLIENTE' } : null));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Ir a administración');
  });
});
