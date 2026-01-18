'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { userService } from '@/lib/firebase-services';
import { UserProfile } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Save, User, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { reauthenticateWithCredential, updatePassword, EmailAuthProvider } from 'firebase/auth';

export default function SettingsPage() {
  const router = useRouter();
  const { user: currentUser, logout } = useAuth();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Password change state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  useEffect(() => {
    if (!currentUser) {
      router.push('/login');
      return;
    }
    setUser(currentUser);
    setName(currentUser.name);
    setUsername(currentUser.username);
    setEmail(currentUser.email || '');
    setIsLoading(false);
  }, [currentUser, router]);

  const handleSave = async () => {
    if (!user) return;
    
    setIsSaving(true);
    setError('');
    setSuccess('');
    
    try {
      // Check if username changed and if it's available
      if (username.trim().toLowerCase() !== user.username.toLowerCase()) {
        const existing = await userService.getByUsername(username.trim().toLowerCase());
        if (existing && existing.id !== user.id) {
          setError('Username is already taken');
          setIsSaving(false);
          return;
        }
      }

      const updated: UserProfile = {
        ...user,
        name: name.trim(),
        username: username.trim().toLowerCase(),
        email: email.trim(),
        updatedAt: new Date(),
      };
      
      await userService.createOrUpdateProfile(updated);
      setUser(updated);
      setSuccess('Settings saved successfully');
      
      // Reload page to update auth context
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!user || !auth.currentUser) return;
    
    setIsChangingPassword(true);
    setPasswordError('');
    setPasswordSuccess('');
    
    try {
      // Validation
      if (!oldPassword.trim()) {
        setPasswordError('Current password is required');
        setIsChangingPassword(false);
        return;
      }
      
      if (!newPassword.trim()) {
        setPasswordError('New password is required');
        setIsChangingPassword(false);
        return;
      }
      
      if (newPassword.length < 6) {
        setPasswordError('New password must be at least 6 characters long');
        setIsChangingPassword(false);
        return;
      }
      
      if (newPassword !== confirmPassword) {
        setPasswordError('New passwords do not match');
        setIsChangingPassword(false);
        return;
      }
      
      if (oldPassword === newPassword) {
        setPasswordError('New password must be different from current password');
        setIsChangingPassword(false);
        return;
      }
      
      // Re-authenticate user with old password
      const credential = EmailAuthProvider.credential(
        auth.currentUser.email!,
        oldPassword
      );
      
      await reauthenticateWithCredential(auth.currentUser, credential);
      
      // Update password
      await updatePassword(auth.currentUser, newPassword);
      
      // Clear form
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSuccess('Password changed successfully');
      
    } catch (err: any) {
      if (err.code === 'auth/wrong-password') {
        setPasswordError('Current password is incorrect');
      } else if (err.code === 'auth/weak-password') {
        setPasswordError('New password is too weak');
      } else if (err.code === 'auth/requires-recent-login') {
        setPasswordError('Please log out and log back in before changing your password');
      } else {
        setPasswordError(err.message || 'Failed to change password');
      }
    } finally {
      setIsChangingPassword(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Button
            variant="secondary"
            onClick={() => router.push('/app')}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to App
          </Button>
          <h1 className="text-3xl font-semibold text-gray-900">My Settings</h1>
          <p className="text-sm text-gray-600 mt-2">Manage your account settings and preferences</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Profile Information</CardTitle>
            <CardDescription>Update your personal information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}
            {success && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
                {success}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Full Name
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-gray-400" />
                </div>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="pl-10"
                  placeholder="Your full name"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-gray-400" />
                </div>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  className="pl-10"
                  placeholder="username"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">Only lowercase letters, numbers, and underscores</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  placeholder="your@email.com"
                />
              </div>
            </div>

            <div className="pt-4">
              <Button
                onClick={handleSave}
                disabled={isSaving || !name.trim() || !username.trim() || !email.trim()}
                className="gap-2"
              >
                <Save className="w-4 h-4" />
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Change Password</CardTitle>
            <CardDescription>Update your account password</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {passwordError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {passwordError}
              </div>
            )}
            {passwordSuccess && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
                {passwordSuccess}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Current Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <Input
                  type={showOldPassword ? 'text' : 'password'}
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="pl-10 pr-10"
                  placeholder="Enter current password"
                />
                <button
                  type="button"
                  onClick={() => setShowOldPassword(!showOldPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                >
                  {showOldPassword ? (
                    <EyeOff className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                  ) : (
                    <Eye className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                  )}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                New Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <Input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="pl-10 pr-10"
                  placeholder="Enter new password"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                >
                  {showNewPassword ? (
                    <EyeOff className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                  ) : (
                    <Eye className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                  )}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">Must be at least 6 characters long</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Confirm New Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <Input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-10 pr-10"
                  placeholder="Confirm new password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                  ) : (
                    <Eye className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                  )}
                </button>
              </div>
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
              )}
            </div>

            <div className="pt-2">
              <Button
                onClick={handleChangePassword}
                disabled={
                  isChangingPassword ||
                  !oldPassword.trim() ||
                  !newPassword.trim() ||
                  !confirmPassword.trim() ||
                  newPassword !== confirmPassword ||
                  newPassword.length < 6
                }
                className="gap-2"
              >
                <Lock className="w-4 h-4" />
                {isChangingPassword ? 'Changing Password...' : 'Change Password'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>Account management options</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">Role</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {user.role === 'admin' ? 'Administrator' : 'User'}
                  </p>
                </div>
                <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium">
                  {user.role}
                </span>
              </div>

              <div className="pt-4 border-t">
                <Button
                  variant="secondary"
                  onClick={logout}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  Logout
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
