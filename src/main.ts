import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app/app.component';
import { appRoutes } from './app/app.routes';
import { LocalStorageSyncService } from './app/services/storage.service/localstorage-sync.service';
import { SharedWorkerSyncService } from './app/services/session.service/sharedworker-sync.service';
import {WebSocketSyncService} from "./app/services/sync/websocket-sync.service";

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(appRoutes),
    LocalStorageSyncService,
    SharedWorkerSyncService,
    WebSocketSyncService
  ],
}).catch(err => console.error(err));
