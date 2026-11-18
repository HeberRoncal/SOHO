import { ComponentFixture, TestBed } from '@angular/core/testing';
import { VistaProducto } from './vista-producto';

describe('VistaProducto', () => {
  let component: VistaProducto;
  let fixture: ComponentFixture<VistaProducto>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VistaProducto],
    }).compileComponents();

    fixture = TestBed.createComponent(VistaProducto);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
