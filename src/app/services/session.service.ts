import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Router, ActivatedRoute } from '@angular/router';
import { StorageService } from './storage.service/storage.service';
import { GameService } from "./game.service/game.service";

@Injectable({
  providedIn: 'root'
})
export class SessionService {
  private sessionId: string | null = null;
  private isHost = true;
  private broadcastChannel: BroadcastChannel | null = null;
  private lastSyncTimestamp = 0;
  private syncRetryCount = 0;
  private maxSyncRetries = 5;
  private syncInterval: any = null;
  private connectionCheckInterval: any = null;

  private ticketSelected = new BehaviorSubject<any>(null);
  private voteReceived = new BehaviorSubject<any>(null);
  private revealTriggered = new BehaviorSubject<boolean>(false);
  private issuesUpdated = new BehaviorSubject<any[]>([]);
  private resetVoting = new BehaviorSubject<boolean>(false);
  private userJoined = new BehaviorSubject<any>(null);

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
      this.startConnectionCheck();
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

  public get userJoined$(): Observable<any> {
    return this.userJoined.asObservable();
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

      this.broadcastChannel.onmessageerror = (error) => {
        setTimeout(() => {
          this.initBroadcastChannel();
        }, 1000);
      };

      if (!this.isHost) {
        setTimeout(() => {
          this.requestCurrentState();
        }, 500);

        setTimeout(() => {
          this.requestCurrentState();
        }, 2000);

        setTimeout(() => {
          this.requestCurrentState();
        }, 5000);
      }
    }
  }

  private startConnectionCheck(): void {
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
    }

    this.connectionCheckInterval = setInterval(() => {
      if (!this.isHost) {
        this.requestCurrentState();
      } else {
        this.sendCurrentState();
      }
    }, 10000);
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

      try {
        this.broadcastChannel.postMessage(message);

        if (eventType === 'update_issues' && this.isHost) {
          setTimeout(() => {
            this.broadcastChannel!.postMessage(message);
          }, 1000);

          setTimeout(() => {
            this.broadcastChannel!.postMessage(message);
          }, 3000);
        }
      } catch (error) {
        setTimeout(() => {
          if (this.broadcastChannel) {
            try {
              this.broadcastChannel.postMessage(message);
            } catch (retryError) {
              this.initBroadcastChannel();
            }
          }
        }, 1000);
      }
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
        setTimeout(() => {
          this.revealTriggered.next(false);
        }, 100);
        break;

      case 'select_ticket':
        this.ticketSelected.next(message.data);
        if (message.data.ticket) {
          this.storageService.setSelectedTicket(message.data.ticket);
        }
        break;

      case 'update_issues':
        this.handleIssuesUpdate(message);
        break;

      case 'reset_voting':
        this.resetVoting.next(true);
        setTimeout(() => {
          this.resetVoting.next(false);
        }, 100);
        break;

      case 'request_state':
        if (this.isHost) {
          setTimeout(() => {
            this.sendCurrentState();
          }, 100);
        }
        break;

      case 'full_state':
        this.handleFullState(message.data);
        break;

      case 'force_sync':
        if (this.isHost) {
          setTimeout(() => {
            this.sendCurrentState();
          }, 100);
        } else {
          setTimeout(() => {
            this.requestCurrentState();
          }, 100);
        }
        break;

      case 'user_joined':
        this.userJoined.next(message.data);
        if (this.isHost) {
          setTimeout(() => {
            this.sendCurrentState();
          }, 500);

          setTimeout(() => {
            this.sendCurrentState();
          }, 2000);
        }
        break;

      case 'ping':
        if (this.isHost) {
          this.broadcastEvent('pong', { timestamp: new Date().getTime() });
        }
        break;

      case 'pong':
        break;
    }
  }

  private handleIssuesUpdate(message: any): void {
    const { data } = message;

    if (data.issues && Array.isArray(data.issues)) {
      const currentIssues = this.storageService.getStoredTickets();

      if (data.forceUpdate ||
        !data.timestamp ||
        data.timestamp > this.lastSyncTimestamp ||
        currentIssues.length === 0 ||
        data.issues.length !== currentIssues.length) {

        this.lastSyncTimestamp = data.timestamp || new Date().getTime();
        this.storageService.storeTickets(data.issues);
        this.issuesUpdated.next([...data.issues]);

        setTimeout(() => {
          this.issuesUpdated.next([...data.issues]);
        }, 100);

        setTimeout(() => {
          this.issuesUpdated.next([...data.issues]);
        }, 500);
      }
    }
  }

  private sendCurrentState(): void {
    const issues = this.storageService.getStoredTickets();
    const selectedTicket = this.storageService.getSelectedTicket();

    const fullState = {
      gameName: this.gameService.getGameName(),
      gameType: this.gameService.getGameType(),
      issues: issues || [],
      selectedTicket: selectedTicket,
      timestamp: new Date().getTime(),
      forceUpdate: true
    };

    this.broadcastEvent('full_state', fullState);

    if (issues && issues.length > 0) {
      this.broadcastEvent('update_issues', {
        issues: issues,
        timestamp: new Date().getTime(),
        forceUpdate: true
      });
    }
  }

  private handleFullState(state: any): void {
    if (!state) return;

    if (state.gameName && state.gameName !== this.gameService.getGameName()) {
      this.gameService.setGameName(state.gameName);
    }

    if (state.gameType && state.gameType !== this.gameService.getGameType()) {
      this.gameService.setGameType(state.gameType);
    }

    const currentIssues = this.storageService.getStoredTickets();

    if (state.issues && Array.isArray(state.issues) && state.issues.length > 0) {
      if (state.forceUpdate ||
        currentIssues.length === 0 ||
        state.issues.length !== currentIssues.length ||
        !state.timestamp ||
        state.timestamp > this.lastSyncTimestamp) {

        this.lastSyncTimestamp = state.timestamp || new Date().getTime();
        this.storageService.storeTickets(state.issues);
        this.issuesUpdated.next([...state.issues]);

        setTimeout(() => {
          this.issuesUpdated.next([...state.issues]);
        }, 100);
      }
    }

    if (state.selectedTicket) {
      const currentSelected = this.storageService.getSelectedTicket();
      if (!currentSelected || currentSelected.Key !== state.selectedTicket.Key) {
        this.storageService.setSelectedTicket(state.selectedTicket);
        this.ticketSelected.next({ ticket: state.selectedTicket });
      }
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
        this.startConnectionCheck();

        if (gameNameParam) {
          this.gameService.setGameName(decodeURIComponent(gameNameParam));
        }

        if (gameTypeParam) {
          this.gameService.setGameType(decodeURIComponent(gameTypeParam));
        }

        this.requestCurrentStateWithRetry();
      }
    });
  }

  private requestCurrentState(): void {
    this.broadcastEvent('request_state', {
      timestamp: new Date().getTime(),
      clientId: this.generateClientId(),
      requestIssues: true
    });

    this.broadcastEvent('ping', {
      timestamp: new Date().getTime(),
      clientId: this.generateClientId()
    });
  }

  private requestCurrentStateWithRetry(): void {
    this.syncRetryCount = 0;
    this.requestStateWithBackoff();
  }

  private requestStateWithBackoff(): void {
    this.requestCurrentState();

    if (this.syncRetryCount < this.maxSyncRetries) {
      setTimeout(() => {
        this.syncRetryCount++;
        this.requestStateWithBackoff();
      }, Math.min(2000 * Math.pow(1.5, this.syncRetryCount), 15000));
    }
  }

  public forceSyncAllClients(): void {
    this.broadcastEvent('force_sync', {
      timestamp: new Date().getTime(),
      sender: this.generateClientId()
    });

    if (this.isHost) {
      setTimeout(() => {
        this.sendCurrentState();
      }, 200);

      setTimeout(() => {
        this.sendCurrentState();
      }, 1000);

      setTimeout(() => {
        this.sendCurrentState();
      }, 3000);
    }
  }

  public getSessionId(): string | null {
    return this.sessionId;
  }

  public isSessionHost(): boolean {
    return this.isHost;
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

  public resetSession(): void {
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
    }

    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
    }

    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    localStorage.removeItem('sessionId');
    localStorage.removeItem('clientId');

    this.sessionId = this.generateUniqueId();
    localStorage.setItem('sessionId', this.sessionId);
    this.isHost = true;

    this.initBroadcastChannel();
    this.startConnectionCheck();
  }

  ngOnDestroy(): void {
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
    }

    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
    }

    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
  }
}
