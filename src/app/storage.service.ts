import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  private displayNameKey = 'displayName';
  selectedCardsKey = 'selectedCards';

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
  
  // Retrieve all stored cards
  getStoredCards(): number[] {
    return JSON.parse(localStorage.getItem(this.selectedCardsKey) || '[]');
  }

  // Clear stored cards
  clearStoredCards(): void {
    localStorage.removeItem(this.selectedCardsKey);
  }

}
