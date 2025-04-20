import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class InvitationService {
  private invitationStatus$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);

  /**
   * Gets the current invitation status as an observable.
   */
  getInvitationStatus(): Observable<boolean> {
    return this.invitationStatus$.asObservable();
  }

  /**
   * Triggers the invitation, setting the status to `true`.
   */
  triggerInvitation(): void {
    this.invitationStatus$.next(true);
  }

  /**
   * Resets the invitation status, setting it back to `false`.
   */
  resetInvitationStatus(): void {
    this.invitationStatus$.next(false);
  }
}
