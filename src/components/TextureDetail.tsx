'use client';

import React, { useState, useEffect } from 'react';
import { GlobalAsset, AssetConcept } from '@/types';
import { 
  ArrowLeft, 
  Image, 
  Upload, 
  Trash2, 
  Edit3,
  Save,
  X,
  Palette,
  Settings
} from 'lucide-react';
import { useS3Upload } from '@/hooks/useS3Upload';

interface TextureDetailProps {
  texture: GlobalAsset;
  onBack: () => void;
  onSave: (texture: GlobalAsset) => void;
  onDeleteConcept: (conceptId: string) => void;
}

export function TextureDetail({
  texture,
  onBack,
  onSave,
  onDeleteConcept
}: TextureDetailProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'concepts' | 'production'>('general');
  const [isEditing, setIsEditing] = useState(false);
  
  // Form states
  const [name, setName] = useState(texture.name);
  const [description, setDescription] = useState(texture.description || '');
  const [textureType, setTextureType] = useState('');
  const [material, setMaterial] = useState('');
  const [resolution, setResolution] = useState('');
  
  // Concept generation
  const [generationPrompt, setGenerationPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [newConceptName, setNewConceptName] = useState('');
  
  // Image upload states
  const [uploadingFiles, setUploadingFiles] = useState<Map<string, { progress: number; error?: string }>>(new Map());
  const { uploadFile } = useS3Upload();
  
  // Gallery states
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'relevance' | 'name'>('newest');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedImage, setSelectedImage] = useState<{ url: string; alt: string } | null>(null);
  const [editingConcept, setEditingConcept] = useState<string | null>(null);

  // Handle ESC key to close image modal
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && selectedImage) {
        setSelectedImage(null);
      }
    };

    if (selectedImage) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [selectedImage]);

  const handleSave = () => {
    const updatedTexture: GlobalAsset = {
      ...texture,
      name: name.trim(),
      description: description.trim() || undefined,
    };
    onSave(updatedTexture);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setName(texture.name);
    setDescription(texture.description || '');
    setIsEditing(false);
  };

  const handleImageUpload = async (file: File, conceptId?: string) => {
    const uploadId = conceptId || `temp-${Date.now()}`;
    setUploadingFiles(prev => new Map(prev).set(uploadId, { progress: 0 }));

    try {
      const result = await uploadFile(file, 'textures');
      const url = result?.url;

      if (url) {
        if (conceptId) {
          // Update existing concept
          const concept = texture.concepts.find(c => c.id === conceptId);
          if (concept) {
            const updatedConcept: AssetConcept = {
              ...concept,
              imageUrl: url,
              updatedAt: new Date(),
            };
            const updatedConcepts = texture.concepts.map(c => 
              c.id === conceptId ? updatedConcept : c
            );
            onSave({ ...texture, concepts: updatedConcepts });
          }
        } else {
          // Create new concept and add it directly to texture's concepts
          const newConcept: AssetConcept = {
            id: `concept-${Date.now()}`,
            category: 'texture',
            assetId: texture.id,
            name: newConceptName || file.name.split('.')[0],
            description: '',
            imageUrl: url,
            relevanceScale: 5,
            conceptType: 'general',
            tags: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          
          // Add the concept directly to the texture's concepts
          const updatedConcepts = [...texture.concepts, newConcept];
          onSave({ ...texture, concepts: updatedConcepts });
          setNewConceptName('');
        }
      }
    } catch (error) {
      setUploadingFiles(prev => new Map(prev).set(uploadId, { 
        progress: 0, 
        error: error instanceof Error ? error.message : 'Upload failed' 
      }));
    } finally {
      setUploadingFiles(prev => {
        const newMap = new Map(prev);
        newMap.delete(uploadId);
        return newMap;
      });
    }
  };

  const handleGenerateImage = async () => {
    if (!generationPrompt.trim()) return;
    
    setIsGenerating(true);
    try {
      // This would integrate with your image generation service
      console.log('Generating texture with prompt:', generationPrompt);
    } catch (error) {
      console.error('Texture generation failed:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUpdateConcept = async (conceptId: string, updates: { name?: string; description?: string; relevanceScale?: number }) => {
    try {
      const updatedConcepts = (texture.concepts || []).map(concept => 
        concept.id === conceptId 
          ? { ...concept, ...updates, updatedAt: new Date() }
          : concept
      );
      
      const updatedTexture = { ...texture, concepts: updatedConcepts };
      onSave(updatedTexture);
      setEditingConcept(null);
    } catch (error) {
      console.error('Failed to update concept:', error);
    }
  };

  const sortedConcepts = (texture.concepts || []).sort((a, b) => {
    switch (sortBy) {
      case 'newest':
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case 'oldest':
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case 'relevance':
        return (b.relevanceScale || 0) - (a.relevanceScale || 0);
      case 'name':
        return a.name.localeCompare(b.name);
      default:
        return 0;
    }
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={onBack}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center space-x-3">
                <Image className="w-6 h-6 text-indigo-600" />
                <div>
                  <h1 className="text-xl font-semibold text-gray-900">
                    {isEditing ? (
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="bg-transparent border-b border-gray-300 focus:border-indigo-500 focus:outline-none"
                        autoFocus
                      />
                    ) : (
                      texture.name
                    )}
                  </h1>
                  <p className="text-sm text-gray-500">Texture Asset</p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              {isEditing ? (
                <>
                  <button
                    onClick={handleCancel}
                    className="px-3 py-2 text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-100"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleSave}
                    className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                  >
                    <Save className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-3 py-2 text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-100"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8">
            {[
              { id: 'general', label: 'General', icon: Image },
              { id: 'concepts', label: 'Concepts', icon: Palette },
              { id: 'production', label: 'Production', icon: Settings },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as 'general' | 'concepts' | 'production')}
                className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'general' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Texture Information</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  {isEditing ? (
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="Describe this texture..."
                    />
                  ) : (
                    <p className="text-gray-600">
                      {description || 'No description provided'}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Texture Specifications</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Texture Type
                  </label>
                  <input
                    type="text"
                    value={textureType}
                    onChange={(e) => setTextureType(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="e.g., Diffuse, Normal, Roughness, Metallic"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Material
                  </label>
                  <input
                    type="text"
                    value={material}
                    onChange={(e) => setMaterial(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="e.g., Metal, Wood, Fabric, Stone"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Resolution
                  </label>
                  <input
                    type="text"
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="e.g., 1024x1024, 2048x2048"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    File Format
                  </label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
                    <option value="">Select format</option>
                    <option value="png">PNG</option>
                    <option value="jpg">JPG</option>
                    <option value="tga">TGA</option>
                    <option value="exr">EXR</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Texture Properties</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">Surface Properties</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Roughness:</span>
                      <span className="text-sm text-gray-900">0.5</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Metallic:</span>
                      <span className="text-sm text-gray-900">0.0</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Specular:</span>
                      <span className="text-sm text-gray-900">0.5</span>
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">Color Properties</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Base Color:</span>
                      <span className="text-sm text-gray-900">#808080</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Emissive:</span>
                      <span className="text-sm text-gray-900">None</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Opacity:</span>
                      <span className="text-sm text-gray-900">1.0</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'concepts' && (
          <div className="space-y-6">
            {/* Concept Generation */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Generate New Texture</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Texture Name
                  </label>
                  <input
                    type="text"
                    value={newConceptName}
                    onChange={(e) => setNewConceptName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Enter texture name..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Generation Prompt
                  </label>
                  <textarea
                    value={generationPrompt}
                    onChange={(e) => setGenerationPrompt(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Describe the texture you want to generate..."
                  />
                </div>
                <div className="flex space-x-3">
                  <button
                    onClick={handleGenerateImage}
                    disabled={isGenerating || !generationPrompt.trim()}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isGenerating ? 'Generating...' : 'Generate Texture'}
                  </button>
                  <label className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 cursor-pointer">
                    <Upload className="w-4 h-4 inline mr-2" />
                    Upload Texture
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageUpload(file);
                      }}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* Gallery Controls */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <label className="text-sm font-medium text-gray-700">Sort by:</label>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as 'newest' | 'oldest' | 'relevance' | 'name')}
                      className="px-3 py-1 border border-gray-300 rounded-lg text-sm"
                    >
                      <option value="newest">Newest</option>
                      <option value="oldest">Oldest</option>
                      <option value="relevance">Relevance</option>
                      <option value="name">Name</option>
                    </select>
                  </div>
                  <div className="flex items-center space-x-2">
                    <label className="text-sm font-medium text-gray-700">View:</label>
                    <div className="flex border border-gray-300 rounded-lg">
                      <button
                        onClick={() => setViewMode('grid')}
                        className={`px-3 py-1 text-sm ${viewMode === 'grid' ? 'bg-indigo-600 text-white' : 'text-gray-600'}`}
                      >
                        Grid
                      </button>
                      <button
                        onClick={() => setViewMode('list')}
                        className={`px-3 py-1 text-sm ${viewMode === 'list' ? 'bg-indigo-600 text-white' : 'text-gray-600'}`}
                      >
                        List
                      </button>
                    </div>
                  </div>
                </div>
                <p className="text-sm text-gray-500">
                  {sortedConcepts.length} texture{sortedConcepts.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            {/* Textures Gallery */}
            <div className={`grid gap-4 ${
              viewMode === 'grid' 
                ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' 
                : 'grid-cols-1'
            }`}>
              {sortedConcepts.map((concept) => (
                <div
                  key={concept.id}
                  className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
                >
                  {concept.imageUrl && (
                    <div className="relative group overflow-hidden">
                      <img
                        src={concept.imageUrl}
                        alt={concept.name}
                        className="w-full h-full object-contain cursor-pointer"
                        onClick={() => setSelectedImage({ url: concept.imageUrl!, alt: concept.name })}
                        onError={(e) => {
                          console.error('Image failed to load:', concept.imageUrl);
                          const img = e.target as HTMLImageElement;
                          img.style.backgroundColor = '#ff0000';
                          img.style.color = '#ffffff';
                          img.style.display = 'flex';
                          img.style.alignItems = 'center';
                          img.style.justifyContent = 'center';
                          img.alt = 'Failed to load image';
                        }}
                        onLoad={(e) => {
                          console.log('Image loaded successfully:', concept.imageUrl);
                        }}
                        style={{ 
                          minHeight: '200px',
                          backgroundColor: '#f8f9fa'
                        }}
                      />
                    </div>
                  )}
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      {editingConcept === concept.id ? (
                        <input
                          type="text"
                          defaultValue={concept.name}
                          className="font-medium text-gray-900 bg-transparent border-b border-gray-300 focus:border-indigo-500 focus:outline-none flex-1"
                          onBlur={(e) => {
                            if (e.target.value !== concept.name) {
                              handleUpdateConcept(concept.id, { name: e.target.value });
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleUpdateConcept(concept.id, { name: e.currentTarget.value });
                            }
                            if (e.key === 'Escape') {
                              setEditingConcept(null);
                            }
                          }}
                          autoFocus
                        />
                      ) : (
                        <h3 
                          className="font-medium text-gray-900 cursor-pointer hover:text-indigo-600"
                          onClick={() => setEditingConcept(concept.id)}
                        >
                          {concept.name}
                        </h3>
                      )}
                      <div className="flex space-x-1">
                        <button
                          onClick={() => onDeleteConcept(concept.id)}
                          className="p-1 text-gray-400 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    
                    {editingConcept === concept.id ? (
                      <textarea
                        defaultValue={concept.description || ''}
                        className="text-sm text-gray-600 mb-2 w-full bg-transparent border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="Add a description..."
                        rows={2}
                        onBlur={(e) => {
                          if (e.target.value !== (concept.description || '')) {
                            handleUpdateConcept(concept.id, { description: e.target.value });
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            setEditingConcept(null);
                          }
                        }}
                      />
                    ) : (
                      <p 
                        className="text-sm text-gray-600 mb-2 cursor-pointer hover:text-indigo-600 min-h-[1.5rem]"
                        onClick={() => setEditingConcept(concept.id)}
                      >
                        {concept.description || 'Click to add description...'}
                      </p>
                    )}
                    
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <div className="flex items-center space-x-2">
                        <span>Relevance:</span>
                        {editingConcept === concept.id ? (
                          <select
                            value={concept.relevanceScale || 5}
                            onChange={(e) => handleUpdateConcept(concept.id, { relevanceScale: parseInt(e.target.value) })}
                            className="bg-transparent border border-gray-300 rounded px-1 py-0.5 text-xs"
                          >
                            {[1,2,3,4,5,6,7,8,9,10].map(num => (
                              <option key={num} value={num}>{num}</option>
                            ))}
                          </select>
                        ) : (
                          <span 
                            className="cursor-pointer hover:text-indigo-600"
                            onClick={() => setEditingConcept(concept.id)}
                          >
                            {concept.relevanceScale || 5}/10
                          </span>
                        )}
                      </div>
                      <span>{new Date(concept.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {sortedConcepts.length === 0 && (
              <div className="text-center py-12">
                <Image className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No textures yet</h3>
                <p className="text-gray-600 mb-4">Start by generating or uploading your first texture.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'production' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Production Notes</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    UV Mapping Notes
                  </label>
                  <textarea
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Notes about UV mapping and texture coordinates..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Material Setup
                  </label>
                  <textarea
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Instructions for setting up the material in your 3D software..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Performance Considerations
                  </label>
                  <textarea
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Notes about texture optimization and performance..."
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Image Modal */}
      {selectedImage && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="relative max-w-4xl max-h-full">
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute top-4 right-4 p-2 bg-white bg-opacity-90 rounded-full hover:bg-opacity-100 z-10"
            >
              <X className="w-5 h-5 text-gray-700" />
            </button>
            <img
              src={selectedImage.url}
              alt={selectedImage.alt}
              className="max-w-full max-h-full object-contain rounded-lg"
            />
          </div>
        </div>
      )}
    </div>
  );
}
