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

  // Subjects to emit events to components
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
    // First get the sessionId
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
        this.broadcastEvent('request_state', { timestamp: new Date().getTime() });
      }
    } else {
      console.error('Cannot initialize broadcast channel: sessionId is null');
    }
  }

  public broadcastEvent(eventType: string, data: any): void {
    if (!this.broadcastChannel) {
      this.initBroadcastChannel();
    }

    const message = {
      type: eventType,
      data: data,
      timestamp: new Date().getTime(),
      sender: {
        id: this.generateClientId(),
        isHost: this.isHost
      }
    };

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
    // Ignore messages from self
    if (message.sender && message.sender.id === this.generateClientId()) {
      return;
    }

    console.log('Received broadcast message:', message);

    switch(message.type) {
      case 'vote':
        // Emit the vote to subscribers
        this.voteReceived.next(message.data);
        break;

      case 'reveal':
        // Trigger card reveal
        this.revealTriggered.next(true);
        break;

      case 'select_ticket':
        // Handle ticket selection
        this.ticketSelected.next(message.data);
        break;

      case 'update_issues':
        // Update issues list
        this.storageService.storeTickets(message.data.issues);
        this.issuesUpdated.next(message.data.issues);
        break;

      case 'reset_voting':
        // Reset the voting state
        this.resetVoting.next(true);
        break;

      case 'request_state':
        // If we're the host, send the current state to the new client
        if (this.isHost) {
          this.sendCurrentState();
        }
        break;

      case 'full_state':
        // Receive full state from host
        this.handleFullState(message.data);
        break;
    }
  }

  private sendCurrentState(): void {
    // Only the host should send the state
    if (!this.isHost) return;

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

        // Re-initialize the broadcast channel with the new session ID
        this.initBroadcastChannel();

        if (gameNameParam) {
          this.gameService.setGameName(gameNameParam);
        }

        if (gameTypeParam) {
          this.gameService.setGameType(gameTypeParam);
        }
      }
    });
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
    // Create a client ID based on some stable factors
    let clientId = localStorage.getItem('clientId');
    if (!clientId) {
      clientId = this.generateUniqueId();
      localStorage.setItem('clientId', clientId);
    }
    return clientId;
  }
}
