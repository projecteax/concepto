'use client';

import { useState } from 'react';
import { Show } from '@/types';
import { Plus, Play, Edit3, Trash2, Archive, ArchiveRestore } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { isAdminUser } from '@/lib/access-control';

interface ShowSelectionProps {
  shows: Show[];
  onSelectShow: (show: Show) => void;
  onAddShow: (show: Omit<Show, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onEditShow: (show: Show) => void;
  onDeleteShow: (showId: string) => void;
  onArchiveShow: (showId: string, archived: boolean) => void;
  canEditShow?: (show: Show) => boolean;
  canCreateShow?: boolean;
}

export function ShowSelection({
  shows,
  onSelectShow,
  onAddShow,
  onEditShow,
  onDeleteShow,
  onArchiveShow,
  canEditShow = () => true,
  canCreateShow = true,
}: ShowSelectionProps) {
  const { user } = useAuth();
  const isAdmin = isAdminUser(user);
  
  const [showAddForm, setShowAddForm] = useState(false);
  const [newShowName, setNewShowName] = useState('');
  const [newShowDescription, setNewShowDescription] = useState('');
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');
  const [showToDelete, setShowToDelete] = useState<Show | null>(null);

  const handleAddShow = () => {
    if (newShowName.trim()) {
      const showData: { name: string; description?: string } = {
        name: newShowName.trim(),
      };
      // Only include description if it has a value (don't set undefined)
      const trimmedDescription = newShowDescription.trim();
      if (trimmedDescription) {
        showData.description = trimmedDescription;
      }
      onAddShow(showData);
      setNewShowName('');
      setNewShowDescription('');
      setShowAddForm(false);
    }
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date);
  };

  // Filter shows based on active tab
  const filteredShows = shows.filter(show => {
    const isArchived = show.archived === true;
    return activeTab === 'archived' ? isArchived : !isArchived;
  });

  return (
    <div className="studio-page">
      <div className="studio-container py-10 sm:py-12">
        {/* Header */}
        <div className="text-center mb-10 sm:mb-12">
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight mb-3">
            <span className="studio-gradient-text">Concepto Studio</span>
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto">
            Create shows, manage assets, and generate screenplays and narratives — all in one place.
          </p>
        </div>

        {/* Shows Grid */}
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Your Shows</h2>
              <p className="text-sm text-muted-foreground">Pick a show to continue working.</p>
            </div>
            {activeTab === 'active' && canCreateShow && (
              <Button onClick={() => setShowAddForm(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                <span>Add New Show</span>
              </Button>
            )}
          </div>

          {/* Add Show Form */}
          {showAddForm && (
            <Card className="mb-8">
              <CardHeader>
                <CardTitle>Add New Show</CardTitle>
                <CardDescription>Name it, add an optional description, and start creating.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Show Name
                  </label>
                  <Input
                    value={newShowName}
                    onChange={(e) => setNewShowName(e.target.value)}
                    placeholder="e.g. The Widgeteers"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Description (Optional)
                  </label>
                  <Textarea
                    value={newShowDescription}
                    onChange={(e) => setNewShowDescription(e.target.value)}
                    placeholder="Short pitch, target audience, main premise…"
                    rows={3}
                  />
                </div>
                <div className="flex space-x-3">
                  <Button
                    onClick={handleAddShow}
                    disabled={!newShowName.trim()}
                    className="gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Create
                  </Button>
                  <Button variant="secondary" onClick={() => setShowAddForm(false)}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Shows Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredShows.map((show) => (
              <Card key={show.id} className="studio-card-hover overflow-hidden">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="min-w-0 text-xl font-semibold truncate">{show.name}</h3>
                        {show.archived ? <Badge variant="secondary">Archived</Badge> : null}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">Created {formatDate(show.createdAt)}</div>
                    </div>
                    {canEditShow(show) ? (
                      <div className="flex space-x-1">
                        <button
                          onClick={() => onArchiveShow(show.id, !show.archived)}
                          className="p-1 text-gray-400 hover:text-gray-600"
                          title={show.archived ? 'Unarchive' : 'Archive'}
                        >
                          {show.archived ? (
                            <ArchiveRestore className="w-4 h-4" />
                          ) : (
                            <Archive className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={() => onEditShow(show)}
                          className="p-1 text-gray-400 hover:text-gray-600"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        {/* Only show delete button for admins, and only on archived shows */}
                        {isAdmin && show.archived && (
                          <button
                            onClick={() => setShowToDelete(show)}
                            className="p-1 text-gray-400 hover:text-red-600"
                            title="Delete show (admin only, archived shows only)"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ) : null}
                  </div>

                  <div className="mb-4">
                    {show.logoUrl ? (
                      <div className="h-32 w-32 mx-auto flex items-center justify-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={show.logoUrl} alt="" className="h-full w-full object-contain" />
                      </div>
                    ) : (
                      <div className="w-full h-32 rounded-xl border bg-muted overflow-hidden flex items-center justify-center">
                        <div className="h-16 w-16 rounded-2xl bg-primary/10 text-primary grid place-items-center text-xl font-semibold">
                          {show.name?.slice(0, 2)?.toUpperCase() || 'S'}
                        </div>
                      </div>
                    )}
                  </div>

                  {show.description && (
                    <p className="text-muted-foreground mb-4 line-clamp-3">{show.description}</p>
                  )}

                  <Button
                    onClick={() => onSelectShow(show)}
                    className="w-full gap-2"
                  >
                    <Play className="w-4 h-4" />
                    <span>Open Show</span>
                  </Button>
                </CardContent>
              </Card>
            ))}

            {/* Empty State */}
            {filteredShows.length === 0 && !showAddForm && (
              <div className="col-span-full flex flex-col items-center justify-center py-12 text-gray-500">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                  {activeTab === 'archived' ? (
                    <Archive className="w-8 h-8" />
                  ) : (
                    <Play className="w-8 h-8" />
                  )}
                </div>
                <h3 className="text-lg font-medium mb-2">
                  {activeTab === 'archived' ? 'No archived shows' : 'No shows yet'}
                </h3>
                <p className="text-sm text-center max-w-sm mb-4">
                  {activeTab === 'archived' 
                    ? 'Archived shows will appear here.'
                    : 'Create your first show to start organizing your concept art and episodes.'}
                </p>
                {activeTab === 'active' && (
                  <button
                    onClick={() => setShowAddForm(true)}
                    className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Your First Show</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Tabs at the bottom */}
          <div className="mt-8 flex justify-center">
            <div className="flex space-x-1 bg-white rounded-lg border border-gray-200 p-1 shadow-sm">
              <button
                onClick={() => setActiveTab('active')}
                className={cn(
                  "px-6 py-2 rounded-md text-sm font-medium transition-colors",
                  activeTab === 'active'
                    ? "bg-indigo-600 text-white"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                )}
              >
                Active
              </button>
              <button
                onClick={() => setActiveTab('archived')}
                className={cn(
                  "px-6 py-2 rounded-md text-sm font-medium transition-colors",
                  activeTab === 'archived'
                    ? "bg-indigo-600 text-white"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                )}
              >
                Archived
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {showToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>Delete Show</CardTitle>
              <CardDescription>
                Are you sure you want to permanently delete "{showToDelete.name}"? This action cannot be undone.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-end space-x-3">
              <Button
                variant="secondary"
                onClick={() => setShowToDelete(null)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  onDeleteShow(showToDelete.id);
                  setShowToDelete(null);
                }}
              >
                Delete
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
