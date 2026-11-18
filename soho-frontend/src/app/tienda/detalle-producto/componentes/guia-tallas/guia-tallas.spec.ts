import { TestBed } from '@angular/core/testing';
import { GuiaTallas } from './guia-tallas';
describe('GuiaTallas', () => {
  it('debe renderizar el componente', async () => {
    await TestBed.configureTestingModule({ imports: [GuiaTallas] }).compileComponents();
    const escenario = TestBed.createComponent(GuiaTallas);
    await escenario.whenStable();
    expect(escenario.componentInstance).toBeTruthy();
  });
});
