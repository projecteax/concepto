'use client';

import React, { useState, useEffect } from 'react';
import { GlobalAsset, AssetConcept, AIRefImages } from '@/types';
import { 
  ArrowLeft, 
  Wrench, 
  Upload, 
  Trash2, 
  Edit3,
  Save,
  X,
  Image as ImageIcon,
  Settings,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import { useS3Upload } from '@/hooks/useS3Upload';

interface GadgetDetailProps {
  gadget: GlobalAsset;
  onBack: () => void;
  onSave: (gadget: GlobalAsset) => void;
  onDeleteConcept: (conceptId: string) => void;
}

export function GadgetDetail({
  gadget,
  onBack,
  onSave,
  onDeleteConcept
}: GadgetDetailProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'concepts' | 'production' | 'ai-ref'>('general');
  const [isEditing, setIsEditing] = useState(false);
  
  // Form states
  const [name, setName] = useState(gadget.name);
  const [description, setDescription] = useState(gadget.description || '');
  const [gadgetType, setGadgetType] = useState('');
  const [functionality, setFunctionality] = useState('');
  const [powerSource, setPowerSource] = useState('');
  
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
  const [galleryImages, setGalleryImages] = useState<string[]>(gadget.galleryImages || []);
  const [mainRender, setMainRender] = useState<string>(gadget.mainRender || '');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  
  // AI Reference Images state
  const [aiRefImages, setAiRefImages] = useState<AIRefImages>(gadget.aiRefImages || {});
  
  // AI Ref upload progress tracking
  const [uploadingAIRefImages, setUploadingAIRefImages] = useState<Map<string, { progress: number; category: 'fullGadget' | 'multipleAnglesGadget'; file: File }>>(new Map());
  
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

  // Clean up data URLs in mainRender when component loads
  useEffect(() => {
    if (gadget.mainRender?.startsWith('data:')) {
      console.warn('Found data URL in mainRender, cleaning up to prevent size issues');
      // Clean up the data URL immediately
      onSave({ ...gadget, mainRender: undefined });
      setMainRender('');
    }
  }, [gadget.id]); // Only run when gadget changes

  // Update AI ref images state when gadget data changes
  useEffect(() => {
    if (gadget.aiRefImages) {
      setAiRefImages(gadget.aiRefImages);
    } else {
      setAiRefImages({});
    }
  }, [gadget.aiRefImages]);

  const handleSave = () => {
    const updatedGadget: GlobalAsset = {
      ...gadget,
      name: name.trim(),
      description: description.trim() || undefined,
      galleryImages: galleryImages,
      mainRender: mainRender,
      aiRefImages,
    };
    onSave(updatedGadget);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setName(gadget.name);
    setDescription(gadget.description || '');
    setIsEditing(false);
  };

  const handleImageUpload = async (file: File, conceptId?: string) => {
    const uploadId = conceptId || `temp-${Date.now()}`;
    setUploadingFiles(prev => new Map(prev).set(uploadId, { progress: 0 }));

    try {
      const result = await uploadFile(file, 'gadgets');
      const url = result?.url;

      if (url) {
        if (conceptId) {
          // Update existing concept
          const concept = gadget.concepts.find(c => c.id === conceptId);
          if (concept) {
            const updatedConcept: AssetConcept = {
              ...concept,
              imageUrl: url,
              updatedAt: new Date(),
            };
            const updatedConcepts = gadget.concepts.map(c => 
              c.id === conceptId ? updatedConcept : c
            );
            onSave({ ...gadget, concepts: updatedConcepts });
          }
        } else {
          // Create new concept and add it directly to gadget's concepts
          const newConcept: AssetConcept = {
            id: `concept-${Date.now()}`,
            category: 'gadget',
            assetId: gadget.id,
            name: newConceptName || file.name.split('.')[0],
            description: '',
            imageUrl: url,
            relevanceScale: 5,
            conceptType: 'general',
            tags: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          
          // Add the concept directly to the gadget's concepts
          const updatedConcepts = [...gadget.concepts, newConcept];
          onSave({ ...gadget, concepts: updatedConcepts });
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
      const result = await uploadFile(file, 'gadgets');
      if (result && result.url) {
        const newGalleryImages = [...galleryImages, result.url];
        setGalleryImages(newGalleryImages);
        
        // If this is the first image, set it as main render
        if (galleryImages.length === 0) {
          setMainRender(result.url);
        }
        
        // Prevent saving data URLs which cause size limit issues
        const safeMainRender = (mainRender || result.url)?.startsWith('data:') ? result.url : (mainRender || result.url);
        onSave({ ...gadget, galleryImages: newGalleryImages, mainRender: safeMainRender });
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
    onSave({ ...gadget, mainRender: imageUrl });
  };

  const handleRemoveGalleryImage = (imageUrl: string) => {
    const newGalleryImages = galleryImages.filter(img => img !== imageUrl);
    setGalleryImages(newGalleryImages);
    
    // If we removed the main render, set a new one or clear it
    if (mainRender === imageUrl) {
      const newMainRender = newGalleryImages.length > 0 ? newGalleryImages[0] : '';
      setMainRender(newMainRender);
      // Prevent saving data URLs
      const safeMainRender = newMainRender?.startsWith('data:') ? '' : newMainRender;
      onSave({ ...gadget, galleryImages: newGalleryImages, mainRender: safeMainRender });
    } else {
      // Prevent saving data URLs in existing mainRender
      const safeMainRender = mainRender?.startsWith('data:') ? '' : mainRender;
      onSave({ ...gadget, galleryImages: newGalleryImages, mainRender: safeMainRender });
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

  // AI Ref Image upload handlers
  const handleAIRefImageUpload = async (file: File, category: 'fullGadget' | 'multipleAnglesGadget') => {
    const uploadId = `${category}-${Date.now()}-${Math.random()}`;
    const previewUrl = URL.createObjectURL(file);
    
    setUploadingAIRefImages(prev => new Map(prev).set(uploadId, { progress: 0, category, file }));
    
    const extension = file.name.split('.').pop() || 'jpg';
    const categoryName = category === 'fullGadget' ? 'full_gadget' : 'multiple_angles';
    const customFileName = `${name}_${categoryName}`;
    
    let progressInterval: NodeJS.Timeout | null = null;
    progressInterval = setInterval(() => {
        setUploadingAIRefImages(prev => {
          const current = prev.get(uploadId);
          if (current && current.progress < 90) {
            const newMap = new Map(prev);
            newMap.set(uploadId, { ...current, progress: current.progress + 10 });
            return newMap;
          }
          return prev;
        });
    }, 200);
    
    try {
      const result = await uploadFile(file, `gadgets/${gadget.id}/ai-ref`, customFileName);
      
      if (progressInterval) {
        clearInterval(progressInterval);
      }
      
      setUploadingAIRefImages(prev => {
        const newMap = new Map(prev);
        const current = newMap.get(uploadId);
        if (current) {
          newMap.set(uploadId, { ...current, progress: 100 });
        }
        return newMap;
      });
      
      if (result && result.url) {
        // Update state immediately
        const updatedAiRefImages = {
          ...aiRefImages,
          [category]: [...(aiRefImages[category] || []), result.url]
        };
        setAiRefImages(updatedAiRefImages);
        
        // Save to database immediately
        const updatedGadget: GlobalAsset = {
          ...gadget,
          aiRefImages: updatedAiRefImages,
        };
        onSave(updatedGadget);
        
        // Small delay to show 100% progress before removing
        setTimeout(() => {
          setUploadingAIRefImages(prev => {
            const newMap = new Map(prev);
            newMap.delete(uploadId);
            return newMap;
          });
          URL.revokeObjectURL(previewUrl);
        }, 300);
      }
    } catch (error) {
      clearInterval(progressInterval);
      console.error('Failed to upload AI ref image:', error);
      setUploadingAIRefImages(prev => {
        const newMap = new Map(prev);
        newMap.delete(uploadId);
        return newMap;
      });
      URL.revokeObjectURL(previewUrl);
    }
  };

  const handleRemoveAIRefImage = (category: 'fullGadget' | 'multipleAnglesGadget', index: number) => {
    setAiRefImages(prev => ({
      ...prev,
      [category]: (prev[category] || []).filter((_, i) => i !== index)
    }));
  };

  const handleUpdateConcept = async (conceptId: string, updates: { name?: string; description?: string; relevanceScale?: number }) => {
    try {
      const updatedConcepts = (gadget.concepts || []).map(concept => 
        concept.id === conceptId 
          ? { ...concept, ...updates, updatedAt: new Date() }
          : concept
      );
      
      const updatedGadget = { ...gadget, concepts: updatedConcepts };
      onSave(updatedGadget);
      setEditingConcept(null);
    } catch (error) {
      console.error('Failed to update concept:', error);
    }
  };

  const sortedConcepts = (gadget.concepts || []).sort((a, b) => {
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
                <Wrench className="w-6 h-6 text-indigo-600" />
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
                      gadget.name
                    )}
                  </h1>
                  <p className="text-sm text-gray-500">Gadget Asset</p>
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
              { id: 'general', label: 'General', icon: Wrench },
              { id: 'concepts', label: 'Concepts', icon: ImageIcon },
              { id: 'production', label: 'Production', icon: Settings },
              { id: 'ai-ref', label: 'AI ref', icon: Sparkles },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as 'general' | 'concepts' | 'production' | 'ai-ref')}
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
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Gadget Information</h2>
              
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
                      placeholder="Describe this gadget..."
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
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Technical Specifications</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Gadget Type
                  </label>
                  <input
                    type="text"
                    value={gadgetType}
                    onChange={(e) => setGadgetType(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="e.g., Communication device, Weapon, Tool"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Power Source
                  </label>
                  <input
                    type="text"
                    value={powerSource}
                    onChange={(e) => setPowerSource(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="e.g., Battery, Solar, Manual"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Functionality
                  </label>
                  <textarea
                    value={functionality}
                    onChange={(e) => setFunctionality(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Describe how this gadget works and what it does..."
                  />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Design Features</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">Materials</h3>
                  <p className="text-gray-600">Primary construction materials</p>
                </div>
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">Size & Weight</h3>
                  <p className="text-gray-600">Physical dimensions and weight</p>
                </div>
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">Controls</h3>
                  <p className="text-gray-600">User interface and controls</p>
                </div>
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">Safety Features</h3>
                  <p className="text-gray-600">Safety mechanisms and warnings</p>
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
                  <p className="text-sm">Upload images to showcase your gadget</p>
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
                    placeholder="Describe the gadget concept you want to generate..."
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
                <Wrench className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No concepts yet</h3>
                <p className="text-gray-600 mb-4">Start by generating or uploading your first gadget concept.</p>
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
                    Manufacturing Requirements
                  </label>
                  <textarea
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Technical specifications for manufacturing..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Animation Notes
                  </label>
                  <textarea
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Notes for animators about how this gadget moves and functions..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Sound Design
                  </label>
                  <textarea
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Sound effects and audio requirements..."
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'ai-ref' && (
          <div className="space-y-6">
            <h3 className="text-xl font-semibold text-gray-900">AI Reference Gallery</h3>
            <p className="text-sm text-gray-600">Upload reference images organized by category for AI generation tools.</p>
            
            {/* Full Gadget Gallery */}
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-lg font-medium text-gray-900">Full Gadget</h4>
                <label className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer text-sm">
                  <Upload className="w-4 h-4 inline mr-2" />
                  Upload
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleAIRefImageUpload(file, 'fullGadget');
                    }}
                    className="hidden"
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {(aiRefImages.fullGadget || []).map((url, index) => (
                  <div key={index} className="relative group bg-gray-100 rounded-lg border border-gray-200 overflow-hidden">
                    <img
                      src={url}
                      alt={`Full gadget ${index + 1}`}
                      className="w-full h-48 object-contain cursor-pointer hover:opacity-90"
                      onClick={() => setSelectedImage({ url, alt: `Full gadget ${index + 1}` })}
                    />
                    <button
                      onClick={() => handleRemoveAIRefImage('fullGadget', index)}
                      className="absolute top-2 right-2 p-1 bg-red-600 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {Array.from(uploadingAIRefImages.entries())
                  .filter(([_, data]) => data.category === 'fullGadget')
                  .map(([uploadId, data]) => (
                    <div key={uploadId} className="relative bg-gray-100 rounded-lg border border-gray-200 overflow-hidden">
                      <img
                        src={URL.createObjectURL(data.file)}
                        alt="Uploading..."
                        className="w-full h-48 object-contain opacity-50"
                      />
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-30">
                        <RefreshCw className="w-6 h-6 text-white animate-spin mb-2" />
                        <div className="w-full px-2">
                          <div className="bg-gray-700 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${data.progress}%` }}
                            />
                          </div>
                          <p className="text-white text-xs mt-1 text-center">{data.progress}%</p>
                        </div>
                      </div>
                    </div>
                  ))}
                {(!aiRefImages.fullGadget || aiRefImages.fullGadget.length === 0) && 
                 Array.from(uploadingAIRefImages.values()).filter(d => d.category === 'fullGadget').length === 0 && (
                  <div className="col-span-full text-center py-8 text-gray-500">
                    <ImageIcon className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                    <p>No full gadget images uploaded</p>
                  </div>
                )}
              </div>
            </div>

            {/* Multiple Angles Gallery */}
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-lg font-medium text-gray-900">Multiple Angles</h4>
                <label className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer text-sm">
                  <Upload className="w-4 h-4 inline mr-2" />
                  Upload
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleAIRefImageUpload(file, 'multipleAnglesGadget');
                    }}
                    className="hidden"
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {(aiRefImages.multipleAnglesGadget || []).map((url, index) => (
                  <div key={index} className="relative group bg-gray-100 rounded-lg border border-gray-200 overflow-hidden">
                    <img
                      src={url}
                      alt={`Multiple angles ${index + 1}`}
                      className="w-full h-48 object-contain cursor-pointer hover:opacity-90"
                      onClick={() => setSelectedImage({ url, alt: `Multiple angles ${index + 1}` })}
                    />
                    <button
                      onClick={() => handleRemoveAIRefImage('multipleAnglesGadget', index)}
                      className="absolute top-2 right-2 p-1 bg-red-600 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {Array.from(uploadingAIRefImages.entries())
                  .filter(([_, data]) => data.category === 'multipleAnglesGadget')
                  .map(([uploadId, data]) => (
                    <div key={uploadId} className="relative bg-gray-100 rounded-lg border border-gray-200 overflow-hidden">
                      <img
                        src={URL.createObjectURL(data.file)}
                        alt="Uploading..."
                        className="w-full h-48 object-contain opacity-50"
                      />
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-30">
                        <RefreshCw className="w-6 h-6 text-white animate-spin mb-2" />
                        <div className="w-full px-2">
                          <div className="bg-gray-700 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${data.progress}%` }}
                            />
                          </div>
                          <p className="text-white text-xs mt-1 text-center">{data.progress}%</p>
                        </div>
                      </div>
                    </div>
                  ))}
                {(!aiRefImages.multipleAnglesGadget || aiRefImages.multipleAnglesGadget.length === 0) && 
                 Array.from(uploadingAIRefImages.values()).filter(d => d.category === 'multipleAnglesGadget').length === 0 && (
                  <div className="col-span-full text-center py-8 text-gray-500">
                    <ImageIcon className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                    <p>No multiple angles images uploaded</p>
                  </div>
                )}
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
