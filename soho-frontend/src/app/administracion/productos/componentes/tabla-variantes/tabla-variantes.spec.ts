import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TablaVariantes } from './tabla-variantes';

describe('TablaVariantes', () => {
  let component: TablaVariantes;
  let fixture: ComponentFixture<TablaVariantes>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TablaVariantes],
    }).compileComponents();

    fixture = TestBed.createComponent(TablaVariantes);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
