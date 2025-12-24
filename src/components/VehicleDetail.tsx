'use client';

import React, { useState, useEffect } from 'react';
import { GlobalAsset, AssetConcept, Show } from '@/types';
import { 
  Car, 
  Upload, 
  Trash2, 
  Edit3,
  Save,
  X,
  Image as ImageIcon,
  Settings,
  Sparkles,
  Star,
  ZoomIn,
  Download,
  Filter,
  CheckCircle,
  RefreshCw
} from 'lucide-react';
import { AIRefImages } from '@/types';
import { useS3Upload } from '@/hooks/useS3Upload';
import { AssetConceptGenerationDialog } from './AssetConceptGenerationDialog';
import { cn } from '@/lib/utils';
import { AppBreadcrumbHeader } from './AppBreadcrumbHeader';
import { useBasePath } from '@/hooks/useBasePath';

interface VehicleDetailProps {
  show: Show;
  vehicle: GlobalAsset;
  onBack: () => void;
  onSave: (vehicle: GlobalAsset) => void;
  onAddConcept: (concept: Omit<AssetConcept, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onDeleteConcept: (conceptId: string) => void;
  globalAssets?: GlobalAsset[];
}

export function VehicleDetail({
  show,
  vehicle,
  onBack,
  onSave,
  onAddConcept,
  onDeleteConcept,
  globalAssets = []
}: VehicleDetailProps) {
  const basePath = useBasePath();
  const headerIsDark = Boolean(show.coverImageUrl);
  const [activeTab, setActiveTab] = useState<'general' | 'concepts' | 'production' | 'ai-ref'>('general');
  const [isEditing, setIsEditing] = useState(false);
  
  // Form states
  const [name, setName] = useState(vehicle.name);
  const [description, setDescription] = useState(vehicle.description || '');
  const [interiorDescription, setInteriorDescription] = useState('');
  const [exteriorDescription, setExteriorDescription] = useState('');
  
  // Concept generation dialog
  const [showImageGenerationDialog, setShowImageGenerationDialog] = useState(false);
  const [selectedConceptType, setSelectedConceptType] = useState<'all' | 'interior' | 'exterior' | 'general'>('all');
  const [selectedConceptIds, setSelectedConceptIds] = useState<Set<string>>(new Set());
  
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
  
  // AI Reference Images state
  const [aiRefImages, setAiRefImages] = useState<AIRefImages>(vehicle.aiRefImages || {});
  
  // AI Ref upload progress tracking
  const [uploadingAIRefImages, setUploadingAIRefImages] = useState<Map<string, { progress: number; category: 'interior' | 'exterior'; file: File }>>(new Map());
  
  // REF assignment modal state
  const [refAssignmentModal, setRefAssignmentModal] = useState<{ conceptId: string; imageUrl: string; conceptName: string } | null>(null);

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
    if (vehicle.mainRender?.startsWith('data:')) {
      console.warn('Found data URL in mainRender, cleaning up to prevent size issues');
      // Clean up the data URL immediately
      onSave({ ...vehicle, mainRender: undefined });
      setMainRender('');
    }
  }, [vehicle.id]); // Only run when vehicle changes

  // Update AI ref images state when vehicle data changes
  useEffect(() => {
    if (vehicle.aiRefImages) {
      setAiRefImages(vehicle.aiRefImages);
    } else {
      setAiRefImages({});
    }
  }, [vehicle.aiRefImages]);

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
            name: file.name.split('.')[0],
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
        
        // Prevent saving data URLs which cause size limit issues
        const safeMainRender = (mainRender || result.url)?.startsWith('data:') ? result.url : (mainRender || result.url);
        onSave({ ...vehicle, galleryImages: newGalleryImages, mainRender: safeMainRender });
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
      // Prevent saving data URLs
      const safeMainRender = newMainRender?.startsWith('data:') ? '' : newMainRender;
      onSave({ ...vehicle, galleryImages: newGalleryImages, mainRender: safeMainRender });
    } else {
      // Prevent saving data URLs in existing mainRender
      const safeMainRender = mainRender?.startsWith('data:') ? '' : mainRender;
      onSave({ ...vehicle, galleryImages: newGalleryImages, mainRender: safeMainRender });
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

  // AI Ref Image upload handlers
  const handleAIRefImageUpload = async (file: File, category: 'interior' | 'exterior') => {
    const uploadId = `${category}-${Date.now()}-${Math.random()}`;
    const previewUrl = URL.createObjectURL(file);
    
    setUploadingAIRefImages(prev => new Map(prev).set(uploadId, { progress: 0, category, file }));
    
    const extension = file.name.split('.').pop() || 'jpg';
    const categoryName = category === 'interior' ? 'interior' : 'exterior';
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
      const result = await uploadFile(file, `vehicles/${vehicle.id}/ai-ref`, customFileName);
      
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
        const updatedVehicle: GlobalAsset = {
          ...vehicle,
          aiRefImages: updatedAiRefImages,
        };
        onSave(updatedVehicle);
        
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
      if (progressInterval) {
        clearInterval(progressInterval);
      }
      console.error('Failed to upload AI ref image:', error);
      setUploadingAIRefImages(prev => {
        const newMap = new Map(prev);
        newMap.delete(uploadId);
        return newMap;
      });
      URL.revokeObjectURL(previewUrl);
    }
  };

  const handleRemoveAIRefImage = (category: 'interior' | 'exterior', index: number) => {
    const updatedAiRefImages = {
      ...aiRefImages,
      [category]: (aiRefImages[category] || []).filter((_, i) => i !== index)
    };
    setAiRefImages(updatedAiRefImages);
    
    // Save to database
    const updatedVehicle = { ...vehicle, aiRefImages: updatedAiRefImages };
    onSave(updatedVehicle);
  };

  const handleAssignToAIRef = (category: 'interior' | 'exterior') => {
    if (!refAssignmentModal) return;
    
    const { imageUrl } = refAssignmentModal;
    const updatedAiRefImages = {
      ...aiRefImages,
      [category]: [...(aiRefImages[category] || []), imageUrl]
    };
    setAiRefImages(updatedAiRefImages);
    
    // Save to database
    const updatedVehicle = { ...vehicle, aiRefImages: updatedAiRefImages };
    onSave(updatedVehicle);
    
    // Close modal
    setRefAssignmentModal(null);
  };

  // Sort and filter concepts based on selected criteria
  const getSortedConcepts = () => {
    let concepts = [...(vehicle.concepts || [])];
    
    // Filter by concept type
    if (selectedConceptType !== 'all') {
      concepts = concepts.filter(concept => concept.conceptType === selectedConceptType);
    }
    
    // Sort concepts
    switch (sortBy) {
      case 'newest':
        return concepts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      case 'oldest':
        return concepts.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      case 'relevance':
        return concepts.sort((a, b) => (b.relevanceScale || 0) - (a.relevanceScale || 0));
      case 'name':
        return concepts.sort((a, b) => a.name.localeCompare(b.name));
      default:
        return concepts;
    }
  };

  // Get concept counts by type
  const getConceptCounts = () => {
    const concepts = vehicle.concepts || [];
    const counts = {
      all: concepts.length,
      interior: concepts.filter(c => c.conceptType === 'interior').length,
      exterior: concepts.filter(c => c.conceptType === 'exterior').length,
      general: concepts.filter(c => c.conceptType === 'general' || !c.conceptType).length,
    };
    return counts;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <AppBreadcrumbHeader
        coverImageUrl={show.coverImageUrl}
        logoUrl={show.logoUrl}
        backHref={`${basePath}/shows/${show.id}/assets?category=vehicle`}
        items={[
          { label: show.name, href: `${basePath}/shows/${show.id}` },
          { label: 'Assets', href: `${basePath}/shows/${show.id}/assets` },
          { label: 'Vehicles', href: `${basePath}/shows/${show.id}/assets?category=vehicle` },
          { label: vehicle.name || 'Vehicle' },
        ]}
        subtitle="Vehicle asset"
        actions={
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <button
                  onClick={handleCancel}
                  className="px-3 py-2 text-white/90 hover:text-white rounded-lg hover:bg-white/10"
                  title="Cancel"
                >
                  <X className="w-4 h-4" />
                </button>
                <button
                  onClick={handleSave}
                  className="px-3 py-2 bg-white/90 text-gray-900 rounded-lg hover:bg-white"
                  title="Save"
                >
                  <Save className="w-4 h-4" />
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                className="px-3 py-2 text-white/90 hover:text-white rounded-lg hover:bg-white/10"
                title="Edit"
              >
                <Edit3 className="w-4 h-4" />
              </button>
            )}
          </div>
        }
        title={
          isEditing ? (
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`w-full text-2xl sm:text-3xl font-bold bg-transparent border-b focus:outline-none ${
                headerIsDark
                  ? 'border-white/40 focus:border-white text-white'
                  : 'border-border focus:border-primary text-foreground'
              }`}
              autoFocus
            />
          ) : (
            <div className={`text-2xl sm:text-3xl font-bold truncate ${headerIsDark ? 'text-white' : 'text-foreground'}`}>
              {vehicle.name}
            </div>
          )
        }
      />

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8">
            {[
              { id: 'general', label: 'General', icon: Car },
              { id: 'concepts', label: 'Concepts', icon: ImageIcon },
              { id: 'ai-ref', label: 'AI ref', icon: Sparkles },
              { id: 'production', label: 'Production', icon: Settings },
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
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Vehicle Design</h2>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Exterior Description
                  </label>
                  <textarea
                    value={exteriorDescription}
                    onChange={(e) => setExteriorDescription(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                    rows={4}
                    placeholder="Describe the vehicle's exterior appearance, body style, colors, and overall look..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Interior Description
                  </label>
                  <textarea
                    value={interiorDescription}
                    onChange={(e) => setInteriorDescription(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                    rows={4}
                    placeholder="Describe the vehicle's interior layout, seating, controls, and cabin design..."
                  />
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
            {/* Concepts Section - Redesigned to match CharacterDetail */}
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">Concept Art Gallery</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {(vehicle.concepts || []).length} {(vehicle.concepts || []).length === 1 ? 'concept' : 'concepts'}
                    {mainRender && (
                      <span className="ml-2 text-green-600 flex items-center space-x-1">
                        <Star className="w-3 h-3 fill-current" />
                        <span>Main concept set</span>
                      </span>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => setShowImageGenerationDialog(true)}
                  className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 cursor-pointer"
                  title="Generate concept art"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Generate Concept</span>
                </button>
              </div>

              {/* Concepts Gallery - Two-panel layout matching dialog */}
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Left Panel - Filters and Controls */}
                <div className="lg:col-span-1 space-y-4">
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <h4 className="text-sm font-semibold text-gray-900 mb-4">Filters</h4>
                    
                    {/* Concept Type Filter */}
                    <div className="space-y-3 mb-4">
                      <label className="block text-xs font-medium text-gray-700">Concept Type</label>
                      <div className="space-y-2">
                        {(['all', 'interior', 'exterior', 'general'] as const).map((type) => {
                          const counts = getConceptCounts();
                          return (
                            <button
                              key={type}
                              onClick={() => setSelectedConceptType(type)}
                              className={cn(
                                "w-full text-left px-3 py-2 text-sm rounded-lg transition-colors",
                                selectedConceptType === type
                                  ? "bg-indigo-600 text-white"
                                  : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-200"
                              )}
                            >
                              <div className="flex items-center justify-between">
                                <span>{type === 'all' ? 'All Types' : type.charAt(0).toUpperCase() + type.slice(1)}</span>
                                <span className={cn(
                                  "text-xs px-2 py-0.5 rounded-full",
                                  selectedConceptType === type
                                    ? "bg-white/20 text-white"
                                    : "bg-gray-200 text-gray-600"
                                )}>
                                  {counts[type]}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Sort Controls */}
                    <div className="space-y-3 mb-4">
                      <label className="block text-xs font-medium text-gray-700">Sort</label>
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as 'newest' | 'oldest' | 'relevance' | 'name')}
                        className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        <option value="newest">Newest First</option>
                        <option value="oldest">Oldest First</option>
                        <option value="relevance">Relevance</option>
                        <option value="name">Name A-Z</option>
                      </select>
                    </div>

                    {/* Main Concept Indicator */}
                    {mainRender && (
                      <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                        <div className="flex items-center space-x-2">
                          <Star className="w-4 h-4 text-green-600 fill-current" />
                          <div className="flex-1">
                            <div className="text-xs font-medium text-green-900">Main Concept</div>
                            <div className="text-xs text-green-700">Set as reference for future generations</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Panel - Concepts Grid */}
                <div className="lg:col-span-3">
                  {(vehicle.concepts || []).length > 0 ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {getSortedConcepts().map((concept) => {
                          const isMainConcept = concept.imageUrl === mainRender;
                          const conceptStyle = concept.tags?.find(tag => 
                            ['2d-disney', '3d-pixar', 'studio-ghibli', '2d-cartoon', '3d-realistic', 'watercolor', 'digital-painting'].includes(tag)
                          );
                          const styleLabel = conceptStyle 
                            ? conceptStyle.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
                            : null;

                          return (
                            <div
                              key={concept.id}
                              className={cn(
                                "relative group border-2 rounded-lg overflow-hidden cursor-pointer transition-all bg-white",
                                isMainConcept
                                  ? 'border-green-500 ring-2 ring-green-200 shadow-lg'
                                  : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
                              )}
                              onClick={() => {
                                setSelectedImage({ url: concept.imageUrl || concept.videoUrl || '', alt: concept.name });
                              }}
                            >
                              {/* REF Button */}
                              {concept.imageUrl && (
                                <div 
                                  className="absolute top-2 left-2 z-20"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRefAssignmentModal({
                                      conceptId: concept.id,
                                      imageUrl: concept.imageUrl!,
                                      conceptName: concept.name
                                    });
                                  }}
                                >
                                  <button
                                    className="px-2 py-1 bg-indigo-600 text-white text-xs font-medium rounded shadow-lg hover:bg-indigo-700 transition-colors"
                                    title="Assign to AI reference"
                                  >
                                    REF
                                  </button>
                                </div>
                              )}
                              {concept.imageUrl ? (
                                <img
                                  src={concept.imageUrl}
                                  alt={concept.name}
                                  className="w-full h-64 object-cover"
                                />
                              ) : (
                                <div className="w-full h-64 bg-gray-100 flex items-center justify-center">
                                  <ImageIcon className="w-12 h-12 text-gray-400" />
                                </div>
                              )}
                              
                              {/* Main Concept Badge */}
                              {isMainConcept && (
                                <div className="absolute top-2 left-2 bg-green-600 text-white px-2 py-1 rounded text-xs font-medium flex items-center space-x-1 shadow-lg z-10">
                                  <Star className="w-3 h-3 fill-current" />
                                  <span>Main Concept</span>
                                </div>
                              )}

                              {/* Style Badge */}
                              {concept.isGenerated && styleLabel && (
                                <div className="absolute top-2 right-2 bg-indigo-600 text-white px-2 py-1 rounded text-xs font-medium shadow-lg z-10">
                                  {styleLabel}
                                </div>
                              )}

                              {/* Overlay Actions */}
                              <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                                <div className="flex space-x-2">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (concept.imageUrl) {
                                        setMainRender(concept.imageUrl);
                                        const updatedVehicle: GlobalAsset = {
                                          ...vehicle,
                                          mainRender: concept.imageUrl,
                                        };
                                        onSave(updatedVehicle);
                                      }
                                    }}
                                    className="p-2 bg-white rounded-lg hover:bg-gray-100 transition-colors"
                                    title={isMainConcept ? "Main Concept" : "Set as Main Concept"}
                                  >
                                    <Star className={cn("w-5 h-5", isMainConcept ? 'text-yellow-500 fill-current' : 'text-gray-700')} />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedImage({ url: concept.imageUrl || concept.videoUrl || '', alt: concept.name });
                                    }}
                                    className="p-2 bg-white rounded-lg hover:bg-gray-100 transition-colors"
                                    title="Preview"
                                  >
                                    <ZoomIn className="w-5 h-5 text-gray-700" />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (concept.imageUrl) {
                                        const link = document.createElement('a');
                                        link.href = concept.imageUrl;
                                        link.download = concept.name || 'concept';
                                        link.click();
                                      }
                                    }}
                                    className="p-2 bg-white rounded-lg hover:bg-gray-100 transition-colors"
                                    title="Download"
                                  >
                                    <Download className="w-5 h-5 text-gray-700" />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onDeleteConcept(concept.id);
                                    }}
                                    className="p-2 bg-white rounded-lg hover:bg-gray-100 transition-colors"
                                    title="Delete"
                                  >
                                    <Trash2 className="w-5 h-5 text-gray-700" />
                                  </button>
                                </div>
                              </div>

                              {/* Concept Info Overlay */}
                              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/60 to-transparent p-3">
                                <div className="text-white">
                                  <div className="font-medium text-sm truncate mb-1">{concept.name}</div>
                                  <div className="flex items-center space-x-2 text-xs">
                                    {concept.conceptType && (
                                      <span className="px-2 py-0.5 bg-white/20 rounded">
                                        {concept.conceptType}
                                      </span>
                                    )}
                                    {concept.isGenerated && (
                                      <span className="flex items-center space-x-1 text-white/80">
                                        <Sparkles className="w-3 h-3" />
                                        <span>AI Generated</span>
                                      </span>
                                    )}
                                  </div>
                                  {concept.description && (
                                    <div className="text-xs text-white/70 mt-1 line-clamp-1">
                                      {concept.description}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50">
                      <ImageIcon className="w-16 h-16 text-gray-400 mb-4" />
                      <h4 className="text-lg font-medium text-gray-900 mb-2">No concepts yet</h4>
                      <p className="text-sm text-gray-600 mb-6 text-center max-w-md">
                        Generate or upload your first vehicle concept art to get started. Concepts will appear here in a gallery matching the generation dialog.
                      </p>
                      <button
                        onClick={() => setShowImageGenerationDialog(true)}
                        className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                      >
                        <Sparkles className="w-4 h-4" />
                        <span>Generate Concept</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'ai-ref' && (
          <div className="space-y-6">
            <h3 className="text-xl font-semibold text-gray-900">AI Reference Gallery</h3>
            <p className="text-sm text-gray-600">Upload reference images organized by category for AI generation tools.</p>
            
            {/* Interior Gallery */}
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-lg font-medium text-gray-900">Interior</h4>
                <label className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer text-sm">
                  <Upload className="w-4 h-4 inline mr-2" />
                  Upload
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleAIRefImageUpload(file, 'interior');
                    }}
                    className="hidden"
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {(aiRefImages.interior || []).map((url, index) => (
                  <div key={index} className="relative group bg-gray-100 rounded-lg border border-gray-200 overflow-hidden">
                    <img
                      src={url}
                      alt={`Interior ${index + 1}`}
                      className="w-full h-48 object-contain cursor-pointer hover:opacity-90"
                      onClick={() => setSelectedImage({ url, alt: `Interior ${index + 1}` })}
                    />
                    <button
                      onClick={() => handleRemoveAIRefImage('interior', index)}
                      className="absolute top-2 right-2 p-1 bg-red-600 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {Array.from(uploadingAIRefImages.entries())
                  .filter(([_, data]) => data.category === 'interior')
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
                {(!aiRefImages.interior || aiRefImages.interior.length === 0) && 
                 Array.from(uploadingAIRefImages.values()).filter(d => d.category === 'interior').length === 0 && (
                  <div className="col-span-full text-center py-8 text-gray-500">
                    <ImageIcon className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                    <p>No interior images uploaded</p>
                  </div>
                )}
              </div>
            </div>

            {/* Exterior Gallery */}
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-lg font-medium text-gray-900">Exterior</h4>
                <label className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer text-sm">
                  <Upload className="w-4 h-4 inline mr-2" />
                  Upload
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleAIRefImageUpload(file, 'exterior');
                    }}
                    className="hidden"
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {(aiRefImages.exterior || []).map((url, index) => (
                  <div key={index} className="relative group bg-gray-100 rounded-lg border border-gray-200 overflow-hidden">
                    <img
                      src={url}
                      alt={`Exterior ${index + 1}`}
                      className="w-full h-48 object-contain cursor-pointer hover:opacity-90"
                      onClick={() => setSelectedImage({ url, alt: `Exterior ${index + 1}` })}
                    />
                    <button
                      onClick={() => handleRemoveAIRefImage('exterior', index)}
                      className="absolute top-2 right-2 p-1 bg-red-600 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {Array.from(uploadingAIRefImages.entries())
                  .filter(([_, data]) => data.category === 'exterior')
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
                {(!aiRefImages.exterior || aiRefImages.exterior.length === 0) && 
                 Array.from(uploadingAIRefImages.values()).filter(d => d.category === 'exterior').length === 0 && (
                  <div className="col-span-full text-center py-8 text-gray-500">
                    <ImageIcon className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                    <p>No exterior images uploaded</p>
                  </div>
                )}
              </div>
            </div>
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

      {/* REF Assignment Modal */}
      {refAssignmentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Assign to AI Reference</h3>
              <button
                onClick={() => setRefAssignmentModal(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Select which section to assign &quot;{refAssignmentModal.conceptName}&quot; to:
            </p>
            <div className="space-y-2">
              <button
                onClick={() => handleAssignToAIRef('interior')}
                className="w-full px-4 py-3 text-left bg-gray-50 hover:bg-indigo-50 border border-gray-200 hover:border-indigo-300 rounded-lg transition-colors"
              >
                <div className="font-medium text-gray-900">Interior</div>
                <div className="text-sm text-gray-500">Add to Interior section</div>
              </button>
              <button
                onClick={() => handleAssignToAIRef('exterior')}
                className="w-full px-4 py-3 text-left bg-gray-50 hover:bg-indigo-50 border border-gray-200 hover:border-indigo-300 rounded-lg transition-colors"
              >
                <div className="font-medium text-gray-900">Exterior</div>
                <div className="text-sm text-gray-500">Add to Exterior section</div>
              </button>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setRefAssignmentModal(null)}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Asset Concept Generation Dialog */}
      {showImageGenerationDialog && (() => {
        const vehicleDescriptionParts: string[] = [];
        if (name) vehicleDescriptionParts.push(`Vehicle name: ${name}`);
        if (description) vehicleDescriptionParts.push(`Description: ${description}`);
        if (exteriorDescription) vehicleDescriptionParts.push(`Exterior description: ${exteriorDescription}`);
        if (interiorDescription) vehicleDescriptionParts.push(`Interior description: ${interiorDescription}`);
        
        const vehicleDescription = vehicleDescriptionParts.length > 0
          ? vehicleDescriptionParts.join('\n')
          : `Vehicle: ${name}`;

        // Get selected concept images
        const selectedConcepts = (vehicle.concepts || []).filter(c => selectedConceptIds.has(c.id));
        const selectedConceptImages = selectedConcepts
          .map(c => c.imageUrl)
          .filter((url): url is string => !!url);
        
        return (
          <AssetConceptGenerationDialog
            isOpen={showImageGenerationDialog}
            onClose={() => setShowImageGenerationDialog(false)}
            selectedReferenceImages={selectedConceptImages}
            onImageGenerated={async (imageUrl, isMainConcept) => {
              if (imageUrl) {
                // If set as main concept, update main render
                if (isMainConcept) {
                  setMainRender(imageUrl);
                  const updatedVehicle: GlobalAsset = {
                    ...vehicle,
                    mainRender: imageUrl,
                  };
                  onSave(updatedVehicle);
                }
              }
            }}
            onConceptCreated={(conceptData) => {
              // Save the generated image as a concept
              onAddConcept(conceptData);
            }}
            asset={vehicle}
            assetDescription={vehicleDescription}
            globalAssets={globalAssets}
            showId={vehicle.showId}
          />
        );
      })()}
    </div>
  );
}

