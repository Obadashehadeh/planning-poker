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
    localStorage.setItem(this.ticketsKey, JSON.stringify(tickets));
  }

  getStoredTickets(): JiraTicket[] {
    return JSON.parse(localStorage.getItem(this.ticketsKey) || '[]');
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
    localStorage.setItem(this.selectedTicketKey, JSON.stringify(ticket));
  }
  getSelectedTicket(): JiraTicket | null {
    const ticket = localStorage.getItem(this.selectedTicketKey);
    return ticket ? JSON.parse(ticket) : null;
  }

  clearSelectedTicket(): void {
    localStorage.removeItem(this.selectedTicketKey);
  }
  clearStoredData(): void {
    localStorage.clear();
  }
}
