import { Component, OnInit, OnChanges, SimpleChanges, Input, HostListener, OnDestroy } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import * as XLSX from 'xlsx';
import { LocalStorageSyncService } from '../services/storage.service/localstorage-sync.service';
import { StorageService } from '../services/storage.service/storage.service';
import { InvitationService } from '../services/invitation.service/invitation.service';
import { InvitationModalComponent } from '../invitation-modal/invitation-modal.component';
import { SessionService } from '../services/session.service/session.service';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { GameService } from "../services/game.service/game.service";

interface JiraTicket {
  Key: string;
  Summary: string;
  Status: string;
  Assignee: string;
  Description: string;
  'Story point': number | string;
}

@Component({
  selector: 'app-main-game',
  templateUrl: './main-game.component.html',
  styleUrls: ['./main-game.component.scss'],
  standalone: true,
  imports: [FormsModule, CommonModule, ReactiveFormsModule, InvitationModalComponent],
})
export class MainGameComponent implements OnInit, OnChanges, OnDestroy {
  @Input() selectedCard: number = 0;
  gameName: string | null = '';
  gameType: string = '';
  cardList: number[] = [];
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
  expectedColumns: string[] = ["Key", "Summary", "Status", "Assignee", "Story point","Description"];
  displayNameEntered: boolean = false;
  displayName: string = '';
  register: boolean = true;
  overlay: boolean = true;
  isDropdownOpen: boolean = false;
  isModalVisible: boolean = false;
  isOpenInvitationModal = false;
  selectedTicket: JiraTicket | null = null;
  fileUploadError: string = '';
  activeTab: string = 'unvoted';
  isHost: boolean = true;
  syncInProgress: boolean = false;
  connectionStatus: 'connected' | 'disconnected' | 'syncing' = 'connected';
  private subscriptions: Subscription[] = [];
  private syncInterval: any;
  private initialSyncCompleted: boolean = false;
  public participantVotes: { [key: string]: number } = {};
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
    this.initializeComponent();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedCard'] && !changes['selectedCard'].firstChange) {
      this.storageService.storeLastClickedCard(this.selectedCard);
    }
  }

  ngOnDestroy(): void {
    this.cleanup();
  }

  private async initializeComponent(): Promise<void> {
    try {
      await this.sessionService.checkUrlForSession();

      this.gameType = this.gameService.getGameType() || this.getDefaultGameType();
      this.initializeCardList();

      const storedDisplayName = this.storageService.getDisplayName();
      if (storedDisplayName) {
        this.displayNameEntered = true;
        this.register = false;
        this.overlay = false;
        this.displayName = storedDisplayName;
      }

      this.gameName = this.gameService.getGameName() || 'Planning Poker Game';

      this.subscriptions.push(
        this.gameService.gameName$.subscribe((gameName) => {
          this.gameName = gameName || 'Planning Poker Game';
        })
      );

      this.isHost = this.sessionService.isSessionHost();

      if (this.isHost) {
        this.loadSavedTickets();
        this.loadSelectedTicket();
      } else {
        this.loadSavedTickets();
        this.loadSelectedTicket();

        if (this.specificData.length === 0) {
          await this.waitForInitialSync();
        }
      }

      this.subscribeToSessionEvents();

      if (this.displayName) {
        this.submitDisplayName();
      }

      this.connectionStatus = 'connected';
    } catch (error: unknown) {
      this.connectionStatus = 'disconnected';
      this.retryInitialization();
    }
  }
  private async waitForInitialSync(): Promise<void> {
    return new Promise((resolve) => {
      const maxWaitTime = 15000;
      const checkInterval = 1000;
      let elapsedTime = 0;

      const interval = setInterval(() => {
        const currentTickets = this.storageService.getStoredTickets();
        elapsedTime += checkInterval;

        if (currentTickets.length > 0) {
          this.specificData = [...currentTickets];
          clearInterval(interval);
          resolve();
        } else if (elapsedTime >= maxWaitTime) {
          clearInterval(interval);
          resolve();
        }
      }, checkInterval);
    });
  }

  private retryInitialization(): void {
    setTimeout(() => {
      this.initializeComponent();
    }, 2000);
  }

  private startPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    this.syncInterval = setInterval(() => {
      const currentIssues = this.storageService.getStoredTickets();
      if (!this.initialSyncCompleted || currentIssues.length === 0) {
        this.sessionService.forceSyncAllClients();
      }
    }, 2000);
  }

  private requestInitialSync(): void {
    const attempts = [100, 500, 1000, 2000, 3000, 5000, 8000, 12000, 15000, 20000];

    attempts.forEach((delay, index) => {
      setTimeout(() => {
        if (!this.initialSyncCompleted || this.storageService.getStoredTickets().length === 0) {
          this.sessionService.forceSyncAllClients();
        }
      }, delay);
    });
  }

  private loadSelectedTicket(): void {
    const savedTicket = this.storageService.getSelectedTicket();
    if (savedTicket) {
      this.selectedTicket = savedTicket;
    }
  }

  private cleanup(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
  }

  submitDisplayName(): void {
    if (this.displayName.trim() !== '') {
      this.displayNameEntered = true;
      this.register = false;
      this.overlay = false;
      this.storageService.setDisplayName(this.displayName);
      this.sessionService.broadcastEvent('user_joined', {
        user: this.displayName,
        timestamp: new Date().getTime(),
        needsSync: !this.isHost,
        clientId: this.generateClientId(),
        isHost: this.isHost
      });

      if (!this.isHost) {
        setTimeout(() => {
          this.sessionService.forceSyncAllClients();
        }, 500);

        setTimeout(() => {
          this.sessionService.forceSyncAllClients();
        }, 2000);

        setTimeout(() => {
          this.sessionService.forceSyncAllClients();
        }, 5000);

        setTimeout(() => {
          const currentTickets = this.storageService.getStoredTickets();
          if (currentTickets.length > 0) {
            this.specificData = [...currentTickets];
          }
        }, 3000);
      }
    }
  }

  private generateClientId(): string {
    let clientId = localStorage.getItem('clientId');
    if (!clientId) {
      clientId = Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
      localStorage.setItem('clientId', clientId);
    }
    return clientId;
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
      user: this.displayName,
      timestamp: new Date().getTime()
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
      ticketKey: this.selectedTicket.Key,
      timestamp: new Date().getTime()
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
        ticketKey: this.selectedTicket.Key,
        timestamp: new Date().getTime()
      });

      this.updateTicketEstimate(this.selectedTicket, this.average);
      this.saveTickets();
      this.broadcastUpdatedIssues();
    } else {
      this.sessionService.broadcastEvent('reset_voting', {
        timestamp: new Date().getTime()
      });
    }
  }

  private broadcastUpdatedIssues(): void {
    if (this.specificData.length > 0) {
      const timestamp = new Date().getTime();
      const issuesClone = this.specificData.map(issue => ({ ...issue }));
      this.sessionService.broadcastEvent('update_issues', {
        issues: issuesClone,
        timestamp: timestamp,
        forceUpdate: true,
        source: 'broadcast_updated'
      });

      this.sessionService.broadcastEvent('full_state', {
        gameName: this.gameService.getGameName(),
        gameType: this.gameService.getGameType(),
        issues: issuesClone,
        selectedTicket: this.selectedTicket,
        timestamp: timestamp,
        forceUpdate: true,
        source: 'broadcast_updated_full'
      });

      setTimeout(() => {
        this.sessionService.broadcastEvent('update_issues', {
          issues: issuesClone,
          timestamp: timestamp,
          forceUpdate: true,
          source: 'broadcast_updated_retry1'
        });
      }, 500);

      setTimeout(() => {
        this.sessionService.broadcastEvent('full_state', {
          gameName: this.gameService.getGameName(),
          gameType: this.gameService.getGameType(),
          issues: issuesClone,
          selectedTicket: this.selectedTicket,
          timestamp: timestamp,
          forceUpdate: true,
          source: 'broadcast_updated_retry2'
        });
      }, 1500);

      this.sessionService.forceSyncAllClients();
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

      if (fileButton) {
        fileButton.textContent = 'File Imported!';
        setTimeout(() => {
          fileButton.textContent = originalText;
        }, 3000);
      }

      event.target.value = '';
    } catch (error: unknown) {
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
        } catch (error: unknown) {
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
    await this.broadcastIssuesWithRetry();

    if (window.innerWidth < 768) {
      setTimeout(() => this.isSidebarOpen = false, 1000);
    }
  }

  private async broadcastIssuesWithRetry(retryCount: number = 0): Promise<void> {
    const maxRetries = 15;
    const baseDelay = 300;

    if (this.specificData.length > 0) {
      const timestamp = new Date().getTime();
      const issuesClone = this.specificData.map(issue => ({ ...issue }));
      this.sessionService.broadcastEvent('update_issues', {
        issues: issuesClone,
        timestamp: timestamp,
        forceUpdate: true,
        source: 'file_upload',
        retryCount: retryCount
      });

      this.sessionService.broadcastEvent('full_state', {
        gameName: this.gameService.getGameName(),
        gameType: this.gameService.getGameType(),
        issues: issuesClone,
        selectedTicket: this.selectedTicket,
        timestamp: timestamp,
        forceUpdate: true,
        source: 'file_upload_full_state'
      });

      this.sessionService.forceSyncAllClients();

      setTimeout(() => {
        this.sessionService.broadcastEvent('update_issues', {
          issues: issuesClone,
          timestamp: timestamp,
          forceUpdate: true,
          source: 'file_upload_delayed',
          retryCount: retryCount
        });
      }, 1000);

      setTimeout(() => {
        this.sessionService.forceSyncAllClients();
      }, 2000);

      if (retryCount < maxRetries) {
        setTimeout(() => {
          this.broadcastIssuesWithRetry(retryCount + 1);
        }, baseDelay * (retryCount + 1));
      }
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

    this.sessionService.broadcastEvent('select_ticket', {
      ticket: this.selectedTicket,
      ticketKey: this.selectedTicket?.Key,
      ticketSummary: this.selectedTicket?.Summary,
      timestamp: new Date().getTime()
    });

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
    } catch (error: unknown) {
      alert('Error exporting file. Please try again.');
    }
  }

  closeModel(): void {
    this.isOpenInvitationModal = false;
  }

  logout(): void {
    this.cleanup();
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

  private subscribeToSessionEvents(): void {
    this.subscriptions.push(
      this.sessionService.issuesUpdated$.subscribe(issues => {
        if (issues && Array.isArray(issues) && issues.length > 0) {
          const currentCount = this.specificData.length;
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
      })
    );
    this.subscriptions.push(
      this.sessionService.ticketSelected$.subscribe(data => {
        if (data && data.ticket) {
          this.selectedTicket = data.ticket;
          this.cardsPicked = false;
          this.countdownFinished = false;
          this.selectedCard = 0;
          this.participantVotes = {};
        }
      })
    );

    this.subscriptions.push(
      this.sessionService.voteReceived$.subscribe(data => {
        if (data && data.user && data.card !== undefined) {
          this.participantVotes[data.user] = data.card;
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
      this.sessionService.resetVoting$.subscribe(reset => {
        if (reset) {
          this.countdownStarted = false;
          this.countdownInProgress = false;
          this.countdownFinished = false;
          this.cardsPicked = false;
          this.selectedCard = 0;
          this.participantVotes = {};
        }
      })
    );

    this.subscriptions.push(
      this.sessionService.userJoined$.subscribe(user => {
        if (user && this.isHost && this.specificData.length > 0) {
          setTimeout(() => this.broadcastUpdatedIssues(), 100);
          setTimeout(() => this.broadcastUpdatedIssues(), 500);
          setTimeout(() => this.broadcastUpdatedIssues(), 1000);
          setTimeout(() => this.broadcastUpdatedIssues(), 2000);
          setTimeout(() => this.broadcastUpdatedIssues(), 5000);
        }
      })
    );
  }

  async syncIssuesManually(): Promise<void> {
    if (this.syncInProgress) return;

    this.syncInProgress = true;
    const button = document.querySelector('.sync-btn');
    const buttonText = button?.querySelector('span') || button;
    const originalText = buttonText?.textContent || 'Sync Issues';

    try {
      if (buttonText) {
        buttonText.textContent = 'Syncing...';
      }

      this.connectionStatus = 'syncing';

      if (this.isHost && this.specificData.length > 0) {
        await this.broadcastIssuesWithRetry();
      } else {
        this.sessionService.broadcastEvent('request_state', {
          timestamp: new Date().getTime(),
          needsIssues: true,
          manualSync: true,
          clientId: this.generateClientId()
        });
        this.sessionService.broadcastEvent('client_joined', {
          clientId: this.generateClientId(),
          timestamp: new Date().getTime(),
          needsFullSync: true,
          manualRequest: true
        });

        this.sessionService.forceSyncAllClients();
        await new Promise(resolve => {
          let attempts = 0;
          const checkInterval = setInterval(() => {
            const currentTickets = this.storageService.getStoredTickets();
            attempts++;

            if (currentTickets.length > 0 || attempts >= 10) {
              clearInterval(checkInterval);
              if (currentTickets.length > 0) {
                this.specificData = [...currentTickets];
              }
              resolve(true);
            }
          }, 500);
        });
      }

      await new Promise(resolve => setTimeout(resolve, 1000));

      this.connectionStatus = 'connected';

      if (buttonText) {
        buttonText.textContent = 'Synced!';
        setTimeout(() => {
          buttonText.textContent = originalText;
        }, 3000);
      }
    } catch (error: unknown) {
      this.connectionStatus = 'disconnected';
      if (buttonText) {
        buttonText.textContent = 'Sync Failed';
        setTimeout(() => {
          buttonText.textContent = originalText;
        }, 3000);
      }
    } finally {
      this.syncInProgress = false;
    }
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
    this.initializeComponent();
  }
}
