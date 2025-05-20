import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { environment } from '../../../environments/environments';
import { StorageService } from '../storage.service/storage.service';
import {
  JiraTicket,
  SyncEvent,
  GameState,
  ConnectionStatus
} from '../../../models';

@Injectable({
  providedIn: 'root'
})
export class SyncService {
  // Observable sources
  private issuesUpdatedSource = new BehaviorSubject<JiraTicket[]>([]);
  private ticketSelectedSource = new BehaviorSubject<{ticket: JiraTicket | null}>({ticket: null});
  private voteReceivedSource = new BehaviorSubject<any>(null);
  private revealTriggeredSource = new Subject<boolean>();
  private resetVotingSource = new Subject<boolean>();
  private userJoinedSource = new BehaviorSubject<any>(null);
  private connectionStatusSource = new BehaviorSubject<ConnectionStatus>('disconnected');

  // Observable streams
  readonly issuesUpdated$ = this.issuesUpdatedSource.asObservable();
  readonly ticketSelected$ = this.ticketSelectedSource.asObservable();
  readonly voteReceived$ = this.voteReceivedSource.asObservable();
  readonly revealTriggered$ = this.revealTriggeredSource.asObservable();
  readonly resetVoting$ = this.resetVotingSource.asObservable();
  readonly userJoined$ = this.userJoinedSource.asObservable();
  readonly connectionStatus$ = this.connectionStatusSource.asObservable();

  // WebSocket properties
  private socket: WebSocket | null = null;
  private reconnectTimeout: any = null;
  private pingInterval: any = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private backoffDelay = 1000;

  // Session properties
  private roomId: string | null = null;
  private clientId: string;
  private displayName = '';
  private isHost = false;
  private gameState: GameState = {
    issues: [],
    selectedTicket: null,
    gameName: '',
    gameType: '',
    votes: {}
  };

  // Queue for messages while disconnected
  private messageQueue: Array<{type: string, data: any}> = [];

  constructor(private storageService: StorageService) {
    this.clientId = this.generateClientId();

    // Add listener for window beforeunload to cleanup
    window.addEventListener('beforeunload', () => this.disconnect());
  }

  connect(roomId: string, displayName: string, isHost: boolean): void {
    if (this.isConnected() && this.roomId === roomId) {
      return;
    }

    this.roomId = roomId;
    this.displayName = displayName;
    this.isHost = isHost;
    this.reconnectAttempts = 0;
    this.connectionStatusSource.next('connecting');

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    this.connectToServer();
  }

  private connectToServer(): void {
    if (!this.roomId) {
      console.error("Cannot connect: roomId is null");
      return;
    }

    try {
      const serverUrl = environment.websocketUrl;
      console.log(`Attempting to connect to WebSocket server at: ${serverUrl}`);
      this.socket = new WebSocket(serverUrl);

      this.socket.onopen = () => {
        console.log("WebSocket connection successfully established");
        this.handleSocketOpen();
      };

      this.socket.onmessage = (event) => {
        console.log("WebSocket message received", event.data.substring(0, 100) + "...");
        this.handleSocketMessage(event);
      };

      this.socket.onclose = (event) => {
        console.error(`WebSocket connection closed: Code=${event.code}, Reason=${event.reason}, Clean=${event.wasClean}`);
        this.handleSocketClose(event);
      };

      this.socket.onerror = (error) => {
        console.error("WebSocket error occurred:", error);
        this.handleSocketError();
      };
    } catch (error) {
      console.error("Error creating WebSocket connection:", error);
      this.handleSocketError();
    }
  }

  private handleSocketOpen(): void {
    this.connectionStatusSource.next('connected');
    this.reconnectAttempts = 0;

    // Start ping interval
    this.startPingInterval();

    // Join room
    this.joinRoom();

    // Process queued messages
    this.processMessageQueue();
  }

  private handleSocketMessage(event: MessageEvent): void {
    try {
      const message = JSON.parse(event.data);
      this.processIncomingMessage(message);
    } catch (error) {
      // Invalid message, ignore
    }
  }

  private handleSocketClose(event: CloseEvent): void {
    this.connectionStatusSource.next('disconnected');
    this.cleanupSocket();

    if (!event.wasClean) {
      this.scheduleReconnect();
    }
  }

  private handleSocketError(): void {
    this.connectionStatusSource.next('disconnected');
    this.cleanupSocket();
    this.scheduleReconnect();
  }

