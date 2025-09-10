'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function ClearAuthPage() {
  const { clearAuth } = useAuth();
  const router = useRouter();

  useEffect(() => {
    clearAuth();
    router.push('/login');
  }, [clearAuth, router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Clearing authentication...</p>
      </div>
    </div>
  );
}
