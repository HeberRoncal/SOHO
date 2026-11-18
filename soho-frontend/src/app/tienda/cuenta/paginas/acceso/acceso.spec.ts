import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Acceso } from './acceso';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

describe('Acceso', () => {
  let component: Acceso;
  let fixture: ComponentFixture<Acceso>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Acceso],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(Acceso);
    component = fixture.componentInstance;
    fixture.detectChanges();
    TestBed.inject(HttpTestingController)
      .expectOne('/api/auth/google/configuracion')
      .flush({ habilitado: false, clientId: null });
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
