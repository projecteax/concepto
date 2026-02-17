'use client';

import React, { useState, useEffect } from 'react';
import { GlobalAsset, AssetConcept, AIRefImages, Show } from '@/types';
import { 
  MapPin, 
  Upload, 
  Trash2, 
  Edit3,
  Save,
  X,
  Image as ImageIcon,
  Palette,
  Sparkles,
  RefreshCw,
  CheckCircle
} from 'lucide-react';
import { useS3Upload } from '@/hooks/useS3Upload';
import { AssetConceptGenerationDialog } from './AssetConceptGenerationDialog';
import { AppBreadcrumbHeader } from './AppBreadcrumbHeader';
import { useBasePath } from '@/hooks/useBasePath';

interface LocationDetailProps {
  show: Show;
  location: GlobalAsset;
  onBack: () => void;
  onSave: (location: GlobalAsset) => void;
  onDeleteConcept: (conceptId: string) => void;
  globalAssets?: GlobalAsset[]; // For image generation context
  isReadOnly?: boolean;
}

export function LocationDetail({
  show,
  location,
  onBack,
  onSave: onSaveProp,
  onDeleteConcept: onDeleteConceptProp,
  globalAssets = [],
  isReadOnly = false
}: LocationDetailProps) {
  const basePath = useBasePath();
  const headerIsDark = Boolean(show.coverImageUrl);
  const [activeTab, setActiveTab] = useState<'general' | 'concepts' | 'production' | 'ai-ref'>('general');
  const [isEditing, setIsEditing] = useState(false);
  
  // Form states
  const [name, setName] = useState(location.name);
  const [description, setDescription] = useState(location.description || '');
  const [environmentType, setEnvironmentType] = useState(location.environmentType || '');
  const [timeOfDay, setTimeOfDay] = useState(location.timeOfDay || '');
  const [weather, setWeather] = useState(location.weather || '');
  const [season, setSeason] = useState(location.season || '');
  
  // Concept generation
  const [generationPrompt, setGenerationPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [newConceptName, setNewConceptName] = useState('');
  
  // Image upload states
  const [uploadingFiles, setUploadingFiles] = useState<Map<string, { progress: number; error?: string }>>(new Map());
  const { uploadFile } = useS3Upload();
  
  // Gallery states
  const [galleryImages, setGalleryImages] = useState<string[]>(location.galleryImages || []);
  const [mainRender, setMainRender] = useState<string>(location.mainRender || '');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  
  // AI Reference Images state
  const [aiRefImages, setAiRefImages] = useState<AIRefImages>(location.aiRefImages || {});
  
  // AI Ref upload progress tracking
  const [uploadingAIRefImages, setUploadingAIRefImages] = useState<Map<string, { progress: number; category: 'ref01' | 'ref02' | 'ref03' | 'ref04'; file: File }>>(new Map());
  
  // Concept gallery states
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'relevance' | 'name'>('newest');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedImage, setSelectedImage] = useState<{ url: string; alt: string } | null>(null);
  const [editingConcept, setEditingConcept] = useState<string | null>(null);
  
  // Image generation state
  const [showImageGenerationDialog, setShowImageGenerationDialog] = useState(false);
  const [selectedConceptIds, setSelectedConceptIds] = useState<Set<string>>(new Set());

  const onSave = React.useCallback((updatedLocation: GlobalAsset) => {
    if (isReadOnly) return;
    onSaveProp(updatedLocation);
  }, [isReadOnly, onSaveProp]);

  const onDeleteConcept = React.useCallback((conceptId: string) => {
    if (isReadOnly) return;
    onDeleteConceptProp(conceptId);
  }, [isReadOnly, onDeleteConceptProp]);

  const blockReadOnlyInteractions = React.useCallback((e: React.SyntheticEvent) => {
    if (!isReadOnly) return;
    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('[data-viewer-visible]')) return;
    if (target.closest('button, input, textarea, select, [role="button"], [contenteditable="true"], a')) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, [isReadOnly]);
  
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

  // Debug concepts data
  useEffect(() => {
    console.log('Location object:', location);
    console.log('Location concepts:', location.concepts);
    console.log('Location concepts type:', typeof location.concepts);
    console.log('Location concepts length:', location.concepts?.length);
    
    if (location.concepts && location.concepts.length > 0) {
      console.log('First concept:', location.concepts[0]);
      console.log('First concept imageUrl:', location.concepts[0].imageUrl);
    }
  }, [location]);

  // Clean up data URLs in mainRender when component loads
  useEffect(() => {
    if (location.mainRender?.startsWith('data:')) {
      console.warn('Found data URL in mainRender, cleaning up to prevent size issues');
      // Clean up the data URL immediately
      onSave({ ...location, mainRender: undefined });
      setMainRender('');
    }
  }, [location.id]); // Only run when location changes

  // Update AI ref images state when location data changes
  useEffect(() => {
    if (location.aiRefImages) {
      setAiRefImages(location.aiRefImages);
    } else {
      setAiRefImages({});
    }
  }, [location.aiRefImages]);

  const handleSave = () => {
    // Prevent saving data URLs which cause size limit issues
    const safeMainRender = mainRender?.startsWith('data:') ? undefined : mainRender;
    
    const updatedLocation: GlobalAsset = {
      ...location,
      name: name.trim(),
      description: description.trim() || undefined,
      galleryImages: galleryImages,
      mainRender: safeMainRender,
      environmentType: environmentType || undefined,
      timeOfDay: timeOfDay || undefined,
      weather: weather || undefined,
      season: season || undefined,
      aiRefImages,
    };
    onSave(updatedLocation);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setName(location.name);
    setDescription(location.description || '');
    setEnvironmentType(location.environmentType || '');
    setTimeOfDay(location.timeOfDay || '');
    setWeather(location.weather || '');
    setSeason(location.season || '');
    setIsEditing(false);
  };

  const handleImageUpload = async (file: File, conceptId?: string) => {
    const uploadId = conceptId || `temp-${Date.now()}`;
    setUploadingFiles(prev => new Map(prev).set(uploadId, { progress: 0 }));

    try {
      const result = await uploadFile(file, 'locations');
      const url = result?.url;

      if (url) {
        if (conceptId) {
          // Update existing concept
          const concept = location.concepts?.find(c => c.id === conceptId);
          if (concept) {
            const updatedConcept: AssetConcept = {
              ...concept,
              imageUrl: url,
              updatedAt: new Date(),
            };
            const updatedConcepts = (location.concepts || []).map(c => 
              c.id === conceptId ? updatedConcept : c
            );
            onSave({ ...location, concepts: updatedConcepts });
          }
        } else {
          // Create new concept using the proper concept system
          const newConcept: AssetConcept = {
            id: `concept-${Date.now()}`,
            category: 'location',
            assetId: location.id,
            name: newConceptName || file.name.split('.')[0],
            description: '',
            imageUrl: url,
            relevanceScale: 5,
            conceptType: 'general',
            tags: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          
          // Add the concept directly to the location's concepts
          const updatedConcepts = [...(location.concepts || []), newConcept];
          onSave({ ...location, concepts: updatedConcepts });
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
      const result = await uploadFile(file, 'locations');
      if (result && result.url) {
        const newGalleryImages = [...galleryImages, result.url];
        setGalleryImages(newGalleryImages);
        
        // If this is the first image, set it as main render
        if (galleryImages.length === 0) {
          setMainRender(result.url);
        }
        
        // Prevent saving data URLs which cause size limit issues
        const safeMainRender = (mainRender || result.url)?.startsWith('data:') ? result.url : (mainRender || result.url);
        onSave({ ...location, galleryImages: newGalleryImages, mainRender: safeMainRender });
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
    onSave({ ...location, mainRender: imageUrl });
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
      onSave({ ...location, galleryImages: newGalleryImages, mainRender: safeMainRender });
    } else {
      // Prevent saving data URLs in existing mainRender
      const safeMainRender = mainRender?.startsWith('data:') ? '' : mainRender;
      onSave({ ...location, galleryImages: newGalleryImages, mainRender: safeMainRender });
    }
  };

  const handleGenerateImage = async () => {
    if (!generationPrompt.trim()) return;
    
    setIsGenerating(true);
    try {
      // This would integrate with your image generation service
      // For now, we'll just show a placeholder
      console.log('Generating image with prompt:', generationPrompt);
      // const generatedUrl = await generateImage(generationPrompt, location.showId);
      // Handle the generated image...
    } catch (error) {
      console.error('Image generation failed:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  // AI Ref Image upload handlers
  const handleAIRefImageUpload = async (file: File, category: 'ref01' | 'ref02' | 'ref03' | 'ref04') => {
    const uploadId = `${category}-${Date.now()}-${Math.random()}`;
    const previewUrl = URL.createObjectURL(file);
    
    setUploadingAIRefImages(prev => new Map(prev).set(uploadId, { progress: 0, category, file }));
    
    let progressInterval: NodeJS.Timeout | undefined;
    try {
      const extension = file.name.split('.').pop() || 'jpg';
      const customFileName = `${name}_${category}`;
      
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
      
      const result = await uploadFile(file, `locations/${location.id}/ai-ref`, customFileName);
      
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
        const updatedLocation: GlobalAsset = {
          ...location,
          aiRefImages: updatedAiRefImages,
        };
        onSave(updatedLocation);
        
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

  const handleRemoveAIRefImage = (category: 'ref01' | 'ref02' | 'ref03' | 'ref04', index: number) => {
    const updatedAiRefImages = {
      ...aiRefImages,
      [category]: (aiRefImages[category] || []).filter((_, i) => i !== index)
    };
    setAiRefImages(updatedAiRefImages);
    
    // Save to database
    const updatedLocation: GlobalAsset = {
      ...location,
      aiRefImages: updatedAiRefImages,
    };
    onSave(updatedLocation);
  };

  const handleAssignToAIRef = (category: 'ref01' | 'ref02' | 'ref03' | 'ref04') => {
    if (!refAssignmentModal) return;
    
    const { imageUrl } = refAssignmentModal;
    const updatedAiRefImages = {
      ...aiRefImages,
      [category]: [...(aiRefImages[category] || []), imageUrl]
    };
    setAiRefImages(updatedAiRefImages);
    
    // Save to database
    const updatedLocation: GlobalAsset = {
      ...location,
      aiRefImages: updatedAiRefImages,
    };
    onSave(updatedLocation);
    
    // Close modal
    setRefAssignmentModal(null);
  };

  const handleUpdateConcept = async (conceptId: string, updates: { name?: string; description?: string; relevanceScale?: number }) => {
    try {
      const updatedConcepts = (location.concepts || []).map(concept => 
        concept.id === conceptId 
          ? { ...concept, ...updates, updatedAt: new Date() }
          : concept
      );
      
      const updatedLocation = { ...location, concepts: updatedConcepts };
      onSave(updatedLocation);
      setEditingConcept(null);
    } catch (error) {
      console.error('Failed to update concept:', error);
    }
  };

  const sortedConcepts = (location.concepts || []).sort((a, b) => {
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
    <div
      className="min-h-screen bg-gray-50"
      data-asset-readonly={isReadOnly || undefined}
      onClickCapture={blockReadOnlyInteractions}
      onMouseDownCapture={blockReadOnlyInteractions}
      onInputCapture={blockReadOnlyInteractions}
      onChangeCapture={blockReadOnlyInteractions}
      onKeyDownCapture={blockReadOnlyInteractions}
      onDropCapture={blockReadOnlyInteractions}
    >
      {isReadOnly && (
        <>
        <style>{`
          [data-asset-readonly] button:not([data-viewer-visible]),
          [data-asset-readonly] input[type="file"],
          [data-asset-readonly] label.cursor-pointer { display: none !important; }
          [data-asset-readonly] input[type="text"]:not([data-viewer-visible]),
          [data-asset-readonly] textarea:not([data-viewer-visible]),
          [data-asset-readonly] select:not([data-viewer-visible]) {
            pointer-events: none; background: #f9fafb; border-color: transparent; resize: none;
          }
        `}</style>
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-sm">
          Viewer mode: location details are read-only.
        </div>
        </>
      
      )}
      <AppBreadcrumbHeader
        coverImageUrl={show.coverImageUrl}
        logoUrl={show.logoUrl}
        backHref={`${basePath}/shows/${show.id}/assets?category=location`}
        items={[
          { label: show.name, href: `${basePath}/shows/${show.id}` },
          { label: 'Assets', href: `${basePath}/shows/${show.id}/assets` },
          { label: 'Locations', href: `${basePath}/shows/${show.id}/assets?category=location` },
          { label: location.name || 'Location' },
        ]}
        subtitle="Location asset"
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
              {location.name}
            </div>
          )
        }
      />

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="studio-container">
          <nav className="flex space-x-4 sm:space-x-8 overflow-x-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            <style jsx>{`
              nav::-webkit-scrollbar {
                display: none;
              }
            `}</style>
            {[
              { id: 'general', label: 'General', icon: MapPin },
              { id: 'concepts', label: 'Concepts', icon: ImageIcon },
              { id: 'production', label: 'Production', icon: Palette },
              { id: 'ai-ref', label: 'AI ref', icon: Sparkles },
            ].map((tab) => (
              <button
                key={tab.id}
                data-viewer-visible
                onClick={() => setActiveTab(tab.id as 'general' | 'concepts' | 'production' | 'ai-ref')}
                className={`flex items-center space-x-2 py-3 sm:py-4 px-1 border-b-2 font-medium text-xs sm:text-sm whitespace-nowrap flex-shrink-0 ${
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
      <div className="studio-container py-4 sm:py-6 lg:py-8">
        {activeTab === 'general' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Location Information</h2>
              
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
                      placeholder="Describe this location..."
                    />
                  ) : (
                    <p className="text-gray-600">
                      {description || 'No description provided'}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Location Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Environment Type
                  </label>
                  <select
                    value={environmentType}
                    onChange={(e) => setEnvironmentType(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="">Select type</option>
                    <option value="indoor">Indoor</option>
                    <option value="outdoor">Outdoor</option>
                    <option value="mixed">Mixed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Time of Day
                  </label>
                  <select
                    value={timeOfDay}
                    onChange={(e) => setTimeOfDay(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="">Select time</option>
                    <option value="dawn">Dawn</option>
                    <option value="morning">Morning</option>
                    <option value="midday">Midday</option>
                    <option value="afternoon">Afternoon</option>
                    <option value="sunset">Sunset</option>
                    <option value="dusk">Dusk</option>
                    <option value="night">Night</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Weather
                  </label>
                  <select
                    value={weather}
                    onChange={(e) => setWeather(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="">Select weather</option>
                    <option value="clear">Clear</option>
                    <option value="cloudy">Cloudy</option>
                    <option value="overcast">Overcast</option>
                    <option value="rainy">Rainy</option>
                    <option value="stormy">Stormy</option>
                    <option value="foggy">Foggy</option>
                    <option value="snowy">Snowy</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Season
                  </label>
                  <select
                    value={season}
                    onChange={(e) => setSeason(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="">Select season</option>
                    <option value="spring">Spring</option>
                    <option value="summer">Summer</option>
                    <option value="autumn">Autumn</option>
                    <option value="winter">Winter</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Gallery Section */}
            <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Gallery</h2>
                <button
                  onClick={() => setShowImageGenerationDialog(true)}
                  className="flex items-center space-x-1 px-3 py-1 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 cursor-pointer"
                  title="Generate image based on location description"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Generate Image</span>
                </button>
              </div>
              
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
                  <p className="text-sm">Upload images to showcase your location</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'concepts' && (
          <div className="space-y-6">
            {/* Concept Generation */}
            <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Generate New Concept</h2>
                <button
                  onClick={() => setShowImageGenerationDialog(true)}
                  className="flex items-center space-x-1 px-3 py-1 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 cursor-pointer"
                  title="Generate image based on location description"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Generate Image</span>
                </button>
              </div>
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
                    placeholder="Describe the location concept you want to generate..."
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
              {sortedConcepts.map((concept) => {
                return (
                <div
                  key={concept.id}
                  className="bg-white rounded-lg border-2 border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
                >
                  {concept.imageUrl && (
                    <div className="relative group overflow-hidden">
                      {/* REF Button */}
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
                      
                      <img
                        src={concept.imageUrl}
                        alt={concept.name}
                        className="w-full h-full object-contain cursor-pointer"
                        onClick={() => setSelectedImage({ url: concept.imageUrl!, alt: concept.name })}
                        onError={(e) => {
                          console.error('Image failed to load:', concept.imageUrl);
                          // Show error message
                          const img = e.target as HTMLImageElement;
                          img.style.backgroundColor = '#ff0000';
                          img.style.color = '#ffffff';
                          img.style.display = 'flex';
                          img.style.alignItems = 'center';
                          img.style.justifyContent = 'center';
                          img.alt = 'Failed to load image';
                        }}
                        onLoad={(e) => {
                          console.log('✅ Image loaded successfully:', concept.imageUrl);
                          console.log('✅ Image element:', e.target);
                        }}
                        style={{ 
                          minHeight: '200px',
                          backgroundColor: '#f8f9fa'
                        }}
                      />
                      
                      {/* Temporarily remove overlay again */}
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
                );
              })}
            </div>

            {sortedConcepts.length === 0 && (
              <div className="text-center py-12">
                <ImageIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No concepts yet</h3>
                <p className="text-gray-600 mb-4">Start by generating or uploading your first location concept.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'production' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Production Notes</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Technical Requirements
                  </label>
                  <textarea
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Any technical notes for production..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Reference Materials
                  </label>
                  <textarea
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Links to reference materials, inspiration, etc..."
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
            
            {/* Ref 1# Gallery */}
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-lg font-medium text-gray-900">Ref 1#</h4>
                <label className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer text-sm">
                  <Upload className="w-4 h-4 inline mr-2" />
                  Upload
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleAIRefImageUpload(file, 'ref01');
                    }}
                    className="hidden"
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {(aiRefImages.ref01 || []).map((url, index) => (
                  <div key={index} className="relative group bg-gray-100 rounded-lg border border-gray-200 overflow-hidden">
                    <img
                      src={url}
                      alt={`Ref 1# ${index + 1}`}
                      className="w-full h-48 object-contain cursor-pointer hover:opacity-90"
                      onClick={() => setSelectedImage({ url, alt: `Ref 1# ${index + 1}` })}
                    />
                    <button
                      onClick={() => handleRemoveAIRefImage('ref01', index)}
                      className="absolute top-2 right-2 p-1 bg-red-600 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {Array.from(uploadingAIRefImages.entries())
                  .filter(([_, data]) => data.category === 'ref01')
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
                {(!aiRefImages.ref01 || aiRefImages.ref01.length === 0) && 
                 Array.from(uploadingAIRefImages.values()).filter(d => d.category === 'ref01').length === 0 && (
                  <div className="col-span-full text-center py-8 text-gray-500">
                    <ImageIcon className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                    <p>No Ref 1# images uploaded</p>
                  </div>
                )}
              </div>
            </div>

            {/* Ref 2# Gallery */}
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-lg font-medium text-gray-900">Ref 2#</h4>
                <label className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer text-sm">
                  <Upload className="w-4 h-4 inline mr-2" />
                  Upload
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleAIRefImageUpload(file, 'ref02');
                    }}
                    className="hidden"
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {(aiRefImages.ref02 || []).map((url, index) => (
                  <div key={index} className="relative group bg-gray-100 rounded-lg border border-gray-200 overflow-hidden">
                    <img
                      src={url}
                      alt={`Ref 2# ${index + 1}`}
                      className="w-full h-48 object-contain cursor-pointer hover:opacity-90"
                      onClick={() => setSelectedImage({ url, alt: `Ref 2# ${index + 1}` })}
                    />
                    <button
                      onClick={() => handleRemoveAIRefImage('ref02', index)}
                      className="absolute top-2 right-2 p-1 bg-red-600 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {Array.from(uploadingAIRefImages.entries())
                  .filter(([_, data]) => data.category === 'ref02')
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
                {(!aiRefImages.ref02 || aiRefImages.ref02.length === 0) && 
                 Array.from(uploadingAIRefImages.values()).filter(d => d.category === 'ref02').length === 0 && (
                  <div className="col-span-full text-center py-8 text-gray-500">
                    <ImageIcon className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                    <p>No Ref 2# images uploaded</p>
                  </div>
                )}
              </div>
            </div>

            {/* Ref 3# Gallery */}
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-lg font-medium text-gray-900">Ref 3#</h4>
                <label className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer text-sm">
                  <Upload className="w-4 h-4 inline mr-2" />
                  Upload
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleAIRefImageUpload(file, 'ref03');
                    }}
                    className="hidden"
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {(aiRefImages.ref03 || []).map((url, index) => (
                  <div key={index} className="relative group bg-gray-100 rounded-lg border border-gray-200 overflow-hidden">
                    <img
                      src={url}
                      alt={`Ref 3# ${index + 1}`}
                      className="w-full h-48 object-contain cursor-pointer hover:opacity-90"
                      onClick={() => setSelectedImage({ url, alt: `Ref 3# ${index + 1}` })}
                    />
                    <button
                      onClick={() => handleRemoveAIRefImage('ref03', index)}
                      className="absolute top-2 right-2 p-1 bg-red-600 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {Array.from(uploadingAIRefImages.entries())
                  .filter(([_, data]) => data.category === 'ref03')
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
                {(!aiRefImages.ref03 || aiRefImages.ref03.length === 0) && 
                 Array.from(uploadingAIRefImages.values()).filter(d => d.category === 'ref03').length === 0 && (
                  <div className="col-span-full text-center py-8 text-gray-500">
                    <ImageIcon className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                    <p>No Ref 3# images uploaded</p>
                  </div>
                )}
              </div>
            </div>

            {/* Ref 4# Gallery */}
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-lg font-medium text-gray-900">Ref 4#</h4>
                <label className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer text-sm">
                  <Upload className="w-4 h-4 inline mr-2" />
                  Upload
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleAIRefImageUpload(file, 'ref04');
                    }}
                    className="hidden"
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {(aiRefImages.ref04 || []).map((url, index) => (
                  <div key={index} className="relative group bg-gray-100 rounded-lg border border-gray-200 overflow-hidden">
                    <img
                      src={url}
                      alt={`Ref 4# ${index + 1}`}
                      className="w-full h-48 object-contain cursor-pointer hover:opacity-90"
                      onClick={() => setSelectedImage({ url, alt: `Ref 4# ${index + 1}` })}
                    />
                    <button
                      onClick={() => handleRemoveAIRefImage('ref04', index)}
                      className="absolute top-2 right-2 p-1 bg-red-600 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {Array.from(uploadingAIRefImages.entries())
                  .filter(([_, data]) => data.category === 'ref04')
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
                {(!aiRefImages.ref04 || aiRefImages.ref04.length === 0) && 
                 Array.from(uploadingAIRefImages.values()).filter(d => d.category === 'ref04').length === 0 && (
                  <div className="col-span-full text-center py-8 text-gray-500">
                    <ImageIcon className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                    <p>No Ref 4# images uploaded</p>
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
                onClick={() => handleAssignToAIRef('ref01')}
                className="w-full px-4 py-3 text-left bg-gray-50 hover:bg-indigo-50 border border-gray-200 hover:border-indigo-300 rounded-lg transition-colors"
              >
                <div className="font-medium text-gray-900">Ref 1#</div>
                <div className="text-sm text-gray-500">Add to Ref 1# section</div>
              </button>
              <button
                onClick={() => handleAssignToAIRef('ref02')}
                className="w-full px-4 py-3 text-left bg-gray-50 hover:bg-indigo-50 border border-gray-200 hover:border-indigo-300 rounded-lg transition-colors"
              >
                <div className="font-medium text-gray-900">Ref 2#</div>
                <div className="text-sm text-gray-500">Add to Ref 2# section</div>
              </button>
              <button
                onClick={() => handleAssignToAIRef('ref03')}
                className="w-full px-4 py-3 text-left bg-gray-50 hover:bg-indigo-50 border border-gray-200 hover:border-indigo-300 rounded-lg transition-colors"
              >
                <div className="font-medium text-gray-900">Ref 3#</div>
                <div className="text-sm text-gray-500">Add to Ref 3# section</div>
              </button>
              <button
                onClick={() => handleAssignToAIRef('ref04')}
                className="w-full px-4 py-3 text-left bg-gray-50 hover:bg-indigo-50 border border-gray-200 hover:border-indigo-300 rounded-lg transition-colors"
              >
                <div className="font-medium text-gray-900">Ref 4#</div>
                <div className="text-sm text-gray-500">Add to Ref 4# section</div>
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
        // Build comprehensive location description for concept generation
        const locationDescriptionParts: string[] = [];
        
        if (name) locationDescriptionParts.push(`Location name: ${name}`);
        if (description) locationDescriptionParts.push(`Description: ${description}`);
        if (environmentType) locationDescriptionParts.push(`Environment type: ${environmentType}`);
        if (timeOfDay) locationDescriptionParts.push(`Time of day: ${timeOfDay}`);
        if (weather) locationDescriptionParts.push(`Weather: ${weather}`);
        if (season) locationDescriptionParts.push(`Season: ${season}`);
        
        const locationDescription = locationDescriptionParts.length > 0
          ? locationDescriptionParts.join('. ')
          : `Location: ${name}`;
        
        // Get selected concept images
        const selectedConcepts = (location.concepts || []).filter(c => selectedConceptIds.has(c.id));
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
                setGalleryImages(prev => [...prev, imageUrl]);
                
                // If set as main concept, update main render
                if (isMainConcept) {
                  setMainRender(imageUrl);
                  // Save immediately to persist main concept
                  const updatedLocation: GlobalAsset = {
                    ...location,
                    name: name.trim(),
                    description: description.trim() || undefined,
                    galleryImages: [...galleryImages, imageUrl],
                    mainRender: imageUrl,
                    environmentType: environmentType || undefined,
                    timeOfDay: timeOfDay || undefined,
                    weather: weather || undefined,
                    season: season || undefined,
                    aiRefImages,
                  };
                  onSave(updatedLocation);
                }
              }
            }}
            asset={location}
            assetDescription={locationDescription}
            globalAssets={globalAssets}
            showId={location.showId}
          />
        );
      })()}
    </div>
  );
}
