'use client';

import React, { useState } from 'react';
import { Show, GlobalAsset, AssetCategory } from '@/types';
import { 
  Users, 
  MapPin, 
  Wrench, 
  Image, 
  Mountain,
  Car,
  Plus,
  Edit3,
  Trash2,
  Star
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AppBreadcrumbHeader } from './AppBreadcrumbHeader';
import { useBasePath } from '@/hooks/useBasePath';

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
  onToggleMainCharacter?: (characterId: string, isMain: boolean) => void | Promise<void>;
}

const categoryIcons = {
  character: Users,
  location: MapPin,
  gadget: Wrench,
  texture: Image,
  background: Mountain,
  vehicle: Car,
};

const categoryLabels = {
  character: 'Characters',
  location: 'Locations',
  gadget: 'Gadgets',
  texture: 'Textures',
  background: 'Backgrounds',
  vehicle: 'Vehicles', // Vehicle category
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
  onDeleteAsset,
  onToggleMainCharacter
}: GlobalAssetsManagerProps) {
  const basePath = useBasePath();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newAssetName, setNewAssetName] = useState('');
  const [newAssetCategory, setNewAssetCategory] = useState<AssetCategory>('character');
  const [newAssetDescription, setNewAssetDescription] = useState('');

  const filteredAssets = selectedCategory === 'all' 
    ? globalAssets 
    : globalAssets.filter(asset => asset.category === selectedCategory);

  const sortedAssets = [...filteredAssets].sort((a, b) => {
    // Starred characters always first (within current filter)
    const aMain = a.category === 'character' && a.isMainCharacter ? 1 : 0;
    const bMain = b.category === 'character' && b.isMainCharacter ? 1 : 0;
    if (aMain !== bMain) return bMain - aMain;

    // Otherwise newest first
    const aTime = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
    const bTime = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
    return bTime - aTime;
  });

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

  const getAssetThumbnailUrl = (asset: GlobalAsset) => {
    // Prefer explicit main fields if present, then fall back to first images in galleries/concepts.
    const anyAsset = asset as unknown as { mainImage?: string };
    return (
      anyAsset.mainImage ||
      asset.mainRender ||
      asset.galleryImages?.[0] ||
      asset.concepts?.find((c) => c.imageUrl)?.imageUrl ||
      ''
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <AppBreadcrumbHeader
        coverImageUrl={show.coverImageUrl}
        logoUrl={show.logoUrl}
        backHref={`${basePath}/shows/${show.id}`}
        items={[
          { label: show.name, href: `${basePath}/shows/${show.id}` },
          { label: 'Assets' },
        ]}
        subtitle="Global assets for this show"
        actions={
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add Asset</span>
          </button>
        }
      />

      <div className="studio-container py-6 sm:py-8">
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
          {/* Sidebar */}
          <div className="w-full lg:w-64 flex-shrink-0">
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
                {sortedAssets.map((asset) => (
                  <div
                    key={asset.id}
                    className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md hover:border-gray-300 transition-all cursor-pointer group"
                    onClick={() => onSelectAsset(asset)}
                  >
                    <div className="p-6">
                      <div className="relative mb-4">
                        {/* Star (top-left) */}
                        {asset.category === 'character' ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const next = !asset.isMainCharacter;
                              void onToggleMainCharacter?.(asset.id, next);
                            }}
                            className={cn(
                              "absolute left-0 top-0 p-1 rounded-md transition-colors",
                              asset.isMainCharacter
                                ? "text-amber-500 hover:text-amber-600"
                                : "text-gray-300 hover:text-gray-500"
                            )}
                            title={asset.isMainCharacter ? "Main character (click to unstar)" : "Mark as main character"}
                            aria-label={asset.isMainCharacter ? "Unmark main character" : "Mark as main character"}
                          >
                            <Star className={cn("w-5 h-5", asset.isMainCharacter ? "fill-current" : "")} />
                          </button>
                        ) : null}

                        {/* Actions (top-right, do not affect centering) */}
                        <div className="absolute right-0 top-0 flex space-x-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditAsset(asset);
                            }}
                            className="p-1 text-gray-400 hover:text-gray-600"
                            title="Edit asset"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteAsset(asset.id);
                            }}
                            className="p-1 text-gray-400 hover:text-red-600"
                            title="Delete asset"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Centered header */}
                        <div className="flex flex-col items-center text-center">
                          <div className="mb-3 flex justify-center">
                            <div className="h-24 w-24 rounded-full border bg-gray-50 overflow-hidden flex-shrink-0">
                              {getAssetThumbnailUrl(asset) ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={getAssetThumbnailUrl(asset)}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="h-full w-full flex items-center justify-center">
                                  {React.createElement(categoryIcons[asset.category], {
                                    className: "w-7 h-7 text-gray-500"
                                  })}
                                </div>
                              )}
                            </div>
                          </div>

                          <h3 className="w-full font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors truncate">
                            {asset.name}
                          </h3>
                          <div className="text-xs text-gray-500 mt-0.5">{categoryLabels[asset.category]}</div>
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
