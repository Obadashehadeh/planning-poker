import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class InvitationService {
  private invitationStatus$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);

  getInvitationStatus(): Observable<boolean> {
    return this.invitationStatus$.asObservable();
  }

  triggerInvitation(): void {
    this.invitationStatus$.next(true);
  }

  resetInvitationStatus(): void {
    this.invitationStatus$.next(false);
  }
}
