import { Routes } from '@angular/router';

export const appRoutes: Routes = [
  {
    path: 'create-game',
    loadComponent: () => import('./creating-game/creating-game.component')
      .then(m => m.CreatingGameComponent)
  },
  {
    path: 'main-game',
    loadComponent: () => import('./main-game/main-game.component')
      .then(m => m.MainGameComponent)
  },
  {
    path: '',
    redirectTo: 'create-game',
    pathMatch: 'full'
  },
  {
    path: '**',
    redirectTo: 'create-game',
  },
];
