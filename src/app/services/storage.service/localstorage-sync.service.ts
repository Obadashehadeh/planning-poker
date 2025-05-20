import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, interval } from 'rxjs';

interface SyncData {
  issues: any[];
  selectedTicket: any;
  votes: { [key: string]: any };
  timestamp: number;
  version: number;
  hostId: string;
  lastActivity: number;
}

interface ClientInfo {
  id: string;
  isHost: boolean;
  lastSeen: number;
  displayName: string;
}

@Injectable({
  providedIn: 'root'
})
export class LocalStorageSyncService {
  private clientId: string;
  private isHost = false;
  private syncKey = 'poker-game-sync';
  private clientsKey = 'poker-clients';
  private eventsKey = 'poker-events';
  private currentVersion = 0;
  private lastSyncTime = 0;
  private syncInterval = 500;
  private hostElectionTimeout = 5000;
  private cleanupInterval = 10000;
  private eventCleanupTime = 5000;


  private issuesUpdated = new BehaviorSubject<any[]>([]);
  private voteReceived = new BehaviorSubject<any>(null);
  private ticketSelected = new BehaviorSubject<any>(null);
  private revealTriggered = new BehaviorSubject<boolean>(false);
  private resetVoting = new BehaviorSubject<boolean>(false);
  private userJoined = new BehaviorSubject<any>(null);
  private connectionStatus = new BehaviorSubject<'connected' | 'disconnected' | 'syncing'>('disconnected');

