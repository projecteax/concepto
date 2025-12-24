'use client';

import { AppTopbar } from '@/components/layout/AppTopbar';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <AppTopbar mode="public" />
      <main className="min-h-[calc(100vh-3.5rem)]">{children}</main>
    </div>
  );
}


