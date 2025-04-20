import {Component, Input, Output, EventEmitter, ViewChild, AfterViewInit} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-invitation-modal',
  standalone: true,
  templateUrl: './invitation-modal.component.html',
  styleUrls: ['./invitation-modal.component.css'],
  imports: [CommonModule, FormsModule],
})
export class InvitationModalComponent {
  @Input() isVisible: boolean = false;
  @Output() closeModal: EventEmitter<void> = new EventEmitter();
  invitationUrl: string = 'https://www.google.com';
  hideModal(): void {
    this.closeModal.emit();
  }

  copyInvitationLink(): void {
    const textArea = document.createElement('textarea');
    textArea.value = this.invitationUrl;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    this.hideModal();
  }
}
