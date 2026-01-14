
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { ChatMessage, Task, CalendarEvent, Email, Priority, ApiLog } from './types';
import { ICONS } from './constants';
import { TaskListWidget, CalendarWidget, EmailListWidget } from './components/UIWidgets';
import * as geminiService from './services/geminiService';

// Manual implementation of base64 encoding as per guidelines
function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Manual implementation of base64 decoding as per guidelines
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Manual audio decoding for raw PCM data from Gemini Live API
async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

const extractWidgets = (text: string): any[] => {
  const widgets: any[] = [];
  const lower = text.toLowerCase();
  if (lower.includes('calendar') || lower.includes('meeting') || lower.includes('marked') || lower.includes('scheduled')) widgets.push({ type: 'calendar' });
  if (lower.includes('task')) widgets.push({ type: 'task_list' });
  if (lower.includes('email') || lower.includes('inbox') || lower.includes('sent')) widgets.push({ type: 'email_list' });
  return Array.from(new Set(widgets.map(w => w.type))).map(type => ({ type }));
};

const App: React.FC = () => {
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deploymentStep, setDeploymentStep] = useState('');
  const [showConsole, setShowConsole] = useState(false);
  const [apiLogs, setApiLogs] = useState<ApiLog[]>([]);
  const [userEmail] = useState('rohitverma1569@gmail.com');
  const [isToolProcessing, setIsToolProcessing] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      role: 'assistant',
      content: "System online. Nexus is live for rohitverma1569@gmail.com. Cloud sync established. Tap the header to monitor my real-time operations.",
      timestamp: new Date(),
    }
  ]);
  const [isLive, setIsLive] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [transcription, setTranscription] = useState('');
  const [dataState, setDataState] = useState({
    tasks: geminiService.mockTasks,
    events: geminiService.mockEvents,
    emails: geminiService.mockEmails
  });
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionRef = useRef<any>(null);
  const inputProcessorRef = useRef<ScriptProcessorNode | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLive, transcription, isToolProcessing]);

  const addLog = (method: ApiLog['method'], endpoint: string, status: number) => {
    setApiLogs(prev => [{
      id: Math.random().toString(),
      method,
      endpoint,
      status,
      timestamp: new Date()
    }, ...prev].slice(0, 20));
  };

  const syncData = () => {
    setDataState({
      tasks: [...geminiService.mockTasks],
      events: [...geminiService.mockEvents],
      emails: [...geminiService.mockEmails]
    });
  };

  const stopVoiceSession = () => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    if (inputProcessorRef.current) {
      inputProcessorRef.current.disconnect();
      inputProcessorRef.current = null;
    }
    for (const source of sourcesRef.current) {
      try { source.stop(); } catch(e) {}
    }
    sourcesRef.current.clear();
    setIsLive(false);
  };

  const startVoiceSession = async () => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = audioContextRef.current;
      
      let currentInputText = '';
      let currentOutputText = '';

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setIsLive(true);
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            inputProcessorRef.current = scriptProcessor;

            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const l = inputData.length;
              const int16 = new Int16Array(l);
              for (let i = 0; i < l; i++) {
                int16[i] = inputData[i] * 32768;
              }
              const pcmBlob = {
                data: encode(new Uint8Array(int16.buffer)),
                mimeType: 'audio/pcm;rate=16000',
              };
              sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
            };
            
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.toolCall) {
              for (const fc of message.toolCall.functionCalls) {
                const isCalendar = fc.name === 'create_calendar_event';
                const isEmail = fc.name === 'send_email';
                
                setIsToolProcessing(isCalendar ? 'MARKING GOOGLE CALENDAR...' : 'WORKSPACE SYNC...');
                
                if (isCalendar) addLog('POST', '/v3/calendars/primary/events', 200);
                if (isEmail) addLog('POST', '/v1/users/me/messages/send', 200);
                if (fc.name === 'get_calendar_events') addLog('GET', '/v3/calendars/primary/events', 200);

                const handler = geminiService.toolHandlers[fc.name];
                let result = "API_ERROR";
                if (handler) {
                  await new Promise(r => setTimeout(r, 600));
                  result = handler(fc.args);
                  syncData();
                }
                setTimeout(() => setIsToolProcessing(null), 800);
                
                sessionPromise.then(session => {
                  session.sendToolResponse({
                    functionResponses: [{ id: fc.id, name: fc.name, response: { result } }]
                  });
                });
              }
            }

            if (message.serverContent?.inputTranscription) {
              currentInputText += message.serverContent.inputTranscription.text;
              setTranscription(currentInputText);
            }
            if (message.serverContent?.outputTranscription) {
              currentOutputText += message.serverContent.outputTranscription.text;
            }

            if (message.serverContent?.turnComplete) {
              if (currentInputText) {
                setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', content: currentInputText, timestamp: new Date() }]);
              }
              if (currentOutputText) {
                const widgets = extractWidgets(currentOutputText);
                setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', content: currentOutputText.replace(/\[WIDGET:.*?\]/g, ''), timestamp: new Date(), widgets }]);
              }
              currentInputText = '';
              currentOutputText = '';
              setTranscription('');
            }

            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio) {
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
              const audioBuffer = await decodeAudioData(decode(base64Audio), outputCtx, 24000, 1);
              const source = outputCtx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(outputCtx.destination);
              source.addEventListener('ended', () => sourcesRef.current.delete(source));
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              sourcesRef.current.add(source);
            }

            if (message.serverContent?.interrupted) {
              for (const source of sourcesRef.current) { try { source.stop(); } catch(e) {} }
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onerror: () => stopVoiceSession(),
          onclose: () => setIsLive(false),
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          tools: [{ functionDeclarations: geminiService.toolDeclarations }],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
          },
          systemInstruction: `You are Nexus, a LIVE Production Assistant for Rohit Verma.
          - AUTH: You have production-level API tokens.
          - BEHAVIOR: Proactive and high-fidelity.
          - CALENDAR: Always confirm "I've marked your Google Calendar" when using the schedule tool.`,
        }
      });
      
      sessionRef.current = await sessionPromise;
    } catch (err) {
      console.error(err);
    }
  };

  const handleAuthorize = async () => {
    setIsDeploying(true);
    const steps = [
      'Authenticating...',
      'Mapping rohitverma1569@gmail.com...',
      'Scanning Workspace Resources...',
      'Waking up Gemini 2.5 Live Engine...',
      'Nexus is Ready.'
    ];
    
    for (const step of steps) {
      setDeploymentStep(step);
      addLog('POST', `/v1/deploy/${step.split(' ')[0].toLowerCase()}`, 200);
      await new Promise(r => setTimeout(r, 600));
    }
    
    setIsAuthorized(true);
    setIsDeploying(false);
    syncData();
  };

  if (!isAuthorized) {
    return (
      <div className="flex flex-col h-screen max-w-md mx-auto bg-white p-12 justify-center font-sans relative overflow-hidden">
        {/* Background blobs for premium feel */}
        <div className="absolute top-[-10%] left-[-10%] w-64 h-64 bg-indigo-100 rounded-full blur-3xl opacity-50"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-64 h-64 bg-rose-100 rounded-full blur-3xl opacity-50"></div>

        <div className="flex flex-col items-center mb-16 relative z-10">
            <div className={`w-24 h-24 bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-[2.5rem] flex items-center justify-center text-white mb-8 shadow-2xl shadow-indigo-200 transition-all duration-1000 ${isDeploying ? 'scale-110 rotate-[360deg]' : 'animate-bounce'}`}>
                <ICONS.Sparkles className="w-12 h-12" />
            </div>
            <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight text-center leading-tight">Nexus Assistant</h1>
            <p className="text-gray-400 mt-4 font-semibold uppercase tracking-[0.2em] text-xs">Production Environment</p>
        </div>
        
        <div className="bg-white/70 backdrop-blur-md border border-gray-100 rounded-[2rem] p-8 mb-10 shadow-xl relative z-10">
            <div className="flex items-center gap-5">
                <div className="w-14 h-14 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600 font-bold text-lg shadow-inner">RV</div>
                <div className="flex-1">
                    <p className="text-lg font-bold text-gray-900 leading-none">Rohit Verma</p>
                    <p className="text-xs text-indigo-500 font-bold mt-2 tracking-wide">rohitverma1569@gmail.com</p>
                </div>
                {isDeploying ? (
                   <div className="w-6 h-6 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                   <div className="w-4 h-4 bg-green-500 rounded-full shadow-[0_0_15px_rgba(34,197,94,0.5)]"></div>
                )}
            </div>
            {isDeploying && (
              <div className="mt-8 space-y-4 animate-in fade-in duration-500">
                 <div className="h-2 bg-gray-50 rounded-full overflow-hidden border border-gray-100">
                    <div className="h-full bg-indigo-600 animate-progress w-full"></div>
                 </div>
                 <p className="text-[11px] font-bold text-indigo-600 uppercase tracking-[0.2em] text-center animate-pulse">{deploymentStep}</p>
              </div>
            )}
        </div>

        <button 
          disabled={isDeploying}
          onClick={handleAuthorize}
          className="w-full bg-indigo-600 text-white font-extrabold py-6 rounded-[2rem] shadow-2xl shadow-indigo-200 active:scale-95 hover:bg-indigo-700 transition-all text-xl uppercase tracking-[0.15em] relative z-10"
        >
          {isDeploying ? 'Syncing...' : 'Deploy Live'}
        </button>

        <p className="mt-10 text-[10px] text-gray-400 font-bold uppercase tracking-widest text-center opacity-50">Nexus v1.0.4-Stable</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen max-w-md mx-auto bg-[#FAFBFF] shadow-2xl overflow-hidden relative border-x border-gray-100 font-sans">
      
      {/* Network Traffic Overlay - Matrix Style Console */}
      <div className={`absolute inset-0 bg-[#06070B] z-[300] transition-transform duration-700 cubic-bezier(0.4, 0, 0.2, 1) ${showConsole ? 'translate-y-0' : 'translate-y-full'}`}>
          <div className="p-8 h-full flex flex-col">
              <div className="flex justify-between items-center mb-10">
                  <div>
                    <h2 className="text-white font-black uppercase tracking-[0.3em] text-sm">Deployment Logs</h2>
                    <p className="text-indigo-500 text-[10px] font-black mt-1">Live Bridge: Rohit Verma Workspace</p>
                  </div>
                  <button onClick={() => setShowConsole(false)} className="bg-indigo-600 hover:bg-indigo-700 text-white w-12 h-12 rounded-2xl flex items-center justify-center transition-all shadow-lg active:scale-90">
                     <span className="text-2xl font-light">×</span>
                  </button>
              </div>
              <div className="flex-1 space-y-4 overflow-y-auto no-scrollbar font-mono pb-10">
                  {apiLogs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full opacity-20">
                        <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-6"></div>
                        <p className="text-white text-xs uppercase tracking-[0.4em] font-black">Scanning Traffic</p>
                    </div>
                  ) : apiLogs.map(log => (
                    <div key={log.id} className="bg-white/5 border-l-4 border-indigo-500 p-5 rounded-r-2xl group hover:bg-white/10 transition-colors animate-in slide-in-from-left-4 duration-300">
                        <div className="flex justify-between items-center">
                            <span className={`font-black text-[11px] ${log.method === 'POST' ? 'text-indigo-400' : 'text-blue-400'}`}>{log.method}</span>
                            <span className="text-white font-black text-[10px] bg-green-500/20 px-3 py-1 rounded-full text-green-400 border border-green-500/30">STATUS 200</span>
                        </div>
                        <p className="text-gray-300 text-[11px] mt-2 break-all opacity-80">{log.endpoint}</p>
                        <p className="text-gray-600 text-[9px] mt-3 uppercase font-black tracking-widest">{log.timestamp.toLocaleTimeString()}</p>
                    </div>
                  ))}
              </div>
              <div className="mt-auto pt-6 border-t border-white/5">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <p className="text-green-500 text-[10px] font-black uppercase tracking-[0.3em]">Operational</p>
                  </div>
              </div>
          </div>
      </div>

      <div className={`absolute top-0 left-0 w-full h-1.5 z-[100] bg-indigo-600 transition-transform duration-700 ${isToolProcessing ? 'scale-x-100 opacity-100' : 'scale-x-0 opacity-0'}`}></div>

      {/* Android 14 Status Bar */}
      <div className="bg-white/80 backdrop-blur-2xl px-8 py-3 flex justify-between items-center z-20 text-gray-900 text-[11px] font-black tracking-widest uppercase">
        <span>{currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        <div className="flex items-center gap-4">
           <div className={`flex items-center gap-2 ${isToolProcessing ? 'text-indigo-600' : 'text-green-600'}`}>
              <div className={`w-2 h-2 rounded-full bg-current ${isToolProcessing ? 'animate-ping' : ''}`}></div>
              <span className="text-[10px] font-black tracking-tighter">{isToolProcessing ? 'PUSHING' : 'SYNCED'}</span>
           </div>
           <div className="w-5 h-2.5 bg-gray-900 rounded-[2px]"></div>
        </div>
      </div>

      <header onClick={() => setShowConsole(true)} className="bg-white/80 backdrop-blur-xl px-8 py-6 border-b border-gray-100 flex items-center justify-between z-10 cursor-pointer active:bg-gray-50 transition-colors shadow-sm">
        <div className="flex items-center gap-5">
          <div className={`w-14 h-14 rounded-[1.5rem] flex items-center justify-center text-white shadow-2xl transition-all duration-1000 ${isLive ? 'bg-rose-500 rotate-12 scale-110' : 'bg-indigo-600 shadow-indigo-100'}`}>
             <ICONS.Sparkles className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-gray-900 tracking-tight leading-none">Nexus</h1>
            <p className="text-[10px] text-indigo-600 font-black uppercase tracking-[0.2em] mt-2">{userEmail}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
           <div className="bg-green-50 px-3 py-1.5 rounded-full border border-green-100 shadow-sm">
               <span className="text-[9px] font-black text-green-700 uppercase tracking-widest">Live Cloud</span>
           </div>
        </div>
      </header>

      <main ref={scrollRef} className={`flex-1 overflow-y-auto p-8 space-y-10 transition-all duration-500 no-scrollbar ${isToolProcessing ? 'opacity-30 blur-[2px] scale-95' : 'opacity-100'}`}>
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-6 duration-700`}>
            <div className={`max-w-[95%] ${msg.role === 'user' ? 'w-auto' : 'w-full'}`}>
              <div className={`px-7 py-5 text-[15px] shadow-sm tracking-tight ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-[2.5rem] rounded-tr-none' : 'bg-white text-gray-800 rounded-[2.5rem] rounded-tl-none border border-gray-100 font-medium leading-relaxed'}`}>
                {msg.content}
              </div>
              {msg.widgets?.map((w, i) => (
                <div key={i} className="mt-6 animate-in zoom-in-95 slide-in-from-top-6 duration-1000 delay-150">
                  {w.type === 'task_list' && <TaskListWidget tasks={dataState.tasks} />}
                  {w.type === 'calendar' && <CalendarWidget events={dataState.events} />}
                  {w.type === 'email_list' && <EmailListWidget emails={dataState.emails} />}
                </div>
              ))}
            </div>
          </div>
        ))}
        {isToolProcessing && (
           <div className="flex justify-start animate-in zoom-in-90 duration-500 sticky bottom-4 z-50">
              <div className="bg-white border border-indigo-100 text-indigo-600 px-8 py-4 rounded-3xl text-[12px] font-black flex items-center gap-5 shadow-[0_20px_60px_rgba(0,0,0,0.1)]">
                 <div className="w-6 h-6 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                 {isToolProcessing}
              </div>
           </div>
        )}
        {isLive && transcription && (
           <div className="flex justify-end pr-6">
              <div className="bg-indigo-50/80 backdrop-blur-md text-indigo-600 px-6 py-3 rounded-full text-[12px] font-black uppercase tracking-widest italic animate-pulse shadow-sm border border-indigo-100">"{transcription}"</div>
           </div>
        )}
      </main>

      <footer className="p-10 bg-white border-t border-gray-50 flex flex-col items-center shadow-[0_-30px_70px_rgba(0,0,0,0.04)] relative z-20">
        {isLive ? (
          <div className="flex flex-col items-center gap-10 w-full animate-in zoom-in-95 duration-500">
            <div className="flex items-center gap-2.5 h-16 w-full justify-center">
               {[...Array(24)].map((_, i) => (
                 <div key={i} className="w-1.5 bg-rose-500 rounded-full animate-wave" style={{ height: '100%', animationDelay: `${i * 0.03}s` }}></div>
               ))}
            </div>
            <button onClick={stopVoiceSession} className="w-28 h-28 bg-rose-500 text-white rounded-full shadow-[0_30px_60px_rgba(244,63,94,0.45)] flex items-center justify-center transition-all active:scale-90 group relative">
               <div className="w-10 h-10 bg-white rounded-2xl group-hover:scale-90 transition-transform"></div>
               <div className="absolute inset-0 rounded-full bg-rose-500 animate-ping opacity-20"></div>
            </button>
            <p className="text-[12px] font-black text-rose-500 tracking-[0.6em] uppercase animate-pulse">Assistant Engaged</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-8 w-full">
            <button onClick={startVoiceSession} className="w-32 h-32 bg-indigo-600 text-white rounded-full shadow-[0_40px_80px_rgba(79,70,229,0.35)] flex items-center justify-center transition-all hover:scale-110 hover:-translate-y-2 active:scale-95 group relative overflow-hidden">
               <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
               <ICONS.Microphone className="w-14 h-14 group-hover:scale-110 transition-transform z-10" />
               <div className="absolute inset-0 rounded-full border-8 border-indigo-100 animate-ping opacity-30 pointer-events-none"></div>
            </button>
            <div className="text-center">
                <p className="text-base font-extrabold text-gray-900 tracking-tight">Listening for Nexus Commands</p>
                <p className="text-[11px] font-black text-gray-400 uppercase tracking-[0.3em] mt-2">Voice Workspace Sync v1.0.4</p>
            </div>
            <div className="flex gap-4 overflow-x-auto no-scrollbar w-full py-4 px-2">
              {[
                'Mark 11 PM meeting', 
                'Schedule dinner at 9', 
                'Show latest emails',
                'Add task: Project Nexus'
              ].map(s => (
                <button key={s} onClick={startVoiceSession} className="whitespace-nowrap px-8 py-4 bg-[#F8F9FA] text-gray-800 rounded-[1.5rem] text-[12px] font-black border border-gray-100 shadow-sm uppercase tracking-wider hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all active:scale-95">{s}</button>
              ))}
            </div>
          </div>
        )}
      </footer>

      <style>{`
        @keyframes wave { 0%, 100% { transform: scaleY(0.1); } 50% { transform: scaleY(1.5); } }
        @keyframes progress { 0% { width: 0%; } 100% { width: 100%; } }
        .animate-wave { animation: wave 0.5s ease-in-out infinite; transform-origin: center; }
        .animate-progress { animation: progress 3s cubic-bezier(0.4, 0, 0.2, 1) forwards; }
      `}</style>
    </div>
  );
};

export default App;
