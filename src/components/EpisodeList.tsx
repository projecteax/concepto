'use client';

import { useState } from 'react';
import { Show, Episode } from '@/types';
import { 
  Plus, 
  Play, 
  Edit3, 
  Trash2,
  FileText,
  Users,
  MapPin,
  Calendar
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AppBreadcrumbHeader } from './AppBreadcrumbHeader';
import { useBasePath } from '@/hooks/useBasePath';

interface EpisodeListProps {
  show: Show;
  episodes: Episode[];
  onBack: () => void;
  onSelectEpisode: (episode: Episode) => void;
  onAddEpisode: (episode: Omit<Episode, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onEditEpisode: (episode: Episode) => void;
  onDeleteEpisode: (episodeId: string) => void;
}

export function EpisodeList({
  show,
  episodes,
  onBack,
  onSelectEpisode,
  onAddEpisode,
  onEditEpisode,
  onDeleteEpisode
}: EpisodeListProps) {
  const basePath = useBasePath();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEpisodeTitle, setNewEpisodeTitle] = useState('');
  const [newEpisodeNumber, setNewEpisodeNumber] = useState(1);
  const [newEpisodeDescription, setNewEpisodeDescription] = useState('');

  const sortedEpisodes = [...episodes].sort((a, b) => a.episodeNumber - b.episodeNumber);

  const handleAddEpisode = () => {
    if (newEpisodeTitle.trim()) {
      const episodeData: Omit<Episode, 'id' | 'createdAt' | 'updatedAt'> = {
        showId: show.id,
        title: newEpisodeTitle.trim(),
        episodeNumber: newEpisodeNumber,
        characters: [],
        locations: [],
        scenes: [],
      };
      
      // Only add description if it's not empty
      if (newEpisodeDescription.trim()) {
        episodeData.description = newEpisodeDescription.trim();
      }
      
      onAddEpisode(episodeData);
      setNewEpisodeTitle('');
      setNewEpisodeNumber(1);
      setNewEpisodeDescription('');
      setShowAddForm(false);
    }
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  };

  const getNextEpisodeNumber = () => {
    if (episodes.length === 0) return 1;
    return Math.max(...episodes.map(e => e.episodeNumber)) + 1;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <AppBreadcrumbHeader
        coverImageUrl={show.coverImageUrl}
        logoUrl={show.logoUrl}
        backHref={`${basePath}/shows/${show.id}`}
        items={[
          { label: show.name, href: `${basePath}/shows/${show.id}` },
          { label: 'Episodes' },
        ]}
        subtitle="All episodes for this show"
        actions={
          <button
            onClick={() => {
              setNewEpisodeNumber(getNextEpisodeNumber());
              setShowAddForm(true);
            }}
            className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add Episode</span>
          </button>
        }
      />

      <div className="container mx-auto px-6 py-8">
        {episodes.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Play className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No episodes yet</h3>
            <p className="text-gray-600 mb-4">
              Create your first episode to start building your show&apos;s story.
            </p>
            <button
              onClick={() => {
                setNewEpisodeNumber(getNextEpisodeNumber());
                setShowAddForm(true);
              }}
              className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors mx-auto"
            >
              <Plus className="w-4 h-4" />
              <span>Add First Episode</span>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {sortedEpisodes.map((episode) => (
              <div
                key={episode.id}
                className="bg-white rounded-lg border border-gray-200 hover:shadow-md hover:border-gray-300 transition-all cursor-pointer group"
                onClick={() => onSelectEpisode(episode)}
              >
                <div className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-4 mb-3">
                        <div className="flex items-center space-x-2">
                          <div className="w-8 h-8 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-sm font-semibold">
                            {episode.episodeNumber}
                          </div>
                          <h3 className="text-xl font-semibold text-gray-900 group-hover:text-green-600 transition-colors">{episode.title}</h3>
                        </div>
                        <div className="flex items-center space-x-4 text-sm text-gray-500">
                          <div className="flex items-center space-x-1">
                            <Users className="w-4 h-4" />
                            <span>{episode.characters.length} characters</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <MapPin className="w-4 h-4" />
                            <span>{episode.locations.length} locations</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <FileText className="w-4 h-4" />
                            <span>{episode.script ? 'Script ready' : 'No script'}</span>
                          </div>
                        </div>
                      </div>

                      {episode.description && (
                        <p className="text-gray-600 mb-4 line-clamp-2">{episode.description}</p>
                      )}

                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4 text-sm text-gray-500">
                          <div className="flex items-center space-x-1">
                            <Calendar className="w-4 h-4" />
                            <span>Created {formatDate(episode.createdAt)}</span>
                          </div>
                          {new Date(episode.updatedAt).getTime() !== new Date(episode.createdAt).getTime() && (
                            <span>Updated {formatDate(episode.updatedAt)}</span>
                          )}
                        </div>

                        <div className="flex items-center space-x-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditEpisode(episode);
                            }}
                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Edit episode"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteEpisode(episode.id);
                            }}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Delete episode"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Episode Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Add New Episode</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Episode Number
                  </label>
                  <input
                    type="number"
                    value={newEpisodeNumber}
                    onChange={(e) => setNewEpisodeNumber(parseInt(e.target.value) || 1)}
                    min="1"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Episode Title
                  </label>
                  <input
                    type="text"
                    value={newEpisodeTitle}
                    onChange={(e) => setNewEpisodeTitle(e.target.value)}
                    placeholder="Enter episode title..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description (Optional)
                  </label>
                  <textarea
                    value={newEpisodeDescription}
                    onChange={(e) => setNewEpisodeDescription(e.target.value)}
                    placeholder="Enter episode description..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                    rows={3}
                  />
                </div>
                <div className="flex space-x-3">
                  <button
                    onClick={handleAddEpisode}
                    disabled={!newEpisodeTitle.trim()}
                    className={cn(
                      "flex-1 px-4 py-2 rounded-lg font-medium transition-colors",
                      newEpisodeTitle.trim()
                        ? "bg-green-600 text-white hover:bg-green-700"
                        : "bg-gray-100 text-gray-400 cursor-not-allowed"
                    )}
                  >
                    Add Episode
                  </button>
                  <button
                    onClick={() => setShowAddForm(false)}
                    className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
