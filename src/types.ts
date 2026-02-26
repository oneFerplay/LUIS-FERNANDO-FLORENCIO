export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai' | 'contact';
  timestamp: Date;
  status?: 'sent' | 'delivered' | 'read';
}

export interface Contact {
  id: string;
  name: string;
  avatar: string;
  lastMessage?: string;
  lastMessageTime?: Date;
  isOnline: boolean;
}
