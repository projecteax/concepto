/* eslint-disable @next/next/no-img-element */
'use client';

import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { LogOut, User as UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

type AppTopbarProps = {
  mode: 'app' | 'public';
  title?: string;
};

export function AppTopbar({ mode, title }: AppTopbarProps) {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={mode === 'public' ? '/public' : '/app'} className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground grid place-items-center text-sm font-semibold">
              C
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
                <div className="hidden sm:flex h-10 items-center gap-2 rounded-md border bg-card px-3">
                  <div className="h-7 w-7 rounded-full bg-primary/10 text-primary grid place-items-center">
                    <UserIcon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 truncate text-sm font-medium">
                    <span className="truncate">{user.name}</span>
                    <span className="ml-2 text-xs font-normal text-muted-foreground">@{user.username}</span>
                  </div>
                </div>
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


