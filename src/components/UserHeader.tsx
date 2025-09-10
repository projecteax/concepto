'use client';

import { useAuth } from '@/contexts/AuthContext';
import { LogOut, User } from 'lucide-react';

export default function UserHeader() {
  const { user, logout, clearAuth } = useAuth();

  if (!user) return null;

  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center">
            <User className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">{user.name}</p>
            <p className="text-xs text-gray-500">@{user.username}</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={clearAuth}
            className="px-3 py-2 text-sm text-red-600 hover:text-red-900 hover:bg-red-50 rounded-lg transition-colors"
            title="Clear all data and logout"
          >
            Clear All
          </button>
          <button
            onClick={logout}
            className="flex items-center space-x-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      </div>
    </div>
  );
}
