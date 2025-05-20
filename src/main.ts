import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app/app.component';
import { appRoutes } from './app/app.routes';
import { LocalStorageSyncService } from './app/services/storage.service/localstorage-sync.service';

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(appRoutes),
    LocalStorageSyncService
  ],
}).catch(err => console.error(err));
