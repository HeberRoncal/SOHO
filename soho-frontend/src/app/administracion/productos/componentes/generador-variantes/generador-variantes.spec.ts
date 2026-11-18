import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GeneradorVariantes } from './generador-variantes';

describe('GeneradorVariantes', () => {
  let component: GeneradorVariantes;
  let fixture: ComponentFixture<GeneradorVariantes>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GeneradorVariantes],
    }).compileComponents();

    fixture = TestBed.createComponent(GeneradorVariantes);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