  private cleanupSocket(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      const delay = Math.min(30000, this.backoffDelay * Math.pow(2, this.reconnectAttempts));
      this.reconnectAttempts++;

      this.reconnectTimeout = setTimeout(() => {
        if (this.roomId) {
          this.connectToServer();
        }
      }, delay);
    }
  }

  private startPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    this.pingInterval = setInterval(() => {
      this.sendMessage('ping', { timestamp: Date.now() });
    }, 30000);
  }

  private joinRoom(): void {
    this.sendMessage('join_room', {
      displayName: this.displayName,
      isHost: this.isHost
    });
  }

  private sendMessage(type: string, data: any): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      // Queue message for later if important
      if (type !== 'ping') {
        this.messageQueue.push({ type, data });
      }
      return;
    }

    const message = {
      type,
      roomId: this.roomId,
      data,
      senderId: this.clientId,
      senderName: this.displayName,
      isHost: this.isHost,
      timestamp: Date.now()
    };

    try {
      this.socket.send(JSON.stringify(message));
    } catch (error) {
      // Add to queue for retry
      if (type !== 'ping') {
        this.messageQueue.push({ type, data });
      }
      this.handleSocketError();
    }
  }

  private processMessageQueue(): void {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (message) {
        this.sendMessage(message.type, message.data);
      }
    }
  }

  private processIncomingMessage(message: SyncEvent): void {
    // Ignore own messages
    if (message.senderId === this.clientId) {
      return;
    }

    switch (message.type) {
      case 'welcome':
        // Server welcome message
        break;

      case 'room_joined':
        if (!this.isHost) {
          this.requestFullState();
        }
        break;

      case 'user_joined':
        this.userJoinedSource.next(message.data);
        if (this.isHost) {
          setTimeout(() => this.sendFullState(), 500);
        }
        break;

      case 'vote':
        this.voteReceivedSource.next(message.data);
        if (this.isHost) {
          // Store vote in game state
          const userId = message.data.user;
          const card = message.data.card;
          if (userId && card !== undefined) {
            this.gameState.votes[userId] = card;
          }
        }
        break;

      case 'reveal':
        this.revealTriggeredSource.next(true);
        break;

      case 'reset_voting':
        if (this.isHost) {
          this.gameState.votes = {};
        }
        this.resetVotingSource.next(true);
        break;

      case 'select_ticket':
        if (message.data.ticket) {
          if (this.isHost) {
            this.gameState.selectedTicket = message.data.ticket;
            this.gameState.votes = {};
          }
          this.ticketSelectedSource.next({ ticket: message.data.ticket });
        }
        break;

      case 'update_issues':
        if (message.data.issues && Array.isArray(message.data.issues)) {
          if (this.isHost) {
            this.gameState.issues = [...message.data.issues];
          }
          this.issuesUpdatedSource.next([...message.data.issues]);
        }
        break;

      case 'request_state':
        if (this.isHost) {
          this.sendFullState();
        }
        break;

      case 'full_state':
        if (!this.isHost && message.data) {
          // Update game state
          if (message.data.issues && Array.isArray(message.data.issues)) {
            this.gameState.issues = [...message.data.issues];
            this.issuesUpdatedSource.next([...message.data.issues]);
          }

          if (message.data.selectedTicket) {
            this.gameState.selectedTicket = message.data.selectedTicket;
            this.ticketSelectedSource.next({ ticket: message.data.selectedTicket });
          }

          if (message.data.gameName) {
            this.gameState.gameName = message.data.gameName;
          }

          if (message.data.gameType) {
            this.gameState.gameType = message.data.gameType;
          }

          if (message.data.votes) {
            this.gameState.votes = { ...message.data.votes };
          }
        }
        break;
    }
  }

  // Public methods for sending updates
  sendVote(vote: any): void {
    this.sendMessage('vote', vote);
  }

  sendReveal(): void {
    this.sendMessage('reveal', {});
  }

  sendResetVoting(): void {
    this.sendMessage('reset_voting', {});
  }

  sendTicketSelection(ticket: JiraTicket): void {
    this.sendMessage('select_ticket', {
      ticket,
      ticketKey: ticket.Key,
      ticketSummary: ticket.Summary
    });
  }

  sendUserJoined(userData: any): void {
    this.sendMessage('user_joined', userData);
  }

  sendIssuesUpdate(issues: JiraTicket[]): void {
    this.sendMessage('update_issues', {
      issues,
      forceUpdate: true
    });
  }

  requestFullState(): void {
    this.sendMessage('request_state', {
      needsFullState: true,
      clientId: this.clientId
    });
  }

  sendFullState(): void {
    this.sendMessage('full_state', {
      issues: this.gameState.issues,
      selectedTicket: this.gameState.selectedTicket,
      gameName: this.gameState.gameName,
      gameType: this.gameState.gameType,
      votes: this.gameState.votes
    });
  }

  disconnect(): void {
    this.connectionStatusSource.next('disconnected');

    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  getCurrentRoomId(): string | null {
    return this.roomId;
  }

  setGameName(name: string): void {
    this.gameState.gameName = name;
  }

  setGameType(type: string): void {
    this.gameState.gameType = type;
  }

  private generateClientId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }

  private setupPollingFallback(): void {
    // If WebSocket fails, set up HTTP polling
    setInterval(() => {
      // Only poll if WebSocket is disconnected
      if (this.connectionStatusSource.getValue() === 'disconnected') {
        this.pollForUpdates();
      }
    }, 5000); // Poll every 5 seconds
  }

  private pollForUpdates(): void {
    // Simple polling using fetch API
    fetch(`${environment.baseUrl}/api/poll?roomId=${this.roomId}`)
      .then(response => response.json())
      .then(data => {
        // Process updates from polling
        this.connectionStatusSource.next('connected');
        // Handle data...
      })
      .catch(error => {
        console.error("Polling error:", error);
      });
  }
}
