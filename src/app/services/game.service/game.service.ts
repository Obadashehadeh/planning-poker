import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class GameService {
  private gameType: string = '';
  private gameNameSubject: BehaviorSubject<string | null> = new BehaviorSubject<string | null>(null);
  public gameName$: Observable<string | null> = this.gameNameSubject.asObservable();

  private readonly gameNameKey: string = 'gameName';
  private readonly gameTypeKey: string = 'gameType';

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    const storedGameName = localStorage.getItem(this.gameNameKey);
    const storedGameType = localStorage.getItem(this.gameTypeKey);

    this.gameNameSubject.next(storedGameName);
    this.gameType = storedGameType || '';
  }

  setGameName(name: string): void {
    localStorage.setItem(this.gameNameKey, name);
    this.gameNameSubject.next(name);
  }

  getGameName(): string | null {
    return this.gameNameSubject.getValue();
  }

  setGameType(gameType: string): void {
    localStorage.setItem(this.gameTypeKey, gameType);
    this.gameType = gameType;
  }

  getGameType(): string {
    if (!this.gameType) {
      const storedGameType = localStorage.getItem(this.gameTypeKey);
      if (storedGameType) {
        this.gameType = storedGameType;
      }
    }
    return this.gameType;
  }

  clearGameData(): void {
    localStorage.removeItem(this.gameNameKey);
    localStorage.removeItem(this.gameTypeKey);
    this.gameType = '';
    this.gameNameSubject.next(null);
  }
}
