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
  private maxSyncRetries = 10;
  private connectionCheckInterval: any = null;
  private isInitialized = false;
  private clientId: string;
  private syncTimeouts: any[] = [];
  private maxSyncTimeouts = 15;

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
    this.clientId = this.generateClientId();
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

      if (!this.isHost && !this.isInitialized) {
        this.performInitialSync();
        this.isInitialized = true;
      }
    }
  }

  private performInitialSync(): void {
    this.syncTimeouts.forEach(timeout => clearTimeout(timeout));
    this.syncTimeouts = [];

    const delays = [100, 500, 1000, 2000, 3000, 5000, 8000, 12000, 15000, 20000, 25000, 30000, 40000, 50000, 60000];

    delays.forEach((delay, index) => {
      if (index < this.maxSyncTimeouts) {
        const timeout = setTimeout(() => {
          this.requestCurrentState();
          this.broadcastEvent('need_issues_urgent', {
            clientId: this.clientId,
            timestamp: new Date().getTime(),
            attempt: index + 1
          });
        }, delay);
        this.syncTimeouts.push(timeout);
      }
    });
  }

  private startConnectionCheck(): void {
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
    }

    this.connectionCheckInterval = setInterval(() => {
      if (!this.isHost) {
        const currentIssues = this.storageService.getStoredTickets();
        if (currentIssues.length === 0) {
          this.requestCurrentState();
          this.broadcastEvent('need_issues_urgent', {
            clientId: this.clientId,
            timestamp: new Date().getTime(),
            reason: 'no_issues_periodic_check'
          });
        }
      } else {
        this.sendCurrentState();
      }
    }, 5000);
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
          id: this.clientId,
          isHost: this.isHost
        }
      };

      try {
        this.broadcastChannel.postMessage(message);

        if (['update_issues', 'full_state', 'need_issues_urgent'].includes(eventType)) {
          setTimeout(() => {
            if (this.broadcastChannel) {
              this.broadcastChannel.postMessage(message);
            }
          }, 100);

          setTimeout(() => {
            if (this.broadcastChannel) {
              this.broadcastChannel.postMessage(message);
            }
          }, 500);

          if (eventType === 'update_issues' && this.isHost) {
            setTimeout(() => {
              if (this.broadcastChannel) {
                this.broadcastChannel.postMessage(message);
              }
            }, 1000);

            setTimeout(() => {
              if (this.broadcastChannel) {
                this.broadcastChannel.postMessage(message);
              }
            }, 3000);
          }
        }
      } catch (error: unknown) {
        setTimeout(() => {
          if (this.broadcastChannel) {
            try {
              this.broadcastChannel.postMessage(message);
            } catch (retryError: unknown) {
              this.initBroadcastChannel();
            }
          }
        }, 1000);
      }
    }
  }

  private handleBroadcastMessage(message: any): void {
    if (message.sender && message.sender.id === this.clientId) {
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
      case 'need_issues_urgent':
        if (this.isHost) {
          this.sendCurrentState();
          setTimeout(() => this.sendCurrentState(), 100);
          setTimeout(() => this.sendCurrentState(), 500);
        }
        break;

      case 'full_state':
        this.handleFullState(message.data);
        break;

      case 'force_sync':
        if (this.isHost) {
          setTimeout(() => this.sendCurrentState(), 100);
        } else {
          setTimeout(() => this.requestCurrentState(), 100);
        }
        break;

      case 'user_joined':
        this.userJoined.next(message.data);
        if (this.isHost) {
          setTimeout(() => this.sendCurrentState(), 100);
          setTimeout(() => this.sendCurrentState(), 500);
          setTimeout(() => this.sendCurrentState(), 1500);
          setTimeout(() => this.sendCurrentState(), 3000);
        }
        break;

      case 'ping':
        if (this.isHost) {
          this.broadcastEvent('pong', {
            timestamp: new Date().getTime(),
            hasIssues: this.storageService.getStoredTickets().length > 0
          });
        }
        break;

      case 'pong':
        if (message.data.hasIssues && this.storageService.getStoredTickets().length === 0) {
          this.requestCurrentState();
        }
        break;
    }
  }

  private handleIssuesUpdate(message: any): void {
    const { data } = message;

    if (data.issues && Array.isArray(data.issues) && data.issues.length > 0) {
      const currentIssues = this.storageService.getStoredTickets();

      if (data.forceUpdate ||
        currentIssues.length === 0 ||
        data.issues.length !== currentIssues.length ||
        !data.timestamp ||
        data.timestamp > this.lastSyncTimestamp) {

        this.lastSyncTimestamp = data.timestamp || new Date().getTime();
        this.storageService.storeTickets(data.issues);
        this.issuesUpdated.next([...data.issues]);

        setTimeout(() => this.issuesUpdated.next([...data.issues]), 100);
        setTimeout(() => this.issuesUpdated.next([...data.issues]), 500);

        this.syncTimeouts.forEach(timeout => clearTimeout(timeout));
        this.syncTimeouts = [];
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
      forceUpdate: true,
      sender: 'host_state_broadcast'
    };

    this.broadcastEvent('full_state', fullState);

    if (issues && issues.length > 0) {
      this.broadcastEvent('update_issues', {
        issues: issues,
        timestamp: new Date().getTime(),
        forceUpdate: true,
        sender: 'host_issues_broadcast'
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

        setTimeout(() => this.issuesUpdated.next([...state.issues]), 100);
        setTimeout(() => this.issuesUpdated.next([...state.issues]), 500);

        this.syncTimeouts.forEach(timeout => clearTimeout(timeout));
        this.syncTimeouts = [];
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

  public checkUrlForSession(): Promise<void> {
    return new Promise((resolve) => {
      this.route.queryParams.subscribe(params => {
        const sessionParam = params['session'];
        const gameNameParam = params['game'];
        const gameTypeParam = params['type'];

        if (sessionParam && sessionParam !== this.sessionId) {
          this.sessionId = sessionParam;
          localStorage.setItem('sessionId', sessionParam);
          this.isHost = false;
          this.isInitialized = false;

          this.storageService.storeTickets([]);
          this.storageService.clearSelectedTicket();

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
        resolve();
      });
    });
  }

  private requestCurrentState(): void {
    this.broadcastEvent('request_state', {
      timestamp: new Date().getTime(),
      clientId: this.clientId,
      requestIssues: true,
      reason: 'manual_request'
    });

    this.broadcastEvent('ping', {
      timestamp: new Date().getTime(),
      clientId: this.clientId
    });
  }

  private requestCurrentStateWithRetry(): void {
    this.syncRetryCount = 0;
    this.requestStateWithBackoff();
  }

  private requestStateWithBackoff(): void {
    this.requestCurrentState();
    this.broadcastEvent('need_issues_urgent', {
      clientId: this.clientId,
      timestamp: new Date().getTime(),
      attempt: this.syncRetryCount + 1
    });

    if (this.syncRetryCount < this.maxSyncRetries) {
      setTimeout(() => {
        this.syncRetryCount++;
        this.requestStateWithBackoff();
      }, Math.min(1000 * Math.pow(1.5, this.syncRetryCount), 10000));
    }
  }

  public forceSyncAllClients(): void {
    this.broadcastEvent('force_sync', {
      timestamp: new Date().getTime(),
      sender: this.clientId
    });

    if (this.isHost) {
      setTimeout(() => this.sendCurrentState(), 100);
      setTimeout(() => this.sendCurrentState(), 500);
      setTimeout(() => this.sendCurrentState(), 1500);
      setTimeout(() => this.sendCurrentState(), 3000);
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
    this.syncTimeouts.forEach(timeout => clearTimeout(timeout));
    this.syncTimeouts = [];

    if (this.broadcastChannel) {
      this.broadcastChannel.close();
    }

    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
    }

    localStorage.removeItem('sessionId');
    localStorage.removeItem('clientId');

    this.sessionId = this.generateUniqueId();
    localStorage.setItem('sessionId', this.sessionId);
    this.isHost = true;
    this.isInitialized = false;
    this.clientId = this.generateClientId();

    this.initBroadcastChannel();
    this.startConnectionCheck();
  }

  ngOnDestroy(): void {
    this.syncTimeouts.forEach(timeout => clearTimeout(timeout));
    this.syncTimeouts = [];

    if (this.broadcastChannel) {
      this.broadcastChannel.close();
    }

    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
    }
  }
}
