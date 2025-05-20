import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class SharedWorkerSyncService {
  private worker: SharedWorker | null = null;
  private port: MessagePort | null = null;
  private clientId: string | null = null;
  private isHost = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  private issuesUpdated = new BehaviorSubject<any[]>([]);
  private voteReceived = new BehaviorSubject<any>(null);
  private ticketSelected = new BehaviorSubject<any>(null);
  private revealTriggered = new BehaviorSubject<boolean>(false);
  private resetVoting = new BehaviorSubject<boolean>(false);
  private userJoined = new BehaviorSubject<any>(null);
  private connectionStatus = new BehaviorSubject<'connected' | 'disconnected' | 'connecting'>('disconnected');

  constructor() {
    this.initializeWorker();
  }

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

  private initializeWorker(): void {
    try {
      this.connectionStatus.next('connecting');

      const workerBlob = new Blob([this.getWorkerCode()], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(workerBlob);

      this.worker = new SharedWorker(workerUrl);
      this.port = this.worker.port;

      this.port.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.port.onmessageerror = (error) => {
        this.handleConnectionError();
      };

      this.port.start();

      this.sendMessage({ type: 'ping' });

    } catch (error) {
      this.handleConnectionError();
    }
  }

  private getWorkerCode(): string {
    return `
      class SharedSyncWorker {
        constructor() {
          this.clients = new Map();
          this.gameState = {
            issues: [],
            selectedTicket: null,
            votes: new Map(),
            hostId: null
          };

          self.onconnect = (event) => {
            const port = event.ports[0];
            this.handleNewConnection(port);
          };

          setInterval(() => {
            this.cleanupInactiveClients();
          }, 30000);
        }

        handleNewConnection(port) {
          const clientId = this.generateId();
          const isHost = this.clients.size === 0;

          const client = {
            port,
            id: clientId,
            isHost,
            lastSeen: Date.now()
          };

          this.clients.set(clientId, client);

          if (isHost) {
            this.gameState.hostId = clientId;
          }

          port.onmessage = (event) => {
            this.handleMessage(clientId, event.data);
          };

          port.postMessage({
            type: 'connection_established',
            clientId,
            isHost,
            gameState: {
              issues: this.gameState.issues,
              selectedTicket: this.gameState.selectedTicket
            }
          });

          if (!isHost && this.gameState.issues.length > 0) {
            port.postMessage({
              type: 'full_state',
              data: {
                issues: this.gameState.issues,
                selectedTicket: this.gameState.selectedTicket
              }
            });
          }
        }

        handleMessage(clientId, message) {
          const client = this.clients.get(clientId);
          if (!client) return;

          client.lastSeen = Date.now();

          switch (message.type) {
            case 'issues_update':
              this.gameState.issues = message.data;
              this.broadcastToOthers(clientId, {
                type: 'issues_update',
                data: message.data
              });
              break;

            case 'vote':
              this.gameState.votes.set(clientId, message.data);
              this.broadcastToOthers(clientId, {
                type: 'vote',
                data: message.data,
                clientId
              });
              break;

            case 'ticket_selected':
              this.gameState.selectedTicket = message.data.ticket;
              this.gameState.votes.clear();
              this.broadcastToOthers(clientId, {
                type: 'ticket_selected',
                data: message.data
              });
              break;

            case 'reveal':
              const votes = {};
              this.gameState.votes.forEach((vote, id) => {
                votes[id] = vote;
              });
              this.broadcastToOthers(clientId, {
                type: 'reveal',
                votes
              });
              break;

            case 'reset_voting':
              this.gameState.votes.clear();
              this.broadcastToOthers(clientId, {
                type: 'reset_voting'
              });
              break;

            case 'user_joined':
              this.broadcastToOthers(clientId, {
                type: 'user_joined',
                data: message.data,
                clientId
              });
              break;

            case 'ping':
              client.port.postMessage({ type: 'pong' });
              break;

            case 'request_state':
              client.port.postMessage({
                type: 'full_state',
                data: {
                  issues: this.gameState.issues,
                  selectedTicket: this.gameState.selectedTicket
                }
              });
              break;
          }
        }

        broadcastToOthers(senderClientId, message) {
          this.clients.forEach((client, clientId) => {
            if (clientId !== senderClientId) {
              try {
                client.port.postMessage(message);
              } catch (error) {
                this.clients.delete(clientId);
              }
            }
          });
        }

        cleanupInactiveClients() {
          const now = Date.now();
          const timeout = 60000;

          this.clients.forEach((client, clientId) => {
            if (now - client.lastSeen > timeout) {
              this.clients.delete(clientId);

              if (clientId === this.gameState.hostId) {
                const remainingClients = Array.from(this.clients.values());
                if (remainingClients.length > 0) {
                  const newHost = remainingClients[0];
                  newHost.isHost = true;
                  this.gameState.hostId = newHost.id;

                  newHost.port.postMessage({
                    type: 'promoted_to_host',
                    gameState: {
                      issues: this.gameState.issues,
                      selectedTicket: this.gameState.selectedTicket
                    }
                  });
                }
              }
            }
          });
        }

        generateId() {
          return Date.now().toString(36) + Math.random().toString(36).substr(2);
        }
      }

      new SharedSyncWorker();
    `;
  }

  private handleMessage(message: any): void {
    switch (message.type) {
      case 'connection_established':
        this.clientId = message.clientId;
        this.isHost = message.isHost;
        this.connectionStatus.next('connected');
        this.reconnectAttempts = 0;

        if (message.gameState.issues.length > 0) {
          this.issuesUpdated.next(message.gameState.issues);
        }
        break;

      case 'full_state':
        if (message.data.issues) {
          this.issuesUpdated.next(message.data.issues);
        }
        if (message.data.selectedTicket) {
          this.ticketSelected.next({ ticket: message.data.selectedTicket });
        }
        break;

      case 'issues_update':
        this.issuesUpdated.next(message.data);
        break;

      case 'vote':
        this.voteReceived.next(message.data);
        break;

      case 'ticket_selected':
        this.ticketSelected.next(message.data);
        break;

      case 'reveal':
        this.revealTriggered.next(true);
        setTimeout(() => this.revealTriggered.next(false), 100);
        break;

      case 'reset_voting':
        this.resetVoting.next(true);
        setTimeout(() => this.resetVoting.next(false), 100);
        break;

      case 'user_joined':
        this.userJoined.next(message.data);
        break;

      case 'promoted_to_host':
        this.isHost = true;
        if (message.gameState.issues.length > 0) {
          this.issuesUpdated.next(message.gameState.issues);
        }
        break;

      case 'pong':
        break;

      default:
        console.log('Unknown message type:', message.type);
    }
  }

  private handleConnectionError(): void {
    this.connectionStatus.next('disconnected');

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      setTimeout(() => {
        this.reconnectAttempts++;
        this.initializeWorker();
      }, 2000 * this.reconnectAttempts);
    } else {
      console.error('Max reconnection attempts reached');
    }
  }

  private sendMessage(message: any): void {
    if (this.port && this.connectionStatus.value === 'connected') {
      try {
        this.port.postMessage(message);
      } catch (error) {
        this.handleConnectionError();
      }
    } else {
      console.warn('Cannot send message: not connected');
    }
  }

  public sendIssuesUpdate(issues: any[]): void {
    this.sendMessage({
      type: 'issues_update',
      data: issues
    });
  }

  public sendVote(vote: any): void {
    this.sendMessage({
      type: 'vote',
      data: vote
    });
  }

  public sendTicketSelection(ticket: any): void {
    this.sendMessage({
      type: 'ticket_selected',
      data: { ticket }
    });
  }

  public sendReveal(): void {
    this.sendMessage({
      type: 'reveal'
    });
  }

  public sendResetVoting(): void {
    this.sendMessage({
      type: 'reset_voting'
    });
  }

  public sendUserJoined(user: any): void {
    this.sendMessage({
      type: 'user_joined',
      data: user
    });
  }

  public requestState(): void {
    this.sendMessage({
      type: 'request_state'
    });
  }

  public isConnected(): boolean {
    return this.connectionStatus.value === 'connected';
  }

  public getClientId(): string | null {
    return this.clientId;
  }

  public isHostClient(): boolean {
    return this.isHost;
  }

  public disconnect(): void {
    if (this.worker) {
      this.worker.port.close();
      this.worker = null;
      this.port = null;
      this.connectionStatus.next('disconnected');
    }
  }

  public ping(): void {
    this.sendMessage({ type: 'ping' });
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
