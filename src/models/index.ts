export interface JiraTicket {
  Key: string;
  Summary: string;
  Status: string;
  Assignee: string;
  Description: string;
  'Story point': number | string;
}

export interface SyncEvent<T = any> {
  type: string;
  data: T;
  senderId: string;
  senderName: string;
  timestamp: number;
  roomId: string;
}

export interface GameState {
  issues: JiraTicket[];
  selectedTicket: JiraTicket | null;
  gameName: string;
  gameType: string;
  votes: { [key: string]: any };
}

export interface UserProfile {
  displayName: string;
  isHost: boolean;
  clientId: string;
}

export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'syncing';
