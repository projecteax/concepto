'use client';

import React, { useState } from 'react';
import { Show, GeneralIdea } from '@/types';
import { 
  ArrowLeft, 
  Plus, 
  Search, 
  Lightbulb,
  Calendar,
  Tag,
  Edit3,
  Trash2,
  Image as ImageIcon,
  MessageCircle
} from 'lucide-react';
import { useComments } from '@/contexts/CommentContext';
import { AppBreadcrumbHeader } from './AppBreadcrumbHeader';
import { useBasePath } from '@/hooks/useBasePath';

interface GeneralIdeasProps {
  show: Show;
  ideas: GeneralIdea[];
  onBack: () => void;
  onSelectIdea: (idea: GeneralIdea) => void;
  onAddIdea: (ideaData: Omit<GeneralIdea, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onEditIdea: (idea: GeneralIdea) => void;
  onDeleteIdea: (ideaId: string) => void;
}

export function GeneralIdeas({
  show,
  ideas,
  onBack,
  onSelectIdea,
  onAddIdea,
  onEditIdea,
  onDeleteIdea
}: GeneralIdeasProps) {
  const basePath = useBasePath();
  const { getCommentsForTarget } = useComments();
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name'>('newest');
  
  // Form state
  const [newIdeaName, setNewIdeaName] = useState('');
  const [newIdeaDescription, setNewIdeaDescription] = useState('');
  const [newIdeaTags, setNewIdeaTags] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<GeneralIdea | null>(null);

  // Filter and sort ideas
  const filteredIdeas = ideas.filter(idea =>
    idea.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    idea.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    idea.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const sortedIdeas = filteredIdeas.sort((a, b) => {
    switch (sortBy) {
      case 'newest':
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case 'oldest':
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case 'name':
        return a.name.localeCompare(b.name);
      default:
        return 0;
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIdeaName.trim()) return;

    const tags = newIdeaTags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);

    onAddIdea({
      showId: show.id,
      name: newIdeaName.trim(),
      description: newIdeaDescription.trim(),
      images: [],
      tags,
    });

    // Reset form
    setNewIdeaName('');
    setNewIdeaDescription('');
    setNewIdeaTags('');
    setShowAddForm(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <AppBreadcrumbHeader
        coverImageUrl={show.coverImageUrl}
        logoUrl={show.logoUrl}
        backHref={`${basePath}/shows/${show.id}`}
        items={[
          { label: show.name, href: `${basePath}/shows/${show.id}` },
          { label: 'General Ideas' },
        ]}
        subtitle="Show-level idea bank"
        actions={
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>New Idea</span>
          </button>
        }
      />

      {/* Filters */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between space-x-4">
            <div className="flex-1 max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search ideas..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium text-gray-700">Sort by:</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'newest' | 'oldest' | 'name')}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                  <option value="name">Name</option>
                </select>
              </div>
              
              <div className="text-sm text-gray-500">
                {sortedIdeas.length} idea{sortedIdeas.length !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Add Form Modal */}
        {showAddForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Add New General Idea</h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Idea Name *
                  </label>
                  <input
                    type="text"
                    value={newIdeaName}
                    onChange={(e) => setNewIdeaName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Enter idea name..."
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    value={newIdeaDescription}
                    onChange={(e) => setNewIdeaDescription(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Describe your idea..."
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tags
                  </label>
                  <input
                    type="text"
                    value={newIdeaTags}
                    onChange={(e) => setNewIdeaTags(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="concept, inspiration, creative, brainstorm..."
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Separate multiple tags with commas (e.g., &quot;concept, inspiration, creative&quot;)
                  </p>
                  {/* Live tag preview */}
                  {newIdeaTags.trim() && (
                    <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs font-medium text-gray-700 mb-2">Preview:</p>
                      <div className="flex flex-wrap gap-1">
                        {newIdeaTags.split(',').map((tag, index) => {
                          const trimmedTag = tag.trim();
                          return trimmedTag ? (
                            <span
                              key={index}
                              className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-indigo-100 text-indigo-700"
                            >
                              <Tag className="w-3 h-3 mr-1" />
                              {trimmedTag}
                            </span>
                          ) : null;
                        })}
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="flex space-x-3 justify-end">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    Add Idea
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Ideas Grid */}
        {sortedIdeas.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sortedIdeas.map((idea, index) => (
              <div
                key={`${idea.id}-${index}`}
                className="bg-white rounded-lg border border-gray-200 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => onSelectIdea(idea)}
              >
                {/* Image Preview */}
                <div className="aspect-video bg-gray-100 rounded-t-lg overflow-hidden">
                  {idea.images.length > 0 ? (
                    <img
                      src={idea.images[0]}
                      alt={idea.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon className="w-12 h-12 text-gray-300" />
                    </div>
                  )}
                  
                  {/* Image Count Badge */}
                  {idea.images.length > 1 && (
                    <div className="absolute top-2 right-2 bg-black bg-opacity-75 text-white px-2 py-1 rounded text-xs">
                      +{idea.images.length - 1}
                    </div>
                  )}
                </div>

                <div className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-medium text-gray-900 line-clamp-1">
                      {idea.name}
                    </h3>
                    <div className="flex space-x-1 ml-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditIdea(idea);
                        }}
                        className="p-1 text-gray-400 hover:text-indigo-600 rounded"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowDeleteConfirm(idea);
                        }}
                        className="p-1 text-gray-400 hover:text-red-600 rounded"
                        title="Delete idea"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  
                  <p className="text-sm text-gray-600 line-clamp-2 mb-3">
                    {idea.description || 'No description'}
                  </p>
                  
                  {/* Tags */}
                  {idea.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {idea.tags.slice(0, 3).map((tag, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-indigo-100 text-indigo-700"
                        >
                          <Tag className="w-3 h-3 mr-1" />
                          {tag}
                        </span>
                      ))}
                      {idea.tags.length > 3 && (
                        <span className="text-xs text-gray-500">
                          +{idea.tags.length - 3} more
                        </span>
                      )}
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <div className="flex items-center space-x-1">
                      <Calendar className="w-3 h-3" />
                      <span>{new Date(idea.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="flex items-center space-x-1">
                        <ImageIcon className="w-3 h-3" />
                        <span>{idea.images.length}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <MessageCircle className="w-3 h-3" />
                        <span>{getCommentsForTarget('general-idea', idea.id)?.comments.length || 0}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <Lightbulb className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm ? 'No ideas found' : 'No general ideas yet'}
            </h3>
            <p className="text-gray-600 mb-4">
              {searchTerm 
                ? 'Try adjusting your search terms'
                : 'Start by adding your first general idea to capture random concepts and inspiration.'
              }
            </p>
            {!searchTerm && (
              <button
                onClick={() => setShowAddForm(true)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Add First Idea
              </button>
            )}
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              <div className="flex items-center space-x-3 mb-4">
                <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <Trash2 className="w-5 h-5 text-red-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Delete Idea</h3>
              </div>
              
              {/* Idea Preview */}
              <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                <div className="flex items-start space-x-3">
                  {showDeleteConfirm.images.length > 0 ? (
                    <img
                      src={showDeleteConfirm.images[0]}
                      alt={showDeleteConfirm.name}
                      className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
                      onError={(e) => {
                        const img = e.target as HTMLImageElement;
                        img.style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Lightbulb className="w-6 h-6 text-gray-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-gray-900 truncate">{showDeleteConfirm.name}</h4>
                    <p className="text-sm text-gray-600 line-clamp-2">
                      {showDeleteConfirm.description || 'No description'}
                    </p>
                    {showDeleteConfirm.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {showDeleteConfirm.tags.slice(0, 3).map((tag, index) => (
                          <span
                            key={index}
                            className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-indigo-100 text-indigo-700"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              <p className="text-gray-600 mb-6">
                Are you sure you want to delete &quot;<strong>{showDeleteConfirm.name}</strong>&quot;? This will permanently remove the idea and all its images. This action cannot be undone.
              </p>
              
              <div className="flex space-x-3 justify-end">
                <button
                  onClick={() => setShowDeleteConfirm(null)}
                  className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onDeleteIdea(showDeleteConfirm.id);
                    setShowDeleteConfirm(null);
                  }}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center space-x-2"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Idea</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
