import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app/app.component';
import { appRoutes } from './app/app.routes';
import { SyncService } from './app/services/sync/sync.service';

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(appRoutes),
    SyncService
  ],
}).catch(err => console.error(err));
