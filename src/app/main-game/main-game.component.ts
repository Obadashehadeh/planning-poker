import { Component, OnInit, OnChanges, SimpleChanges, Input, HostListener } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import * as XLSX from 'xlsx';

import { GameService } from '../services/game.service/game.service';
import { StorageService } from '../services/storage.service/storage.service';
import { InvitationService } from '../services/invitation.service';
import { InvitationModalComponent } from '../invitation-modal/invitation-modal.component';

@Component({
  selector: 'app-main-game',
  templateUrl: './main-game.component.html',
  styleUrls: ['./main-game.component.css'],
  standalone: true,
  imports: [FormsModule, CommonModule, ReactiveFormsModule, InvitationModalComponent],
})
export class MainGameComponent implements OnInit, OnChanges {
  @Input() selectedCard: number = 0;
  gameName: string | null = '';
  gameType: string = '';
  cardList: number[] = [];
  lastClickedCard: number | null = null;
  cardsPicked: boolean = false;
  countdownStarted: boolean = false;
  countdownValue: number = 2;
  countdownInProgress: boolean = false;
  countdownFinished: boolean = false;
  average: number = 0;
  selectedCards: number[] = [];
  showModal: boolean = false;
  isSidebarOpen: boolean = false;
  specificData: any[] = [];
  uploadedData: any[] = [];
  expectedColumns: string[] = ["Key","Summary","Status","Assignee","Story point estimate"];
  displayNameEntered: boolean = false;
  displayName: string = '';
  register: boolean = true;
  overlay: boolean = true;
  isDropdownOpen: boolean = false;
  isModalVisible: boolean = false;
  isOpenInvitationModal = false;
  selectedTicket: any = null;
  constructor(
    private gameService: GameService,
    private storageService: StorageService,
    private invitationService: InvitationService,
    private router: Router
  ) {
    this.invitationService.getInvitationStatus().subscribe((status) => {
      this.showModal = status;
    });
  }

  ngOnInit(): void {


    this.gameType = this.gameService.getGameType();
    const storedDisplayName = this.storageService.getDisplayName();
    if (storedDisplayName) {
      this.displayNameEntered = true;
      this.register = false;
      this.overlay = false;
      this.displayName = storedDisplayName;
    }
    this.gameService.gameName$.subscribe((gameName) => {
      this.gameName = gameName;
    });
    this.initializeCardList();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedCard']) {
      this.storageService.storeLastClickedCard(this.selectedCard);
    }
  }

  submitDisplayName(): void {
    if (this.displayName.trim() !== '') {
      this.displayNameEntered = true;
      this.register = false;
      this.overlay = false;
      this.storageService.setDisplayName(this.displayName);
    }
  }

  toggleDropdown(event: MouseEvent): void {
    event.stopPropagation();
    this.isDropdownOpen = !this.isDropdownOpen;
  }

  @HostListener('document:click', ['$event'])
  onClick(): void {
    this.isDropdownOpen = false;
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
        this.countdownStarted = false;
        this.countdownInProgress = false;
        this.countdownFinished = true;
        this.countdownValue = 0;
      }
    }, 800);
  }

  finishCountdown(): void {
    this.countdownStarted = false;
    this.countdownInProgress = false;
    this.countdownFinished = true;
    location.reload();
  }

  calculateAverage(): void {
    const selectedCards: number[] = this.storageService.getStoredCards();
    const sum = selectedCards.reduce((acc, card) => acc + card, 0);
    const average = selectedCards.length > 0 ? sum / selectedCards.length : 0;
    this.average = parseFloat(average.toFixed(2));
    this.setStoryPoint(this.average);
  }

  invitePlayer(): void {
    this.invitationService.triggerInvitation();
    this.isOpenInvitationModal = true;
  }

  toggleSidebar(): void {
    this.isSidebarOpen = !this.isSidebarOpen;
  }

  onFileChange(event: any): void {
    const target: DataTransfer = <DataTransfer>event.target;
    if (target.files.length !== 1) {
      console.error('Cannot upload multiple files at once.');
      return;
    }

    const file: File = target.files[0];
    const reader: FileReader = new FileReader();

    reader.onload = (e: any) => {
      const binaryData: string = e.target.result;
      const workbook: XLSX.WorkBook = XLSX.read(binaryData, { type: 'binary' });
      const sheetName: string = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      this.uploadedData = XLSX.utils.sheet_to_json(sheet);
      this.specificData = this.uploadedData.map((row: any) => {
        const filteredRow: any = {};
        this.expectedColumns.forEach(col => {
          filteredRow[col] = row[col] ?? '';
        });
        return filteredRow;
      });
    };
    reader.readAsBinaryString(file);
  }
  private initializeCardList(): void {
    if (this.gameType.includes('Fibonacci')) {
      this.cardList = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
    } else if (this.gameType.includes('Numbers 1-15')) {
      this.cardList = Array.from({ length: 15 }, (_, i) => i + 1);
    } else if (this.gameType.includes('Powers of 2')) {
      this.cardList = [0, 1, 2, 4, 8, 16, 32, 64];
    }
  }

  protected readonly Object = Object;
  closeModel() {
    this.isOpenInvitationModal = false;
  }
  logout(): void {
    this.storageService.clearStoredData();
    sessionStorage.clear();
    this.router.navigate(['/']);
  }
  setSelectVotingTicket(row: any) {
    this.selectedTicket = row;
  }
  setStoryPoint(average:number) {
    this.selectedTicket['Story point estimate'] = average;
  }
}
