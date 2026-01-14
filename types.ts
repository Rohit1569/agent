
export enum Priority {
  Low = 'Low',
  Medium = 'Medium',
  High = 'High'
}

export interface Task {
  id: string;
  title: string;
  priority: Priority;
  completed: boolean;
  dueDate?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  attendees?: string[];
  location?: string;
}

export interface Email {
  id: string;
  sender: string;
  subject: string;
  snippet: string;
  date: string;
  read: boolean;
}

export interface ApiLog {
  id: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  endpoint: string;
  status: number;
  timestamp: Date;
}

export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  widgets?: UIWidget[];
}

export interface UIWidget {
  type: 'calendar' | 'task_list' | 'email_list' | 'confirmation' | 'chart' | 'generic_card';
  title?: string;
  data: any;
}
