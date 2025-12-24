'use client';

import React, { useState } from 'react';
import { ArrowLeft, Plus, Edit3, Trash2, Tag, Calendar, Save, X } from 'lucide-react';
import { EpisodeIdea, Show } from '@/types';
import { AppBreadcrumbHeader } from './AppBreadcrumbHeader';
import { useBasePath } from '@/hooks/useBasePath';

interface EpisodeIdeasProps {
  show: Show;
  ideas: EpisodeIdea[];
  onBack: () => void;
  onSaveIdea: (idea: Omit<EpisodeIdea, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onUpdateIdea: (id: string, updates: Partial<EpisodeIdea>) => Promise<void>;
  onDeleteIdea: (id: string) => Promise<void>;
}

export function EpisodeIdeas({
  show,
  ideas,
  onBack,
  onSaveIdea,
  onDeleteIdea
}: EpisodeIdeasProps) {
  const basePath = useBasePath();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingIdea, setEditingIdea] = useState<string | null>(null);
  const [newIdea, setNewIdea] = useState({
    title: '',
    description: '',
    status: 'draft' as 'draft' | 'in-development' | 'ready' | 'archived',
    tags: [] as string[],
  });
  const [newTag, setNewTag] = useState('');

  const handleSaveNewIdea = async () => {
    if (!newIdea.title.trim()) return;
    
    try {
      await onSaveIdea({
        showId: show.id,
        title: newIdea.title.trim(),
        description: newIdea.description.trim(),
        status: newIdea.status,
        tags: newIdea.tags,
      });
      
      setNewIdea({ title: '', description: '', status: 'draft', tags: [] });
      setShowAddForm(false);
    } catch (error) {
      console.error('Failed to save idea:', error);
    }
  };

  // const handleUpdateIdea = async (id: string, updates: Partial<EpisodeIdea>) => {
  //   try {
  //     await onUpdateIdea(id, updates);
  //     setEditingIdea(null);
  //   } catch (error) {
  //     console.error('Failed to update idea:', error);
  //   }
  // };

  const handleDeleteIdea = async (id: string) => {
    if (confirm('Are you sure you want to delete this episode idea?')) {
      try {
        await onDeleteIdea(id);
      } catch (error) {
        console.error('Failed to delete idea:', error);
      }
    }
  };

  const addTag = () => {
    if (newTag.trim() && !newIdea.tags.includes(newTag.trim())) {
      setNewIdea(prev => ({
        ...prev,
        tags: [...prev.tags, newTag.trim()]
      }));
      setNewTag('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setNewIdea(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'in-development': return 'bg-blue-100 text-blue-800';
      case 'ready': return 'bg-green-100 text-green-800';
      case 'archived': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <AppBreadcrumbHeader
        coverImageUrl={show.coverImageUrl}
        logoUrl={show.logoUrl}
        backHref={`${basePath}/shows/${show.id}`}
        items={[
          { label: show.name, href: `${basePath}/shows/${show.id}` },
          { label: 'Episode Ideas' },
        ]}
        subtitle="Idea backlog for episodes"
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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Add New Idea Form */}
        {showAddForm && (
          <div className="bg-white rounded-lg shadow-sm border p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">New Episode Idea</h2>
              <button
                onClick={() => setShowAddForm(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Title *
                </label>
                <input
                  type="text"
                  value={newIdea.title}
                  onChange={(e) => setNewIdea(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter episode title..."
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  value={newIdea.description}
                  onChange={(e) => setNewIdea(prev => ({ ...prev, description: e.target.value }))}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Describe your episode idea..."
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Status
                </label>
                <select
                  value={newIdea.status}
                  onChange={(e) => setNewIdea(prev => ({ ...prev, status: e.target.value as 'draft' | 'in-development' | 'ready' | 'archived' }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="draft">Draft</option>
                  <option value="in-development">In Development</option>
                  <option value="ready">Ready</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tags
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {newIdea.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                    >
                      {tag}
                      <button
                        onClick={() => removeTag(tag)}
                        className="ml-1 text-blue-600 hover:text-blue-800"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addTag()}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Add a tag..."
                  />
                  <button
                    onClick={addTag}
                    className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Add
                  </button>
                </div>
              </div>
              
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowAddForm(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveNewIdea}
                  disabled={!newIdea.title.trim()}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Save className="w-4 h-4" />
                  <span>Save Idea</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Ideas List */}
        <div className="space-y-4">
          {ideas.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Tag className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No episode ideas yet</h3>
              <p className="text-gray-500 mb-4">Start brainstorming by adding your first episode idea.</p>
              <button
                onClick={() => setShowAddForm(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors mx-auto"
              >
                <Plus className="w-4 h-4" />
                <span>Add First Idea</span>
              </button>
            </div>
          ) : (
            ideas.map((idea) => (
              <div key={idea.id} className="bg-white rounded-lg shadow-sm border p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">{idea.title}</h3>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(idea.status)}`}>
                        {idea.status.replace('-', ' ')}
                      </span>
                    </div>
                    
                    {idea.description && (
                      <p className="text-gray-600 mb-4">{idea.description}</p>
                    )}
                    
                    {idea.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-4">
                        {idea.tags.map((tag, index) => (
                          <span
                            key={index}
                            className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    
                    <div className="flex items-center space-x-4 text-sm text-gray-500">
                      <div className="flex items-center space-x-1">
                        <Calendar className="w-4 h-4" />
                        <span>Created {formatDate(idea.createdAt)}</span>
                      </div>
                      {new Date(idea.updatedAt).getTime() !== new Date(idea.createdAt).getTime() && (
                        <span>Updated {formatDate(idea.updatedAt)}</span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2 ml-4">
                    <button
                      onClick={() => setEditingIdea(idea.id)}
                      className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteIdea(idea.id)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
