'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { LogOut, User, Settings, Users, Shield } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function UserHeader() {
  const { user, logout, clearAuth } = useAuth();
  const router = useRouter();

  if (!user) return null;

  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center space-x-3 hover:bg-gray-50 rounded-lg px-2 py-1 -mx-2 transition-colors cursor-pointer">
              <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center">
                <User className="w-4 h-4 text-white" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-gray-900">{user.name}</p>
                <p className="text-xs text-gray-500">@{user.username}</p>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
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
        
        <div className="flex items-center space-x-2">
          {user.role === 'admin' && (
            <a
              href="/admin"
              className="px-3 py-2 text-sm text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 rounded-lg transition-colors flex items-center gap-2"
            >
              <Shield className="w-4 h-4" />
              Admin Panel
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
