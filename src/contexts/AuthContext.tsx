'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface User {
  id: string;
  username: string;
  name: string;
  role: 'admin' | 'user';
}

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  clearAuth: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Predefined users
const PREDEFINED_USERS: User[] = [
  {
    id: '1',
    username: 'lukasz',
    name: 'Lukasz',
    role: 'admin'
  },
  {
    id: '2',
    username: 'adrian',
    name: 'Adrian',
    role: 'admin'
  }
];

const PASSWORD = 'zaq12wsx';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user is logged in (from localStorage)
    const savedUser = localStorage.getItem('concepto_user');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (error) {
        console.error('Error parsing saved user:', error);
        localStorage.removeItem('concepto_user');
      }
    }
    setIsLoading(false);
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 500));

    if (password !== PASSWORD) {
      return false;
    }

    const foundUser = PREDEFINED_USERS.find(u => u.username.toLowerCase() === username.toLowerCase());
    
    if (foundUser) {
      setUser(foundUser);
      localStorage.setItem('concepto_user', JSON.stringify(foundUser));
      return true;
    }

    return false;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('concepto_user');
  };

  const clearAuth = () => {
    setUser(null);
    localStorage.removeItem('concepto_user');
    localStorage.removeItem('concepto_comments');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, clearAuth, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
