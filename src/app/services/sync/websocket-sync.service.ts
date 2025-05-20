import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '../../../environments/environments';
import { StorageService } from '../storage.service/storage.service';
import { GameService } from '../game.service/game.service';

interface JiraTicket {
  Key: string;
  Summary: string;
  Status: string;
  Assignee: string;
  Description: string;
  'Story point': number | string;
}

interface RoomState {
  issues: JiraTicket[];
  selectedTicket: JiraTicket | null;
  gameName: string;
  gameType: string;
}

@Injectable({
  providedIn: 'root'
})
export class WebSocketSyncService {
  private socket: WebSocket | null = null;
  private reconnectInterval: any = null;
  private pingInterval: any = null;
  private clientId: string;
  private roomId: string | null = null;
  private isHost = false;
  private displayName = '';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;

  private issuesUpdated = new BehaviorSubject<JiraTicket[]>([]);
  private voteReceived = new BehaviorSubject<any>(null);
  private ticketSelected = new BehaviorSubject<any>(null);
  private revealTriggered = new BehaviorSubject<boolean>(false);
  private resetVoting = new BehaviorSubject<boolean>(false);
  private userJoined = new BehaviorSubject<any>(null);
  private connectionStatus = new BehaviorSubject<'connected' | 'disconnected' | 'connecting'>('disconnected');

  constructor(
    private storageService: StorageService,
    private gameService: GameService
  ) {
    this.clientId = this.generateClientId();
  }

  public get issuesUpdated$(): Observable<JiraTicket[]> {
    return this.issuesUpdated.asObservable();
  }

  public get voteReceived$(): Observable<any> {
    return this.voteReceived.asObservable();
  }

  public get ticketSelected$(): Observable<any> {
    return this.ticketSelected.asObservable();
  }

  public get revealTriggered$(): Observable<boolean> {
    return this.revealTriggered.asObservable();
  }

  public get resetVoting$(): Observable<boolean> {
    return this.resetVoting.asObservable();
  }

  public get userJoined$(): Observable<any> {
    return this.userJoined.asObservable();
  }

  public get connectionStatus$(): Observable<'connected' | 'disconnected' | 'connecting'> {
    return this.connectionStatus.asObservable();
  }

  public connect(roomId: string, displayName: string, isHost: boolean = false): void {
    if (this.socket &&
      this.socket.readyState === WebSocket.OPEN &&
      this.roomId === roomId &&
      this.displayName === displayName) {
      return;
    }

    if (this.socket && this.socket.readyState === WebSocket.OPEN && this.roomId !== roomId) {
      this.disconnect();
    }

    this.roomId = roomId;
    this.isHost = isHost;
    this.displayName = displayName;
    this.reconnectAttempts = 0;

    this.connectToWebSocket();
  }
  public isConnectedToRoom(roomId: string): boolean {
    return this.socket !== null &&
      this.socket.readyState === WebSocket.OPEN &&
      this.roomId === roomId;
  }

  public getCurrentRoomId(): string | null {
    return this.roomId;
  }

