import { Injectable } from '@angular/core';

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
export class StorageService {
  private displayNameKey = 'displayName';
  private selectedCardsKey = 'selectedCards';
  private ticketsKey = 'jiraTickets';
  private selectedTicketKey = 'selectedTicket';

  setDisplayName(displayName: string): void {
    try {
      localStorage.setItem(this.displayNameKey, displayName);
    } catch (error) {
      console.error('Error storing display name', error);
    }
  }

  getDisplayName(): string | null {
    try {
      return localStorage.getItem(this.displayNameKey);
    } catch (error) {
      console.error('Error getting display name', error);
      return null;
    }
  }

  clearDisplayName(): void {
    try {
      localStorage.removeItem(this.displayNameKey);
    } catch (error) {
      console.error('Error clearing display name', error);
    }
  }

  storeLastClickedCard(card: number): void {
    try {
      const selectedCards: number[] = JSON.parse(localStorage.getItem(this.selectedCardsKey) || '[]');
      selectedCards.push(card);
      localStorage.setItem(this.selectedCardsKey, JSON.stringify(selectedCards));
    } catch (error) {
      console.error('Error storing last clicked card', error);
    }
  }

  getStoredCards(): number[] {
    try {
      return JSON.parse(localStorage.getItem(this.selectedCardsKey) || '[]');
    } catch (error) {
      console.error('Error getting stored cards', error);
      return [];
    }
  }

  clearStoredCards(): void {
    try {
      localStorage.removeItem(this.selectedCardsKey);
    } catch (error) {
      console.error('Error clearing stored cards', error);
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
      console.error('Error storing tickets', error);
      try {
        localStorage.removeItem(this.ticketsKey);
        localStorage.setItem(this.ticketsKey, JSON.stringify([]));
      } catch (fallbackError) {
        console.error('Error in fallback storage', fallbackError);
      }
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
      console.error('Error getting stored tickets', error);
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
    } catch (error) {
      console.error('Error updating ticket story points', error);
    }
  }

  setSelectedTicket(ticket: JiraTicket): void {
    try {
      if (!ticket || !ticket.Key) {
        return;
      }
      localStorage.setItem(this.selectedTicketKey, JSON.stringify(ticket));
    } catch (error) {
      console.error('Error setting selected ticket', error);
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
    } catch (error) {
      console.error('Error getting selected ticket', error);
      localStorage.removeItem(this.selectedTicketKey);
      return null;
    }
  }

  clearSelectedTicket(): void {
    try {
      localStorage.removeItem(this.selectedTicketKey);
    } catch (error) {
      console.error('Error clearing selected ticket', error);
    }
  }
}
