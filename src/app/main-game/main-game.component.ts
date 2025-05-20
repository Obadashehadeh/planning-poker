import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import * as XLSX from 'xlsx';
import { Subscription } from 'rxjs';

import { StorageService } from '../services/storage.service/storage.service';
import { InvitationService } from '../services/invitation.service/invitation.service';
import { InvitationModalComponent } from '../invitation-modal/invitation-modal.component';
import { SessionService } from '../services/session.service/session.service';
import { GameService } from "../services/game.service/game.service";
import { SyncService } from "../services/sync/sync.service";
import { JiraTicket, ConnectionStatus } from '../../models';

@Component({
  selector: 'app-main-game',
  templateUrl: './main-game.component.html',
  styleUrls: ['./main-game.component.scss'],
  standalone: true,
  imports: [FormsModule, CommonModule, ReactiveFormsModule, InvitationModalComponent],
})
export class MainGameComponent implements OnInit, OnDestroy {
  selectedCard: number = 0;
  gameName: string | null = '';
  gameType: string = '';
  cardList: number[] = [];
  cardsPicked: boolean = false;
  countdownStarted: boolean = false;
  countdownValue: number = 3;
  countdownInProgress: boolean = false;
  countdownFinished: boolean = false;
  average: number = 0;
  isSidebarOpen: boolean = false;
  specificData: JiraTicket[] = [];
  displayNameEntered: boolean = false;
  displayName: string = '';
  overlay: boolean = true;
  isDropdownOpen: boolean = false;
  isOpenInvitationModal = false;
  selectedTicket: JiraTicket | null = null;
  fileUploadError: string = '';
  activeTab: string = 'unvoted';
  isHost: boolean = true;
  connectionStatus: ConnectionStatus = 'connected';
  private subscriptions: Subscription[] = [];
  public participantVotes: { [key: string]: number } = {};
  public Object = Object;

  constructor(
    private gameService: GameService,
    private storageService: StorageService,
    private invitationService: InvitationService,
    private sessionService: SessionService,
    private syncService: SyncService,
    private route: ActivatedRoute,
    private router: Router
  ) {
    this.invitationService.getInvitationStatus().subscribe((status) => {
      this.isOpenInvitationModal = status;
    });
  }

  ngOnInit(): void {
    this.initializeComponent();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.syncService.disconnect();
  }

  private async initializeComponent(): Promise<void> {
    try {
      await this.sessionService.checkUrlForSession();
      this.sessionService.verifySessionId();

      this.gameType = this.gameService.getGameType() || this.getDefaultGameType();
      this.initializeCardList();
      const sessionId = this.sessionService.getSessionId();
      this.isHost = this.sessionService.isSessionHost();

      const storedDisplayName = this.storageService.getDisplayName();
      if (storedDisplayName) {
        this.displayNameEntered = true;
        this.overlay = false;
        this.displayName = storedDisplayName;
      }

      this.gameName = this.gameService.getGameName() || 'Planning Poker Game';

      this.subscriptions.push(
        this.gameService.gameName$.subscribe((gameName) => {
          this.gameName = gameName || 'Planning Poker Game';
        })
      );

      this.loadSavedTickets();
      this.loadSelectedTicket();
      this.subscribeToSyncEvents();

      if (this.displayName) {
        this.submitDisplayName();
      }

      this.connectionStatus = 'connected';
    } catch (error) {
      this.connectionStatus = 'disconnected';
      setTimeout(() => {
        this.initializeComponent();
      }, 2000);
    }
  }

  private loadSelectedTicket(): void {
    const savedTicket = this.storageService.getSelectedTicket();
    if (savedTicket) {
      this.selectedTicket = savedTicket;
    }
  }

  submitDisplayName(): void {
    if (this.displayName.trim() !== '') {
      this.displayNameEntered = true;
      this.overlay = false;
      this.storageService.setDisplayName(this.displayName);

      const sessionId = this.sessionService.getSessionId() || 'default';
      this.syncService.connect(sessionId, this.displayName, this.isHost);

      const userData = {
        user: this.displayName,
        timestamp: new Date().getTime(),
        isHost: this.isHost
      };

      this.syncService.sendUserJoined(userData);

      if (this.isHost && this.specificData.length > 0) {
        setTimeout(() => {
          this.syncIssuesManually();
        }, 1000);
      } else if (!this.isHost) {
        setTimeout(() => {
          this.syncService.requestFullState();
        }, 1000);
      }
    }
  }

