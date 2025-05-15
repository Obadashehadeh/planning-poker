import { Component, Input, Output, EventEmitter, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SessionService } from '../services/session.service';
import { environment } from '../../environments/environments';
import {GameService} from "../services/game.service/game.service";

@Component({
  selector: 'app-invitation-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './invitation-modal.component.html',
  styleUrls: ['./invitation-modal.component.css']
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
    const inputElement = this.invitationInput.nativeElement as HTMLInputElement;

    inputElement.select();
    inputElement.setSelectionRange(0, 99999);

    navigator.clipboard.writeText(this.invitationUrl)
      .then(() => {
        this.handleCopySuccess();
      })
      .catch(() => {
        try {
          document.execCommand('copy');
          this.handleCopySuccess();
        } catch (err) {
          console.error('Failed to copy: ', err);
        }
      });
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
    inputElement.setSelectionRange(0, 99999); // For mobile devices
  }

  private generateInvitationLink(): void {
    const baseUrl = environment.baseUrl;
    const gameName = this.gameService.getGameName() || 'planning-poker-game';
    const gameType = this.gameService.getGameType();
    const sessionId = this.sessionService.getSessionId();

    this.invitationUrl = `${baseUrl}/main-game?game=${encodeURIComponent(gameName)}&type=${encodeURIComponent(gameType)}&session=${sessionId}`;
  }
}
