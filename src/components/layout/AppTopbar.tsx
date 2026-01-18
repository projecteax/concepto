/* eslint-disable @next/next/no-img-element */
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { LogOut, User as UserIcon, Settings, Users, Shield, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { NotificationItem } from '@/types';
import { notificationService } from '@/lib/firebase-services';

type AppTopbarProps = {
  mode: 'app' | 'public';
  title?: string;
};

export function AppTopbar({ mode, title }: AppTopbarProps) {
  const { user, logout, clearAuth } = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  useEffect(() => {
    if (!user || mode !== 'app') {
      setNotifications([]);
      return;
    }
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.id),
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          ...data,
          createdAt: data.createdAt?.toDate?.() || new Date(),
          readAt: data.readAt?.toDate?.() || undefined,
        } as NotificationItem;
      });
      items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      setNotifications(items.slice(0, 12));
    });
    return () => unsub();
  }, [user, mode]);

  const unreadCount = useMemo(
    () => notifications.filter(n => !n.isRead).length,
    [notifications]
  );

  const formatTime = (date?: Date) => {
    if (!date) return '';
    const diff = Date.now() - date.getTime();
    if (diff < 60_000) return 'Just now';
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={mode === 'public' ? '/public' : '/app'} className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg overflow-hidden bg-transparent">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/android-chrome-192x192.png"
                alt="Concepto"
                className="h-full w-full object-contain"
              />
            </div>
            <div className="hidden sm:block">
              <div className="text-sm font-semibold leading-4">
                <span className="studio-gradient-text">Concepto</span>
              </div>
              <div className="text-xs text-muted-foreground leading-4">
                {mode === 'public' ? 'Public view' : 'Studio'}
              </div>
            </div>
          </Link>

          {title ? (
            <div className="hidden md:block h-6 w-px bg-border" />
          ) : null}

          {title ? (
            <div className="hidden md:block min-w-0 text-sm text-muted-foreground truncate">{title}</div>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          {mode === 'public' ? (
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm hover:bg-accent"
            >
              <UserIcon className="h-4 w-4" />
              <span>Login to edit</span>
            </Link>
          ) : (
            <>
              {user ? (
                <>
                {mode === 'app' ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="relative h-10 w-10 rounded-md border bg-card hover:bg-accent transition-colors flex items-center justify-center">
                        <Bell className="h-4 w-4" />
                        {unreadCount > 0 ? (
                          <span className="absolute -top-1 -right-1 h-5 min-w-[20px] rounded-full bg-red-600 text-white text-[10px] px-1 flex items-center justify-center">
                            {unreadCount > 9 ? '9+' : unreadCount}
                          </span>
                        ) : null}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-80">
                      <div className="flex items-center justify-between px-3 py-2">
                        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                        {unreadCount > 0 ? (
                          <button
                            className="text-xs text-indigo-600 hover:text-indigo-700"
                            onClick={() => user && notificationService.markAllRead(user.id)}
                          >
                            Mark all read
                          </button>
                        ) : null}
                      </div>
                      <DropdownMenuSeparator />
                      {notifications.length === 0 ? (
                        <div className="px-3 py-4 text-sm text-gray-500">No notifications yet.</div>
                      ) : (
                        notifications.map((notification) => (
                          <DropdownMenuItem
                            key={notification.id}
                            className="flex flex-col items-start gap-1 py-2"
                            onClick={() => {
                              if (!notification.isRead) {
                                void notificationService.markRead(notification.id);
                              }
                              // Navigate based on notification type
                              if (notification.showId && notification.episodeId) {
                                router.push(`/app/shows/${notification.showId}/episodes/${notification.episodeId}`);
                              } else if (notification.showId) {
                                // For asset notifications, navigate to assets page
                                if (notification.type === 'asset-created' || notification.type === 'asset-updated') {
                                  router.push(`/app/shows/${notification.showId}/assets`);
                                } else {
                                  router.push(`/app/shows/${notification.showId}`);
                                }
                              }
                            }}
                          >
                            <div className="text-sm text-gray-900">{notification.message}</div>
                            <div className="text-[11px] text-gray-500 flex items-center gap-2">
                              <span>{formatTime(notification.createdAt)}</span>
                              {!notification.isRead ? (
                                <span className="text-indigo-600">New</span>
                              ) : null}
                            </div>
                          </DropdownMenuItem>
                        ))
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="hidden sm:flex h-10 items-center gap-2 rounded-md border bg-card px-3 hover:bg-accent transition-colors cursor-pointer">
                      <div className="h-7 w-7 rounded-full bg-primary/10 text-primary grid place-items-center overflow-hidden">
                        {user.avatarUrl ? (
                          <img src={user.avatarUrl} alt={user.name} className="h-full w-full object-cover" />
                        ) : (
                          <UserIcon className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0 truncate text-sm font-medium">
                        <span className="truncate">{user.name}</span>
                        <span className="ml-2 text-xs font-normal text-muted-foreground">@{user.username}</span>
                      </div>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>My Account</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => router.push('/settings')}>
                      <Settings className="w-4 h-4 mr-2" />
                      My Settings
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push('/collaboration')}>
                      <Users className="w-4 h-4 mr-2" />
                      Collaboration
                    </DropdownMenuItem>
                    {user.role === 'admin' && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => router.push('/admin')}>
                          <Shield className="w-4 h-4 mr-2" />
                          Admin Panel
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={clearAuth}
                      className="text-red-600 focus:text-red-600 focus:bg-red-50"
                    >
                      <LogOut className="w-4 h-4 mr-2" />
                      Clear All & Logout
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={logout}
                      className="text-gray-600"
                    >
                      <LogOut className="w-4 h-4 mr-2" />
                      Logout
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                </>
              ) : null}

              <Button
                type="button"
                onClick={logout}
                variant="outline"
                className="h-10 gap-2"
                title="Logout"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Logout</span>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}


