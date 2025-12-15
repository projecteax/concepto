'use client';

import { useState } from 'react';
import { Show } from '@/types';
import { Plus, Play, Edit3, Trash2, Archive, ArchiveRestore } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ShowSelectionProps {
  shows: Show[];
  onSelectShow: (show: Show) => void;
  onAddShow: (show: Omit<Show, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onEditShow: (show: Show) => void;
  onDeleteShow: (showId: string) => void;
  onArchiveShow: (showId: string, archived: boolean) => void;
}

export function ShowSelection({
  shows,
  onSelectShow,
  onAddShow,
  onEditShow,
  onDeleteShow,
  onArchiveShow
}: ShowSelectionProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newShowName, setNewShowName] = useState('');
  const [newShowDescription, setNewShowDescription] = useState('');
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');

  const handleAddShow = () => {
    if (newShowName.trim()) {
      onAddShow({
        name: newShowName.trim(),
        description: newShowDescription.trim() || undefined,
      });
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
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50">
      <div className="container mx-auto px-6 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Concepto</h1>
          <p className="text-xl text-gray-600">Kids TV Show Concept Art Manager</p>
        </div>

        {/* Shows Grid */}
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-semibold text-gray-900">Your Shows</h2>
            {activeTab === 'active' && (
              <button
                onClick={() => setShowAddForm(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Add New Show</span>
              </button>
            )}
          </div>

          {/* Add Show Form */}
          {showAddForm && (
            <div className="mb-8 p-6 bg-white rounded-lg border border-gray-200 shadow-sm">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Add New Show</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Show Name
                  </label>
                  <input
                    type="text"
                    value={newShowName}
                    onChange={(e) => setNewShowName(e.target.value)}
                    placeholder="Enter show name..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description (Optional)
                  </label>
                  <textarea
                    value={newShowDescription}
                    onChange={(e) => setNewShowDescription(e.target.value)}
                    placeholder="Enter show description..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                    rows={3}
                  />
                </div>
                <div className="flex space-x-3">
                  <button
                    onClick={handleAddShow}
                    disabled={!newShowName.trim()}
                    className={cn(
                      "px-4 py-2 rounded-lg font-medium transition-colors",
                      newShowName.trim()
                        ? "bg-indigo-600 text-white hover:bg-indigo-700"
                        : "bg-gray-100 text-gray-400 cursor-not-allowed"
                    )}
                  >
                    Add Show
                  </button>
                  <button
                    onClick={() => setShowAddForm(false)}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Shows Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredShows.map((show) => (
              <div
                key={show.id}
                className="bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden"
              >
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <h3 className="text-xl font-semibold text-gray-900">{show.name}</h3>
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
                      <button
                        onClick={() => onDeleteShow(show.id)}
                        className="p-1 text-gray-400 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {show.description && (
                    <p className="text-gray-600 mb-4 line-clamp-3">{show.description}</p>
                  )}

                  <div className="text-sm text-gray-500 mb-4">
                    Created {formatDate(show.createdAt)}
                  </div>

                  <button
                    onClick={() => onSelectShow(show)}
                    className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    <Play className="w-4 h-4" />
                    <span>Open Show</span>
                  </button>
                </div>
              </div>
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
    </div>
  );
}