  toggleDropdown(event: MouseEvent): void {
    event.stopPropagation();
    this.isDropdownOpen = !this.isDropdownOpen;
  }

  @HostListener('document:click')
  onClick(): void {
    this.isDropdownOpen = false;
  }

  onCardClick(card: number): void {
    if (this.countdownInProgress) return;

    this.selectedCard = card;
    this.cardsPicked = true;
    this.storageService.storeLastClickedCard(card);

    this.syncService.sendVote({
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

    this.syncService.sendReveal();
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
      this.syncService.sendResetVoting();
      this.updateTicketEstimate(this.selectedTicket, this.average);
      this.saveTickets();
      this.syncIssuesManually();
    } else {
      this.syncService.sendResetVoting();
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
    const sessionId = this.sessionService.getSessionId();

    if (!sessionId) {
      alert('Unable to create invitation link: No session ID available. Please refresh the page and try again.');
      return;
    }

    this.invitationService.triggerInvitation();
    this.isOpenInvitationModal = true;
  }

  toggleSidebar(): void {
    this.isSidebarOpen = !this.isSidebarOpen;
  }

  setActiveTab(tab: string): void {
    this.activeTab = tab;
  }

  getUnvotedIssues(): JiraTicket[] {
    return this.specificData.filter(issue => !issue['Story point'] || issue['Story point'] === '');
  }

  getVotedIssues(): JiraTicket[] {
    return this.specificData.filter(issue => issue['Story point'] && issue['Story point'] !== '');
  }

  getFilteredIssues(): JiraTicket[] {
    return this.activeTab === 'voted' ? this.getVotedIssues() : this.getUnvotedIssues();
  }

  async onFileChange(event: any): Promise<void> {
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

    const fileButton = document.querySelector('.file-upload-btn') as HTMLElement;
    const originalText = fileButton?.textContent || 'Import from Excel';

    try {
      if (fileButton) {
        fileButton.textContent = 'Processing...';
      }

      const data = await this.readExcelFile(file);
      await this.processUploadedData(data);
      this.syncIssuesManually();

      if (fileButton) {
        fileButton.textContent = 'File Imported!';
        setTimeout(() => {
          fileButton.textContent = originalText;
        }, 3000);
      }

      event.target.value = '';
    } catch (error) {
      this.fileUploadError = 'Error processing Excel file. Please check the file format.';
      if (fileButton) {
        fileButton.textContent = originalText;
      }
    }
  }

  private readExcelFile(file: File): Promise<any[]> {
    return new Promise((resolve, reject) => {
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
            reject(new Error('The Excel file contains no sheets'));
            return;
          }

          const sheetName: string = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const data = XLSX.utils.sheet_to_json(sheet);

          if (data.length === 0) {
            reject(new Error('No data found in the Excel file'));
            return;
          }

          resolve(data);
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => {
        reject(new Error('Error reading file'));
      };

      reader.readAsBinaryString(file);
    });
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

  private async processUploadedData(uploadedData: any[]): Promise<void> {
    const missingColumns = this.validateRequiredColumns(uploadedData);

    if (missingColumns.length > 0) {
      this.fileUploadError = `Missing required columns: ${missingColumns.join(', ')}`;
      return;
    }

    this.specificData = uploadedData.map((row: any) => ({
      Key: row.Key || '',
      Summary: row.Summary || '',
      Status: row.Status || 'To Do',
      Assignee: row.Assignee || '',
      Description: row.Description || '',
      'Story point': row['Story point'] || ''
    }));

    this.specificData.sort((a, b) => a.Key.localeCompare(b.Key));
    this.saveTickets();

    if (window.innerWidth < 768) {
      setTimeout(() => this.isSidebarOpen = false, 1000);
    }
  }

  private validateRequiredColumns(data: any[]): string[] {
    if (data.length === 0) return [];

    const firstRow = data[0];
    const requiredColumns = ['Key', 'Summary'];

    return requiredColumns.filter(col => !(col in firstRow));
  }

  private saveTickets(): void {
    this.storageService.storeTickets(this.specificData);
  }

  private loadSavedTickets(): void {
    const savedTickets = this.storageService.getStoredTickets();
    if (savedTickets && savedTickets.length > 0) {
      this.specificData = [...savedTickets];
    }
  }

  setSelectVotingTicket(ticket: JiraTicket): void {
    this.selectedTicket = ticket;
    this.storageService.setSelectedTicket(ticket);

    this.cardsPicked = false;
    this.countdownFinished = false;
    this.selectedCard = 0;
    this.participantVotes = {};

    this.syncService.sendTicketSelection(ticket);

    if (window.innerWidth < 768) {
      this.isSidebarOpen = false;
    }
  }

  getTicketStatusClass(status: string): string {
    if (!status) return 'status-todo';

    const normalizedStatus = status.toLowerCase();
    if (normalizedStatus.includes('open') || normalizedStatus.includes('to do') || normalizedStatus.includes('todo')) {
      return 'status-todo';
    } else if (normalizedStatus.includes('progress') || normalizedStatus.includes('doing') || normalizedStatus.includes('in dev')) {
      return 'status-progress';
    } else if (normalizedStatus.includes('done') || normalizedStatus.includes('completed') || normalizedStatus.includes('closed')) {
      return 'status-done';
    }
    return 'status-todo';
  }

  exportEstimates(): void {
    if (this.specificData.length === 0) {
      alert('No data to export');
      return;
    }

    try {
      const worksheet = XLSX.utils.json_to_sheet(this.specificData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Estimates');

      const filename = `planning_poker_estimates_${new Date().toISOString().slice(0, 10)}.csv`;
      XLSX.writeFile(workbook, filename);
    } catch (error) {
      alert('Error exporting file. Please try again.');
    }
  }

  closeModel(): void {
    this.isOpenInvitationModal = false;
  }

  logout(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.storageService.clearDisplayName();
    this.sessionService.resetSession();
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

  private subscribeToSyncEvents(): void {
    this.subscriptions.push(
      this.syncService.issuesUpdated$.subscribe(issues => {
        if (issues && Array.isArray(issues) && issues.length > 0) {
          this.specificData = [...issues];
          this.storageService.storeTickets(this.specificData);
          this.connectionStatus = 'connected';

          if (!this.selectedTicket && issues.length > 0) {
            const savedTicket = this.storageService.getSelectedTicket();
            if (savedTicket) {
              const foundTicket = issues.find(issue => issue.Key === savedTicket.Key);
              if (foundTicket) {
                this.selectedTicket = foundTicket;
              }
            }
          }
        }
      }),

      this.syncService.ticketSelected$.subscribe(data => {
        if (data && data.ticket) {
          this.selectedTicket = data.ticket;
          this.storageService.setSelectedTicket(data.ticket);
          this.cardsPicked = false;
          this.countdownFinished = false;
          this.selectedCard = 0;
          this.participantVotes = {};
        }
      }),

      this.syncService.voteReceived$.subscribe(data => {
        if (data && data.user && data.card !== undefined) {
          this.participantVotes[data.user] = data.card;
        }
      }),

      this.syncService.revealTriggered$.subscribe(triggered => {
        if (triggered && !this.countdownStarted) {
          this.startCountdown();
        }
      }),

      this.syncService.resetVoting$.subscribe(reset => {
        if (reset) {
          this.countdownStarted = false;
          this.countdownInProgress = false;
          this.countdownFinished = false;
          this.cardsPicked = false;
          this.selectedCard = 0;
          this.participantVotes = {};
        }
      }),

      this.syncService.userJoined$.subscribe(user => {
        if (user && this.isHost && this.specificData.length > 0) {
          setTimeout(() => this.syncIssuesManually(), 500);
        }
      }),

      this.syncService.connectionStatus$.subscribe(status => {
        this.connectionStatus = status === 'connecting' ? 'syncing' : status;

        if (status === 'connected' && this.isHost && this.specificData.length > 0) {
          setTimeout(() => this.syncIssuesManually(), 1000);
        }
      })
    );
  }

  syncIssuesManually(): void {
    this.connectionStatus = 'syncing';

    if (this.isHost && this.specificData.length > 0) {
      this.syncService.sendIssuesUpdate(this.specificData);
      this.syncService.sendFullState();
    } else {
      this.syncService.requestFullState();
    }

    setTimeout(() => {
      this.connectionStatus = 'connected';
    }, 1000);
  }

  getConnectionStatusClass(): string {
    switch (this.connectionStatus) {
      case 'connected': return 'status-connected';
      case 'syncing': return 'status-syncing';
      case 'disconnected': return 'status-disconnected';
      default: return '';
    }
  }

  retryConnection(): void {
    this.connectionStatus = 'syncing';

    if (this.displayNameEntered && this.displayName) {
      const sessionId = this.sessionService.getSessionId() || 'default';
      this.syncService.connect(sessionId, this.displayName, this.isHost);
    }

    setTimeout(() => {
      this.syncIssuesManually();
    }, 1000);
  }
}
