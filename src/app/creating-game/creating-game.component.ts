import {Component, HostListener} from '@angular/core';
import { CommonModule } from '@angular/common';
import {FormControl, ReactiveFormsModule} from '@angular/forms';
import {Router, RouterModule} from '@angular/router';
import {UserService} from "../services/user.service/user.service";
import {StorageService} from "../services/storage.service/storage.service";

@Component({
  selector: 'app-creating-game',
  templateUrl: './creating-game.component.html',
  styleUrls: ['./creating-game.component.css'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule
  ]
})
export class CreatingGameComponent {
  gameName="Create Game";
  name = new FormControl('');
  votingSystem = new FormControl("");
  gameList = ['Fibonacci (0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89)', 'Numbers 1-15 (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15)', 'Powers of 2 (0, 1, 2, 4, 8, 16, 32, 64)'];
  showDropdown = false;
  selectedGame: string = "";

  constructor(private router: Router, private userService: UserService, private storageService: StorageService) {}

  toggleDropdown(event: MouseEvent): void {
    event.stopPropagation(); // Prevent event bubbling to the document
    this.showDropdown = !this.showDropdown;
  }

  selectGame(game: string): void {
    this.selectedGame = game;
    this.showDropdown = false;
  }

  createGame(): void {
    const gameName = this.name.value || 'planning poker game';
    const gameType = this.selectedGame;


    this.userService.setGameName(gameName);
    this.userService.setGameType(gameType);
    this.storageService.clearStoredCards();
    this.storageService.clearDisplayName()
    this.router.navigate(['/main-game']);
  }


  @HostListener('document:click', ['$event'])
  onClick(event: MouseEvent): void {
    this.showDropdown = false;
  }
}
