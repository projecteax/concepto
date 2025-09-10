'use client';

import { useState } from 'react';
import { Show, GlobalAsset, Episode } from '@/types';
import { 
  ArrowLeft, 
  Users, 
  MapPin, 
  Wrench, 
  Image, 
  Mountain,
  Play,
  Plus,
  FolderOpen
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ShowDashboardProps {
  show: Show;
  globalAssets: GlobalAsset[];
  episodes: Episode[];
  onBack: () => void;
  onSelectGlobalAssets: () => void;
  onSelectEpisodes: () => void;
  onAddGlobalAsset: (asset: Omit<GlobalAsset, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onAddEpisode: (episode: Omit<Episode, 'id' | 'createdAt' | 'updatedAt'>) => void;
}

const assetIcons = {
  character: Users,
  location: MapPin,
  gadget: Wrench,
  texture: Image,
  background: Mountain,
};

const assetLabels = {
  character: 'Characters',
  location: 'Locations',
  gadget: 'Gadgets',
  texture: 'Textures',
  background: 'Backgrounds',
};

export function ShowDashboard({
  show,
  globalAssets,
  episodes,
  onBack,
  onSelectGlobalAssets,
  onSelectEpisodes,
  onAddGlobalAsset,
  onAddEpisode
}: ShowDashboardProps) {
  const [showAddAsset, setShowAddAsset] = useState(false);
  const [showAddEpisode, setShowAddEpisode] = useState(false);
  const [newAssetName, setNewAssetName] = useState('');
  const [newAssetCategory, setNewAssetCategory] = useState<'character' | 'location' | 'gadget' | 'texture' | 'background'>('character');
  const [newEpisodeTitle, setNewEpisodeTitle] = useState('');
  const [newEpisodeNumber, setNewEpisodeNumber] = useState(1);

  const getAssetCount = (category: keyof typeof assetLabels) => {
    return globalAssets.filter(asset => asset.category === category).length;
  };

  const handleAddAsset = () => {
    if (newAssetName.trim()) {
      onAddGlobalAsset({
        showId: show.id,
        name: newAssetName.trim(),
        category: newAssetCategory,
        concepts: [],
      });
      setNewAssetName('');
      setShowAddAsset(false);
    }
  };

  const handleAddEpisode = () => {
    if (newEpisodeTitle.trim()) {
      onAddEpisode({
        showId: show.id,
        title: newEpisodeTitle.trim(),
        episodeNumber: newEpisodeNumber,
        characters: [],
        locations: [],
      });
      setNewEpisodeTitle('');
      setNewEpisodeNumber(1);
      setShowAddEpisode(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={onBack}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{show.name}</h1>
                <p className="text-sm text-gray-600">Show Dashboard</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8">
        {/* Show Description */}
        {show.description && (
          <div className="mb-8 p-6 bg-white rounded-lg border border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Description</h2>
            <p className="text-gray-600">{show.description}</p>
          </div>
        )}

        {/* Main Navigation */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Global Assets Section */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <FolderOpen className="w-6 h-6 text-indigo-600" />
                <h2 className="text-xl font-semibold text-gray-900">Global Assets</h2>
              </div>
              <button
                onClick={() => setShowAddAsset(true)}
                className="flex items-center space-x-2 px-3 py-1 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Add Asset</span>
              </button>
            </div>

            <p className="text-gray-600 mb-6">
              Manage characters, locations, gadgets, textures, and backgrounds that will be used across the show.
            </p>

            {/* Asset Categories */}
            <div className="space-y-3 mb-6">
              {Object.entries(assetLabels).map(([category, label]) => {
                const Icon = assetIcons[category as keyof typeof assetIcons];
                const count = getAssetCount(category as keyof typeof assetLabels);
                
                return (
                  <div
                    key={category}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                    onClick={onSelectGlobalAssets}
                  >
                    <div className="flex items-center space-x-3">
                      <Icon className="w-5 h-5 text-gray-600" />
                      <span className="font-medium text-gray-900">{label}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-500">{count} items</span>
                      <span className="text-gray-400">→</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              onClick={onSelectGlobalAssets}
              className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <FolderOpen className="w-5 h-5" />
              <span>Manage Global Assets</span>
            </button>
          </div>

          {/* Episodes Section */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <Play className="w-6 h-6 text-green-600" />
                <h2 className="text-xl font-semibold text-gray-900">Episodes</h2>
              </div>
              <button
                onClick={() => setShowAddEpisode(true)}
                className="flex items-center space-x-2 px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Add Episode</span>
              </button>
            </div>

            <p className="text-gray-600 mb-6">
              Create and manage episodes with scripts, character lists, and location details.
            </p>

            {/* Recent Episodes */}
            <div className="space-y-3 mb-6">
              {episodes.slice(0, 3).map((episode) => (
                <div
                  key={episode.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div>
                    <h4 className="font-medium text-gray-900">Episode {episode.episodeNumber}</h4>
                    <p className="text-sm text-gray-600">{episode.title}</p>
                  </div>
                  <span className="text-sm text-gray-500">
                    {episode.characters.length} characters
                  </span>
                </div>
              ))}
              
              {episodes.length === 0 && (
                <div className="text-center py-6 text-gray-500">
                  <Play className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                  <p className="text-sm">No episodes yet</p>
                </div>
              )}
            </div>

            <button
              onClick={onSelectEpisodes}
              className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Play className="w-5 h-5" />
              <span>Manage Episodes</span>
            </button>
          </div>
        </div>

        {/* Add Asset Modal */}
        {showAddAsset && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg max-w-md w-full mx-4">
              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Add New Asset</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Asset Name
                    </label>
                    <input
                      type="text"
                      value={newAssetName}
                      onChange={(e) => setNewAssetName(e.target.value)}
                      placeholder="Enter asset name..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Category
                    </label>
                    <select
                      value={newAssetCategory}
                      onChange={(e) => setNewAssetCategory(e.target.value as any)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    >
                      {Object.entries(assetLabels).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex space-x-3">
                    <button
                      onClick={handleAddAsset}
                      disabled={!newAssetName.trim()}
                      className={cn(
                        "flex-1 px-4 py-2 rounded-lg font-medium transition-colors",
                        newAssetName.trim()
                          ? "bg-indigo-600 text-white hover:bg-indigo-700"
                          : "bg-gray-100 text-gray-400 cursor-not-allowed"
                      )}
                    >
                      Add Asset
                    </button>
                    <button
                      onClick={() => setShowAddAsset(false)}
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

        {/* Add Episode Modal */}
        {showAddEpisode && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg max-w-md w-full mx-4">
              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Add New Episode</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Episode Title
                    </label>
                    <input
                      type="text"
                      value={newEpisodeTitle}
                      onChange={(e) => setNewEpisodeTitle(e.target.value)}
                      placeholder="Enter episode title..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Episode Number
                    </label>
                    <input
                      type="number"
                      value={newEpisodeNumber}
                      onChange={(e) => setNewEpisodeNumber(parseInt(e.target.value) || 1)}
                      min="1"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
                      onClick={() => setShowAddEpisode(false)}
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
    </div>
  );
}
