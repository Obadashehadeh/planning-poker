import { Component, Input, Output, EventEmitter, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { environment } from '../../environments/environments';
import { GameService } from "../services/game.service/game.service";
import { SessionService } from "../services/session.service/session.service";

@Component({
  selector: 'app-invitation-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './invitation-modal.component.html',
  styleUrls: ['./invitation-modal.component.scss']
})
export class InvitationModalComponent implements OnInit {
  @Input() isVisible: boolean = false;
  @Output() closeModal: EventEmitter<void> = new EventEmitter();

  @ViewChild('invitationInput') invitationInput!: ElementRef;

  invitationUrl: string = '';
  copySuccess: boolean = false;

  constructor(
    private gameService: GameService,
    private sessionService: SessionService
  ) {}

  ngOnInit(): void {
    this.generateInvitationLink();
  }

  hideModal(): void {
    this.closeModal.emit();
  }

  copyInvitationLink(): void {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(this.invitationUrl)
        .then(() => {
          this.handleCopySuccess();
        })
        .catch(() => {
          this.fallbackCopyTextToClipboard();
        });
    } else {
      this.fallbackCopyTextToClipboard();
    }
  }

  private fallbackCopyTextToClipboard(): void {
    const inputElement = this.invitationInput.nativeElement as HTMLInputElement;
    inputElement.select();
    inputElement.setSelectionRange(0, 99999);

    try {
      document.execCommand('copy');
      this.handleCopySuccess();
    } catch (err) {
      const textArea = document.createElement('textarea');
      textArea.value = this.invitationUrl;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();

      try {
        document.execCommand('copy');
        this.handleCopySuccess();
      } catch (err) {
        alert('Failed to copy the invitation link. Please copy it manually.');
      }

      document.body.removeChild(textArea);
    }
  }

  private handleCopySuccess(): void {
    this.copySuccess = true;
    setTimeout(() => {
      this.copySuccess = false;
    }, 2000);
  }

  selectInvitationLink(): void {
    const inputElement = this.invitationInput.nativeElement as HTMLInputElement;
    inputElement.select();
    inputElement.setSelectionRange(0, 99999);
  }

  private generateInvitationLink(): void {
    const baseUrl = environment.baseUrl;
    const gameName = this.gameService.getGameName() || 'planning-poker-game';
    const gameType = this.gameService.getGameType();
    const sessionId = this.sessionService.getSessionId();

    if (!sessionId) {
      this.invitationUrl = 'Error: No session ID available. Please try again.';
      return;
    }

    this.invitationUrl = `${baseUrl}/main-game?game=${encodeURIComponent(gameName)}&type=${encodeURIComponent(gameType)}&session=${encodeURIComponent(sessionId)}`;
  }
}
