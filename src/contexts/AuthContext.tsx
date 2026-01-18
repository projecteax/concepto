'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut, updateProfile } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { userService } from '@/lib/firebase-services';
import { ADMIN_EMAILS, ADMIN_USERNAMES } from '@/lib/access-control';
import { UserProfile } from '@/types';

interface AuthContextType {
  user: UserProfile | null;
  login: (identifier: string, password: string) => Promise<boolean>;
  register: (input: { username: string; name: string; email: string; password: string }) => Promise<boolean>;
  logout: () => void;
  clearAuth: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (!firebaseUser) {
          setUser(null);
          return;
        }

        const profile = await userService.getProfile(firebaseUser.uid);
        if (profile) {
          setUser(profile);
          void userService.updateLastActive(profile.id);
          return;
        }

        const email = firebaseUser.email || '';
        const username = firebaseUser.displayName || (email ? email.split('@')[0] : 'user');
        const isAdmin = ADMIN_EMAILS.includes(email) || ADMIN_USERNAMES.includes(username);

        const newProfile: UserProfile = {
          id: firebaseUser.uid,
          username,
          name: firebaseUser.displayName || username,
          email,
          role: isAdmin ? 'admin' : 'user',
          avatarUrl: firebaseUser.photoURL || undefined,
          lastActiveAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        await userService.createOrUpdateProfile(newProfile);
        setUser(newProfile);
        void userService.updateLastActive(newProfile.id);
      } catch (error) {
        console.error('Error loading user profile:', error);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const updatePresence = () => {
      if (!active) return;
      void userService.updateLastActive(user.id);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        updatePresence();
      }
    };

    updatePresence();
    intervalId = setInterval(updatePresence, 60_000);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      active = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user]);

  const login = async (identifier: string, password: string): Promise<boolean> => {
    try {
      const trimmed = identifier.trim();
      let email = trimmed;
      if (!trimmed.includes('@')) {
        const profile = await userService.getByUsername(trimmed.toLowerCase());
        if (!profile?.email) {
          return false;
        }
        email = profile.email;
      }
      await signInWithEmailAndPassword(auth, email, password);
      return true;
    } catch (error) {
      console.error('Login failed:', error);
      return false;
    }
  };

  const register = async (input: { username: string; name: string; email: string; password: string }): Promise<boolean> => {
    try {
      const username = input.username.trim().toLowerCase();
      const existing = await userService.getByUsername(username);
      if (existing) {
        return false;
      }
      const credential = await createUserWithEmailAndPassword(auth, input.email.trim(), input.password);
      await updateProfile(credential.user, { displayName: input.name.trim() || username });
      const isAdmin = ADMIN_EMAILS.includes(input.email.trim()) || ADMIN_USERNAMES.includes(username);
      const profile: UserProfile = {
        id: credential.user.uid,
        username,
        name: input.name.trim() || username,
        email: input.email.trim(),
        role: isAdmin ? 'admin' : 'user',
        avatarUrl: credential.user.photoURL || undefined,
        lastActiveAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await userService.createOrUpdateProfile(profile);
      setUser(profile);
      return true;
    } catch (error) {
      console.error('Registration failed:', error);
      return false;
    }
  };

  const logout = async () => {
    await signOut(auth);
    setUser(null);
  };

  const clearAuth = async () => {
    await signOut(auth);
    setUser(null);
    localStorage.removeItem('concepto_comments');
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, clearAuth, isLoading }}>
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
