'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import { AppTopbar } from '@/components/layout/AppTopbar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background">
        <AppTopbar mode="app" />
        <main className="min-h-[calc(100vh-3.5rem)]">{children}</main>
      </div>
    </ProtectedRoute>
  );
}


