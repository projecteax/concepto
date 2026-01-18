'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Episode, EpisodeAccess, PermissionRole, Show, ShowAccess, UserProfile } from '@/types';
import { episodeService, showAccessService, showService, userService, episodeAccessService } from '@/lib/firebase-services';
import { isAdminUser } from '@/lib/access-control';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const roleOptions: PermissionRole[] = ['editor', 'commenter', 'viewer'];

export default function AdminPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [shows, setShows] = useState<Show[]>([]);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [showAccess, setShowAccess] = useState<ShowAccess[]>([]);
  const [episodeAccess, setEpisodeAccess] = useState<EpisodeAccess[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedShowId, setSelectedShowId] = useState('');
  const [selectedEpisodeId, setSelectedEpisodeId] = useState('');
  const [selectedRole, setSelectedRole] = useState<PermissionRole>('viewer');

  const selectedShow = useMemo(() => shows.find(show => show.id === selectedShowId), [shows, selectedShowId]);
  const showEpisodes = useMemo(() => episodes.filter(ep => ep.showId === selectedShowId), [episodes, selectedShowId]);

  useEffect(() => {
    if (user === null) {
      return;
    }
    if (user && !isAdminUser(user)) {
      router.push('/app');
      return;
    }
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [usersData, showsData, episodesData, showAccessData, episodeAccessData] = await Promise.all([
          userService.getAll(),
          showService.getAll(),
          episodeService.getAll(),
          showAccessService.getAll(),
          episodeAccessService.getAll(),
        ]);
        setUsers(usersData);
        setShows(showsData);
        setEpisodes(episodesData);
        setShowAccess(showAccessData);
        setEpisodeAccess(episodeAccessData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load admin data');
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, [router, user]);

  const handleRoleChange = async (userId: string, role: UserProfile['role']) => {
    await userService.updateRole(userId, role);
    setUsers(prev => prev.map(item => (item.id === userId ? { ...item, role } : item)));
  };

  const handleSetShowAccess = async () => {
    if (!selectedUserId || !selectedShowId) return;
    const entry = await showAccessService.setAccess(selectedShowId, selectedUserId, selectedRole);
    setShowAccess(prev => {
      const without = prev.filter(item => item.id !== entry.id);
      return [...without, entry];
    });
  };

  const handleRemoveShowAccess = async (accessId: string) => {
    await showAccessService.removeAccess(accessId);
    setShowAccess(prev => prev.filter(item => item.id !== accessId));
  };

  const handleSetEpisodeAccess = async () => {
    if (!selectedUserId || !selectedShowId || !selectedEpisodeId) return;
    const entry = await episodeAccessService.setAccess(selectedShowId, selectedEpisodeId, selectedUserId, selectedRole);
    setEpisodeAccess(prev => {
      const without = prev.filter(item => item.id !== entry.id);
      return [...without, entry];
    });
  };

  const handleRemoveEpisodeAccess = async (accessId: string) => {
    await episodeAccessService.removeAccess(accessId);
    setEpisodeAccess(prev => prev.filter(item => item.id !== accessId));
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  if (!isAdminUser(user)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Redirecting...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Admin Panel</h1>
            <p className="text-sm text-gray-600">Manage users, permissions, and access control</p>
          </div>
          <Button onClick={() => router.push('/app')}>Back to App</Button>
        </div>

        {error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        ) : null}

        {isLoading ? (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <p className="text-gray-600">Loading admin data...</p>
          </div>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Users</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {users.map(item => (
                    <div key={item.id} className="flex items-center justify-between border-b pb-2 last:border-b-0">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{item.name}</p>
                        <p className="text-xs text-gray-500">@{item.username} · {item.email}</p>
                      </div>
                      <div>
                        <select
                          value={item.role}
                          onChange={(e) => handleRoleChange(item.id, e.target.value as UserProfile['role'])}
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        >
                          <option value="admin">admin</option>
                          <option value="user">user</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Grant Show Access</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">User</label>
                    <select
                      value={selectedUserId}
                      onChange={(e) => setSelectedUserId(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      <option value="">Select user</option>
                      {users.map(item => (
                        <option key={item.id} value={item.id}>
                          {item.name} (@{item.username})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Show</label>
                    <select
                      value={selectedShowId}
                      onChange={(e) => {
                        setSelectedShowId(e.target.value);
                        setSelectedEpisodeId('');
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      <option value="">Select show</option>
                      {shows.map(show => (
                        <option key={show.id} value={show.id}>{show.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                    <select
                      value={selectedRole}
                      onChange={(e) => setSelectedRole(e.target.value as PermissionRole)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      {roleOptions.map(role => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                    </select>
                  </div>
                  <Button onClick={handleSetShowAccess}>Grant</Button>
                </div>

                {selectedShow ? (
                  <div className="mt-4">
                    <h3 className="text-sm font-semibold text-gray-800 mb-2">Current access for {selectedShow.name}</h3>
                    <div className="space-y-2">
                      {showAccess.filter(entry => entry.showId === selectedShow.id).map(entry => {
                        const member = users.find(u => u.id === entry.userId);
                        return (
                          <div key={entry.id} className="flex items-center justify-between border-b pb-2 last:border-b-0">
                            <div>
                              <p className="text-sm text-gray-900">{member?.name || entry.userId}</p>
                              <p className="text-xs text-gray-500">{entry.role}</p>
                            </div>
                            <Button variant="secondary" onClick={() => handleRemoveShowAccess(entry.id)}>Remove</Button>
                          </div>
                        );
                      })}
                      {showAccess.filter(entry => entry.showId === selectedShow.id).length === 0 && (
                        <p className="text-sm text-gray-500">No shared access yet.</p>
                      )}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Grant Episode Access</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">User</label>
                    <select
                      value={selectedUserId}
                      onChange={(e) => setSelectedUserId(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      <option value="">Select user</option>
                      {users.map(item => (
                        <option key={item.id} value={item.id}>
                          {item.name} (@{item.username})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Show</label>
                    <select
                      value={selectedShowId}
                      onChange={(e) => {
                        setSelectedShowId(e.target.value);
                        setSelectedEpisodeId('');
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      <option value="">Select show</option>
                      {shows.map(show => (
                        <option key={show.id} value={show.id}>{show.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Episode</label>
                    <select
                      value={selectedEpisodeId}
                      onChange={(e) => setSelectedEpisodeId(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      disabled={!selectedShowId}
                    >
                      <option value="">Select episode</option>
                      {showEpisodes.map(ep => (
                        <option key={ep.id} value={ep.id}>{ep.title}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                    <select
                      value={selectedRole}
                      onChange={(e) => setSelectedRole(e.target.value as PermissionRole)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      {roleOptions.map(role => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                    </select>
                  </div>
                  <Button onClick={handleSetEpisodeAccess}>Grant</Button>
                </div>

                {selectedShow ? (
                  <div className="mt-4">
                    <h3 className="text-sm font-semibold text-gray-800 mb-2">Episode access for {selectedShow.name}</h3>
                    <div className="space-y-2">
                      {episodeAccess.filter(entry => entry.showId === selectedShow.id).map(entry => {
                        const member = users.find(u => u.id === entry.userId);
                        const episode = episodes.find(ep => ep.id === entry.episodeId);
                        return (
                          <div key={entry.id} className="flex items-center justify-between border-b pb-2 last:border-b-0">
                            <div>
                              <p className="text-sm text-gray-900">
                                {member?.name || entry.userId} · {episode?.title || entry.episodeId}
                              </p>
                              <p className="text-xs text-gray-500">{entry.role}</p>
                            </div>
                            <Button variant="secondary" onClick={() => handleRemoveEpisodeAccess(entry.id)}>Remove</Button>
                          </div>
                        );
                      })}
                      {episodeAccess.filter(entry => entry.showId === selectedShow.id).length === 0 && (
                        <p className="text-sm text-gray-500">No episode-specific access entries.</p>
                      )}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
