import { Injectable } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { StorageService } from '../storage.service/storage.service';
import { GameService } from "../game.service/game.service";
import { SyncService } from '../sync/sync.service';

@Injectable({
  providedIn: 'root'
})
export class SessionService {
  private sessionId: string | null = null;
  private isHost: boolean = true;
  private clientId: string;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private gameService: GameService,
    private storageService: StorageService,
    private syncService: SyncService
  ) {
    this.clientId = this.generateClientId();
    this.sessionId = localStorage.getItem('sessionId');

    if (!this.sessionId) {
      this.sessionId = this.generateUniqueId();
      localStorage.setItem('sessionId', this.sessionId);
      this.isHost = true;
    }
  }

  async checkUrlForSession(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.route.queryParams.subscribe(params => {
        const sessionParam = params['session'];
        const gameNameParam = params['game'];
        const gameTypeParam = params['type'];

        if (sessionParam) {
          if (sessionParam !== this.sessionId || !this.isHost) {
            this.sessionId = sessionParam;
            localStorage.setItem('sessionId', sessionParam);
            this.isHost = false;

            this.storageService.clearSelectedTicket();

            if (gameNameParam) {
              this.gameService.setGameName(decodeURIComponent(gameNameParam));
              this.syncService.setGameName(decodeURIComponent(gameNameParam));
            }

            if (gameTypeParam) {
              this.gameService.setGameType(decodeURIComponent(gameTypeParam));
              this.syncService.setGameType(decodeURIComponent(gameTypeParam));
            }
          }
        }
        resolve();
      });
    });
  }

  verifySessionId(): void {
    if (!this.sessionId) {
      this.sessionId = this.generateUniqueId();
      localStorage.setItem('sessionId', this.sessionId);
      this.isHost = true;
    }
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  isSessionHost(): boolean {
    return this.isHost;
  }

  resetSession(): void {
    localStorage.removeItem('sessionId');
    this.syncService.disconnect();

    this.sessionId = this.generateUniqueId();
    localStorage.setItem('sessionId', this.sessionId);
    this.isHost = true;
  }

  private generateUniqueId(): string {
    return Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15) +
      Date.now().toString(36);
  }

  private generateClientId(): string {
    let clientId = localStorage.getItem('clientId');
    if (!clientId) {
      clientId = this.generateUniqueId();
      localStorage.setItem('clientId', clientId);
    }
    return clientId;
  }
}
