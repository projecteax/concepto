'use client';

import React, { useState } from 'react';
import { Show, GlobalAsset, AssetCategory } from '@/types';
import { 
  ArrowLeft, 
  Users, 
  MapPin, 
  Wrench, 
  Image, 
  Mountain,
  Plus,
  Edit3,
  Trash2,
  Eye
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface GlobalAssetsManagerProps {
  show: Show;
  globalAssets: GlobalAsset[];
  selectedCategory: AssetCategory | 'all';
  onBack: () => void;
  onSelectCategory: (category: AssetCategory | 'all') => void;
  onSelectAsset: (asset: GlobalAsset) => void;
  onAddAsset: (asset: Omit<GlobalAsset, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onEditAsset: (asset: GlobalAsset) => void;
  onDeleteAsset: (assetId: string) => void;
}

const categoryIcons = {
  character: Users,
  location: MapPin,
  gadget: Wrench,
  texture: Image,
  background: Mountain,
};

const categoryLabels = {
  character: 'Characters',
  location: 'Locations',
  gadget: 'Gadgets',
  texture: 'Textures',
  background: 'Backgrounds',
};

export function GlobalAssetsManager({
  show,
  globalAssets,
  selectedCategory,
  onBack,
  onSelectCategory,
  onSelectAsset,
  onAddAsset,
  onEditAsset,
  onDeleteAsset
}: GlobalAssetsManagerProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newAssetName, setNewAssetName] = useState('');
  const [newAssetCategory, setNewAssetCategory] = useState<AssetCategory>('character');
  const [newAssetDescription, setNewAssetDescription] = useState('');

  const filteredAssets = selectedCategory === 'all' 
    ? globalAssets 
    : globalAssets.filter(asset => asset.category === selectedCategory);

  const getCategoryCount = (category: AssetCategory) => {
    return globalAssets.filter(asset => asset.category === category).length;
  };

  const handleAddAsset = () => {
    if (newAssetName.trim()) {
      onAddAsset({
        showId: show.id,
        name: newAssetName.trim(),
        description: newAssetDescription.trim() || undefined,
        category: newAssetCategory,
        concepts: [],
      });
      setNewAssetName('');
      setNewAssetDescription('');
      setShowAddForm(false);
    }
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
    }).format(date);
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
                <h1 className="text-2xl font-bold text-gray-900">Global Assets</h1>
                <p className="text-sm text-gray-600">{show.name}</p>
              </div>
            </div>
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Add Asset</span>
            </button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8">
        <div className="flex gap-8">
          {/* Sidebar */}
          <div className="w-64 flex-shrink-0">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Categories</h2>
              
              <div className="space-y-2">
                <button
                  onClick={() => onSelectCategory('all')}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg transition-colors",
                    selectedCategory === 'all'
                      ? "bg-indigo-100 text-indigo-700"
                      : "text-gray-700 hover:bg-gray-100"
                  )}
                >
                  <span>All Assets</span>
                  <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded-full">
                    {globalAssets.length}
                  </span>
                </button>

                {Object.entries(categoryLabels).map(([category, label]) => {
                  const Icon = categoryIcons[category as AssetCategory];
                  const count = getCategoryCount(category as AssetCategory);
                  
                  return (
                    <button
                      key={category}
                      onClick={() => onSelectCategory(category as AssetCategory)}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg transition-colors",
                        selectedCategory === category
                          ? "bg-indigo-100 text-indigo-700"
                          : "text-gray-700 hover:bg-gray-100"
                      )}
                    >
                      <div className="flex items-center space-x-3">
                        <Icon className="w-4 h-4" />
                        <span>{label}</span>
                      </div>
                      <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded-full">
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1">
            {filteredAssets.length === 0 ? (
              <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Plus className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No assets yet</h3>
                <p className="text-gray-600 mb-4">
                  {selectedCategory === 'all' 
                    ? 'Create your first global asset to get started.'
                    : `No ${categoryLabels[selectedCategory as AssetCategory]?.toLowerCase()} found.`
                  }
                </p>
                <button
                  onClick={() => setShowAddForm(true)}
                  className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors mx-auto"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Asset</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredAssets.map((asset) => (
                  <div
                    key={asset.id}
                    className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
                  >
                    <div className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center space-x-3">
                          {React.createElement(categoryIcons[asset.category], {
                            className: "w-5 h-5 text-indigo-600"
                          })}
                          <h3 className="font-semibold text-gray-900">{asset.name}</h3>
                        </div>
                        <div className="flex space-x-1">
                          <button
                            onClick={() => onSelectAsset(asset)}
                            className="p-1 text-gray-400 hover:text-gray-600"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onEditAsset(asset)}
                            className="p-1 text-gray-400 hover:text-gray-600"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onDeleteAsset(asset.id)}
                            className="p-1 text-gray-400 hover:text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {asset.description && (
                        <p className="text-gray-600 mb-4 line-clamp-2">{asset.description}</p>
                      )}

                      <div className="flex items-center justify-between text-sm text-gray-500">
                        <span>{asset.concepts.length} concepts</span>
                        <span>{formatDate(asset.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Asset Modal */}
      {showAddForm && (
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
                    onChange={(e) => setNewAssetCategory(e.target.value as AssetCategory)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    {Object.entries(categoryLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description (Optional)
                  </label>
                  <textarea
                    value={newAssetDescription}
                    onChange={(e) => setNewAssetDescription(e.target.value)}
                    placeholder="Enter asset description..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                    rows={3}
                  />
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
