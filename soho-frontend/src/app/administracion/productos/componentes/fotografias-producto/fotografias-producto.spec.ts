import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FotografiasProducto } from './fotografias-producto';

describe('FotografiasProducto', () => {
  let component: FotografiasProducto;
  let fixture: ComponentFixture<FotografiasProducto>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FotografiasProducto],
    }).compileComponents();

    fixture = TestBed.createComponent(FotografiasProducto);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
