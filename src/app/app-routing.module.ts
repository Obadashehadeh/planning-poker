import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { CreatingGameComponent } from './creating-game/creating-game.component';
import { MainGameComponent } from './main-game/main-game.component'; 

const routes: Routes = [
  { path: 'create-game', component: CreatingGameComponent },
  { path: 'main-game', component: MainGameComponent },
  { path: '', redirectTo: '/create-game', pathMatch: 'full' }, // Default route
];


@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
