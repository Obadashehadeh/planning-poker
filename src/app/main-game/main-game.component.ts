import { Component, OnInit, OnChanges, SimpleChanges, Input } from '@angular/core';
import { UserService } from '../user.service'; 
import { StorageService } from '../storage.service';
import { HostListener } from '@angular/core';


@Component({
  selector: 'app-main-game',
  templateUrl: './main-game.component.html',
  styleUrls: ['./main-game.component.css']
})
export class MainGameComponent implements OnInit, OnChanges{
  gameName: string | null = "";
  gameType: string = ''; 
  cardList: number[] = [];
  @Input() selectedCard: number = 0;
  lastClickedCard: number | null = null;
  cardsPicked: boolean = false;
  countdownStarted: boolean = false;
  countdownValue: number = 2;
  countdownInProgress: boolean = false;
  countdownFinished: boolean = false;
  average: number =0;
  selectedCards: number[] = [];

  constructor(private userService: UserService, private storageService: StorageService) {
   
  }

  ngOnInit(): void {
    this.userService.gameName$.subscribe(gameName => {
      this.gameName = gameName;
    });
    this.gameType = this.userService.getGameType();
    const storedDisplayName = this.storageService.getDisplayName();
    if (storedDisplayName) {
      this.displayNameEntered = true;
      this.displayName = storedDisplayName;
      this.register = false;
      this.overlay = false;
    }

    if (this.gameType.includes('Fibonacci')) {
      this.cardList = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
    } else if (this.gameType.includes('Numbers 1-15')) {
      this.cardList = Array.from({ length: 15 }, (_, i) => i + 1);
    } else if (this.gameType.includes('Powers of 2')) {
      this.cardList = [0, 1, 2, 4, 8, 16, 32, 64];
    }
  }



  displayNameEntered = false;
  displayName: string = '';
  register = true;
  overlay = true;
  submitDisplayName(): void {
    if (this.displayName.trim() !== '') {
      this.displayNameEntered = true;
      this.register = false;
      this.overlay = false;
      // Store display name in the storage service
      this.storageService.setDisplayName(this.displayName);
    }
  }
  isDropdownOpen = false;
  toggleDropdown(event: MouseEvent): void {
    event.stopPropagation(); 
    this.isDropdownOpen = !this. isDropdownOpen;
  }
  @HostListener('document:click', ['$event'])
  onClick(event: MouseEvent): void {
    this.isDropdownOpen = false; 
  }
  
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedCard']) {
      this.storageService.storeLastClickedCard(this.selectedCard);
    }

  }
  
  
  
  onCardClick(card: number): void {
    this.selectedCard = card;
    this.cardsPicked = true;
  }

  startCountdown(): void {
    this.countdownStarted = true;
    this.countdownInProgress = true;
    this.updateCountdown();
    this.storageService.storeLastClickedCard(this.selectedCard);
    this.calculateAverage();

  }
  
  updateCountdown(): void {
    setTimeout(() => {
      if (this.countdownValue > 0) {
        this.countdownValue--;
        this.updateCountdown();
      } else {
        // Countdown finished
        this.countdownStarted = false;
        this.countdownInProgress = false;
        this.countdownFinished = true;
        this.countdownValue = 0; 
      }
    }, 800);
  }

  finsihCountdown(): void{
    this.countdownStarted = false;
    this.countdownInProgress = false;
    this.countdownFinished = true;
    location.reload();
  }

  selectedCardsKey = 'selectedCards';

  calculateAverage(): void {
    const selectedCards: number[] = this.storageService.getStoredCards();
    const sum = selectedCards.reduce((acc, card) => acc + card, 0);
    const average = selectedCards.length > 0 ? sum / selectedCards.length : 0;
    this.average = parseFloat(average.toFixed(2));
}


}
