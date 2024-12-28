import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CreatingGameComponent } from './creating-game.component';

describe('CreatingGameComponent', () => {
  let component: CreatingGameComponent;
  let fixture: ComponentFixture<CreatingGameComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreatingGameComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(CreatingGameComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
