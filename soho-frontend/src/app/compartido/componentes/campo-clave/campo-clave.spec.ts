import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CampoClave } from './campo-clave';

describe('CampoClave', () => {
  let component: CampoClave;
  let fixture: ComponentFixture<CampoClave>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CampoClave],
    }).compileComponents();

    fixture = TestBed.createComponent(CampoClave);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