  constructor() {
    this.clientId = this.generateClientId();
    this.initializeSync();
  private generateClientId(): string {
      const stored = localStorage.getItem('poker-client-id');
      if (stored) return stored;

      const id = Date.now().toString(36) + Math.random().toString(36).substr(2);
      localStorage.setItem('poker-client-id', id);
      return id;
    }

  public isConnected(): boolean {
      return this.connectionStatus.value === 'connected';
    }

  public getClientId(): string {
      return this.clientId;
    }

  public isHostClient(): boolean {
      return this.isHost;
    }

  public getConnectedClientsCount(): number {
      const clients = this.getClients();
      const activeClients = Object.values(clients).filter(
        client => Date.now() - client.lastSeen < 30000
      );
      return activeClients.length;
    }

  public disconnect(): void {
      const clients = this.getClients();
      delete clients[this.clientId];
      this.setClients(clients);

      this.connectionStatus.next('disconnected');
    }

  public requestSync(): void {
      if (this.isHost) {
      const syncData = this.getSyncData();
      if (syncData) {
        syncData.version++;
        syncData.timestamp = Date.now();
        this.setSyncData(syncData);
      }
    } else {
      this.broadcastEvent('request_sync', {
        clientId: this.clientId,
        needsFullSync: true
      });
    }
  }
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

  public get connectionStatus$(): Observable<'connected' | 'disconnected' | 'syncing'> {
    return this.connectionStatus.asObservable();
  }

  private initializeSync(): void {
    this.registerClient();

    window.addEventListener('storage', (event) => {
      this.handleStorageChange(event);
    });

    interval(this.syncInterval).subscribe(() => {
      this.performSync();
    });

    setTimeout(() => {
      this.performHostElection();
    }, 1000);

    interval(this.cleanupInterval).subscribe(() => {
      this.cleanupInactiveClients();
      this.cleanupOldEvents();
    });

    this.connectionStatus.next('connected');
    console.log(`LocalStorageSyncService initialized for client: ${this.clientId}`);
  }

  private registerClient(): void {
    const clients = this.getClients();
    const clientInfo: ClientInfo = {
      id: this.clientId,
      isHost: false,
      lastSeen: Date.now(),
      displayName: ''
    };

    clients[this.clientId] = clientInfo;
    this.setClients(clients);

  }

  private performHostElection(): void {
    const clients = this.getClients();
    const activeClients = Object.values(clients).filter(
      client => Date.now() - client.lastSeen < this.hostElectionTimeout
    );

    if (activeClients.length === 0) {
      this.becomeHost();
      return;
    }

    activeClients.sort((a, b) => a.id.localeCompare(b.id));
    const electedHost = activeClients[0];

    if (electedHost.id === this.clientId) {
      this.becomeHost();
    } else {
      this.isHost = false;
      console.log(`Client ${this.clientId} is not host. Host is: ${electedHost.id}`);
    }
  }

  private becomeHost(): void {
    this.isHost = true;
    const clients = this.getClients();

    Object.values(clients).forEach(client => {
      client.isHost = false;
    });

    if (clients[this.clientId]) {
      clients[this.clientId].isHost = true;
    }

    this.setClients(clients);
    console.log(`Client ${this.clientId} became host`);
    const syncData = this.getSyncData();
    if (!syncData) {
      this.setSyncData({
        issues: [],
        selectedTicket: null,
        votes: {},
        timestamp: Date.now(),
        version: 1,
        hostId: this.clientId,
        lastActivity: Date.now()
      });
    }
  }

  private handleStorageChange(event: StorageEvent): void {
    if (!event.key) return;

    if (event.key === this.syncKey && event.newValue) {
      try {
        const syncData: SyncData = JSON.parse(event.newValue);

        if (syncData.version > this.currentVersion) {
          this.processSyncData(syncData);
        }
      } catch (error) {
        console.error('Error parsing sync data:', error);
      }
    } else if (event.key === this.clientsKey) {
      this.handleClientChange();
    } else if (event.key.startsWith('poker-event-')) {
      try {
        if (event.newValue) {
          const eventData = JSON.parse(event.newValue);
          if (eventData.sender !== this.clientId) {
            this.handleEventData(eventData);
          }
        }
      } catch (error) {
        console.error('Error parsing event data:', error);
      }
    }
  }

  private performSync(): void {
    this.updateClientLastSeen();

    if (!this.isHost) {
      const syncData = this.getSyncData();
      if (syncData && syncData.version > this.currentVersion) {
        this.processSyncData(syncData);
      }
    }

    this.checkForEvents();

    const clients = this.getClients();
    const hostClient = Object.values(clients).find(c => c.isHost);

    if (!hostClient || Date.now() - hostClient.lastSeen > this.hostElectionTimeout) {
      this.performHostElection();
    }
  }

  private checkForEvents(): void {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('poker-event-')) {
        try {
          const eventData = JSON.parse(localStorage.getItem(key) || '{}');
          if (eventData.sender !== this.clientId) {
            this.handleEventData(eventData);
          }
        } catch (error) {
          console.error('Error parsing event:', error);
        }
      }
    }
  }

  private handleEventData(eventData: any): void {
    if (!eventData || !eventData.type) return;

    switch (eventData.type) {
      case 'vote':
        this.voteReceived.next(eventData.data);
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
        this.userJoined.next(eventData.data);
        break;
    }
  }

  private processSyncData(syncData: SyncData): void {
    this.currentVersion = syncData.version;
    this.lastSyncTime = Date.now();

    if (syncData.issues && syncData.issues.length > 0) {
      const currentIssues = this.issuesUpdated.value;
      if (JSON.stringify(currentIssues) !== JSON.stringify(syncData.issues)) {
        this.issuesUpdated.next(syncData.issues);
      }
    }

    if (syncData.selectedTicket) {
      this.ticketSelected.next({ ticket: syncData.selectedTicket });
    }
  }

  private updateClientLastSeen(): void {
    const clients = this.getClients();
    if (clients[this.clientId]) {
      clients[this.clientId].lastSeen = Date.now();
      this.setClients(clients);
    }
  }

  private cleanupInactiveClients(): void {
    const clients = this.getClients();
    const now = Date.now();
    const timeout = 30000;

    let hasChanges = false;
    Object.keys(clients).forEach(clientId => {
      if (now - clients[clientId].lastSeen > timeout) {
        delete clients[clientId];
        hasChanges = true;
      }
    });

    if (hasChanges) {
      this.setClients(clients);

      const remainingClients = Object.values(clients);
      const hasHost = remainingClients.some(c => c.isHost);

      if (!hasHost && remainingClients.length > 0) {
        this.performHostElection();
      }
    }
  }

  private cleanupOldEvents(): void {
    const now = Date.now();

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('poker-event-')) {
        try {
          const eventData = JSON.parse(localStorage.getItem(key) || '{}');
          if (now - eventData.timestamp > this.eventCleanupTime) {
            localStorage.removeItem(key);
          }
        } catch (error) {
          if (key) localStorage.removeItem(key);
        }
      }
    }
  }

  private handleClientChange(): void {
    const clients = this.getClients();
    const hostClient = Object.values(clients).find(c => c.isHost);

    if (hostClient && hostClient.id !== this.clientId && this.isHost) {
      this.isHost = false;
    }
  }

  private getSyncData(): SyncData | null {
    try {
      const data = localStorage.getItem(this.syncKey);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      return null;
    }
  }

  private setSyncData(data: SyncData): void {
    try {
      if (!this.isHost) {
        console.warn('Non-host client attempted to write sync data');
        return;
      }

      localStorage.setItem(this.syncKey, JSON.stringify(data));
      this.currentVersion = data.version;
    } catch (error) {
      console.error('Error writing sync data:', error);
    }
  }

  private getClients(): { [key: string]: ClientInfo } {
    try {
      const data = localStorage.getItem(this.clientsKey);
      return data ? JSON.parse(data) : {};
    } catch (error) {
      return {};
    }
  }

  private setClients(clients: { [key: string]: ClientInfo }): void {
    try {
      localStorage.setItem(this.clientsKey, JSON.stringify(clients));
    } catch (error) {
      console.error('Error writing clients data:', error);
    }
  }

  public sendIssuesUpdate(issues: any[]): void {
    if (!this.isHost) {
      console.warn('Only host can update issues');
      return;
    }

    const syncData: SyncData = {
      issues,
      selectedTicket: this.getSyncData()?.selectedTicket || null,
      votes: this.getSyncData()?.votes || {},
      timestamp: Date.now(),
      version: this.currentVersion + 1,
      hostId: this.clientId,
      lastActivity: Date.now()
    };

    this.setSyncData(syncData);
    this.issuesUpdated.next(issues);
  }

  public sendVote(vote: any): void {
    const syncData = this.getSyncData();
    if (!syncData) return;

    const votes = syncData.votes || {};
    votes[this.clientId] = vote;

    if (this.isHost) {
      syncData.votes = votes;
      syncData.version++;
      syncData.timestamp = Date.now();
      syncData.lastActivity = Date.now();
      this.setSyncData(syncData);
    }

    this.broadcastEvent('vote', vote);
    this.voteReceived.next(vote);
  }

  public sendTicketSelection(ticket: any): void {
    if (!this.isHost) {
      console.warn('Only host can select tickets');
      return;
    }

    const syncData: SyncData = {
      issues: this.getSyncData()?.issues || [],
      selectedTicket: ticket,
      votes: {},
      timestamp: Date.now(),
      version: this.currentVersion + 1,
      hostId: this.clientId,
      lastActivity: Date.now()
    };

    this.setSyncData(syncData);
    this.ticketSelected.next({ ticket });
  }

  public sendReveal(): void {
    this.revealTriggered.next(true);
    setTimeout(() => this.revealTriggered.next(false), 100);

    this.broadcastEvent('reveal', {});
  }

  public sendResetVoting(): void {
    if (this.isHost) {
      const syncData = this.getSyncData();
      if (syncData) {
        syncData.votes = {};
        syncData.version++;
        syncData.timestamp = Date.now();
        syncData.lastActivity = Date.now();
        this.setSyncData(syncData);
      }
    }

    this.resetVoting.next(true);
    setTimeout(() => this.resetVoting.next(false), 100);

    this.broadcastEvent('reset_voting', {});
  }

  public sendUserJoined(user: any): void {
    const clients = this.getClients();
    if (clients[this.clientId]) {
      clients[this.clientId].displayName = user.user || user.displayName || '';
      clients[this.clientId].lastSeen = Date.now();
      this.setClients(clients);
    }

    this.userJoined.next(user);
    this.broadcastEvent('user_joined', user);
  }

  private broadcastEvent(eventType: string, data: any): void {
    const eventKey = `poker-event-${eventType}-${Date.now()}`;
    try {
      localStorage.setItem(eventKey, JSON.stringify({
        type: eventType,
        data,
        sender: this.clientId,
        timestamp: Date.now()
      }));

      setTimeout(() => {
        localStorage.removeItem(eventKey);
      }, this.eventCleanupTime);
    } catch (error) {
      console.error('Error broadcasting event:', error);
    }
  }
