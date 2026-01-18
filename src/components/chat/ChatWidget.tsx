'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { chatMessageService, chatService, episodeAccessService, showAccessService, userService } from '@/lib/firebase-services';
import { ChatAttachment, ChatConversation, ChatMessage, Show, UserProfile } from '@/types';
import { generateFileKey, uploadToS3 } from '@/lib/s3-service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Users, MessageCircle, X, Send, Plus, Image as ImageIcon, Paperclip, Trash2, Pencil } from 'lucide-react';

type ChatWidgetProps = {
  show: Show | null;
  isDisabled?: boolean;
};

const MAX_ATTACHMENT_SIZE = 15 * 1024 * 1024;

const getInitials = (name?: string, username?: string) => {
  const source = (name || username || '').trim();
  if (!source) return '?';
  const parts = source.split(' ').filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

const formatTimeAgo = (date?: Date) => {
  if (!date) return 'Offline';
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return 'Active now';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `Active ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Active ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Active ${days}d ago`;
};

const isOnline = (date?: Date) => {
  if (!date) return false;
  return Date.now() - date.getTime() < 5 * 60_000;
};

export function ChatWidget({ show, isDisabled = false }: ChatWidgetProps) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [activeView, setActiveView] = useState<'list' | 'chat' | 'group'>('list');
  const [activeTab, setActiveTab] = useState<'people' | 'groups'>('people');
  const [collaborators, setCollaborators] = useState<UserProfile[]>([]);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selectedChat, setSelectedChat] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [uploadError, setUploadError] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupMembers, setGroupMembers] = useState<string[]>([]);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [hasUnread, setHasUnread] = useState(false);
  const [readTimestamps, setReadTimestamps] = useState<Record<string, number>>({});
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const lastSeenMessageRef = useRef<Record<string, number>>({});

  const showId = show?.id || null;

  useEffect(() => {
    if (!user || !showId) {
      setCollaborators([]);
      return;
    }
    let active = true;

    const loadCollaborators = async () => {
      const [showAccess, episodeAccess] = await Promise.all([
        showAccessService.getByShow(showId),
        episodeAccessService.getByShow(showId),
      ]);
      const allUsers = await userService.getAll();
      const userIds = new Set<string>();
      if (show?.ownerId) {
        userIds.add(show.ownerId);
      }
      showAccess.forEach(entry => userIds.add(entry.userId));
      episodeAccess.forEach(entry => userIds.add(entry.userId));
      allUsers.filter(profile => profile.role === 'admin').forEach(profile => userIds.add(profile.id));
      userIds.add(user.id);
      const profiles = allUsers.filter(profile => userIds.has(profile.id));
      if (active) {
        profiles.sort((a, b) => {
          const aOnline = isOnline(a.lastActiveAt) ? 1 : 0;
          const bOnline = isOnline(b.lastActiveAt) ? 1 : 0;
          if (aOnline !== bOnline) return bOnline - aOnline;
          return a.name.localeCompare(b.name);
        });
        setCollaborators(profiles);
      }
    };

    void loadCollaborators();
    const intervalId = setInterval(loadCollaborators, 60_000);
    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [showId, show?.ownerId, user]);

  useEffect(() => {
    if (!user || !showId) {
      setConversations([]);
      return;
    }
    const q = query(
      collection(db, 'chats'),
      where('showId', '==', showId),
      where('memberIds', 'array-contains', user.id),
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(docSnap => {
        const docData = docSnap.data();
        return {
          id: docSnap.id,
          ...docData,
          createdAt: docData.createdAt?.toDate?.() || new Date(),
          updatedAt: docData.updatedAt?.toDate?.() || new Date(),
          lastMessage: docData.lastMessage
            ? {
                ...docData.lastMessage,
                createdAt: docData.lastMessage.createdAt?.toDate?.() || new Date(),
              }
            : undefined,
        } as ChatConversation;
      });
      data.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      setConversations(data);
    });
    return () => unsub();
  }, [showId, user]);

  useEffect(() => {
    if (!selectedChat) {
      setMessages([]);
      return;
    }
    const q = query(
      collection(db, 'chatMessages'),
      where('chatId', '==', selectedChat.id),
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(docSnap => {
        const docData = docSnap.data();
        return {
          id: docSnap.id,
          ...docData,
          createdAt: docData.createdAt?.toDate?.() || new Date(),
          updatedAt: docData.updatedAt?.toDate?.() || new Date(),
          editedAt: docData.editedAt?.toDate?.(),
          deletedAt: docData.deletedAt?.toDate?.(),
        } as ChatMessage;
      });
      data.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      setMessages(data.slice(-200));
    });
    return () => unsub();
  }, [selectedChat]);

  useEffect(() => {
    if (!messagesEndRef.current) return;
    messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages, selectedChat]);

  // Mark messages as read when chat is opened
  useEffect(() => {
    if (!isOpen || !selectedChat || !user) return;
    
    // Mark as read using current timestamp - this ensures we're always ahead of any message
    const timestamp = Date.now();
    lastSeenMessageRef.current[selectedChat.id] = timestamp;
    setReadTimestamps(prev => ({
      ...prev,
      [selectedChat.id]: timestamp,
    }));
  }, [isOpen, selectedChat?.id, user?.id]);

  // Calculate unread status for all chats
  useEffect(() => {
    if (!user) {
      setHasUnread(false);
      return;
    }
    let unread = false;
    conversations.forEach(convo => {
      if (!convo.lastMessage?.createdAt) return;
      if (convo.lastMessage.senderId === user.id) return;
      const ts = convo.lastMessage.createdAt.getTime();
      // Use state value if available, fallback to ref
      const lastSeen = readTimestamps[convo.id] || lastSeenMessageRef.current[convo.id] || 0;
      if (ts > lastSeen) {
        unread = true;
      }
    });
    setHasUnread(unread);
  }, [conversations, user?.id, readTimestamps]);

  const directChats = useMemo(
    () => conversations.filter(convo => convo.type === 'direct'),
    [conversations]
  );
  const groupChats = useMemo(
    () => conversations.filter(convo => convo.type === 'group'),
    [conversations]
  );

  const getOtherUser = (conversation: ChatConversation) => {
    if (!user) return null;
    const otherId = conversation.memberIds.find(id => id !== user.id);
    return collaborators.find(profile => profile.id === otherId) || null;
  };

  const hasUnreadMessages = (conversation: ChatConversation): boolean => {
    if (!user || !conversation.lastMessage) return false;
    if (conversation.lastMessage.senderId === user.id) return false;
    const ts = conversation.lastMessage.createdAt.getTime();
    // Use state value if available, fallback to ref
    const lastSeen = readTimestamps[conversation.id] || lastSeenMessageRef.current[conversation.id] || 0;
    return ts > lastSeen;
  };

  const openDirectChat = async (profile: UserProfile) => {
    if (!user || !showId) return;
    const memberIds = [user.id, profile.id].sort();
    const memberKey = memberIds.join('__');
    let conversation = directChats.find(c => c.memberKey === memberKey);
    if (!conversation) {
      const existing = await chatService.getDirectByMemberKey(showId, memberKey);
      if (existing) {
        conversation = existing;
      } else {
        conversation = await chatService.createConversation({
          showId,
          type: 'direct',
          memberIds,
          memberKey,
          createdBy: user.id,
        });
      }
    }
    setSelectedChat(conversation);
    setActiveView('chat');
    setIsOpen(true); // Ensure chat is open when selecting
  };

  const openGroupChat = (conversation: ChatConversation) => {
    setSelectedChat(conversation);
    setActiveView('chat');
    setIsOpen(true); // Ensure chat is open when selecting
  };

  const handleCreateGroup = async () => {
    if (!user || !showId) return;
    const trimmed = groupName.trim();
    if (!trimmed) return;
    const members = Array.from(new Set([user.id, ...groupMembers]));
    const conversation = await chatService.createConversation({
      showId,
      type: 'group',
      memberIds: members,
      name: trimmed,
      createdBy: user.id,
    });
    setGroupName('');
    setGroupMembers([]);
    setSelectedChat(conversation);
    setActiveView('chat');
  };

  const handleSelectAttachment = (files: FileList | null) => {
    if (!files) return;
    const next = Array.from(files);
    setAttachments(prev => [...prev, ...next]);
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleSendMessage = async () => {
    if (!user || !selectedChat) return;
    const trimmed = messageText.trim();
    if (!trimmed && attachments.length === 0) return;

    setUploadError('');
    setIsSending(true);
    let uploadedAttachments: ChatAttachment[] = [];

    try {
      if (attachments.length > 0) {
        uploadedAttachments = [];
        for (const file of attachments) {
          if (file.size > MAX_ATTACHMENT_SIZE) {
            throw new Error(`${file.name} exceeds 15MB limit`);
          }
          const key = generateFileKey(`chat-attachments/${selectedChat.showId}/${selectedChat.id}`, file.name);
          const result = await uploadToS3(file, key);
          uploadedAttachments.push({
            id: `${Date.now()}-${file.name}`,
            url: result.url,
            name: file.name,
            size: file.size,
            type: file.type,
          });
        }
      }

      await chatMessageService.addMessage({
        chatId: selectedChat.id,
        showId: selectedChat.showId,
        senderId: user.id,
        senderName: user.name,
        senderAvatarUrl: user.avatarUrl,
        text: trimmed || undefined,
        attachments: uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
        isDeleted: false,
      });

      const lastMessageType = trimmed ? 'text' : 'attachment';
      await chatService.updateLastMessage(selectedChat.id, {
        text: trimmed || (uploadedAttachments.length > 0 ? 'Attachment' : ''),
        senderId: user.id,
        createdAt: new Date(),
        type: lastMessageType,
      });

      setMessageText('');
      setAttachments([]);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  const handleEditMessage = async (message: ChatMessage) => {
    if (!editingText.trim()) return;
    await chatMessageService.updateMessage(message.id, {
      text: editingText.trim(),
      editedAt: new Date(),
    });
    setEditingMessageId(null);
    setEditingText('');
  };

  const handleDeleteMessage = async (message: ChatMessage) => {
    if (!user) return;
    await chatMessageService.markDeleted(message.id, user.id);
  };

  const activeChatTitle = useMemo(() => {
    if (!selectedChat) return '';
    if (selectedChat.type === 'group') return selectedChat.name || 'Group chat';
    const other = getOtherUser(selectedChat);
    return other?.name || other?.username || 'Direct chat';
  }, [selectedChat, collaborators]);

  if (!user) return null;

  return (
    <>
      <button
        className={`fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg border flex items-center justify-center transition-colors ${
          isDisabled || !show ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'
        }`}
        onClick={() => {
          if (isDisabled || !show) return;
          setIsOpen(!isOpen);
          if (!isOpen) {
            setActiveView('list');
          }
        }}
        aria-label="Open chat"
        type="button"
      >
        {hasUnread ? (
          <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-600 text-white text-[11px] flex items-center justify-center border border-white">
            !
          </span>
        ) : null}
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt={user.name} className="h-full w-full rounded-full object-cover" />
        ) : (
          <span className="text-sm font-semibold">{getInitials(user.name, user.username)}</span>
        )}
      </button>

      {isOpen ? (
        <div className="fixed bottom-24 right-6 z-50 w-80 max-h-[70vh] bg-white border border-gray-200 rounded-xl shadow-xl flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-indigo-600" />
              <div className="text-sm font-semibold">Show Chat</div>
              {show ? (
                <div className="text-xs text-gray-500 truncate max-w-[120px]">· {show.name}</div>
              ) : null}
            </div>
            <button
              className="text-gray-500 hover:text-gray-700"
              onClick={() => setIsOpen(false)}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {activeView === 'list' ? (
            <>
              <div className="flex items-center gap-2 px-4 py-2 border-b">
                <button
                  className={`text-xs font-medium px-2 py-1 rounded ${activeTab === 'people' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}
                  onClick={() => setActiveTab('people')}
                >
                  People
                </button>
                <button
                  className={`text-xs font-medium px-2 py-1 rounded ${activeTab === 'groups' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}
                  onClick={() => setActiveTab('groups')}
                >
                  Groups
                </button>
                {activeTab === 'groups' ? (
                  <button
                    className="ml-auto inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700"
                    onClick={() => setActiveView('group')}
                  >
                    <Plus className="w-3 h-3" />
                    New group
                  </button>
                ) : null}
              </div>

              {activeTab === 'people' ? (
                <div className="p-3 flex flex-col gap-3 overflow-y-auto">
                  <div className="space-y-2">
                    {collaborators
                      .filter(profile => profile.id !== user.id)
                      .map(profile => {
                        const memberIds = [user.id, profile.id].sort();
                        const memberKey = memberIds.join('__');
                        const conversation = directChats.find(c => c.memberKey === memberKey);
                        const hasUnread = conversation ? hasUnreadMessages(conversation) : false;
                        return (
                          <button
                            key={profile.id}
                            className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-200"
                            onClick={() => void openDirectChat(profile)}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="relative">
                                {profile.avatarUrl ? (
                                  <img src={profile.avatarUrl} alt={profile.name} className="h-9 w-9 rounded-full object-cover" />
                                ) : (
                                  <div className="h-9 w-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-semibold">
                                    {getInitials(profile.name, profile.username)}
                                  </div>
                                )}
                                <span className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border border-white ${isOnline(profile.lastActiveAt) ? 'bg-green-500' : 'bg-gray-300'}`} />
                              </div>
                              <div className="min-w-0 text-left">
                                <div className="text-sm font-medium truncate">{profile.name}</div>
                                <div className="text-xs text-gray-500 truncate">@{profile.username}</div>
                                <div className="text-[11px] text-gray-400">{formatTimeAgo(profile.lastActiveAt)}</div>
                              </div>
                            </div>
                            {hasUnread ? (
                              <span className="text-red-600 font-bold text-lg">!</span>
                            ) : (
                              <MessageCircle className="w-4 h-4 text-gray-400" />
                            )}
                          </button>
                        );
                      })}
                    {collaborators.filter(profile => profile.id !== user.id).length === 0 ? (
                      <div className="text-xs text-gray-500 text-center py-6">No collaborators yet.</div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="p-3 overflow-y-auto">
                  <div className="space-y-2">
                    {groupChats.map(group => {
                      const hasUnread = hasUnreadMessages(group);
                      return (
                        <button
                          key={group.id}
                          className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-200"
                          onClick={() => openGroupChat(group)}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="relative">
                              <div className="h-9 w-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center">
                                <Users className="w-4 h-4" />
                              </div>
                              {hasUnread ? (
                                <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-600 text-white text-[10px] flex items-center justify-center font-bold">!</span>
                              ) : null}
                            </div>
                            <div className="min-w-0 text-left">
                              <div className="text-sm font-medium truncate">{group.name || 'Group chat'}</div>
                              <div className="text-xs text-gray-500 truncate">{group.memberIds.length} members</div>
                            </div>
                          </div>
                          <div className="text-xs text-gray-400 truncate max-w-[120px]">
                            {group.lastMessage?.text ? group.lastMessage.text : 'No messages'}
                          </div>
                        </button>
                      );
                    })}
                    {groupChats.length === 0 ? (
                      <div className="text-xs text-gray-500 text-center py-6">No group chats yet.</div>
                    ) : null}
                  </div>
                </div>
              )}
            </>
          ) : null}

          {activeView === 'group' ? (
            <div className="p-4 space-y-3">
              <div className="text-sm font-semibold">Create group</div>
              <Input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Group name"
              />
              <div className="text-xs text-gray-500">Select collaborators</div>
              <div className="max-h-48 overflow-y-auto space-y-2">
                {collaborators
                  .filter(profile => profile.id !== user.id)
                  .map(profile => {
                    const selected = groupMembers.includes(profile.id);
                    return (
                      <button
                        key={profile.id}
                        className={`w-full flex items-center gap-3 p-2 rounded-lg border ${selected ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'}`}
                        onClick={() => {
                          setGroupMembers(prev => selected
                            ? prev.filter(id => id !== profile.id)
                            : [...prev, profile.id]);
                        }}
                      >
                        {profile.avatarUrl ? (
                          <img src={profile.avatarUrl} alt={profile.name} className="h-8 w-8 rounded-full object-cover" />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-semibold">
                            {getInitials(profile.name, profile.username)}
                          </div>
                        )}
                        <div className="min-w-0 text-left">
                          <div className="text-sm font-medium truncate">{profile.name}</div>
                          <div className="text-xs text-gray-500 truncate">@{profile.username}</div>
                        </div>
                      </button>
                    );
                  })}
              </div>
              <div className="flex items-center justify-between">
                <Button variant="secondary" onClick={() => setActiveView('list')}>
                  Back
                </Button>
                <Button
                  onClick={() => void handleCreateGroup()}
                  disabled={!groupName.trim() || groupMembers.length === 0}
                >
                  Create
                </Button>
              </div>
            </div>
          ) : null}

          {activeView === 'chat' && selectedChat ? (
            <>
              <div className="flex items-center gap-2 px-4 py-2 border-b">
                <button
                  className="text-xs text-gray-500 hover:text-gray-700"
                  onClick={() => {
                    setSelectedChat(null);
                    setActiveView('list');
                  }}
                >
                  ← Back
                </button>
                <div className="text-sm font-semibold truncate">{activeChatTitle}</div>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {messages.map(msg => {
                  const isOwn = msg.senderId === user.id;
                  const isDeleted = msg.isDeleted;
                  return (
                    <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${isOwn ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-900'}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-medium opacity-80">
                            {isOwn ? 'You' : msg.senderName}
                          </div>
                          {!isDeleted && isOwn ? (
                            <div className="flex items-center gap-2 text-[11px] opacity-70">
                              <button onClick={() => {
                                setEditingMessageId(msg.id);
                                setEditingText(msg.text || '');
                              }}>
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button onClick={() => void handleDeleteMessage(msg)}>
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ) : null}
                        </div>

                        {isDeleted ? (
                          <div className="text-xs italic opacity-70">Message deleted</div>
                        ) : (
                          <>
                            {editingMessageId === msg.id ? (
                              <div className="mt-2 space-y-2">
                                <Input
                                  value={editingText}
                                  onChange={(e) => setEditingText(e.target.value)}
                                  className="text-sm"
                                />
                                <div className="flex items-center gap-2 text-xs">
                                  <button
                                    className="text-white/80 hover:text-white"
                                    onClick={() => void handleEditMessage(msg)}
                                  >
                                    Save
                                  </button>
                                  <button
                                    className="text-white/60 hover:text-white"
                                    onClick={() => {
                                      setEditingMessageId(null);
                                      setEditingText('');
                                    }}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                {msg.text ? <div className="mt-1 whitespace-pre-wrap">{msg.text}</div> : null}
                                {msg.attachments && msg.attachments.length > 0 ? (
                                  <div className="mt-2 space-y-2">
                                    {msg.attachments.map(att => (
                                      <div key={att.id} className="flex items-center gap-2 text-xs">
                                        {att.type.startsWith('image/') ? (
                                          <img src={att.url} alt={att.name} className="h-14 w-14 rounded-md object-cover border" />
                                        ) : (
                                          <Paperclip className="w-4 h-4" />
                                        )}
                                        <a href={att.url} target="_blank" rel="noreferrer" className="underline">
                                          {att.name}
                                        </a>
                                      </div>
                                    ))}
                                  </div>
                                ) : null}
                                {msg.editedAt ? (
                                  <div className="text-[10px] opacity-60 mt-1">Edited</div>
                                ) : null}
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
              <div className="border-t px-4 py-3 space-y-2">
                {attachments.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {attachments.map((file, idx) => (
                      <div key={`${file.name}-${idx}`} className="flex items-center gap-2 bg-gray-100 rounded px-2 py-1 text-xs">
                        <ImageIcon className="w-3 h-3 text-gray-500" />
                        <span className="max-w-[120px] truncate">{file.name}</span>
                        <button onClick={() => handleRemoveAttachment(idx)}>
                          <X className="w-3 h-3 text-gray-400" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
                {uploadError ? <div className="text-xs text-red-600">{uploadError}</div> : null}
                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center justify-center h-9 w-9 rounded-md border border-gray-200 hover:bg-gray-50 cursor-pointer">
                    <Paperclip className="w-4 h-4 text-gray-500" />
                    <input
                      type="file"
                      className="hidden"
                      multiple
                      onChange={(e) => handleSelectAttachment(e.target.files)}
                    />
                  </label>
                  <Input
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder="Type a message..."
                    className="text-sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void handleSendMessage();
                      }
                    }}
                  />
                  <Button onClick={() => void handleSendMessage()} disabled={isSending}>
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
