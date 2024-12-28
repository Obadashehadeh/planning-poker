import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private gameType: string = '';
  private gameNameSubject: BehaviorSubject<string | null> = new BehaviorSubject<string | null>(null);
  public gameName$: Observable<string | null> = this.gameNameSubject.asObservable();
  //use local storage
  key: string = 'gameName';
  gameTypeKey: string = 'gameType';
  myGame: string | null = "";
   
  constructor() {
    this.myGame = localStorage.getItem(this.key);
    this.gameNameSubject.next(this.myGame);
    this.gameType = localStorage.getItem(this.gameTypeKey) || '';
  }

  setGameName(name: string): void {
    localStorage.setItem(this.key, name);
  }

  getGameName(): string | null {
    return this.myGame;
  }


  setGameType(gameType: string): void {
    localStorage.setItem(this.gameTypeKey, gameType); 
    this.gameType = gameType; 
  }

  getGameType(): string {
    return this.gameType;
  }

  
}
