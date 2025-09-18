'use client';

import React, { useState, useEffect } from 'react';
import { GlobalAsset, AssetConcept } from '@/types';
import { 
  ArrowLeft, 
  Car, 
  Upload, 
  Trash2, 
  Edit3,
  Save,
  X,
  Image as ImageIcon,
  Settings
} from 'lucide-react';
import { useS3Upload } from '@/hooks/useS3Upload';

interface VehicleDetailProps {
  vehicle: GlobalAsset;
  onBack: () => void;
  onSave: (vehicle: GlobalAsset) => void;
  onDeleteConcept: (conceptId: string) => void;
}

export function VehicleDetail({
  vehicle,
  onBack,
  onSave,
  onDeleteConcept
}: VehicleDetailProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'concepts' | 'production'>('general');
  const [isEditing, setIsEditing] = useState(false);
  
  // Form states
  const [name, setName] = useState(vehicle.name);
  const [description, setDescription] = useState(vehicle.description || '');
  const [vehicleType, setVehicleType] = useState('');
  const [propulsion, setPropulsion] = useState('');
  const [capacity, setCapacity] = useState('');
  
  // Concept generation
  const [generationPrompt, setGenerationPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [newConceptName, setNewConceptName] = useState('');
  
  // Image upload states
  const [uploadingFiles, setUploadingFiles] = useState<Map<string, { progress: number; error?: string }>>(new Map());
  const [selectedImage, setSelectedImage] = useState<{ url: string; alt: string } | null>(null);
  const [editingConcept, setEditingConcept] = useState<string | null>(null);
  const { uploadFile } = useS3Upload();
  
  // Gallery states
  const [galleryImages, setGalleryImages] = useState<string[]>(vehicle.galleryImages || []);
  const [mainRender, setMainRender] = useState<string>(vehicle.mainRender || '');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  
  // Concept gallery states
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'relevance' | 'name'>('newest');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

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
    const updatedVehicle: GlobalAsset = {
      ...vehicle,
      name: name.trim(),
      description: description.trim() || undefined,
      galleryImages: galleryImages,
      mainRender: mainRender,
    };
    onSave(updatedVehicle);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setName(vehicle.name);
    setDescription(vehicle.description || '');
    setIsEditing(false);
  };

  const handleImageUpload = async (file: File, conceptId?: string) => {
    const uploadId = conceptId || `temp-${Date.now()}`;
    setUploadingFiles(prev => new Map(prev).set(uploadId, { progress: 0 }));

    try {
      const result = await uploadFile(file, 'vehicles');
      const url = result?.url;

      if (url) {
        if (conceptId) {
          // Update existing concept
          const concept = vehicle.concepts.find(c => c.id === conceptId);
          if (concept) {
            const updatedConcept: AssetConcept = {
              ...concept,
              imageUrl: url,
              updatedAt: new Date(),
            };
            const updatedConcepts = vehicle.concepts.map(c => 
              c.id === conceptId ? updatedConcept : c
            );
            onSave({ ...vehicle, concepts: updatedConcepts });
          }
        } else {
          // Create new concept and add it directly to vehicle's concepts
          const newConcept: AssetConcept = {
            id: `concept-${Date.now()}`,
            category: 'vehicle',
            assetId: vehicle.id,
            name: newConceptName || file.name.split('.')[0],
            description: '',
            imageUrl: url,
            relevanceScale: 5,
            conceptType: 'general',
            tags: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          
          // Add the concept directly to the vehicle's concepts
          const updatedConcepts = [...vehicle.concepts, newConcept];
          onSave({ ...vehicle, concepts: updatedConcepts });
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

  const handleGalleryUpload = async (file: File) => {
    try {
      const result = await uploadFile(file, 'vehicles');
      if (result && result.url) {
        const newGalleryImages = [...galleryImages, result.url];
        setGalleryImages(newGalleryImages);
        
        // If this is the first image, set it as main render
        if (galleryImages.length === 0) {
          setMainRender(result.url);
        }
        
        onSave({ ...vehicle, galleryImages: newGalleryImages, mainRender: mainRender || result.url });
      }
    } catch (error) {
      console.error('Failed to upload gallery image:', error);
    }
  };

  const handleSetMainRender = (imageUrl: string) => {
    // Prevent setting data URLs as main render
    if (imageUrl.startsWith('data:')) {
      alert('Cannot set generated image as main render. Please upload the image to cloud storage first.');
      return;
    }
    setMainRender(imageUrl);
    onSave({ ...vehicle, mainRender: imageUrl });
  };

  const handleRemoveGalleryImage = (imageUrl: string) => {
    const newGalleryImages = galleryImages.filter(img => img !== imageUrl);
    setGalleryImages(newGalleryImages);
    
    // If we removed the main render, set a new one or clear it
    if (mainRender === imageUrl) {
      const newMainRender = newGalleryImages.length > 0 ? newGalleryImages[0] : '';
      setMainRender(newMainRender);
      onSave({ ...vehicle, galleryImages: newGalleryImages, mainRender: newMainRender });
    } else {
      onSave({ ...vehicle, galleryImages: newGalleryImages });
    }
  };

  const handleGenerateImage = async () => {
    if (!generationPrompt.trim()) return;
    
    setIsGenerating(true);
    try {
      // This would integrate with your image generation service
      console.log('Generating image with prompt:', generationPrompt);
    } catch (error) {
      console.error('Image generation failed:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUpdateConcept = async (conceptId: string, updates: { name?: string; description?: string; relevanceScale?: number }) => {
    try {
      const updatedConcepts = (vehicle.concepts || []).map(concept => 
        concept.id === conceptId 
          ? { ...concept, ...updates, updatedAt: new Date() }
          : concept
      );
      
      const updatedVehicle = { ...vehicle, concepts: updatedConcepts };
      onSave(updatedVehicle);
      setEditingConcept(null);
    } catch (error) {
      console.error('Failed to update concept:', error);
    }
  };

  const sortedConcepts = (vehicle.concepts || []).sort((a, b) => {
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
                <Car className="w-6 h-6 text-indigo-600" />
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
                      vehicle.name
                    )}
                  </h1>
                  <p className="text-sm text-gray-500">Vehicle Asset</p>
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
              { id: 'general', label: 'General', icon: Car },
              { id: 'concepts', label: 'Concepts', icon: ImageIcon },
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
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Vehicle Information</h2>
              
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
                      placeholder="Describe this vehicle..."
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
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Vehicle Specifications</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Vehicle Type
                  </label>
                  <input
                    type="text"
                    value={vehicleType}
                    onChange={(e) => setVehicleType(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="e.g., Spacecraft, Car, Motorcycle, Boat"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Propulsion System
                  </label>
                  <input
                    type="text"
                    value={propulsion}
                    onChange={(e) => setPropulsion(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="e.g., Electric, Fusion, Combustion, Hover"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Capacity
                  </label>
                  <input
                    type="text"
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="e.g., 2 passengers, 500kg cargo"
                  />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Design Features</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">Exterior Design</h3>
                  <p className="text-gray-600">Body style, paint, and exterior features</p>
                </div>
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">Interior Layout</h3>
                  <p className="text-gray-600">Seating, controls, and cabin design</p>
                </div>
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">Performance</h3>
                  <p className="text-gray-600">Speed, range, and handling characteristics</p>
                </div>
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">Special Features</h3>
                  <p className="text-gray-600">Unique capabilities and technologies</p>
                </div>
              </div>
            </div>

            {/* Gallery Section */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Gallery</h2>
              
              {/* Upload Section */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Upload Renders
                </label>
                <div className="flex items-center space-x-4">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleGalleryUpload(file);
                    }}
                    className="hidden"
                    id="gallery-upload"
                  />
                  <label
                    htmlFor="gallery-upload"
                    className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Upload Image</span>
                  </label>
                </div>
              </div>

              {/* Main Render */}
              {mainRender && (
                <div className="mb-6">
                  <h3 className="text-md font-medium text-gray-900 mb-3">Main Render</h3>
                  <div className="relative inline-block">
                    <img
                      src={mainRender}
                      alt="Main render"
                      className="w-48 h-48 object-cover rounded-lg border-2 border-blue-500 cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => setSelectedImage({ url: mainRender, alt: 'Main render' })}
                    />
                    <div className="absolute top-2 left-2 bg-blue-500 text-white px-2 py-1 rounded text-xs font-medium">
                      Main
                    </div>
                  </div>
                </div>
              )}

              {/* Gallery Grid */}
              {galleryImages.length > 0 && (
                <div>
                  <h3 className="text-md font-medium text-gray-900 mb-3">All Renders</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {galleryImages.map((imageUrl, index) => (
                      <div
                        key={index}
                        className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
                      >
                        <div className="relative group overflow-hidden">
                          <img
                            src={imageUrl}
                            alt={`Render ${index + 1}`}
                            className="w-full h-full object-contain cursor-pointer"
                            onClick={() => setSelectedImage({ url: imageUrl, alt: `Render ${index + 1}` })}
                            onError={(e) => {
                              console.error('Image failed to load:', imageUrl);
                              const img = e.target as HTMLImageElement;
                              img.style.backgroundColor = '#f8f9fa';
                              img.style.color = '#6b7280';
                              img.style.display = 'flex';
                              img.style.alignItems = 'center';
                              img.style.justifyContent = 'center';
                              img.alt = 'Failed to load image';
                            }}
                            onLoad={(e) => {
                              console.log('✅ Gallery image loaded successfully:', imageUrl);
                            }}
                            style={{ 
                              minHeight: '200px',
                              backgroundColor: '#f8f9fa'
                            }}
                          />
                          
                          {/* Main render indicator */}
                          {mainRender === imageUrl && (
                            <div className="absolute top-2 left-2 bg-blue-500 text-white px-2 py-1 rounded text-xs font-medium">
                              Main
                            </div>
                          )}
                        </div>
                        
                        <div className="p-4">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-900">
                              Render {index + 1}
                            </span>
                            <div className="flex space-x-2">
                              {mainRender !== imageUrl && (
                                <button
                                  onClick={() => handleSetMainRender(imageUrl)}
                                  className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
                                >
                                  Set Main
                                </button>
                              )}
                              <button
                                onClick={() => setShowDeleteConfirm(imageUrl)}
                                className="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {galleryImages.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <ImageIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>No renders uploaded yet</p>
                  <p className="text-sm">Upload images to showcase your vehicle</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'concepts' && (
          <div className="space-y-6">
            {/* Concept Generation */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Generate New Concept</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Concept Name
                  </label>
                  <input
                    type="text"
                    value={newConceptName}
                    onChange={(e) => setNewConceptName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Enter concept name..."
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
                    placeholder="Describe the vehicle concept you want to generate..."
                  />
                </div>
                <div className="flex space-x-3">
                  <button
                    onClick={handleGenerateImage}
                    disabled={isGenerating || !generationPrompt.trim()}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isGenerating ? 'Generating...' : 'Generate Concept'}
                  </button>
                  <label className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 cursor-pointer">
                    <Upload className="w-4 h-4 inline mr-2" />
                    Upload Image
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
                  {sortedConcepts.length} concept{sortedConcepts.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            {/* Concepts Gallery */}
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
                <Car className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No concepts yet</h3>
                <p className="text-gray-600 mb-4">Start by generating or uploading your first vehicle concept.</p>
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
                    Modeling Requirements
                  </label>
                  <textarea
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="3D modeling specifications and requirements..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Animation Notes
                  </label>
                  <textarea
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Movement, physics, and animation requirements..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Sound Design
                  </label>
                  <textarea
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Engine sounds, effects, and audio requirements..."
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

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Confirm Delete</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete this render? This action cannot be undone.
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
                  handleRemoveGalleryImage(showDeleteConfirm);
                  setShowDeleteConfirm(null);
                }}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

