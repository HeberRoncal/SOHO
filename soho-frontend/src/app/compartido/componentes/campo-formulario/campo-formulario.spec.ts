import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CampoFormulario } from './campo-formulario';

describe('CampoFormulario', () => {
  let componente: CampoFormulario;
  let escenario: ComponentFixture<CampoFormulario>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CampoFormulario],
    }).compileComponents();

    escenario = TestBed.createComponent(CampoFormulario);
    componente = escenario.componentInstance;
    await escenario.whenStable();
  });

  it('debe renderizar el componente', () => {
    expect(componente).toBeTruthy();
  });
});
