'use client';

import { useState } from 'react';
import { AssetConcept, AssetCategory } from '@/types';
import { 
  Grid, 
  List, 
  Search, 
  Filter,
  Eye,
  Download,
  Trash2,
  Edit3,
  Upload
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface MainContentProps {
  concepts: AssetConcept[];
  selectedCategory: AssetCategory | 'all';
  onAssetConceptUpdate: (id: string, updates: Partial<AssetConcept>) => void;
  onAssetConceptDelete: (id: string) => void;
}

export function MainContent({ 
  concepts, 
  selectedCategory, 
  onAssetConceptUpdate, 
  onAssetConceptDelete 
}: MainContentProps) {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAssetConcept, setSelectedAssetConcept] = useState<AssetConcept | null>(null);

  const filteredAssetConcepts = concepts.filter(concept => 
    concept.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    concept.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    concept.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search concepts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <button className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
              <Filter className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setViewMode('grid')}
              className={cn(
                "p-2 rounded-lg transition-colors",
                viewMode === 'grid' 
                  ? "bg-indigo-100 text-indigo-700" 
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
              )}
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                "p-2 rounded-lg transition-colors",
                viewMode === 'list' 
                  ? "bg-indigo-100 text-indigo-700" 
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
              )}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {filteredAssetConcepts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Upload className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-medium mb-2">No concepts yet</h3>
            <p className="text-sm text-center max-w-sm">
              Start generating concept art using the panel on the right to build your library.
            </p>
          </div>
        ) : (
          <div className={cn(
            viewMode === 'grid' 
              ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
              : "space-y-4"
          )}>
            {filteredAssetConcepts.map((concept) => (
              <div
                key={concept.id}
                className={cn(
                  "bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow",
                  viewMode === 'list' && "flex"
                )}
              >
                {concept.imageUrl && (
                  <div className={cn(
                    "relative",
                    viewMode === 'grid' ? "aspect-square" : "w-32 h-32 flex-shrink-0"
                  )}>
                    <img
                      src={concept.imageUrl}
                      alt={concept.name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-2 right-2 flex space-x-1">
                      <button
                        onClick={() => setSelectedAssetConcept(concept)}
                        className="p-1 bg-white bg-opacity-80 rounded hover:bg-opacity-100"
                      >
                        <Eye className="w-3 h-3 text-gray-600" />
                      </button>
                      <button className="p-1 bg-white bg-opacity-80 rounded hover:bg-opacity-100">
                        <Download className="w-3 h-3 text-gray-600" />
                      </button>
                    </div>
                  </div>
                )}

                <div className="p-4 flex-1">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-medium text-gray-900 truncate">{concept.name}</h3>
                    <div className="flex space-x-1 ml-2">
                      <button
                        onClick={() => onAssetConceptUpdate(concept.id, { name: prompt('Edit name:', concept.name) || concept.name })}
                        className="p-1 text-gray-400 hover:text-gray-600"
                      >
                        <Edit3 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => onAssetConceptDelete(concept.id)}
                        className="p-1 text-gray-400 hover:text-red-600"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 mb-2">
                    <span className={cn(
                      "px-2 py-1 text-xs rounded-full",
                      concept.category === 'character' && "bg-blue-100 text-blue-700",
                      concept.category === 'location' && "bg-green-100 text-green-700",
                      concept.category === 'gadget' && "bg-purple-100 text-purple-700",
                      concept.category === 'texture' && "bg-orange-100 text-orange-700",
                      concept.category === 'background' && "bg-pink-100 text-pink-700"
                    )}>
                      {concept.category}
                    </span>
                    {concept.fbxUrl && (
                      <span className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded-full">
                        3D Model
                      </span>
                    )}
                  </div>

                  {concept.description && (
                    <p className="text-sm text-gray-600 mb-2 line-clamp-2">
                      {concept.description}
                    </p>
                  )}

                  {concept.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {concept.tags.slice(0, 3).map((tag, index) => (
                        <span
                          key={index}
                          className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded"
                        >
                          {tag}
                        </span>
                      ))}
                      {concept.tags.length > 3 && (
                        <span className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">
                          +{concept.tags.length - 3}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="text-xs text-gray-500">
                    {formatDate(concept.createdAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* AssetConcept Detail Modal */}
      {selectedAssetConcept && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">{selectedAssetConcept.name}</h2>
                <button
                  onClick={() => setSelectedAssetConcept(null)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ×
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {selectedAssetConcept.imageUrl && (
                  <div>
                    <img
                      src={selectedAssetConcept.imageUrl}
                      alt={selectedAssetConcept.name}
                      className="w-full rounded-lg"
                    />
                  </div>
                )}
                
                <div>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Category
                      </label>
                      <span className="px-3 py-1 text-sm bg-indigo-100 text-indigo-700 rounded-full">
                        {selectedAssetConcept.category}
                      </span>
                    </div>
                    
                    {selectedAssetConcept.description && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Description
                        </label>
                        <p className="text-sm text-gray-600">{selectedAssetConcept.description}</p>
                      </div>
                    )}
                    
                    {selectedAssetConcept.tags.length > 0 && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Tags
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {selectedAssetConcept.tags.map((tag, index) => (
                            <span
                              key={index}
                              className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {selectedAssetConcept.fbxUrl && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          3D Model
                        </label>
                        <button className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200">
                          View 3D Model
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
