import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CabeceraAcceso } from './cabecera-acceso';
import { provideRouter } from '@angular/router';

describe('CabeceraAcceso', () => {
  let component: CabeceraAcceso;
  let fixture: ComponentFixture<CabeceraAcceso>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CabeceraAcceso],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(CabeceraAcceso);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
