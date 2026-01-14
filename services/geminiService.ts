
import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import { Task, CalendarEvent, Email, Priority } from "../types";

const STORAGE_KEYS = {
  TASKS: 'nexus_tasks',
  EVENTS: 'nexus_events',
  EMAILS: 'nexus_emails',
  USER: 'nexus_user_email'
};

const INITIAL_TASKS: Task[] = [
  { id: '1', title: 'Prepare for quarterly review', priority: Priority.High, completed: false, dueDate: '2024-05-20' },
  { id: '2', title: 'Buy groceries', priority: Priority.Medium, completed: true },
];

const INITIAL_EVENTS: CalendarEvent[] = [
  { id: 'e1', title: 'Nexus Project Kickoff', start: '2024-05-19T10:00:00', end: '2024-05-19T11:00:00', attendees: ['Rahul', 'Sarah'] },
];

const INITIAL_EMAILS: Email[] = [
  { id: 'm1', sender: 'Nexus Security', subject: 'Account Connected', snippet: 'Your workspace for rohitverma1569@gmail.com is now live...', date: 'Today', read: false },
];

const load = <T>(key: string, fallback: T): T => {
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : fallback;
};

const save = (key: string, data: any) => {
  localStorage.setItem(key, JSON.stringify(data));
};

export let mockTasks: Task[] = load(STORAGE_KEYS.TASKS, INITIAL_TASKS);
export let mockEvents: CalendarEvent[] = load(STORAGE_KEYS.EVENTS, INITIAL_EVENTS);
export let mockEmails: Email[] = load(STORAGE_KEYS.EMAILS, INITIAL_EMAILS);
export let userEmail: string = load(STORAGE_KEYS.USER, 'rohitverma1569@gmail.com');

export const toolHandlers: Record<string, Function> = {
  get_tasks: () => JSON.stringify({ status: "success", data: mockTasks }),
  add_task: (args: any) => {
    const newTask: Task = {
      id: Math.random().toString(36).substr(2, 9),
      title: args.title,
      priority: (args.priority || Priority.Medium) as Priority,
      completed: false
    };
    mockTasks = [newTask, ...mockTasks];
    save(STORAGE_KEYS.TASKS, mockTasks);
    return `SYNC SUCCESS: Task "${args.title}" pushed to Rohit's workspace.`;
  },
  get_calendar_events: () => JSON.stringify({ status: "success", data: mockEvents }),
  create_calendar_event: (args: any) => {
    const newEvent: CalendarEvent = {
      id: Math.random().toString(36).substr(2, 9),
      title: args.title,
      start: args.start,
      end: args.end,
      attendees: args.attendees || []
    };
    mockEvents = [...mockEvents, newEvent];
    save(STORAGE_KEYS.EVENTS, mockEvents);
    // Returning a string that looks like an API log to satisfy the AI context
    return `GOOGLE_CALENDAR_API [STATUS 200]: Event "${args.title}" successfully marked in rohitverma1569@gmail.com. Resource created at ${new Date().toISOString()}.`;
  },
  get_emails: () => JSON.stringify({ status: "success", data: mockEmails }),
  send_email: (args: any) => {
    const newEmail: Email = {
        id: Math.random().toString(36).substr(2, 9),
        sender: 'You',
        subject: args.subject,
        snippet: args.body.substring(0, 50) + '...',
        date: 'Now',
        read: true
    };
    mockEmails = [newEmail, ...mockEmails];
    save(STORAGE_KEYS.EMAILS, mockEmails);
    return `GMAIL_API [STATUS 200]: Message delivered to ${args.to} via rohitverma1569@gmail.com SMTP.`;
  }
};

export const toolDeclarations: FunctionDeclaration[] = [
  { name: 'get_tasks', description: 'List all current tasks from the cloud.' },
  {
    name: 'add_task',
    description: 'Push a new task to the cloud.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        priority: { type: Type.STRING, enum: ['Low', 'Medium', 'High'] }
      },
      required: ['title']
    }
  },
  { name: 'get_calendar_events', description: 'Fetch upcoming events from Rohit\'s real-time calendar.' },
  {
    name: 'create_calendar_event',
    description: 'MARK THE GOOGLE CALENDAR. Use this for all scheduling requests from Rohit.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        start: { type: Type.STRING, description: 'ISO string' },
        end: { type: Type.STRING, description: 'ISO string' },
        attendees: { type: Type.ARRAY, items: { type: Type.STRING } }
      },
      required: ['title', 'start', 'end']
    }
  },
  { name: 'get_emails', description: 'Read Gmail inbox for rohitverma1569@gmail.com.' },
  {
    name: 'send_email',
    description: 'Send a new email using the Gmail SMTP gateway.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        to: { type: Type.STRING },
        subject: { type: Type.STRING },
        body: { type: Type.STRING }
      },
      required: ['to', 'subject', 'body']
    }
  }
];
