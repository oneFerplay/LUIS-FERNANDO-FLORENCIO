/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Virtuoso } from 'react-virtuoso';
import { 
  Search, 
  MoreVertical, 
  Phone, 
  Video, 
  Send, 
  Paperclip, 
  Smile, 
  Bot,
  Check,
  CheckCheck,
  Menu,
  Settings,
  UploadCloud,
  X,
  Mic,
  MicOff,
  VideoOff,
  Maximize2,
  Minimize2
} from 'lucide-react';
import Markdown from 'react-markdown';
import { cn } from './utils';
import { Message, Contact } from './types';
import { generateChatResponse } from './services/gemini';

const INITIAL_CONTACTS: Contact[] = [
  {
    id: 'gemini',
    name: 'Gemini AI',
    avatar: 'https://picsum.photos/seed/gemini/200',
    lastMessage: 'Olá! Como posso ajudar você hoje?',
    lastMessageTime: new Date(),
    isOnline: true,
  },
  {
    id: '1',
    name: 'Alice Silva',
    avatar: 'https://picsum.photos/seed/alice/200',
    lastMessage: 'Você viu o novo design?',
    lastMessageTime: new Date(Date.now() - 3600000),
    isOnline: true,
  },
  {
    id: '2',
    name: 'Bruno Costa',
    avatar: 'https://picsum.photos/seed/bruno/200',
    lastMessage: 'Até amanhã!',
    lastMessageTime: new Date(Date.now() - 7200000),
    isOnline: false,
  },
  {
    id: '3',
    name: 'Carla Souza',
    avatar: 'https://picsum.photos/seed/carla/200',
    lastMessage: 'Obrigada pela ajuda!',
    lastMessageTime: new Date(Date.now() - 86400000),
    isOnline: true,
  }
];

