'use client';

import { useState } from 'react';
import { AssetConcept, AssetCategory, Tag } from '@/types';
import { 
  Users, 
  MapPin, 
  Wrench, 
  Image, 
  Mountain, 
  Plus,
  Tag as TagIcon,
  FolderOpen
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarProps {
  selectedCategory: AssetCategory | 'all';
  onCategorySelect: (category: AssetCategory | 'all') => void;
  concepts: AssetConcept[];
  tags: Tag[];
  onAddTag: (tag: Omit<Tag, 'id'>) => void;
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
  location: 'Localizations',
  gadget: 'Gadgets',
  texture: 'Textures',
  background: 'Backgrounds',
};

export function Sidebar({ 
  selectedCategory, 
  onCategorySelect, 
  concepts, 
  tags,
  onAddTag 
}: SidebarProps) {
  const [showAddTag, setShowAddTag] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#6366f1');

  const handleAddTag = () => {
    if (newTagName.trim()) {
      onAddTag({
        name: newTagName.trim(),
        category: 'custom',
        color: newTagColor,
      });
      setNewTagName('');
      setShowAddTag(false);
    }
  };

  const getCategoryCount = (category: AssetCategory) => {
    return concepts.filter(concept => concept.category === category).length;
  };

  return (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Categories</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-2">
          <button
            onClick={() => onCategorySelect('all')}
            className={cn(
              "w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg transition-colors",
              selectedCategory === 'all'
                ? "bg-indigo-100 text-indigo-700"
                : "text-gray-700 hover:bg-gray-100"
            )}
          >
            <div className="flex items-center space-x-3">
              <FolderOpen className="w-4 h-4" />
              <span>All AssetConcepts</span>
            </div>
            <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded-full">
              {concepts.length}
            </span>
          </button>

          {Object.entries(categoryLabels).map(([category, label]) => {
            const Icon = categoryIcons[category as AssetCategory];
            const count = getCategoryCount(category as AssetCategory);
            
            return (
              <button
                key={category}
                onClick={() => onCategorySelect(category as AssetCategory)}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg transition-colors mt-1",
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

        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-900">Tags</h3>
            <button
              onClick={() => setShowAddTag(!showAddTag)}
              className="p-1 hover:bg-gray-100 rounded"
            >
              <Plus className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          {showAddTag && (
            <div className="mb-3 p-3 bg-gray-50 rounded-lg">
              <input
                type="text"
                placeholder="Tag name"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded mb-2"
              />
              <div className="flex items-center space-x-2 mb-2">
                <input
                  type="color"
                  value={newTagColor}
                  onChange={(e) => setNewTagColor(e.target.value)}
                  className="w-6 h-6 border border-gray-300 rounded"
                />
                <span className="text-xs text-gray-600">Color</span>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={handleAddTag}
                  className="px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700"
                >
                  Add
                </button>
                <button
                  onClick={() => setShowAddTag(false)}
                  className="px-2 py-1 text-xs bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="space-y-1">
            {tags.map((tag) => (
              <div
                key={tag.id}
                className="flex items-center space-x-2 px-2 py-1 text-sm"
              >
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
                <TagIcon className="w-3 h-3 text-gray-400" />
                <span className="text-gray-700">{tag.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
