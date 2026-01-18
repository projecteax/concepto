'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Episode, EpisodeAccess, PermissionRole, Show, ShowAccess, UserProfile } from '@/types';
import { episodeService, showAccessService, showService, userService, episodeAccessService } from '@/lib/firebase-services';
import { isAdminUser } from '@/lib/access-control';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, UserPlus, X, Check, AlertCircle } from 'lucide-react';

const roleOptions: PermissionRole[] = ['editor', 'commenter', 'viewer'];

export default function CollaborationPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [shows, setShows] = useState<Show[]>([]);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [showAccess, setShowAccess] = useState<ShowAccess[]>([]);
  const [episodeAccess, setEpisodeAccess] = useState<EpisodeAccess[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form state
  const [userIdentifier, setUserIdentifier] = useState('');
  const [selectedShowId, setSelectedShowId] = useState('');
  const [selectedEpisodeIds, setSelectedEpisodeIds] = useState<string[]>([]);
  const [selectedRole, setSelectedRole] = useState<PermissionRole>('viewer');
  const [foundUser, setFoundUser] = useState<UserProfile | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [accessType, setAccessType] = useState<'show' | 'episode'>('show');

  const selectedShow = useMemo(() => shows.find(s => s.id === selectedShowId), [shows, selectedShowId]);
  const showEpisodes = useMemo(() => 
    episodes.filter(ep => ep.showId === selectedShowId),
    [episodes, selectedShowId]
  );

  // Load user's accessible shows and episodes
  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    
    const load = async () => {
      setIsLoading(true);
      setError('');
      try {
        const [allShows, allEpisodes, allUsers, allShowAccess, allEpisodeAccess] = await Promise.all([
          showService.getAll(),
          episodeService.getAll(),
          userService.getAll(),
          showAccessService.getAll(),
          episodeAccessService.getAll(),
        ]);

        // Filter shows user can manage (owner or admin)
        const manageableShows = allShows.filter(show => 
          isAdminUser(user) || show.ownerId === user.id
        );

        // Filter access entries for shows user can manage
        const manageableShowIds = new Set(manageableShows.map(s => s.id));
        const filteredShowAccess = allShowAccess.filter(entry => manageableShowIds.has(entry.showId));
        const filteredEpisodeAccess = allEpisodeAccess.filter(entry => manageableShowIds.has(entry.showId));

        setShows(manageableShows);
        setEpisodes(allEpisodes);
        setUsers(allUsers);
        setShowAccess(filteredShowAccess);
        setEpisodeAccess(filteredEpisodeAccess);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, [user, router]);

  const handleSearchUser = async () => {
    if (!userIdentifier.trim()) {
      setFoundUser(null);
      return;
    }

    setIsSearching(true);
    setError('');
    setFoundUser(null);

    try {
      const trimmed = userIdentifier.trim().toLowerCase();
      let profile: UserProfile | null = null;

      // Try by email first
      if (trimmed.includes('@')) {
        const allUsers = await userService.getAll();
        profile = allUsers.find(u => u.email?.toLowerCase() === trimmed) || null;
      } else {
        // Try by username
        profile = await userService.getByUsername(trimmed);
      }

      if (profile) {
        setFoundUser(profile);
      } else {
        setError('User not found. Please check the email or username.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search user');
    } finally {
      setIsSearching(false);
    }
  };

  const handleGrantShowAccess = async () => {
    if (!foundUser || !selectedShowId) return;

    setError('');
    setSuccess('');

    try {
      const entry = await showAccessService.setAccess(selectedShowId, foundUser.id, selectedRole);
      setShowAccess(prev => {
        const without = prev.filter(item => item.id !== entry.id);
        return [...without, entry];
      });
      setSuccess(`Access granted to ${foundUser.name} for ${selectedShow?.name}`);
      setUserIdentifier('');
      setFoundUser(null);
      setSelectedShowId('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to grant access');
    }
  };

  const handleGrantEpisodeAccess = async () => {
    if (!foundUser || !selectedShowId || selectedEpisodeIds.length === 0) return;

    setError('');
    setSuccess('');

    try {
      const promises = selectedEpisodeIds.map(episodeId =>
        episodeAccessService.setAccess(selectedShowId, episodeId, foundUser.id, selectedRole)
      );
      const entries = await Promise.all(promises);
      
      setEpisodeAccess(prev => {
        const without = prev.filter(item => 
          !selectedEpisodeIds.includes(item.episodeId) || item.userId !== foundUser.id
        );
        return [...without, ...entries];
      });
      
      setSuccess(`Access granted to ${foundUser.name} for ${selectedEpisodeIds.length} episode(s)`);
      setUserIdentifier('');
      setFoundUser(null);
      setSelectedShowId('');
      setSelectedEpisodeIds([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to grant access');
    }
  };

  const handleRemoveShowAccess = async (accessId: string) => {
    try {
      await showAccessService.removeAccess(accessId);
      setShowAccess(prev => prev.filter(item => item.id !== accessId));
      setSuccess('Access removed successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove access');
    }
  };

  const handleRemoveEpisodeAccess = async (accessId: string) => {
    try {
      await episodeAccessService.removeAccess(accessId);
      setEpisodeAccess(prev => prev.filter(item => item.id !== accessId));
      setSuccess('Access removed successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove access');
    }
  };

  const toggleEpisodeSelection = (episodeId: string) => {
    setSelectedEpisodeIds(prev =>
      prev.includes(episodeId)
        ? prev.filter(id => id !== episodeId)
        : [...prev, episodeId]
    );
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
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Button
            variant="secondary"
            onClick={() => router.push('/app')}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to App
          </Button>
          <h1 className="text-3xl font-semibold text-gray-900">Collaboration</h1>
          <p className="text-sm text-gray-600 mt-2">Manage access permissions for shows and episodes</p>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center gap-2">
            <Check className="w-5 h-5" />
            {success}
          </div>
        )}

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Grant Access</CardTitle>
            <CardDescription>Invite users by email or username and set their permissions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* User Search */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                User Email or Username
              </label>
              <div className="flex gap-2">
                <Input
                  value={userIdentifier}
                  onChange={(e) => setUserIdentifier(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSearchUser();
                    }
                  }}
                  placeholder="Enter email or username"
                  className="flex-1"
                />
                <Button onClick={handleSearchUser} disabled={isSearching || !userIdentifier.trim()}>
                  {isSearching ? 'Searching...' : 'Search'}
                </Button>
              </div>
              {foundUser && (
                <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{foundUser.name}</p>
                      <p className="text-xs text-gray-500">@{foundUser.username} · {foundUser.email}</p>
                    </div>
                    <Check className="w-5 h-5 text-green-600" />
                  </div>
                </div>
              )}
            </div>

            {/* Access Type Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Access Type
              </label>
              <div className="flex gap-2">
                <Button
                  variant={accessType === 'show' ? 'default' : 'secondary'}
                  onClick={() => {
                    setAccessType('show');
                    setSelectedEpisodeIds([]);
                  }}
                >
                  Show Access
                </Button>
                <Button
                  variant={accessType === 'episode' ? 'default' : 'secondary'}
                  onClick={() => {
                    setAccessType('episode');
                  }}
                >
                  Episode Access
                </Button>
              </div>
            </div>

            {/* Show Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Show
              </label>
              <select
                value={selectedShowId}
                onChange={(e) => {
                  setSelectedShowId(e.target.value);
                  setSelectedEpisodeIds([]);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="">Select a show</option>
                {shows.map(show => (
                  <option key={show.id} value={show.id}>{show.name}</option>
                ))}
              </select>
            </div>

            {/* Episode Selection (only for episode access) */}
            {accessType === 'episode' && selectedShowId && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Episodes (select one or more)
                </label>
                <div className="max-h-48 overflow-y-auto border border-gray-300 rounded-lg p-2 space-y-2">
                  {showEpisodes.length === 0 ? (
                    <p className="text-sm text-gray-500 p-2">No episodes in this show</p>
                  ) : (
                    showEpisodes.map(episode => (
                      <label
                        key={episode.id}
                        className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedEpisodeIds.includes(episode.id)}
                          onChange={() => toggleEpisodeSelection(episode.id)}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm text-gray-900">
                          {episode.episodeNumber === 'intro' ? 'Intro' : `Episode ${episode.episodeNumber}`}: {episode.title}
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Role Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Permission Level
              </label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as PermissionRole)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                {roleOptions.map(role => (
                  <option key={role} value={role}>
                    {role === 'editor' && 'Editor - Can edit everything'}
                    {role === 'commenter' && 'Commenter - Can add comments only'}
                    {role === 'viewer' && 'Viewer - Read-only access'}
                  </option>
                ))}
              </select>
            </div>

            {/* Grant Button */}
            {foundUser && (
              <Button
                onClick={accessType === 'show' ? handleGrantShowAccess : handleGrantEpisodeAccess}
                disabled={
                  !selectedShowId ||
                  (accessType === 'episode' && selectedEpisodeIds.length === 0)
                }
                className="w-full gap-2"
              >
                <UserPlus className="w-4 h-4" />
                Grant {accessType === 'show' ? 'Show' : 'Episode'} Access
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Show Access List */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Show Access</CardTitle>
            <CardDescription>Users with access to entire shows</CardDescription>
          </CardHeader>
          <CardContent>
            {showAccess.length === 0 ? (
              <p className="text-sm text-gray-500">No show access granted yet</p>
            ) : (
              <div className="space-y-3">
                {shows.map(show => {
                  const showAccessEntries = showAccess.filter(entry => entry.showId === show.id);
                  if (showAccessEntries.length === 0) return null;
                  
                  return (
                    <div key={show.id} className="border rounded-lg p-4">
                      <h3 className="text-sm font-semibold text-gray-900 mb-3">{show.name}</h3>
                      <div className="space-y-2">
                        {showAccessEntries.map(entry => {
                          const member = users.find(u => u.id === entry.userId);
                          return (
                            <div key={entry.id} className="flex items-center justify-between border-b pb-2 last:border-b-0">
                              <div>
                                <p className="text-sm text-gray-900">{member?.name || entry.userId}</p>
                                <p className="text-xs text-gray-500">@{member?.username || 'unknown'} · {entry.role}</p>
                              </div>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => handleRemoveShowAccess(entry.id)}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Episode Access List */}
        <Card>
          <CardHeader>
            <CardTitle>Episode Access</CardTitle>
            <CardDescription>Users with access to specific episodes</CardDescription>
          </CardHeader>
          <CardContent>
            {episodeAccess.length === 0 ? (
              <p className="text-sm text-gray-500">No episode-specific access granted yet</p>
            ) : (
              <div className="space-y-3">
                {shows.map(show => {
                  const episodeAccessEntries = episodeAccess.filter(entry => entry.showId === show.id);
                  if (episodeAccessEntries.length === 0) return null;
                  
                  return (
                    <div key={show.id} className="border rounded-lg p-4">
                      <h3 className="text-sm font-semibold text-gray-900 mb-3">{show.name}</h3>
                      <div className="space-y-2">
                        {episodeAccessEntries.map(entry => {
                          const episode = episodes.find(ep => ep.id === entry.episodeId);
                          const member = users.find(u => u.id === entry.userId);
                          return (
                            <div key={entry.id} className="flex items-center justify-between border-b pb-2 last:border-b-0">
                              <div>
                                <p className="text-sm text-gray-900">
                                  {member?.name || entry.userId} · {episode?.title || entry.episodeId}
                                </p>
                                <p className="text-xs text-gray-500">@{member?.username || 'unknown'} · {entry.role}</p>
                              </div>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => handleRemoveEpisodeAccess(entry.id)}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
