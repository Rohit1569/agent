
import React from 'react';
import { Task, CalendarEvent, Email, Priority } from '../types';
import { ICONS } from '../constants';

export const TaskListWidget: React.FC<{ tasks: Task[] }> = ({ tasks }) => (
  <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100 my-4">
    <div className="flex items-center gap-3 mb-6">
      <div className="w-10 h-10 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
        <ICONS.Task className="w-6 h-6" />
      </div>
      <h3 className="font-extrabold text-gray-900 tracking-tight text-lg">Daily Agenda</h3>
    </div>
    <div className="space-y-4">
      {tasks.map(task => (
        <div key={task.id} className="flex items-center gap-4 p-4 hover:bg-gray-50 rounded-2xl transition-all border border-transparent hover:border-gray-100 group">
          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${task.completed ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'}`}>
            {task.completed && <div className="w-2 h-2 bg-white rounded-full"></div>}
          </div>
          <div className="flex-1">
            <p className={`text-base font-semibold ${task.completed ? 'line-through text-gray-400' : 'text-gray-800'}`}>{task.title}</p>
            {task.dueDate && <p className="text-xs text-indigo-400 font-bold mt-1 uppercase tracking-widest">DUE {task.dueDate}</p>}
          </div>
          <span className={`text-[10px] px-3 py-1 rounded-full font-black uppercase tracking-widest ${
            task.priority === Priority.High ? 'bg-rose-50 text-rose-600 border border-rose-100' : 
            task.priority === Priority.Medium ? 'bg-amber-50 text-amber-600 border border-amber-100' : 'bg-green-50 text-green-600 border border-green-100'
          }`}>
            {task.priority}
          </span>
        </div>
      ))}
    </div>
  </div>
);

export const CalendarWidget: React.FC<{ events: CalendarEvent[] }> = ({ events }) => (
  <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100 my-4 overflow-hidden">
    <div className="flex items-center gap-3 mb-6">
      <div className="w-10 h-10 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
        <ICONS.Calendar className="w-6 h-6" />
      </div>
      <h3 className="font-extrabold text-gray-900 tracking-tight text-lg">Cloud Calendar</h3>
    </div>
    <div className="space-y-6">
      {events.map(event => (
        <div key={event.id} className="relative pl-6 border-l-4 border-blue-500 py-1">
          <p className="text-base font-extrabold text-gray-900 tracking-tight">{event.title}</p>
          <div className="flex items-center gap-2 text-xs font-bold text-gray-400 mt-2 uppercase tracking-widest">
            <span>{new Date(event.start).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
            <span className="opacity-30">—</span>
            <span>{new Date(event.end).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
          </div>
          {event.attendees && (
             <div className="flex flex-wrap gap-2 mt-3">
                {event.attendees.map(a => (
                    <span key={a} className="text-[10px] font-black uppercase tracking-widest bg-gray-50 text-gray-500 px-2 py-1 rounded-lg border border-gray-100">{a}</span>
                ))}
             </div>
          )}
        </div>
      ))}
    </div>
  </div>
);

export const EmailListWidget: React.FC<{ emails: Email[] }> = ({ emails }) => (
  <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100 my-4">
    <div className="flex items-center gap-3 mb-6">
      <div className="w-10 h-10 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-600">
        <ICONS.Email className="w-6 h-6" />
      </div>
      <h3 className="font-extrabold text-gray-900 tracking-tight text-lg">Gmail Inbox</h3>
    </div>
    <div className="space-y-2">
      {emails.map(email => (
        <div key={email.id} className="p-4 cursor-pointer hover:bg-gray-50 rounded-2xl transition-all group">
          <div className="flex justify-between items-center mb-1">
            <p className={`text-sm tracking-tight ${email.read ? 'text-gray-500 font-bold' : 'text-gray-900 font-extrabold'}`}>{email.sender}</p>
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{email.date}</span>
          </div>
          <p className="text-sm text-gray-800 font-semibold line-clamp-1">{email.subject}</p>
          <p className="text-xs text-gray-400 mt-2 line-clamp-2 leading-relaxed font-medium">{email.snippet}</p>
        </div>
      ))}
    </div>
  </div>
);
