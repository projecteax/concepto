'use client';

import React, { useState } from 'react';
import { Show, PlotTheme } from '@/types';
import { 
  ArrowLeft, 
  Plus, 
  Search, 
  BookOpen,
  Calendar,
  Tag,
  Edit3,
  Trash2,
  X,
  Check
} from 'lucide-react';
import { AppBreadcrumbHeader } from './AppBreadcrumbHeader';
import { useBasePath } from '@/hooks/useBasePath';

interface PlotThemesProps {
  show: Show;
  themes: PlotTheme[];
  onBack: () => void;
  onAddTheme: (themeData: Omit<PlotTheme, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onEditTheme: (theme: PlotTheme) => void;
  onDeleteTheme: (themeId: string) => void;
  isReadOnly?: boolean;
}

export function PlotThemes({
  show,
  themes,
  onBack,
  onAddTheme,
  onEditTheme,
  onDeleteTheme,
  isReadOnly = false,
}: PlotThemesProps) {
  const readOnly = isReadOnly;
  const basePath = useBasePath();
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name'>('newest');
  const [editingTheme, setEditingTheme] = useState<PlotTheme | null>(null);
  
  // Form state
  const [themeName, setThemeName] = useState('');
  const [themeDescription, setThemeDescription] = useState('');
  const [themeKeyElements, setThemeKeyElements] = useState<string[]>([]);
  const [newKeyElement, setNewKeyElement] = useState('');
  const [themeTags, setThemeTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<PlotTheme | null>(null);

  // Helper function to safely format dates
  const formatDate = (dateValue: Date | string | number): string => {
    try {
      let date: Date;
      if (dateValue instanceof Date) {
        date = dateValue;
      } else {
        date = new Date(dateValue);
      }
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString();
      }
      return 'N/A';
    } catch {
      return 'N/A';
    }
  };

  // Filter and sort themes
  const filteredThemes = themes.filter(theme =>
    theme.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    theme.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    theme.keyElements.some(element => element.toLowerCase().includes(searchTerm.toLowerCase())) ||
    theme.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const sortedThemes = filteredThemes.sort((a, b) => {
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

  const resetForm = () => {
    setThemeName('');
    setThemeDescription('');
    setThemeKeyElements([]);
    setNewKeyElement('');
    setThemeTags([]);
    setNewTag('');
    setEditingTheme(null);
    setShowAddForm(false);
  };

  const handleStartEdit = (theme: PlotTheme) => {
    setEditingTheme(theme);
    setThemeName(theme.name);
    setThemeDescription(theme.description);
    setThemeKeyElements(theme.keyElements || []);
    setThemeTags(theme.tags || []);
    setShowAddForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!themeName.trim()) return;

    if (editingTheme) {
      onEditTheme({
        ...editingTheme,
        name: themeName.trim(),
        description: themeDescription.trim(),
        keyElements: themeKeyElements,
        tags: themeTags,
        updatedAt: new Date(),
      });
    } else {
      onAddTheme({
        showId: show.id,
        name: themeName.trim(),
        description: themeDescription.trim(),
        keyElements: themeKeyElements,
        tags: themeTags,
      });
    }

    resetForm();
  };

  const addKeyElement = () => {
    if (newKeyElement.trim() && !themeKeyElements.includes(newKeyElement.trim())) {
      setThemeKeyElements([...themeKeyElements, newKeyElement.trim()]);
      setNewKeyElement('');
    }
  };

  const removeKeyElement = (element: string) => {
    setThemeKeyElements(themeKeyElements.filter(e => e !== element));
  };

  const addTag = () => {
    if (newTag.trim() && !themeTags.includes(newTag.trim())) {
      setThemeTags([...themeTags, newTag.trim()]);
      setNewTag('');
    }
  };

  const removeTag = (tag: string) => {
    setThemeTags(themeTags.filter(t => t !== tag));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <AppBreadcrumbHeader
        coverImageUrl={show.coverImageUrl}
        logoUrl={show.logoUrl}
        backHref={`${basePath}/shows/${show.id}`}
        items={[
          { label: show.name, href: `${basePath}/shows/${show.id}` },
          { label: 'Plot Themes' },
        ]}
        subtitle="Reusable themes across episodes"
        actions={
          !readOnly ? (
            <button
              onClick={() => {
                resetForm();
                setShowAddForm(true);
              }}
              className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>New Theme</span>
            </button>
          ) : null
        }
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search and Sort */}
        <div className="mb-6 flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search themes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'newest' | 'oldest' | 'name')}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="name">Name (A-Z)</option>
          </select>
        </div>

        {/* Add/Edit Form */}
        {showAddForm && !readOnly && (
          <div className="mb-8 bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {editingTheme ? 'Edit Plot Theme' : 'New Plot Theme'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Theme Name *
                </label>
                <input
                  type="text"
                  value={themeName}
                  onChange={(e) => setThemeName(e.target.value)}
                  placeholder="e.g., Friendship, Adventure, Discovery..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  value={themeDescription}
                  onChange={(e) => setThemeDescription(e.target.value)}
                  placeholder="Describe this plot theme and how it can be used in episodes..."
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Key Elements
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={newKeyElement}
                    onChange={(e) => setNewKeyElement(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addKeyElement();
                      }
                    }}
                    placeholder="Add key element (e.g., character arc, plot point)..."
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={addKeyElement}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Add
                  </button>
                </div>
                {themeKeyElements.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {themeKeyElements.map((element, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-indigo-100 text-indigo-800 rounded-full text-sm"
                      >
                        {element}
                        <button
                          type="button"
                          onClick={() => removeKeyElement(element)}
                          className="text-indigo-600 hover:text-indigo-800"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tags
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addTag();
                      }
                    }}
                    placeholder="Add tag..."
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={addTag}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Add
                  </button>
                </div>
                {themeTags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {themeTags.map((tag, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-800 rounded-full text-sm"
                      >
                        <Tag className="w-3 h-3" />
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeTag(tag)}
                          className="text-gray-600 hover:text-gray-800"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  <Check className="w-4 h-4" />
                  <span>{editingTheme ? 'Save Changes' : 'Create Theme'}</span>
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  <X className="w-4 h-4" />
                  <span>Cancel</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Themes Grid */}
        {sortedThemes.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <BookOpen className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Plot Themes Yet</h3>
            <p className="text-gray-600 mb-4">Create your first plot theme to get started</p>
            {!readOnly ? (
              <button
                onClick={() => {
                  resetForm();
                  setShowAddForm(true);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Create Theme</span>
              </button>
            ) : null}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sortedThemes.map((theme) => (
              <div
                key={theme.id}
                className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-lg font-semibold text-gray-900 flex-1">{theme.name}</h3>
                  {!readOnly ? (
                    <div className="flex items-center gap-1 ml-2">
                      <button
                        onClick={() => handleStartEdit(theme)}
                        className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        title="Edit theme"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(theme)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete theme"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : null}
                </div>

                {theme.description && (
                  <p className="text-gray-600 text-sm mb-4 line-clamp-3">{theme.description}</p>
                )}

                {theme.keyElements && theme.keyElements.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-xs font-medium text-gray-700 mb-2 uppercase tracking-wide">Key Elements</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {theme.keyElements.slice(0, 3).map((element, index) => (
                        <span
                          key={index}
                          className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-xs"
                        >
                          {element}
                        </span>
                      ))}
                      {theme.keyElements.length > 3 && (
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                          +{theme.keyElements.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {theme.tags && theme.tags.length > 0 && (
                  <div className="mb-4">
                    <div className="flex flex-wrap gap-1.5">
                      {theme.tags.map((tag, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs"
                        >
                          <Tag className="w-3 h-3" />
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center text-xs text-gray-500 pt-3 border-t border-gray-200">
                  <Calendar className="w-3 h-3 mr-1" />
                  <span>Created {formatDate(theme.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Plot Theme?</h3>
            <p className="text-gray-600 mb-4">
              Are you sure you want to delete &quot;{showDeleteConfirm.name}&quot;? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  onDeleteTheme(showDeleteConfirm.id);
                  setShowDeleteConfirm(null);
                }}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

