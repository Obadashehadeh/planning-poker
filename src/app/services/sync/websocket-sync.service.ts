// src/app/services/sync/websocket-sync.service.ts

import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '../../../environments/environments';

interface JiraTicket {
  Key: string;
  Summary: string;
  Status: string;
  Assignee: string;
  Description: string;
  'Story point': number | string;
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

  // Observables for real-time updates
  private issuesUpdated = new BehaviorSubject<any[]>([]);
  private voteReceived = new BehaviorSubject<any>(null);
  private ticketSelected = new BehaviorSubject<any>(null);
  private revealTriggered = new BehaviorSubject<boolean>(false);
  private resetVoting = new BehaviorSubject<boolean>(false);
  private userJoined = new BehaviorSubject<any>(null);
  private connectionStatus = new BehaviorSubject<'connected' | 'disconnected' | 'connecting'>('disconnected');

  constructor() {
    this.clientId = this.generateClientId();
  }

  // Public observables
  public get issuesUpdated$(): Observable<any[]> {
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
    this.roomId = roomId;
    this.isHost = isHost;
    this.displayName = displayName;
    this.connectToWebSocket();
  }

  private connectToWebSocket(): void {
    this.connectionStatus.next('connecting');

    // Use wss:// for production and secure environments
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Dynamically determine server address (you'll need to set this up separately)
    const serverUrl = `${protocol}//${window.location.hostname}:3000`;

    try {
      this.socket = new WebSocket(serverUrl);

      this.socket.onopen = () => {
        console.log('WebSocket connection established');
        this.connectionStatus.next('connected');
        this.startPingInterval();
        this.joinRoom();
      };

      this.socket.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.socket.onclose = () => {
        console.log('WebSocket connection closed');
        this.connectionStatus.next('disconnected');
        this.clearIntervals();
        this.scheduleReconnect();
      };

      this.socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.connectionStatus.next('disconnected');
      };
    } catch (error) {
      console.error('Error creating WebSocket:', error);
      this.connectionStatus.next('disconnected');
      this.scheduleReconnect();
    }
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      // Ignore messages from self
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

        case 'ticket_selected':
          this.ticketSelected.next(message.data);
          break;

        case 'update_issues':
          if (message.data.issues && Array.isArray(message.data.issues)) {
            this.issuesUpdated.next(message.data.issues);
          }
          break;

        case 'reset_voting':
          this.resetVoting.next(true);
          setTimeout(() => this.resetVoting.next(false), 100);
          break;

        case 'user_joined':
          this.userJoined.next(message.data);
          break;

        case 'request_state':
          if (this.isHost) {
            this.sendFullState();
          }
          break;

        case 'full_state':
          if (!this.isHost && message.data) {
            if (message.data.issues) {
              this.issuesUpdated.next(message.data.issues);
            }
            if (message.data.selectedTicket) {
              this.ticketSelected.next({ ticket: message.data.selectedTicket });
            }
          }
          break;

        case 'pong':
          // Handle pong response
          break;
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  }

  private sendMessage(type: string, data: any): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.warn('Cannot send message, socket not open');
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
      this.socket.send(JSON.stringify(message));
    } catch (error) {
      console.error('Error sending message:', error);
      this.scheduleReconnect();
    }
  }

  private joinRoom(): void {
    if (!this.roomId) {
      console.error('No room ID provided');
      return;
    }

    this.sendMessage('join_room', {
      displayName: this.displayName,
      isHost: this.isHost
    });

    // If not host, request current state
    if (!this.isHost) {
      this.requestFullStateInternal();
    }
  }

  private startPingInterval(): void {
    this.clearIntervals();
    this.pingInterval = setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.sendMessage('ping', { timestamp: new Date().getTime() });
      }
    }, 30000); // 30 seconds
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
    if (!this.reconnectInterval) {
      this.reconnectInterval = setInterval(() => {
        console.log('Attempting to reconnect...');
        this.connectToWebSocket();
      }, 5000); // Attempt reconnect every 5 seconds
    }
  }

  // Private method used internally
  private requestFullStateInternal(): void {
    this.sendMessage('request_state', {
      needsFullState: true
    });
  }

  // Public method that can be called from components
  public requestFullState(): void {
    this.requestFullStateInternal();
  }

  private sendFullState(): void {
    // This would be implemented by the host to send current game state
    // You'll need to update this to include the actual game state data from your storage services
    this.sendMessage('full_state', {
      // Get this data from your storage services
      issues: [],
      selectedTicket: null,
      gameName: '',
      gameType: ''
    });
  }

  // Public methods for sending updates
  public sendIssuesUpdate(issues: any[]): void {
    this.sendMessage('update_issues', {
      issues
    });
  }

  public sendVote(vote: any): void {
    this.sendMessage('vote', vote);
  }

  public sendTicketSelection(ticket: JiraTicket): void {
    this.sendMessage('ticket_selected', {
      ticket
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
