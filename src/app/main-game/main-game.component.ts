import { Component, OnInit, OnChanges, SimpleChanges, Input, HostListener } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import * as XLSX from 'xlsx';

import { StorageService } from '../services/storage.service/storage.service';
import { InvitationService } from '../services/invitation.service';
import { InvitationModalComponent } from '../invitation-modal/invitation-modal.component';
import { SessionService } from '../services/session.service';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import {GameService} from "../services/game.service/game.service";

interface JiraTicket {
  Key: string;
  Summary: string;
  Status: string;
  Assignee: string;
  'Story point': number | string;
}

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
  countdownValue: number = 3;
  countdownInProgress: boolean = false;
  countdownFinished: boolean = false;
  average: number = 0;
  selectedCards: number[] = [];
  showModal: boolean = false;
  isSidebarOpen: boolean = false;
  specificData: JiraTicket[] = [];
  uploadedData: any[] = [];
  expectedColumns: string[] = ["Key", "Summary", "Status", "Assignee", "Story point"];
  displayNameEntered: boolean = false;
  displayName: string = '';
  register: boolean = true;
  overlay: boolean = true;
  isDropdownOpen: boolean = false;
  isModalVisible: boolean = false;
  isOpenInvitationModal = false;
  selectedTicket: JiraTicket | null = null;
  fileUploadError: string = '';
  private subscriptions: Subscription[] = [];
  public  participantVotes: {[key: string]: number} = {};
  public Object = Object;
  constructor(
    private gameService: GameService,
    private storageService: StorageService,
    private invitationService: InvitationService,
    private sessionService: SessionService,
    private route: ActivatedRoute,
    private router: Router
  ) {
    this.invitationService.getInvitationStatus().subscribe((status) => {
      this.showModal = status;
    });
  }

  ngOnInit(): void {
    this.sessionService.checkUrlForSession();
    this.gameType = this.gameService.getGameType() || this.getDefaultGameType();
    const storedDisplayName = this.storageService.getDisplayName();

    if (storedDisplayName) {
      this.displayNameEntered = true;
      this.register = false;
      this.overlay = false;
      this.displayName = storedDisplayName;
    }

    this.gameName = this.gameService.getGameName() || 'Planning Poker Game';

    this.gameService.gameName$.subscribe((gameName) => {
      this.gameName = gameName || 'Planning Poker Game';
    });

    if (this.displayName) {
      this.submitDisplayName();
    }

    this.initializeCardList();

    this.loadSavedTickets();
    const savedTicket = this.storageService.getSelectedTicket();
    if (savedTicket) {
      this.selectedTicket = savedTicket;
    }
    this.subscribeToSessionEvents();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedCard'] && !changes['selectedCard'].firstChange) {
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
    if (this.countdownInProgress) return;

    this.selectedCard = card;
    this.cardsPicked = true;

    this.storageService.storeLastClickedCard(card);
    this.sessionService.broadcastEvent('vote', {
      card: card,
      user: this.displayName
    });
  }

  startCountdown(): void {
    if (!this.selectedTicket) {
      alert('Please select a ticket to vote on first');
      return;
    }

    this.countdownStarted = true;
    this.countdownInProgress = true;
    this.countdownValue = 3;
    this.sessionService.broadcastEvent('reveal', {
      ticketKey: this.selectedTicket.Key
    });
    this.updateCountdown();
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
        this.calculateAverage();
      }
    }, 1000);
  }

  finishCountdown(): void {
    this.countdownStarted = false;
    this.countdownInProgress = false;
    this.countdownFinished = false;
    this.cardsPicked = false;
    this.selectedCard = 0;
    this.participantVotes = {};

    if (this.selectedTicket) {
      this.sessionService.broadcastEvent('reset_voting', {
        ticketKey: this.selectedTicket.Key
      });

      this.updateTicketEstimate(this.selectedTicket, this.average);
      this.saveTickets();
    } else {
      this.sessionService.broadcastEvent('reset_voting', {});
    }
  }

  calculateAverage(): void {
    const allVotes = [this.selectedCard, ...Object.values(this.participantVotes)];
    const filteredVotes = allVotes.filter(vote => vote > 0);

    const sum = filteredVotes.reduce((acc, card) => acc + card, 0);
    const average = filteredVotes.length > 0 ? sum / filteredVotes.length : 0;
    this.average = parseFloat(average.toFixed(1));

    if (this.selectedTicket) {
      this.updateTicketEstimate(this.selectedTicket, this.average);
    }
  }

  updateTicketEstimate(ticket: JiraTicket, estimate: number): void {
    ticket['Story point'] = estimate;

    const ticketIndex = this.specificData.findIndex(t => t.Key === ticket.Key);
    if (ticketIndex !== -1) {
      this.specificData[ticketIndex]['Story point'] = estimate;
    }
  }

  invitePlayer(): void {
    this.invitationService.triggerInvitation();
    this.isOpenInvitationModal = true;
  }

  toggleSidebar(): void {
    this.isSidebarOpen = !this.isSidebarOpen;
  }

  onFileChange(event: any): void {
    this.fileUploadError = '';
    const target: DataTransfer = <DataTransfer>event.target;

    if (target.files.length !== 1) {
      this.fileUploadError = 'Please select a single file';
      return;
    }

    const file: File = target.files[0];

    if (!this.isValidExcelFile(file)) {
      this.fileUploadError = 'Invalid file type. Please upload an Excel file (.xlsx, .xls)';
      return;
    }

    const reader: FileReader = new FileReader();

    reader.onload = (e: any) => {
      try {
        const binaryData: string = e.target.result;
        const workbook: XLSX.WorkBook = XLSX.read(binaryData, {
          type: 'binary',
          cellDates: true,
          cellStyles: true
        });

        if (workbook.SheetNames.length === 0) {
          this.fileUploadError = 'The Excel file contains no sheets';
          return;
        }

        const sheetName: string = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        this.uploadedData = XLSX.utils.sheet_to_json(sheet);

        if (this.uploadedData.length === 0) {
          this.fileUploadError = 'No data found in the Excel file';
          return;
        }

        this.processUploadedData();
        if (this.specificData.length > 0) {
          this.sessionService.broadcastEvent('update_issues', {
            issues: this.specificData
          });
        }
      } catch (error) {
        console.error('Error processing Excel file:', error);
        this.fileUploadError = 'Error processing Excel file. Please check the file format.';
      }
    };

    reader.onerror = () => {
      this.fileUploadError = 'Error reading file';
    };

    reader.readAsBinaryString(file);
  }

  private isValidExcelFile(file: File): boolean {
    const validTypes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/octet-stream'
    ];

    return validTypes.includes(file.type) ||
      file.name.endsWith('.xlsx') ||
      file.name.endsWith('.xls');
  }

  private processUploadedData(): void {
    const missingColumns = this.validateRequiredColumns(this.uploadedData);

    if (missingColumns.length > 0) {
      this.fileUploadError = `Missing required columns: ${missingColumns.join(', ')}`;
      return;
    }

    this.specificData = this.uploadedData.map((row: any) => {
      const ticket: JiraTicket = {
        Key: row.Key || '',
        Summary: row.Summary || '',
        Status: row.Status || 'To Do',
        Assignee: row.Assignee || '',
        'Story point': row['Story point'] || ''
      };
      return ticket;
    });

    this.specificData.sort((a, b) => a.Key.localeCompare(b.Key));

    this.saveTickets();

    if (window.innerWidth < 768) {
      setTimeout(() => this.isSidebarOpen = false, 1000);
    }
  }

  private validateRequiredColumns(data: any[]): string[] {
    if (data.length === 0) return [];

    const firstRow = data[0];
    const requiredColumns = ['Key', 'Summary']; // Only these two are truly required

    return requiredColumns.filter(col => !(col in firstRow));
  }

  private saveTickets(): void {
    this.storageService.storeTickets(this.specificData);
  }

  private loadSavedTickets(): void {
    const savedTickets = this.storageService.getStoredTickets();
    if (savedTickets && savedTickets.length > 0) {
      this.specificData = savedTickets;
    }
  }

  setSelectVotingTicket(ticket: JiraTicket): void {
    this.selectedTicket = ticket;

    this.cardsPicked = false;
    this.countdownFinished = false;
    this.selectedCard = 0;

    this.sessionService.broadcastEvent('select_ticket', {
      ticketKey: this.selectedTicket?.Key,
      ticketSummary: this.selectedTicket?.Summary
    });
    if (window.innerWidth < 768) {
      this.isSidebarOpen = false;
    }
  }

  getTicketStatusClass(status: string): string {
    if (!status) return 'status-todo';

    status = status.toLowerCase();
    if (status.includes('open') || status.includes('to do') || status.includes('todo')) {
      return 'status-todo';
    } else if (status.includes('progress') || status.includes('doing') || status.includes('in dev')) {
      return 'status-progress';
    } else if (status.includes('done') || status.includes('completed') || status.includes('closed')) {
      return 'status-done';
    }
    return 'status-todo';
  }

  exportEstimates(): void {
    if (this.specificData.length === 0) {
      alert('No data to export');
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(this.specificData);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Estimates');

    const filename = 'planning_poker_estimates_' + new Date().toISOString().slice(0, 10) + '.csv';
    XLSX.writeFile(workbook, filename);
  }

  closeModel(): void {
    this.isOpenInvitationModal = false;
  }

  logout(): void {
    this.storageService.clearDisplayName();
    this.router.navigate(['/create-game']);
  }

  private getDefaultGameType(): string {
    return 'Fibonacci (0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89)';
  }

  private initializeCardList(): void {
    if (this.gameType.includes('Fibonacci')) {
      this.cardList = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
    } else if (this.gameType.includes('Numbers 1-15')) {
      this.cardList = Array.from({ length: 15 }, (_, i) => i + 1);
    } else if (this.gameType.includes('Powers of 2')) {
      this.cardList = [0, 1, 2, 4, 8, 16, 32, 64];
    } else {
      this.cardList = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
    }
  }
  private subscribeToSessionEvents(): void {
    this.subscriptions.push(
      this.sessionService.ticketSelected$.subscribe(data => {
        if (data && data.ticket) {
          this.selectedTicket = data.ticket;
          this.cardsPicked = false;
          this.countdownFinished = false;
          this.selectedCard = 0;
        }
      })
    );
    this.subscriptions.push(
      this.sessionService.voteReceived$.subscribe(data => {
        if (data) {
          this.participantVotes[data.user] = data.card;
          console.log(`User ${data.user} voted: ${data.card}`);
        }
      })
    );
    this.subscriptions.push(
      this.sessionService.revealTriggered$.subscribe(triggered => {
        if (triggered && !this.countdownStarted) {
          this.startCountdown();
        }
      })
    );

    this.subscriptions.push(
      this.sessionService.issuesUpdated$.subscribe(issues => {
        if (issues && issues.length > 0) {
          this.specificData = issues;
        }
      })
    );

    this.subscriptions.push(
      this.sessionService.resetVoting$.subscribe(reset => {
        if (reset) {
          this.finishCountdown();
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

}
