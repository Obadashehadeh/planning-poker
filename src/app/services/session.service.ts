import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Router, ActivatedRoute } from '@angular/router';
import { StorageService } from './storage.service/storage.service';
import {GameService} from "./game.service/game.service";

@Injectable({
  providedIn: 'root'
})
export class SessionService {
  private sessionId: string | null = null;
  private isHost = true;
  private broadcastChannel: BroadcastChannel | null = null;

  private ticketSelected = new BehaviorSubject<any>(null);
  private voteReceived = new BehaviorSubject<any>(null);
  private revealTriggered = new BehaviorSubject<boolean>(false);
  private issuesUpdated = new BehaviorSubject<any[]>([]);
  private resetVoting = new BehaviorSubject<boolean>(false);

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private gameService: GameService,
    private storageService: StorageService
  ) {
    this.sessionId = localStorage.getItem('sessionId');
    if (!this.sessionId) {
      this.sessionId = this.generateUniqueId();
      localStorage.setItem('sessionId', this.sessionId);
    }

    if (this.sessionId) {
      this.initBroadcastChannel();
    }
  }

  public get ticketSelected$(): Observable<any> {
    return this.ticketSelected.asObservable();
  }

  public get voteReceived$(): Observable<any> {
    return this.voteReceived.asObservable();
  }

  public get revealTriggered$(): Observable<boolean> {
    return this.revealTriggered.asObservable();
  }

  public get issuesUpdated$(): Observable<any[]> {
    return this.issuesUpdated.asObservable();
  }

  public get resetVoting$(): Observable<boolean> {
    return this.resetVoting.asObservable();
  }

  private initBroadcastChannel() {
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
    }

    if (this.sessionId) {
      this.broadcastChannel = new BroadcastChannel('poker_session_' + this.sessionId);

      this.broadcastChannel.onmessage = (event) => {
        this.handleBroadcastMessage(event.data);
      };

      if (!this.isHost) {
        setTimeout(() => {
          this.broadcastEvent('request_state', { timestamp: new Date().getTime() });
        }, 1000);
      }
    } else {
      console.error('Cannot initialize broadcast channel: sessionId is null');
    }
  }

  public broadcastEvent(eventType: string, data: any): void {
    if (!this.broadcastChannel) {
      this.initBroadcastChannel();
    }

    if (this.broadcastChannel) {
      const message = {
        type: eventType,
        data: data,
        timestamp: new Date().getTime(),
        sender: {
          id: this.generateClientId(),
          isHost: this.isHost
        }
      };

      this.broadcastChannel.postMessage(message);
    }
  }

  private handleBroadcastMessage(message: any): void {
    if (message.sender && message.sender.id === this.generateClientId()) {
      return;
    }


    switch(message.type) {
      case 'vote':
        this.voteReceived.next(message.data);
        break;

      case 'reveal':
        this.revealTriggered.next(true);
        break;

      case 'select_ticket':
        this.ticketSelected.next(message.data);
        if (message.data.ticket) {
          this.storageService.setSelectedTicket(message.data.ticket);
        }
        break;

      case 'update_issues':
        if (message.data.issues && message.data.issues.length > 0) {
          this.storageService.storeTickets(message.data.issues);
          this.issuesUpdated.next(message.data.issues);
        }
        break;

      case 'reset_voting':
        this.resetVoting.next(true);
        break;

      case 'request_state':
        if (this.isHost) {
          this.sendCurrentState();
        }
        break;

      case 'full_state':
        this.handleFullState(message.data);
        break;

      case 'force_sync':
        this.sendCurrentState();
        break;
    }
  }

  private sendCurrentState(): void {
    const fullState = {
      gameName: this.gameService.getGameName(),
      gameType: this.gameService.getGameType(),
      issues: this.storageService.getStoredTickets(),
      selectedTicket: this.storageService.getSelectedTicket()
    };

    this.broadcastEvent('full_state', fullState);
  }

  private handleFullState(state: any): void {
    if (state.gameName) {
      this.gameService.setGameName(state.gameName);
    }

    if (state.gameType) {
      this.gameService.setGameType(state.gameType);
    }

    if (state.issues && state.issues.length > 0) {
      this.storageService.storeTickets(state.issues);
      this.issuesUpdated.next(state.issues);
    }

    if (state.selectedTicket) {
      this.storageService.setSelectedTicket(state.selectedTicket);
      this.ticketSelected.next({ ticket: state.selectedTicket });
    }
  }

  public checkUrlForSession(): void {
    this.route.queryParams.subscribe(params => {
      const sessionParam = params['session'];
      const gameNameParam = params['game'];
      const gameTypeParam = params['type'];

      if (sessionParam && sessionParam !== this.sessionId) {
        this.sessionId = sessionParam;
        localStorage.setItem('sessionId', sessionParam);
        this.isHost = false;

        this.initBroadcastChannel();

        if (gameNameParam) {
          this.gameService.setGameName(gameNameParam);
        }

        if (gameTypeParam) {
          this.gameService.setGameType(gameTypeParam);
        }

        setTimeout(() => {
          this.broadcastEvent('request_state', { timestamp: new Date().getTime() });
        }, 1500);
      }
    });
  }

  public forceSyncAllClients(): void {
    this.broadcastEvent('force_sync', { timestamp: new Date().getTime() });
    this.sendCurrentState();
  }

  public getSessionId(): string | null {
    return this.sessionId;
  }

  public isSessionHost(): boolean {
    return this.isHost;
  }

  private generateUniqueId(): string {
    return Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15);
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
