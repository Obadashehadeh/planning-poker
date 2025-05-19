import { Injectable } from '@angular/core';

interface JiraTicket {
  Key: string;
  Summary: string;
  Status: string;
  Assignee: string;
  'Story point': number | string;
}

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  private displayNameKey = 'displayName';
  private selectedCardsKey = 'selectedCards';
  private ticketsKey = 'jiraTickets';
  private selectedTicketKey = 'selectedTicket';
  private syncVersionKey = 'syncVersion';
  private lastUpdateKey = 'lastTicketUpdate';

  setDisplayName(displayName: string): void {
    try {
      localStorage.setItem(this.displayNameKey, displayName);
    } catch (error: unknown) {
      this.handleStorageError('setDisplayName', error);
    }
  }

  getDisplayName(): string | null {
    try {
      return localStorage.getItem(this.displayNameKey);
    } catch (error: unknown) {
      this.handleStorageError('getDisplayName', error);
      return null;
    }
  }

  clearDisplayName(): void {
    try {
      localStorage.removeItem(this.displayNameKey);
    } catch (error: unknown) {
      this.handleStorageError('clearDisplayName', error);
    }
  }

  storeLastClickedCard(card: number): void {
    try {
      const selectedCards: number[] = JSON.parse(localStorage.getItem(this.selectedCardsKey) || '[]');
      selectedCards.push(card);
      localStorage.setItem(this.selectedCardsKey, JSON.stringify(selectedCards));
    } catch (error: unknown) {
      this.handleStorageError('storeLastClickedCard', error);
    }
  }

  getStoredCards(): number[] {
    try {
      return JSON.parse(localStorage.getItem(this.selectedCardsKey) || '[]');
    } catch (error: unknown) {
      this.handleStorageError('getStoredCards', error);
      return [];
    }
  }

  clearStoredCards(): void {
    try {
      localStorage.removeItem(this.selectedCardsKey);
    } catch (error: unknown) {
      this.handleStorageError('clearStoredCards', error);
    }
  }

  storeTickets(tickets: JiraTicket[]): void {
    try {
      if (!Array.isArray(tickets)) {
        tickets = [];
      }

      const ticketsToStore = tickets.map(ticket => ({
        Key: ticket.Key || '',
        Summary: ticket.Summary || '',
        Status: ticket.Status || 'To Do',
        Assignee: ticket.Assignee || '',
        'Story point': ticket['Story point'] || ''
      }));

      localStorage.setItem(this.ticketsKey, JSON.stringify(ticketsToStore));
      localStorage.setItem(this.lastUpdateKey, new Date().getTime().toString());
      this.updateSyncVersion();

      const verifyStored = this.getStoredTickets();
      if (verifyStored.length !== ticketsToStore.length) {
        this.forceStoreTickets(ticketsToStore);
      }
    } catch (error: unknown) {
      this.handleStorageError('storeTickets', error);
      try {
        localStorage.removeItem(this.ticketsKey);
        localStorage.setItem(this.ticketsKey, JSON.stringify([]));
      } catch (fallbackError: unknown) {
        this.handleStorageError('storeTickets fallback', fallbackError);
      }
    }
  }

  private forceStoreTickets(tickets: JiraTicket[]): void {
    try {
      localStorage.removeItem(this.ticketsKey);
      setTimeout(() => {
        localStorage.setItem(this.ticketsKey, JSON.stringify(tickets));
      }, 100);
    } catch (error: unknown) {
      this.handleStorageError('forceStoreTickets', error);
    }
  }

  getStoredTickets(): JiraTicket[] {
    try {
      const stored = localStorage.getItem(this.ticketsKey);
      if (!stored) {
        return [];
      }

      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) {
        localStorage.removeItem(this.ticketsKey);
        return [];
      }

      return parsed;
    } catch (error: unknown) {
      this.handleStorageError('getStoredTickets', error);
      localStorage.removeItem(this.ticketsKey);
      return [];
    }
  }

  updateTicketStoryPoints(ticketKey: string, storyPoints: number): void {
    try {
      const tickets = this.getStoredTickets();
      const ticketIndex = tickets.findIndex(t => t.Key === ticketKey);

      if (ticketIndex !== -1) {
        tickets[ticketIndex]['Story point'] = storyPoints;
        this.storeTickets(tickets);
      }
    } catch (error: unknown) {
      this.handleStorageError('updateTicketStoryPoints', error);
    }
  }

  setSelectedTicket(ticket: JiraTicket): void {
    try {
      if (!ticket || !ticket.Key) {
        return;
      }
      localStorage.setItem(this.selectedTicketKey, JSON.stringify(ticket));
    } catch (error: unknown) {
      this.handleStorageError('setSelectedTicket', error);
      localStorage.removeItem(this.selectedTicketKey);
    }
  }

  getSelectedTicket(): JiraTicket | null {
    try {
      const ticket = localStorage.getItem(this.selectedTicketKey);
      if (!ticket) {
        return null;
      }
      return JSON.parse(ticket);
    } catch (error: unknown) {
      this.handleStorageError('getSelectedTicket', error);
      localStorage.removeItem(this.selectedTicketKey);
      return null;
    }
  }

  clearSelectedTicket(): void {
    try {
      localStorage.removeItem(this.selectedTicketKey);
    } catch (error: unknown) {
      this.handleStorageError('clearSelectedTicket', error);
    }
  }

  private updateSyncVersion(): void {
    try {
      const currentVersion = parseInt(localStorage.getItem(this.syncVersionKey) || '0');
      const newVersion = currentVersion + 1;
      localStorage.setItem(this.syncVersionKey, newVersion.toString());
    } catch (error: unknown) {
      this.handleStorageError('updateSyncVersion', error);
    }
  }

  getSyncVersion(): number {
    try {
      return parseInt(localStorage.getItem(this.syncVersionKey) || '0');
    } catch (error: unknown) {
      this.handleStorageError('getSyncVersion', error);
      return 0;
    }
  }

  getLastUpdateTimestamp(): number {
    try {
      return parseInt(localStorage.getItem(this.lastUpdateKey) || '0');
    } catch (error: unknown) {
      this.handleStorageError('getLastUpdateTimestamp', error);
      return 0;
    }
  }

  clearStoredData(): void {
    try {
      const keys = [
        this.displayNameKey,
        this.selectedCardsKey,
        this.ticketsKey,
        this.selectedTicketKey,
        this.syncVersionKey,
        this.lastUpdateKey
      ];

      keys.forEach(key => {
        try {
          localStorage.removeItem(key);
        } catch (keyError: unknown) {
          this.handleStorageError(`clearStoredData-${key}`, keyError);
        }
      });
    } catch (error: unknown) {
      this.handleStorageError('clearStoredData', error);
    }
  }

  forceRefreshTickets(): void {
    try {
      const tickets = this.getStoredTickets();
      this.storeTickets([]);
      setTimeout(() => {
        this.storeTickets(tickets);
      }, 100);
    } catch (error: unknown) {
      this.handleStorageError('forceRefreshTickets', error);
    }
  }

  debugStorageHealth(): object | null {
    try {
      const tickets = this.getStoredTickets();
      const selectedTicket = this.getSelectedTicket();
      const displayName = this.getDisplayName();
      const syncVersion = this.getSyncVersion();
      const lastUpdate = this.getLastUpdateTimestamp();

      return {
        ticketsCount: tickets.length,
        selectedTicket: selectedTicket?.Key || 'None',
        displayName: displayName || 'None',
        syncVersion: syncVersion,
        lastUpdate: new Date(lastUpdate).toISOString(),
        storageSize: JSON.stringify(localStorage).length
      };
    } catch (error: unknown) {
      this.handleStorageError('debugStorageHealth', error);
      return null;
    }
  }

  exportDebugData(): object {
    try {
      return {
        tickets: this.getStoredTickets(),
        selectedTicket: this.getSelectedTicket(),
        displayName: this.getDisplayName(),
        syncVersion: this.getSyncVersion(),
        lastUpdate: this.getLastUpdateTimestamp(),
        timestamp: new Date().toISOString()
      };
    } catch (error: unknown) {
      this.handleStorageError('exportDebugData', error);
      return { error: 'Export failed' };
    }
  }

  private handleStorageError(method: string, error: unknown): void {
    // Silent error handling - could be enhanced with proper logging service
  }
}