export default function App() {
  const [contacts, setContacts] = useState<Contact[]>(INITIAL_CONTACTS);
  const [activeContactId, setActiveContactId] = useState<string>('gemini');
  const [messages, setMessages] = useState<Record<string, Message[]>>({
    'gemini': [
      { id: '1', text: 'Olá! Eu sou o Gemini, seu assistente inteligente. Como posso ajudar você hoje?', sender: 'ai', timestamp: new Date(), status: 'read' }
    ],
    '1': [{ id: '2', text: 'Oi! Tudo bem?', sender: 'contact', timestamp: new Date(Date.now() - 3600000), status: 'read' }],
    '2': [{ id: '3', text: 'E aí, beleza?', sender: 'contact', timestamp: new Date(Date.now() - 7200000), status: 'read' }],
    '3': [{ id: '4', text: 'Oi, pode me ajudar?', sender: 'contact', timestamp: new Date(Date.now() - 86400000), status: 'read' }],
  });
  const [inputValue, setInputValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [remoteTyping, setRemoteTyping] = useState<Record<string, boolean>>({});
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [userId] = useState(() => `user_${Math.floor(Math.random() * 1000)}`);
  
  // Video Call State
  const [callStatus, setCallStatus] = useState<'idle' | 'calling' | 'incoming' | 'active'>('idle');
  const [activeCall, setActiveCall] = useState<{ targetId: string; isCaller: boolean } | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  
  const messagesEndRef = useRef<any>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [userProfile, setUserProfile] = useState({
    name: 'Luis Florêncio',
    email: 'luisflorencio1998@gmail.com',
    avatar: 'https://picsum.photos/seed/me/200'
  });

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const activeContact = contacts.find(c => c.id === activeContactId) || contacts[0];

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);
    
    ws.onopen = () => {
      console.log('Connected to WebSocket');
      ws.send(JSON.stringify({ type: 'identify', userId }));
    };

    ws.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'message') {
        const { contactId, message, senderId } = data;
        // If the message is for me, or I sent it
        setMessages(prev => ({
          ...prev,
          [contactId]: [...(prev[contactId] || []), { ...message, timestamp: new Date(message.timestamp) }]
        }));
        
        // Update last message in contact list
        setContacts(prev => prev.map(c => 
          c.id === contactId ? { ...c, lastMessage: message.text, lastMessageTime: new Date(message.timestamp) } : c
        ));

        // If I'm currently viewing this conversation, send a read receipt
        if (activeContactId === contactId && senderId !== userId) {
          ws.send(JSON.stringify({
            type: 'read_receipt',
            contactId,
            messageId: message.id,
            senderId: userId
          }));
        }
      } else if (data.type === 'history') {
        const { contactId, messages: historyMessages } = data;
        setMessages(prev => ({
          ...prev,
          [contactId]: historyMessages
        }));
      } else if (data.type === 'typing') {
        const { contactId, isTyping: isRemoteTyping, senderId } = data;
        if (senderId !== userId) {
          setRemoteTyping(prev => ({
            ...prev,
            [contactId]: isRemoteTyping
          }));
        }
      } else if (data.type === 'read_receipt') {
        const { contactId, messageId, senderId } = data;
        if (senderId !== userId) {
          setMessages(prev => {
            const contactMessages = prev[contactId] || [];
            const updatedMessages = contactMessages.map(m => {
              if (messageId && m.id === messageId) {
                return { ...m, status: 'read' as const };
              } else if (!messageId && m.sender === 'user') {
                return { ...m, status: 'read' as const };
              }
              return m;
            });
            return { ...prev, [contactId]: updatedMessages };
          });
        }
      } else if (data.type === 'delivered_receipt') {
        const { contactId, messageId, senderId } = data;
        if (senderId !== userId) {
          setMessages(prev => {
            const contactMessages = prev[contactId] || [];
            const updatedMessages = contactMessages.map(m => {
              if (m.id === messageId) {
                return { ...m, status: 'delivered' as const };
              }
              return m;
            });
            return { ...prev, [contactId]: updatedMessages };
          });
        }
      } else if (data.type === 'call_request') {
        setCallStatus('incoming');
        setActiveCall({ targetId: data.senderId, isCaller: false });
      } else if (data.type === 'call_response') {
        if (data.accepted) {
          setCallStatus('active');
          startWebRTC(data.senderId, true);
        } else {
          setCallStatus('idle');
          setActiveCall(null);
          alert('Chamada recusada');
        }
      } else if (data.type === 'webrtc_signal') {
        handleWebRTCSignal(data.signal);
      }
    };

    setSocket(ws);

    return () => {
      ws.close();
    };
  }, []);

  // Request history when active contact changes
  useEffect(() => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'get_history',
        contactId: activeContactId
      }));

      // Mark as read
      socket.send(JSON.stringify({
        type: 'read_receipt',
        contactId: activeContactId,
        senderId: userId
      }));
    }
  }, [activeContactId, socket, userId]);

  // Handle local typing status
  useEffect(() => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    const timeoutId = setTimeout(() => {
      socket.send(JSON.stringify({
        type: 'typing',
        contactId: activeContactId,
        isTyping: false,
        senderId: userId
      }));
    }, 2000);

    socket.send(JSON.stringify({
      type: 'typing',
      contactId: activeContactId,
      isTyping: inputValue.length > 0,
      senderId: userId
    }));

    return () => clearTimeout(timeoutId);
  }, [inputValue, socket, activeContactId, userId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollToIndex({
      index: (messages[activeContactId] || []).length - 1,
      behavior: 'smooth'
    });
  };

  const filteredContacts = contacts.filter(contact => 
    contact.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    scrollToBottom();
  }, [messages, activeContactId]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() || !socket) return;
    
    // Stop listening if sending message
    if (isListening) {
      setIsListening(false);
    }

    const newMessage: Message = {
      id: Date.now().toString(),
      text: inputValue,
      sender: 'user',
      timestamp: new Date(),
      status: 'sent'
    };

    // Send via WebSocket
    socket.send(JSON.stringify({
      type: 'message',
      contactId: activeContactId,
      message: newMessage,
      senderId: userId
    }));

    setInputValue('');

    // Simulate 'delivered' status after 1 second for non-AI contacts
    if (activeContactId !== 'gemini') {
      setTimeout(() => {
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            type: 'delivered_receipt',
            contactId: activeContactId,
            messageId: newMessage.id,
            senderId: userId
          }));
        }
      }, 1000);

      // Simulate 'read' status after 3 seconds
      setTimeout(() => {
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            type: 'read_receipt',
            contactId: activeContactId,
            messageId: newMessage.id,
            senderId: activeContactId
          }));
        }
      }, 3000);
    }

    // If talking to Gemini, trigger AI response locally
    if (activeContactId === 'gemini') {
      setIsTyping(true);
      // Mark as read immediately for AI
      socket.send(JSON.stringify({
        type: 'read_receipt',
        contactId: 'gemini',
        messageId: newMessage.id,
        senderId: 'gemini'
      }));
      try {
        const aiResponse = await generateChatResponse(inputValue, []);
        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          text: aiResponse || "Desculpe, não consegui processar sua mensagem.",
          sender: 'ai',
          timestamp: new Date(),
        };
        
        // Send AI response via WebSocket so it's synced
        socket.send(JSON.stringify({
          type: 'message',
          contactId: 'gemini',
          message: aiMessage,
          senderId: 'gemini'
        }));
      } catch (error) {
        console.error("AI Error:", error);
      } finally {
        setIsTyping(false);
      }
    }
  };

  const toggleListening = () => {
    if (isListening) {
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Seu navegador não suporta reconhecimento de voz.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'pt-BR';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInputValue(prev => prev + (prev.length > 0 ? ' ' : '') + transcript);
      setIsListening(false);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  // WebRTC Logic
  const startWebRTC = async (targetId: string, isCaller: boolean) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        setRemoteStream(event.streams[0]);
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0];
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && socket) {
          socket.send(JSON.stringify({
            type: 'webrtc_signal',
            targetId,
            signal: { candidate: event.candidate }
          }));
        }
      };

      if (isCaller) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket?.send(JSON.stringify({
          type: 'webrtc_signal',
          targetId,
          signal: { sdp: pc.localDescription }
        }));
      }

      peerConnectionRef.current = pc;
    } catch (err) {
      console.error('WebRTC Error:', err);
      endCall();
    }
  };

  const handleWebRTCSignal = async (signal: any) => {
    const pc = peerConnectionRef.current;
    if (!pc) return;

    if (signal.sdp) {
      await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      if (pc.remoteDescription?.type === 'offer') {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket?.send(JSON.stringify({
          type: 'webrtc_signal',
          targetId: activeCall?.targetId,
          signal: { sdp: pc.localDescription }
        }));
      }
    } else if (signal.candidate) {
      await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
    }
  };

  const initiateCall = () => {
    if (activeContactId === 'gemini') {
      alert('Gemini ainda não suporta chamadas de vídeo.');
      return;
    }
    setCallStatus('calling');
    setActiveCall({ targetId: activeContactId, isCaller: true });
    socket?.send(JSON.stringify({
      type: 'call_request',
      targetId: activeContactId,
      senderId: userId
    }));
  };

  const acceptCall = () => {
    setCallStatus('active');
    socket?.send(JSON.stringify({
      type: 'call_response',
      targetId: activeCall?.targetId,
      senderId: userId,
      accepted: true
    }));
    startWebRTC(activeCall!.targetId, false);
  };

  const rejectCall = () => {
    socket?.send(JSON.stringify({
      type: 'call_response',
      targetId: activeCall?.targetId,
      senderId: userId,
      accepted: false
    }));
    setCallStatus('idle');
    setActiveCall(null);
  };

  const endCall = () => {
    localStream?.getTracks().forEach(track => track.stop());
    peerConnectionRef.current?.close();
    setCallStatus('idle');
    setActiveCall(null);
    setLocalStream(null);
    setRemoteStream(null);
  };

  return (
    <div className="flex h-screen bg-zinc-100 overflow-hidden">
      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ width: isSidebarOpen ? 320 : 0, opacity: isSidebarOpen ? 1 : 0 }}
        className={cn(
          "bg-white border-r border-zinc-200 flex flex-col z-20 absolute md:relative h-full",
          !isSidebarOpen && "hidden md:flex"
        )}
      >
        <div className="p-4 border-b border-zinc-100 flex items-center justify-between">
          <h1 className="text-xl font-bold text-zinc-800">Mensagens</h1>
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-2 hover:bg-zinc-100 rounded-full">
            <X size={20} />
          </button>
        </div>

        <div className="px-4 py-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
            <input 
              type="text" 
              placeholder="Buscar conversas..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-zinc-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredContacts.length > 0 ? (
            filteredContacts.map((contact) => (
              <button
                key={contact.id}
                onClick={() => {
                  setActiveContactId(contact.id);
                  if (window.innerWidth < 768) setIsSidebarOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 p-4 hover:bg-zinc-50 transition-colors border-l-4",
                  activeContactId === contact.id ? "bg-indigo-50/50 border-indigo-500" : "border-transparent"
                )}
              >
                <div className="relative">
                  <img 
                    src={contact.avatar} 
                    alt={contact.name} 
                    className="w-12 h-12 rounded-full object-cover border border-zinc-200"
                    referrerPolicy="no-referrer"
                  />
                  {contact.isOnline && (
                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full" />
                  )}
                </div>
                <div className="flex-1 text-left overflow-hidden">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-semibold text-zinc-800 truncate">{contact.name}</span>
                    <span className="text-[10px] text-zinc-400">
                      {contact.lastMessageTime ? new Date(contact.lastMessageTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 truncate">
                    {contact.id === 'gemini' && <Bot size={12} className="inline mr-1 text-indigo-500" />}
                    {remoteTyping[contact.id] ? (
                      <span className="text-indigo-500 font-medium italic animate-pulse">Digitando...</span>
                    ) : (
                      contact.lastMessage
                    )}
                  </p>
                </div>
              </button>
            ))
          ) : (
            <div className="p-8 text-center">
              <p className="text-sm text-zinc-500">Nenhum contato encontrado</p>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-zinc-100 bg-zinc-50/50">
          <div className="flex items-center gap-3">
            <img 
              src={userProfile.avatar} 
              alt="Meu Perfil" 
              className="w-10 h-10 rounded-full object-cover border border-zinc-200"
              referrerPolicy="no-referrer"
            />
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-semibold text-zinc-800 truncate">{userProfile.name}</p>
              <p className="text-[10px] text-zinc-500 truncate">{userProfile.email}</p>
            </div>
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 text-zinc-400 hover:text-zinc-600 transition-colors"
            >
              <Settings size={18} />
            </button>
          </div>
        </div>
      </motion.aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col bg-white relative">
        {/* Chat Header */}
        <header className="h-16 border-b border-zinc-100 flex items-center justify-between px-4 md:px-6 shrink-0">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className={cn("p-2 hover:bg-zinc-100 rounded-full transition-colors", isSidebarOpen && "md:hidden")}
            >
              <Menu size={20} />
            </button>
            <div className="relative">
              <img 
                src={activeContact.avatar} 
                alt={activeContact.name} 
                className="w-10 h-10 rounded-full object-cover border border-zinc-100"
                referrerPolicy="no-referrer"
              />
              {activeContact.isOnline && (
                <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-white rounded-full" />
              )}
            </div>
            <div>
              <h2 className="font-semibold text-zinc-800 leading-tight">{activeContact.name}</h2>
              {remoteTyping[activeContact.id] ? (
                <p className="text-xs text-indigo-500 font-medium italic animate-pulse">Digitando...</p>
              ) : (
                <p className="text-xs text-emerald-500 font-medium">
                  {activeContact.isOnline ? 'Online' : 'Visto por último há 2h'}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 md:gap-3">
            <button className="p-2 text-zinc-500 hover:bg-zinc-100 rounded-full transition-colors">
              <Phone size={20} />
            </button>
            <button 
              onClick={initiateCall}
              className="p-2 text-zinc-500 hover:bg-zinc-100 rounded-full transition-colors"
            >
              <Video size={20} />
            </button>
            <button className="p-2 text-zinc-500 hover:bg-zinc-100 rounded-full transition-colors">
              <MoreVertical size={20} />
            </button>
          </div>
        </header>

        {/* Messages Container */}
        <div className="flex-1 bg-zinc-50/30 overflow-hidden">
          <Virtuoso
            ref={messagesEndRef}
            data={messages[activeContactId] || []}
            followOutput="smooth"
            initialTopMostItemIndex={(messages[activeContactId] || []).length - 1}
            className="h-full"
            itemContent={(_index, msg) => (
              <div className="px-4 md:px-6 py-2">
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  className={cn(
                    "flex flex-col max-w-[85%] md:max-w-[70%] group",
                    msg.sender === 'user' ? "ml-auto items-end" : "items-start"
                  )}
                >
                  <div className={cn(
                    "px-4 py-2 rounded-2xl text-sm shadow-sm transition-all",
                    msg.sender === 'user' 
                      ? "bg-indigo-600 text-white rounded-tr-none" 
                      : "bg-white text-zinc-800 border border-zinc-100 rounded-tl-none"
                  )}>
                    {msg.sender === 'ai' ? (
                      <div className="prose prose-sm max-w-none prose-zinc">
                        <Markdown>{msg.text}</Markdown>
                      </div>
                    ) : (
                      <p>{msg.text}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 mt-1 px-1">
                    <span className="text-[10px] text-zinc-400">
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {msg.sender === 'user' && (
                      <div className="flex items-center ml-1">
                        {msg.status === 'read' ? (
                          <CheckCheck size={14} className="text-indigo-500 stroke-[3px]" />
                        ) : msg.status === 'delivered' ? (
                          <CheckCheck size={14} className="text-zinc-400 stroke-[2px]" />
                        ) : (
                          <Check size={14} className="text-zinc-400 stroke-[2px]" />
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              </div>
            )}
            components={{
              Footer: () => (
                <div className="pb-4">
                  {isTyping && activeContactId === 'gemini' && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-start gap-2 px-4 md:px-6 py-2"
                    >
                      <div className="bg-white border border-zinc-100 px-4 py-3 rounded-2xl rounded-tl-none shadow-sm">
                        <div className="flex gap-1">
                          <span className="w-1.5 h-1.5 bg-zinc-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-1.5 h-1.5 bg-zinc-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-1.5 h-1.5 bg-zinc-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>
              )
            }}
          />
        </div>

        {/* Message Input */}
        <footer className="p-4 border-t border-zinc-100 bg-white">
          <form 
            onSubmit={handleSendMessage}
            className="flex items-center gap-2 md:gap-4 max-w-5xl mx-auto"
          >
            <button type="button" className="p-2 text-zinc-400 hover:bg-zinc-100 rounded-full transition-colors shrink-0">
              <Paperclip size={20} />
            </button>
            <div className="flex-1 relative">
              <input 
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={isListening ? "Ouvindo..." : "Digite sua mensagem..."}
                className={cn(
                  "w-full pl-4 pr-20 py-3 bg-zinc-100 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all",
                  isListening && "ring-2 ring-indigo-500/20"
                )}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button 
                  type="button" 
                  onClick={toggleListening}
                  className={cn(
                    "p-1 transition-colors",
                    isListening ? "text-indigo-600 animate-pulse" : "text-zinc-400 hover:text-indigo-500"
                  )}
                >
                  {isListening ? <MicOff size={20} /> : <Mic size={20} />}
                </button>
                <button type="button" className="p-1 text-zinc-400 hover:text-indigo-500 transition-colors">
                  <Smile size={20} />
                </button>
              </div>
            </div>
            <button 
              type="submit"
              disabled={!inputValue.trim()}
              className={cn(
                "p-3 rounded-2xl transition-all shrink-0",
                inputValue.trim() 
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200 hover:bg-indigo-700" 
                  : "bg-zinc-100 text-zinc-400 cursor-not-allowed"
              )}
            >
              <Send size={20} />
            </button>
          </form>
        </footer>
      </main>

      {/* Video Call Overlay */}
      <AnimatePresence>
        {callStatus !== 'idle' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
          >
            <div className="relative w-full max-w-4xl aspect-video bg-zinc-900 rounded-3xl overflow-hidden shadow-2xl border border-white/10">
              {callStatus === 'active' ? (
                <>
                  <video 
                    ref={remoteVideoRef} 
                    autoPlay 
                    playsInline 
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-4 right-4 w-1/4 aspect-video bg-black rounded-xl overflow-hidden border-2 border-white/20 shadow-lg">
                    <video 
                      ref={localVideoRef} 
                      autoPlay 
                      playsInline 
                      muted 
                      className="w-full h-full object-cover"
                    />
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-white gap-6">
                  <div className="relative">
                    <img 
                      src={activeCall?.isCaller ? activeContact.avatar : contacts.find(c => c.id === activeCall?.targetId)?.avatar} 
                      alt="Avatar" 
                      className="w-32 h-32 rounded-full border-4 border-indigo-500 p-1"
                    />
                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-indigo-500 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                      {callStatus === 'calling' ? 'Chamando...' : 'Recebendo...'}
                    </div>
                  </div>
                  <h3 className="text-2xl font-bold">
                    {activeCall?.isCaller ? activeContact.name : contacts.find(c => c.id === activeCall?.targetId)?.name}
                  </h3>
                </div>
              )}

              {/* Call Controls */}
              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-6">
                {callStatus === 'incoming' ? (
                  <>
                    <button 
                      onClick={acceptCall}
                      className="w-16 h-16 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-emerald-600 transition-all hover:scale-110"
                    >
                      <Phone size={28} />
                    </button>
                    <button 
                      onClick={rejectCall}
                      className="w-16 h-16 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-red-600 transition-all hover:scale-110"
                    >
                      <Phone size={28} className="rotate-[135deg]" />
                    </button>
                  </>
                ) : (
                  <>
                    <button className="w-12 h-12 bg-white/10 text-white rounded-full flex items-center justify-center hover:bg-white/20 transition-all">
                      <Mic size={20} />
                    </button>
                    <button 
                      onClick={endCall}
                      className="w-16 h-16 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-red-600 transition-all hover:scale-110"
                    >
                      <VideoOff size={28} />
                    </button>
                    <button className="w-12 h-12 bg-white/10 text-white rounded-full flex items-center justify-center hover:bg-white/20 transition-all">
                      <Maximize2 size={20} />
                    </button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={() => setIsSettingsOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-zinc-200 p-8"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-zinc-800">Configurações</h2>
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="p-2 text-zinc-400 hover:bg-zinc-100 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex flex-col items-center gap-4 mb-8">
                <div className="relative group">
                  <img 
                    src={userProfile.avatar}
                    alt="Profile Avatar"
                    className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-lg"
                  />
                  <label 
                    htmlFor="avatar-upload"
                    className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    <UploadCloud size={24} className="text-white" />
                  </label>
                  <input 
                    id="avatar-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          setUserProfile(prev => ({ ...prev, avatar: event.target?.result as string }));
                        };
                        reader.readAsDataURL(e.target.files[0]);
                      }
                    }}
                  />
                </div>
                <div>
                  <p className="font-semibold text-zinc-800 text-center">{userProfile.name}</p>
                  <p className="text-sm text-zinc-500 text-center">{userProfile.email}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-zinc-500">Nome</label>
                  <input 
                    type="text"
                    value={userProfile.name}
                    onChange={(e) => setUserProfile(p => ({...p, name: e.target.value}))}
                    className="w-full mt-1 px-3 py-2 bg-zinc-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-500">E-mail</label>
                  <input 
                    type="email"
                    value={userProfile.email}
                    onChange={(e) => setUserProfile(p => ({...p, email: e.target.value}))}
                    className="w-full mt-1 px-3 py-2 bg-zinc-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>
              </div>

              <div className="mt-8 flex justify-end gap-3">
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-zinc-600 bg-zinc-100 rounded-lg hover:bg-zinc-200 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                >
                  Salvar Alterações
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
