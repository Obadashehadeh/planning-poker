import { Routes } from '@angular/router';

export const appRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import
      ('./creating-game/creating-game.component').then(
      m => m.CreatingGameComponent
    )
  },
  {
    path: '',
    loadComponent: () => import
      ('./main-game/main-game.component').then(
      m => m.MainGameComponent
    )
  },
];