  private connectToWebSocket(): void {
    this.connectionStatus.next('connecting');

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    const serverUrl = environment.websocketUrl;

    try {
      this.socket = new WebSocket(serverUrl);

      this.socket.onopen = () => {
        this.connectionStatus.next('connected');
        this.reconnectAttempts = 0;
        this.startPingInterval();
        this.joinRoom();
      };

      this.socket.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.socket.onclose = () => {
        this.connectionStatus.next('disconnected');
        this.clearIntervals();
        this.scheduleReconnect();
      };

      this.socket.onerror = () => {
        this.connectionStatus.next('disconnected');
      };
    } catch (error) {
      this.connectionStatus.next('disconnected');
      this.scheduleReconnect();
    }
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      if (message.senderId === this.clientId) {
        return;
      }

      switch (message.type) {
        case 'vote':
          this.voteReceived.next(message.data);
          break;

        case 'reveal':
          this.revealTriggered.next(true);
          setTimeout(() => this.revealTriggered.next(false), 100);
          break;

        case 'select_ticket':
        case 'ticket_selected':
          this.ticketSelected.next(message.data);
          break;

        case 'update_issues':
          if (message.data.issues && Array.isArray(message.data.issues)) {
            this.issuesUpdated.next(message.data.issues);
            // Store the issues in local storage
            this.storageService.storeTickets(message.data.issues);
          }
          break;

        case 'reset_voting':
          this.resetVoting.next(true);
          setTimeout(() => this.resetVoting.next(false), 100);
          break;

        case 'user_joined':
          this.userJoined.next(message.data);
          if (this.isHost) {
            // Send current state to new user
            setTimeout(() => this.sendFullState(), 1000);
          }
          break;

        case 'request_state':
          if (this.isHost) {
            this.sendFullState();
          }
          break;

        case 'room_joined':
          if (!this.isHost) {
            this.requestFullStateInternal();
          }
          break;

        case 'full_state':
          if (!this.isHost && message.data) {
            if (message.data.issues && Array.isArray(message.data.issues)) {
              this.issuesUpdated.next(message.data.issues);
              // Store the issues in local storage
              this.storageService.storeTickets(message.data.issues);
            }
            if (message.data.selectedTicket) {
              this.ticketSelected.next({ ticket: message.data.selectedTicket });
              this.storageService.setSelectedTicket(message.data.selectedTicket);
            }
            if (message.data.gameName) {
              this.gameService.setGameName(message.data.gameName);
            }
            if (message.data.gameType) {
              this.gameService.setGameType(message.data.gameType);
            }
          }
          break;

        case 'welcome':
          // Server welcome message
          if (this.isHost) {
            setTimeout(() => this.sendFullState(), 1000);
          } else {
            this.requestFullStateInternal();
          }
          break;
      }
    } catch (error) {
      // Silent error handling
    }
  }

  private sendMessage(type: string, data: any): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const message = {
      type,
      roomId: this.roomId,
      data,
      senderId: this.clientId,
      senderName: this.displayName,
      isHost: this.isHost,
      timestamp: new Date().getTime()
    };

    try {
      const messageStr = JSON.stringify(message);
      this.socket.send(messageStr);
    } catch (error) {
      this.scheduleReconnect();
    }
  }

  private joinRoom(): void {
    if (!this.roomId) {
      return;
    }

    this.sendMessage('join_room', {
      displayName: this.displayName,
      isHost: this.isHost,
      needsFullState: !this.isHost
    });

    if (!this.isHost) {
      setTimeout(() => {
        this.requestFullStateInternal();
      }, 1000);
    } else if (this.isHost) {
      setTimeout(() => {
        this.sendFullState();
      }, 1000);
    }
  }

  private startPingInterval(): void {
    this.clearIntervals();
    this.pingInterval = setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.sendMessage('ping', { timestamp: new Date().getTime() });
      }
    }, 30000);
  }

  private clearIntervals(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
      this.reconnectInterval = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
    }

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(30000, Math.pow(2, this.reconnectAttempts) * 1000);

      this.reconnectInterval = setTimeout(() => {
        this.connectToWebSocket();
      }, delay);
    }
  }

  private requestFullStateInternal(): void {
    this.sendMessage('request_state', {
      needsFullState: true,
      clientId: this.clientId
    });
  }

  public requestFullState(): void {
    this.requestFullStateInternal();
  }

  public sendFullState(): void {
    const issues = this.storageService.getStoredTickets();
    const selectedTicket = this.storageService.getSelectedTicket();
    const gameName = this.gameService.getGameName();
    const gameType = this.gameService.getGameType();

    const state: RoomState = {
      issues: issues || [],
      selectedTicket: selectedTicket,
      gameName: gameName || '',
      gameType: gameType || ''
    };

    this.sendMessage('full_state', state);

    if (issues && issues.length > 0) {
      this.sendMessage('update_issues', {
        issues: issues,
        forceUpdate: true
      });
    }
  }
  public sendIssuesUpdate(issues: JiraTicket[]): void {
    this.sendMessage('update_issues', {
      issues,
      forceUpdate: true
    });

    this.storageService.storeTickets(issues);
  }

  public sendVote(vote: any): void {
    this.sendMessage('vote', vote);
  }

  public sendTicketSelection(ticket: JiraTicket): void {
    this.sendMessage('select_ticket', {
      ticket,
      ticketKey: ticket.Key,
      ticketSummary: ticket.Summary
    });
  }

  public sendReveal(): void {
    this.sendMessage('reveal', {});
  }

  public sendResetVoting(): void {
    this.sendMessage('reset_voting', {});
  }

  public sendUserJoined(user: any): void {
    this.sendMessage('user_joined', user);
  }

  public disconnect(): void {
    this.clearIntervals();
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.connectionStatus.next('disconnected');
  }

  private generateClientId(): string {
    let clientId = localStorage.getItem('ws-client-id');
    if (!clientId) {
      clientId = Date.now().toString(36) + Math.random().toString(36).substring(2);
      localStorage.setItem('ws-client-id', clientId);
    }
    return clientId;
  }

  public isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }
}
