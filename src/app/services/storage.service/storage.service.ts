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

  constructor() { }

  setDisplayName(displayName: string): void {
    localStorage.setItem(this.displayNameKey, displayName);
  }

  getDisplayName(): string | null {
    return localStorage.getItem(this.displayNameKey);
  }

  clearDisplayName(): void {
    localStorage.removeItem(this.displayNameKey);
  }

  storeLastClickedCard(card: number): void {
    const selectedCards: number[] = JSON.parse(localStorage.getItem(this.selectedCardsKey) || '[]');
    selectedCards.push(card);
    localStorage.setItem(this.selectedCardsKey, JSON.stringify(selectedCards));
  }

  getStoredCards(): number[] {
    return JSON.parse(localStorage.getItem(this.selectedCardsKey) || '[]');
  }

  clearStoredCards(): void {
    localStorage.removeItem(this.selectedCardsKey);
  }

  storeTickets(tickets: JiraTicket[]): void {
    try {
      const ticketsToStore = Array.isArray(tickets) ? tickets : [];
      localStorage.setItem(this.ticketsKey, JSON.stringify(ticketsToStore));
      this.updateSyncVersion();
    } catch (error) {
      localStorage.removeItem(this.ticketsKey);
      localStorage.setItem(this.ticketsKey, JSON.stringify([]));
    }
  }

  getStoredTickets(): JiraTicket[] {
    try {
      const stored = localStorage.getItem(this.ticketsKey);
      if (!stored) return [];
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      localStorage.removeItem(this.ticketsKey);
      return [];
    }
  }

  updateTicketStoryPoints(ticketKey: string, storyPoints: number): void {
    const tickets = this.getStoredTickets();
    const ticketIndex = tickets.findIndex(t => t.Key === ticketKey);

    if (ticketIndex !== -1) {
      tickets[ticketIndex]['Story point'] = storyPoints;
      this.storeTickets(tickets);
    }
  }

  setSelectedTicket(ticket: JiraTicket): void {
    try {
      localStorage.setItem(this.selectedTicketKey, JSON.stringify(ticket));
    } catch (error) {
      localStorage.removeItem(this.selectedTicketKey);
    }
  }

  getSelectedTicket(): JiraTicket | null {
    try {
      const ticket = localStorage.getItem(this.selectedTicketKey);
      return ticket ? JSON.parse(ticket) : null;
    } catch (error) {
      localStorage.removeItem(this.selectedTicketKey);
      return null;
    }
  }

  clearSelectedTicket(): void {
    localStorage.removeItem(this.selectedTicketKey);
  }

  private updateSyncVersion(): void {
    const currentVersion = parseInt(localStorage.getItem(this.syncVersionKey) || '0');
    localStorage.setItem(this.syncVersionKey, (currentVersion + 1).toString());
  }

  getSyncVersion(): number {
    return parseInt(localStorage.getItem(this.syncVersionKey) || '0');
  }

  clearStoredData(): void {
    localStorage.clear();
  }

  forceRefreshTickets(): void {
    const tickets = this.getStoredTickets();
    this.storeTickets([]);
    setTimeout(() => {
      this.storeTickets(tickets);
    }, 100);
  }
}
