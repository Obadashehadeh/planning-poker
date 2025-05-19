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
  private maxSyncRetries = 15;
  private connectionCheckInterval: any = null;
  private isInitialized = false;
  private clientId: string;
  private syncTimeouts: any[] = [];
  private maxSyncTimeouts = 20;
  private lastHeartbeat = 0;
  private heartbeatInterval: any = null;
  private hostDetectionTimeout: any = null;

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
      this.startHeartbeat();
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
        this.detectHostAndSync();
        this.isInitialized = true;
      }
    }
  }

  private detectHostAndSync(): void {
    this.syncTimeouts.forEach(timeout => clearTimeout(timeout));
    this.syncTimeouts = [];

    this.broadcastEvent('client_joined', {
      clientId: this.clientId,
      timestamp: new Date().getTime(),
      needsFullSync: true
    });

    const syncAttempts = [
      100, 300, 600, 1000, 1500, 2000, 3000, 4000, 5000,
      7000, 10000, 15000, 20000, 25000, 30000, 40000, 50000, 60000
    ];

    syncAttempts.forEach((delay, index) => {
      const timeout = setTimeout(() => {
        this.requestFullStateFromHost();
      }, delay);
      this.syncTimeouts.push(timeout);
    });

    this.hostDetectionTimeout = setTimeout(() => {
      this.clearSyncTimeouts();
    }, 10000);
  }

  private requestFullStateFromHost(): void {
    const currentIssues = this.storageService.getStoredTickets();

    this.broadcastEvent('request_full_state', {
      clientId: this.clientId,
      timestamp: new Date().getTime(),
      currentIssuesCount: currentIssues.length,
      hasIssues: currentIssues.length > 0,
      urgent: true
    });

    this.broadcastEvent('ping', {
      clientId: this.clientId,
      timestamp: new Date().getTime(),
      needsState: true
    });
  }

  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      if (this.isHost) {
        const issues = this.storageService.getStoredTickets();
        this.broadcastEvent('heartbeat', {
          isHost: true,
          timestamp: new Date().getTime(),
          hasIssues: issues.length > 0,
          issuesCount: issues.length,
          sessionId: this.sessionId
        });
      } else {
        const currentIssues = this.storageService.getStoredTickets();
        this.broadcastEvent('heartbeat', {
          isHost: false,
          timestamp: new Date().getTime(),
          hasIssues: currentIssues.length > 0,
          issuesCount: currentIssues.length,
          needsSync: currentIssues.length === 0
        });

        if (currentIssues.length === 0) {
          this.requestFullStateFromHost();
        }
      }
    }, 3000);
  }

  private startConnectionCheck(): void {
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
    }

    this.connectionCheckInterval = setInterval(() => {
      if (!this.isHost) {
        const currentIssues = this.storageService.getStoredTickets();
        const timeSinceLastHeartbeat = new Date().getTime() - this.lastHeartbeat;

        if (currentIssues.length === 0 || timeSinceLastHeartbeat > 10000) {
          this.requestFullStateFromHost();
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
          isHost: this.isHost,
          sessionId: this.sessionId
        }
      };

      try {
        this.broadcastChannel.postMessage(message);

        if (['update_issues', 'full_state', 'request_full_state', 'client_joined'].includes(eventType)) {
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

          if (eventType === 'full_state' && this.isHost) {
            setTimeout(() => {
              if (this.broadcastChannel) {
                this.broadcastChannel.postMessage(message);
              }
            }, 1000);

            setTimeout(() => {
              if (this.broadcastChannel) {
                this.broadcastChannel.postMessage(message);
              }
            }, 2000);
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

    if (message.sender && message.sender.isHost) {
      this.lastHeartbeat = new Date().getTime();
    }

    switch(message.type) {
      case 'client_joined':
        if (this.isHost) {
          setTimeout(() => this.sendCurrentState(), 100);
          setTimeout(() => this.sendCurrentState(), 500);
          setTimeout(() => this.sendCurrentState(), 1000);
          setTimeout(() => this.sendCurrentState(), 2000);
        }
        break;

      case 'heartbeat':
        if (message.data.isHost && !this.isHost) {
          this.lastHeartbeat = new Date().getTime();

          const currentIssues = this.storageService.getStoredTickets();
          if (currentIssues.length === 0 && message.data.hasIssues) {
            this.requestFullStateFromHost();
          }
        } else if (!message.data.isHost && this.isHost) {
          if (message.data.needsSync) {
            this.sendCurrentState();
          }
        }
        break;

      case 'vote':
        this.voteReceived.next(message.data);
        break;

      case 'reveal':
        this.revealTriggered.next(true);
        setTimeout(() => this.revealTriggered.next(false), 100);
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
        setTimeout(() => this.resetVoting.next(false), 100);
        break;

      case 'request_full_state':
      case 'ping':
        if (this.isHost) {
          this.sendCurrentState();
          setTimeout(() => this.sendCurrentState(), 100);
          setTimeout(() => this.sendCurrentState(), 500);
          setTimeout(() => this.sendCurrentState(), 1000);
        }
        break;

      case 'full_state':
        if (!this.isHost) {
          this.handleFullState(message.data);
          this.clearSyncTimeouts();
        }
        break;

      case 'force_sync':
        if (this.isHost) {
          setTimeout(() => this.sendCurrentState(), 100);
        } else {
          setTimeout(() => this.requestFullStateFromHost(), 100);
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

      case 'pong':
        if (!this.isHost && message.data.hasIssues) {
          const currentIssues = this.storageService.getStoredTickets();
          if (currentIssues.length === 0) {
            this.requestFullStateFromHost();
          }
        }
        break;
    }
  }

  private clearSyncTimeouts(): void {
    this.syncTimeouts.forEach(timeout => clearTimeout(timeout));
    this.syncTimeouts = [];

    if (this.hostDetectionTimeout) {
      clearTimeout(this.hostDetectionTimeout);
      this.hostDetectionTimeout = null;
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
        this.clearSyncTimeouts();
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
      sender: 'host_state_broadcast',
      sessionId: this.sessionId
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
    if (!state) {
      return;
    }

    if (state.gameName && state.gameName !== this.gameService.getGameName()) {
      this.gameService.setGameName(state.gameName);
    }

    if (state.gameType && state.gameType !== this.gameService.getGameType()) {
      this.gameService.setGameType(state.gameType);
    }

    const currentIssues = this.storageService.getStoredTickets();

    if (state.issues && Array.isArray(state.issues) && state.issues.length > 0) {
      this.lastSyncTimestamp = state.timestamp || new Date().getTime();
      this.storageService.storeTickets(state.issues);
      this.issuesUpdated.next([...state.issues]);

      setTimeout(() => this.issuesUpdated.next([...state.issues]), 100);
      setTimeout(() => this.issuesUpdated.next([...state.issues]), 500);
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
          this.startHeartbeat();

          if (gameNameParam) {
            this.gameService.setGameName(decodeURIComponent(gameNameParam));
          }

          if (gameTypeParam) {
            this.gameService.setGameType(decodeURIComponent(gameTypeParam));
          }

          this.requestStateWithAggressiveRetry();
        }
        resolve();
      });
    });
  }

  private requestStateWithAggressiveRetry(): void {
    this.syncRetryCount = 0;
    this.requestStateWithBackoff();
  }

  private requestStateWithBackoff(): void {
    this.requestFullStateFromHost();

    if (this.syncRetryCount < this.maxSyncRetries) {
      const delay = Math.min(1000 * Math.pow(1.3, this.syncRetryCount), 8000);
      setTimeout(() => {
        this.syncRetryCount++;
        this.requestStateWithBackoff();
      }, delay);
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
    this.clearSyncTimeouts();

    if (this.broadcastChannel) {
      this.broadcastChannel.close();
    }

    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
    }

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
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
    this.startHeartbeat();
  }

  ngOnDestroy(): void {
    this.clearSyncTimeouts();

    if (this.broadcastChannel) {
      this.broadcastChannel.close();
    }

    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
    }

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
  }
}
