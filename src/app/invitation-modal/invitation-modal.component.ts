import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GameService } from '../services/game.service/game.service';

@Component({
  selector: 'app-invitation-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div *ngIf="isVisible" class="modal-overlay">
      <div class="modal-container">
        <div class="modal-header">
          <h2>Invite Players</h2>
          <button class="close-button" (click)="hideModal()">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
              <path d="M18.3 5.71a.996.996 0 00-1.41 0L12 10.59 7.11 5.7A.996.996 0 105.7 7.11L10.59 12 5.7 16.89a.996.996 0 101.41 1.41L12 13.41l4.89 4.89a.996.996 0 101.41-1.41L13.41 12l4.89-4.89c.38-.38.38-1.02 0-1.4z"/>
            </svg>
          </button>
        </div>

        <div class="modal-content">
          <p class="invitation-instructions">
            Share this link with your team members to invite them to your planning poker session.
          </p>

          <div class="invitation-link">
            <input
              type="text"
              [value]="invitationUrl"
              class="invitation-input"
              readonly
              #invitationInput
              (click)="selectInvitationLink(invitationInput)"
            />

            <button class="copy-button" (click)="copyInvitationLink(invitationInput)">
              <span *ngIf="!copySuccess">Copy</span>
              <span *ngIf="copySuccess" class="success-message">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="currentColor"/>
                </svg>
                Copied
              </span>
            </button>
          </div>
        </div>

        <div class="modal-footer">
          <button class="close-button-text" (click)="hideModal()">Close</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      animation: fadeIn 0.2s ease-out;
    }

    .modal-container {
      background-color: #fff;
      border-radius: 12px;
      width: 90%;
      max-width: 500px;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
      animation: slideUp 0.3s ease-out;
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 24px;
      border-bottom: 1px solid #eaeaea;
    }

    .modal-header h2 {
      font-size: 20px;
      font-weight: 600;
      margin: 0;
    }

    .close-button {
      background: transparent;
      border: none;
      cursor: pointer;
      color: #666;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 4px;
      border-radius: 50%;
      transition: background-color 0.2s;
    }

    .close-button:hover {
      background-color: #f0f0f0;
    }

    .modal-content {
      padding: 24px;
    }

    .invitation-instructions {
      margin-bottom: 20px;
      color: #555;
    }

    .invitation-link {
      display: flex;
      margin-bottom: 8px;
    }

    .invitation-input {
      flex: 1;
      padding: 12px 16px;
      border: 1px solid #ddd;
      border-radius: 8px 0 0 8px;
      font-size: 14px;
      background-color: #f8f9fa;
    }

    .invitation-input:focus {
      outline: none;
      border-color: #409afa;
    }

    .copy-button {
      padding: 12px 24px;
      background-color: #409afa;
      color: white;
      font-weight: 500;
      border: none;
      border-radius: 0 8px 8px 0;
      cursor: pointer;
      transition: background-color 0.2s;
    }

    .copy-button:hover {
      background-color: #3080e8;
    }

    .success-message {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .modal-footer {
      padding: 16px 24px 24px;
      text-align: right;
    }

    .close-button-text {
      padding: 10px 20px;
      background-color: #f0f0f0;
      color: #333;
      border: none;
      border-radius: 8px;
      font-weight: 500;
      cursor: pointer;
      transition: background-color 0.2s;
    }

    .close-button-text:hover {
      background-color: #e0e0e0;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes slideUp {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }

    @media (max-width: 480px) {
      .modal-container {
        width: 95%;
      }

      .invitation-link {
        flex-direction: column;
      }

      .invitation-input {
        border-radius: 8px;
        margin-bottom: 12px;
      }

      .copy-button {
        border-radius: 8px;
        width: 100%;
      }
    }
  `]
})
export class InvitationModalComponent implements OnInit {
  @Input() isVisible: boolean = false;
  @Output() closeModal: EventEmitter<void> = new EventEmitter();
  invitationUrl: string = '';
  copySuccess: boolean = false;

  constructor(private gameService: GameService) {}

  ngOnInit(): void {
    this.generateInvitationLink();
  }

  hideModal(): void {
    this.closeModal.emit();
  }

  copyInvitationLink(inputElement: HTMLInputElement): void {
    inputElement.select();

    navigator.clipboard.writeText(this.invitationUrl)
      .then(() => {
        this.copySuccess = true;
        setTimeout(() => {
          this.copySuccess = false;
        }, 2000);
      })
      .catch(err => {
        console.error('Failed to copy text: ', err);
        this.fallbackCopyTextToClipboard(inputElement);
      });
  }

  selectInvitationLink(inputElement: HTMLInputElement): void {
    inputElement.select();
  }

  private fallbackCopyTextToClipboard(inputElement: HTMLInputElement): void {
    inputElement.select();

    try {
      const successful = document.execCommand('copy');
      this.copySuccess = successful;
      if (successful) {
        setTimeout(() => {
          this.copySuccess = false;
        }, 2000);
      }
    } catch (err) {
      console.error('Failed to copy with execCommand', err);
    }
  }

  private generateInvitationLink(): void {
    window.location.origin;
    const baseUrl = 'http://192.168.3.196:4200';
    const gameName = this.gameService.getGameName() || 'planning-poker-game';

    const gameId = this.generateUniqueId();

    this.invitationUrl = `${baseUrl}/join-game?game=${encodeURIComponent(gameName)}&id=${gameId}`;
  }

  private generateUniqueId(): string {
    return Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15);
  }
}
