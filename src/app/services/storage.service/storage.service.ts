import { Injectable } from '@angular/core';
import { JiraTicket } from '../../../models';

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  private displayNameKey = 'displayName';
  private selectedCardsKey = 'selectedCards';
  private ticketsKey = 'jiraTickets';
  private selectedTicketKey = 'selectedTicket';

  setDisplayName(displayName: string): void {
    try {
      localStorage.setItem(this.displayNameKey, displayName);
    } catch (error) {
      // Handle error
    }
  }

  getDisplayName(): string | null {
    try {
      return localStorage.getItem(this.displayNameKey);
    } catch (error) {
      return null;
    }
  }

  clearDisplayName(): void {
    try {
      localStorage.removeItem(this.displayNameKey);
    } catch (error) {
      // Handle error
    }
  }

  storeLastClickedCard(card: number): void {
    try {
      localStorage.setItem(this.selectedCardsKey, JSON.stringify(card));
    } catch (error) {
      // Handle error
    }
  }

  getLastClickedCard(): number | null {
    try {
      const card = localStorage.getItem(this.selectedCardsKey);
      return card ? JSON.parse(card) : null;
    } catch (error) {
      return null;
    }
  }

  clearStoredCards(): void {
    try {
      localStorage.removeItem(this.selectedCardsKey);
    } catch (error) {
      // Handle error
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
        Description: ticket.Description || '',
        'Story point': ticket['Story point'] || ''
      }));

      localStorage.setItem(this.ticketsKey, JSON.stringify(ticketsToStore));
    } catch (error) {
      // Handle error
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
    } catch (error) {
      return [];
    }
  }

  setSelectedTicket(ticket: JiraTicket): void {
    try {
      if (!ticket || !ticket.Key) {
        return;
      }
      localStorage.setItem(this.selectedTicketKey, JSON.stringify(ticket));
    } catch (error) {
      // Handle error
    }
  }

  getSelectedTicket(): JiraTicket | null {
    try {
      const ticket = localStorage.getItem(this.selectedTicketKey);
      if (!ticket) {
        return null;
      }
      return JSON.parse(ticket);
    } catch (error) {
      return null;
    }
  }

  clearSelectedTicket(): void {
    try {
      localStorage.removeItem(this.selectedTicketKey);
    } catch (error) {
      // Handle error
    }
  }
}
