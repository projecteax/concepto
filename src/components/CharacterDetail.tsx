'use client';

import { useState } from 'react';
import { Character, AssetConcept, CharacterGeneral, CharacterClothing, CharacterPose } from '@/types';
import { 
  ArrowLeft, 
  Save, 
  Upload,
  Trash2,
  Edit3,
  Wand2,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Filter,
  Grid3X3,
  List
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useS3Upload } from '@/hooks/useS3Upload';

interface CharacterDetailProps {
  character: Character;
  onBack: () => void;
  onSave: (character: Character) => void;
  onAddConcept: (concept: Omit<AssetConcept, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onDeleteConcept: (conceptId: string) => void;
}

export function CharacterDetail({
  character,
  onBack,
  onSave,
  onAddConcept,
  onDeleteConcept
}: CharacterDetailProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'clothing' | 'pose-concepts'>('general');
  const [isEditing, setIsEditing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Form states
  const [general, setGeneral] = useState<CharacterGeneral>(character.general || {});
  const [clothing, setClothing] = useState<CharacterClothing>(character.clothing || {});
  const [pose, setPose] = useState<CharacterPose>(character.pose || { defaultPose: 'T-pose' });
  
  // Concept generation
  const [generationPrompt, setGenerationPrompt] = useState('');
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [newConceptName, setNewConceptName] = useState('');
  
  // Image upload states
  const [uploadedImages, setUploadedImages] = useState<File[]>([]);
  const [uploadedImageUrls, setUploadedImageUrls] = useState<string[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState<Map<string, { progress: number; error?: string }>>(new Map());
  const [imageFormData, setImageFormData] = useState<Map<number, { description: string; relevanceScale: number }>>(new Map());
  
  // Gallery states
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'relevance' | 'name'>('newest');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedConceptType, setSelectedConceptType] = useState<'all' | 'pose' | 'clothing' | 'general' | 'expression' | 'action'>('all');
  
  // Main character image state
  const [mainImageUrl, setMainImageUrl] = useState<string | null>(character.mainImage || null);
  const [isUploadingMainImage, setIsUploadingMainImage] = useState(false);
  
  // S3 upload hook
  const { uploadFile } = useS3Upload();

  const handleSave = () => {
    const updatedCharacter: Character = {
      ...character,
      general,
      clothing,
      pose,
    };
    onSave(updatedCharacter);
    setIsEditing(false);
  };

  const handleGenerateConcept = async () => {
    if (!generationPrompt.trim()) return;
    
    setIsGenerating(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));
      const imageUrl = `https://via.placeholder.com/512x512/6366f1/ffffff?text=${encodeURIComponent(generationPrompt)}`;
      setGeneratedImage(imageUrl);
    } catch (error) {
      console.error('Generation failed:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveConcept = () => {
    if (generatedImage && newConceptName.trim()) {
      onAddConcept({
        category: 'character',
        tags: [],
        assetId: character.id,
        name: newConceptName.trim(),
        imageUrl: generatedImage,
        prompt: generationPrompt.trim(),
      });
      setGeneratedImage(null);
      setNewConceptName('');
      setGenerationPrompt('');
    }
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length > 0) {
      // Add files to preview state
      setUploadedImages(prev => [...prev, ...files]);
      
      // Create preview URLs
      const newUrls = files.map(file => URL.createObjectURL(file));
      setUploadedImageUrls(prev => [...prev, ...newUrls]);

      // Upload each file to S3
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileId = `${Date.now()}-${i}`;
        
        // Initialize upload state
        setUploadingFiles(prev => new Map(prev.set(fileId, { progress: 0 })));

        try {
          const result = await uploadFile(file, `characters/${character.id}/concepts`);
          
          if (result) {
            // Update the preview URL with the S3 URL
            setUploadedImageUrls(prev => {
              const newUrls = [...prev];
              newUrls[newUrls.length - files.length + i] = result.url;
              return newUrls;
            });
            
            // Mark as completed
            setUploadingFiles(prev => new Map(prev.set(fileId, { progress: 100 })));
          } else {
            // Mark as error
            setUploadingFiles(prev => new Map(prev.set(fileId, { progress: 0, error: 'Upload failed' })));
          }
        } catch (error) {
          console.error('Upload error:', error);
          setUploadingFiles(prev => new Map(prev.set(fileId, { progress: 0, error: 'Upload failed' })));
        }
      }
    }
  };

  const handleSaveUploadedConcept = (imageUrl: string, description: string = '', relevanceScale: number = 3, conceptType: 'pose' | 'clothing' | 'general' | 'expression' | 'action' = 'general') => {
    // Generate a name based on the file or use a default
    const fileName = uploadedImages[0]?.name || 'Uploaded Image';
    const baseName = fileName.split('.')[0] || 'Concept';
    const timestamp = new Date().toISOString().slice(0, 10);
    const conceptName = `${baseName} - ${timestamp}`;
    
    const newConcept = {
      category: 'character' as const,
      conceptType: conceptType,
      tags: [],
      assetId: character.id,
      name: conceptName,
      description: description.trim() || undefined,
      relevanceScale: relevanceScale,
      imageUrl: imageUrl,
      prompt: 'User uploaded image',
    };
    
    onAddConcept(newConcept);
  };

  const handleMainImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setMainImageUrl(URL.createObjectURL(file));
      setIsUploadingMainImage(true);
      
      try {
        const result = await uploadFile(file, `characters/${character.id}/main`);
        if (result) {
          setMainImageUrl(result.url);
          // Update character with new main image
          const updatedCharacter = {
            ...character,
            mainImage: result.url
          };
          onSave(updatedCharacter);
        }
      } catch (error) {
        console.error('Main image upload failed:', error);
        setMainImageUrl(character.mainImage || null);
      } finally {
        setIsUploadingMainImage(false);
      }
    }
  };

  const removeUploadedImage = (index: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index));
    setUploadedImageUrls(prev => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
    // Clean up form data
    setImageFormData(prev => {
      const newMap = new Map(prev);
      newMap.delete(index);
      return newMap;
    });
  };

  // Sort and filter concepts based on selected criteria
  const getSortedConcepts = () => {
    let concepts = [...character.concepts];
    
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
    const counts = {
      all: character.concepts.length,
      pose: character.concepts.filter(c => c.conceptType === 'pose').length,
      clothing: character.concepts.filter(c => c.conceptType === 'clothing').length,
      general: character.concepts.filter(c => c.conceptType === 'general').length,
      expression: character.concepts.filter(c => c.conceptType === 'expression').length,
      action: character.concepts.filter(c => c.conceptType === 'action').length,
    };
    return counts;
  };

  const tabs = [
    { id: 'general', label: 'General', icon: '👤' },
    { id: 'clothing', label: 'Clothing', icon: '👕' },
    { id: 'pose-concepts', label: 'Concepts', icon: '🎨' },
  ] as const;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={onBack}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{character.name}</h1>
                <p className="text-sm text-gray-600">Character Details</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              {isEditing ? (
                <>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    <Save className="w-4 h-4" />
                    <span>Save</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  <Edit3 className="w-4 h-4" />
                  <span>Edit</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8">
        <div className="flex gap-8">
          {/* Sidebar */}
          <div className="w-64 flex-shrink-0">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Sections</h2>
              <div className="space-y-2">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "w-full flex items-center space-x-3 px-3 py-2 text-sm rounded-lg transition-colors",
                      activeTab === tab.id
                        ? "bg-indigo-100 text-indigo-700"
                        : "text-gray-700 hover:bg-gray-100"
                    )}
                  >
                    <span className="text-lg">{tab.icon}</span>
                    <span>{tab.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              {/* General Tab */}
              {activeTab === 'general' && (
                <div className="space-y-6">
                  <h3 className="text-xl font-semibold text-gray-900">General Information</h3>
                  
                  {/* Main Character Image */}
                  <div className="space-y-4">
                    <h4 className="text-lg font-medium text-gray-900">Main Character Image</h4>
                    <div className="flex items-start space-x-6">
                      {/* Current Image */}
                      <div className="flex-shrink-0">
                        {mainImageUrl ? (
                          <div className="relative">
                            <img
                              src={mainImageUrl}
                              alt="Main character"
                              className="w-32 h-32 object-cover rounded-lg border border-gray-200"
                            />
                            {isUploadingMainImage && (
                              <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center rounded-lg">
                                <RefreshCw className="w-6 h-6 text-white animate-spin" />
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="w-32 h-32 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center">
                            <Upload className="w-8 h-8 text-gray-400" />
                          </div>
                        )}
                      </div>
                      
                      {/* Upload Controls */}
                      <div className="flex-1">
                        <div className="space-y-3">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Upload Main Character Image
                            </label>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleMainImageUpload}
                              className="hidden"
                              id="main-image-upload"
                              disabled={isUploadingMainImage}
                            />
                            <label
                              htmlFor="main-image-upload"
                              className={cn(
                                "inline-block px-4 py-2 text-sm rounded-lg cursor-pointer transition-colors",
                                isUploadingMainImage
                                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                                  : "bg-indigo-600 text-white hover:bg-indigo-700"
                              )}
                            >
                              {isUploadingMainImage ? 'Uploading...' : 'Choose Image'}
                            </label>
                          </div>
                          <p className="text-xs text-gray-500">
                            This will be the main reference image for the character
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Age
                      </label>
                      <input
                        type="text"
                        value={general.age || ''}
                        onChange={(e) => setGeneral(prev => ({ ...prev, age: e.target.value }))}
                        placeholder="e.g., 8 years old"
                        disabled={!isEditing}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-50"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Personality
                      </label>
                      <input
                        type="text"
                        value={general.personality || ''}
                        onChange={(e) => setGeneral(prev => ({ ...prev, personality: e.target.value }))}
                        placeholder="e.g., Brave, curious, friendly"
                        disabled={!isEditing}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-50"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Backstory
                    </label>
                    <textarea
                      value={general.backstory || ''}
                      onChange={(e) => setGeneral(prev => ({ ...prev, backstory: e.target.value }))}
                      placeholder="Tell the character's backstory..."
                      disabled={!isEditing}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none disabled:bg-gray-50"
                      rows={4}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Special Abilities
                    </label>
                    <textarea
                      value={general.specialAbilities || ''}
                      onChange={(e) => setGeneral(prev => ({ ...prev, specialAbilities: e.target.value }))}
                      placeholder="Describe any special abilities or powers..."
                      disabled={!isEditing}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none disabled:bg-gray-50"
                      rows={3}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Relationships
                    </label>
                    <textarea
                      value={general.relationships || ''}
                      onChange={(e) => setGeneral(prev => ({ ...prev, relationships: e.target.value }))}
                      placeholder="Describe relationships with other characters..."
                      disabled={!isEditing}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none disabled:bg-gray-50"
                      rows={3}
                    />
                  </div>
                </div>
              )}

              {/* Clothing Tab */}
              {activeTab === 'clothing' && (
                <div className="space-y-6">
                  <h3 className="text-xl font-semibold text-gray-900">Clothing & Outfits</h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Default Outfit
                    </label>
                    <textarea
                      value={clothing.defaultOutfit || ''}
                      onChange={(e) => setClothing(prev => ({ ...prev, defaultOutfit: e.target.value }))}
                      placeholder="Describe the character's default outfit..."
                      disabled={!isEditing}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none disabled:bg-gray-50"
                      rows={3}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Seasonal Outfits
                    </label>
                    <textarea
                      value={clothing.seasonalOutfits?.join('\n') || ''}
                      onChange={(e) => setClothing(prev => ({ 
                        ...prev, 
                        seasonalOutfits: e.target.value.split('\n').filter(line => line.trim()) 
                      }))}
                      placeholder="List seasonal outfits (one per line)..."
                      disabled={!isEditing}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none disabled:bg-gray-50"
                      rows={4}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Special Costumes
                    </label>
                    <textarea
                      value={clothing.specialCostumes?.join('\n') || ''}
                      onChange={(e) => setClothing(prev => ({ 
                        ...prev, 
                        specialCostumes: e.target.value.split('\n').filter(line => line.trim()) 
                      }))}
                      placeholder="List special costumes (one per line)..."
                      disabled={!isEditing}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none disabled:bg-gray-50"
                      rows={4}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Accessories
                    </label>
                    <textarea
                      value={clothing.accessories?.join('\n') || ''}
                      onChange={(e) => setClothing(prev => ({ 
                        ...prev, 
                        accessories: e.target.value.split('\n').filter(line => line.trim()) 
                      }))}
                      placeholder="List accessories (one per line)..."
                      disabled={!isEditing}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none disabled:bg-gray-50"
                      rows={3}
                    />
                  </div>
                </div>
              )}

              {/* Pose & Concepts Tab */}
              {activeTab === 'pose-concepts' && (
                <div className="space-y-8">
                  {/* Pose Section */}
                <div className="space-y-6">
                  <h3 className="text-xl font-semibold text-gray-900">Pose & Reference</h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Default Pose
                    </label>
                    <div className="flex space-x-4">
                      <label className="flex items-center">
                        <input
                          type="radio"
                          value="T-pose"
                          checked={pose.defaultPose === 'T-pose'}
                          onChange={(e) => setPose(prev => ({ ...prev, defaultPose: e.target.value as 'T-pose' | 'free-pose' }))}
                          disabled={!isEditing}
                          className="mr-2"
                        />
                        T-pose
                      </label>
                      <label className="flex items-center">
                        <input
                          type="radio"
                          value="free-pose"
                          checked={pose.defaultPose === 'free-pose'}
                          onChange={(e) => setPose(prev => ({ ...prev, defaultPose: e.target.value as 'T-pose' | 'free-pose' }))}
                          disabled={!isEditing}
                          className="mr-2"
                        />
                        Free pose
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Pose Description
                    </label>
                    <textarea
                      value={pose.poseDescription || ''}
                      onChange={(e) => setPose(prev => ({ ...prev, poseDescription: e.target.value }))}
                      placeholder="Describe the character's typical pose and stance..."
                      disabled={!isEditing}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none disabled:bg-gray-50"
                      rows={4}
                    />
                  </div>
                  </div>

                  {/* Concepts Section */}
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xl font-semibold text-gray-900">Concept Art</h3>
                  </div>

                    {/* Upload Section */}
                    <div className="border border-gray-200 rounded-lg p-6">
                      <h4 className="text-lg font-medium text-gray-900 mb-4">Upload Images</h4>
                      <div className="space-y-4">
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                      <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                          <p className="text-sm text-gray-600 mb-2">Upload your own images</p>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                            onChange={handleImageUpload}
                        className="hidden"
                            id="image-upload"
                      />
                      <label
                            htmlFor="image-upload"
                            className="inline-block px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 cursor-pointer transition-colors"
                      >
                        Choose Files
                      </label>
                    </div>

                        {/* Uploaded Images Preview */}
                        {uploadedImageUrls.length > 0 && (
                          <div className="space-y-4">
                            <h5 className="text-sm font-medium text-gray-700">Uploaded Images</h5>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                              {uploadedImageUrls.map((url, index) => {
                                const fileId = `${Date.now()}-${index}`;
                                const uploadInfo = uploadingFiles.get(fileId);
                                const isUploading = uploadInfo && uploadInfo.progress < 100;
                                const hasError = uploadInfo?.error;
                                
                                return (
                                  <div key={index} className="relative border border-gray-200 rounded-lg overflow-hidden">
                                    <div className="relative">
                                      <img
                                        src={url}
                                        alt={`Uploaded ${index + 1}`}
                                        className="w-full h-32 object-cover"
                                      />
                                      
                                      {/* Upload Progress Overlay */}
                                      {isUploading && (
                                        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                                          <div className="text-center text-white">
                                            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                                            <div className="text-xs">
                                              {uploadInfo?.progress || 0}%
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                      
                                      {/* Error Overlay */}
                                      {hasError && (
                                        <div className="absolute inset-0 bg-red-500 bg-opacity-75 flex items-center justify-center">
                                          <div className="text-center text-white">
                                            <AlertCircle className="w-6 h-6 mx-auto mb-2" />
                                            <div className="text-xs">Upload Failed</div>
                  </div>
                </div>
              )}

                                      {/* Success Indicator */}
                                      {uploadInfo?.progress === 100 && !hasError && (
                                        <div className="absolute top-2 right-2">
                                          <CheckCircle className="w-5 h-5 text-green-500" />
                                        </div>
                                      )}
                                    </div>
                                    
                                    <div className="p-3 space-y-2">
                                      <textarea
                                        placeholder="Description (optional)..."
                                        value={imageFormData.get(index)?.description || ''}
                                        onChange={(e) => {
                                          const currentData = imageFormData.get(index) || { description: '', relevanceScale: 3 };
                                          setImageFormData(new Map(imageFormData.set(index, { ...currentData, description: e.target.value })));
                                        }}
                                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-transparent resize-none"
                                        rows={2}
                                      />
                                      
                                      <div className="flex items-center space-x-2">
                                        <label className="text-xs text-gray-600">Type:</label>
                                        <select 
                                          data-concept-type={index}
                                          className="text-xs border border-gray-300 rounded px-1 py-1"
                                          onChange={(e) => {
                                            const currentData = imageFormData.get(index) || { description: '', relevanceScale: 3 };
                                            setImageFormData(new Map(imageFormData.set(index, { ...currentData, conceptType: e.target.value as 'pose' | 'clothing' | 'general' | 'expression' | 'action' })));
                                          }}
                                        >
                                          <option value="general">General</option>
                                          <option value="pose">Pose</option>
                                          <option value="clothing">Clothing</option>
                                          <option value="expression">Expression</option>
                                          <option value="action">Action</option>
                                        </select>
                                      </div>
                                      
                                      <div className="flex items-center space-x-2">
                                        <label className="text-xs text-gray-600">Relevance:</label>
                                        <select 
                                          value={imageFormData.get(index)?.relevanceScale || 3}
                                          onChange={(e) => {
                                            const currentData = imageFormData.get(index) || { description: '', relevanceScale: 3 };
                                            setImageFormData(new Map(imageFormData.set(index, { ...currentData, relevanceScale: parseInt(e.target.value) })));
                                          }}
                                          className="text-xs border border-gray-300 rounded px-1 py-1"
                                        >
                                          <option value={1}>1 - Low</option>
                                          <option value={2}>2 - Below Average</option>
                                          <option value={3}>3 - Average</option>
                                          <option value={4}>4 - Above Average</option>
                                          <option value={5}>5 - High</option>
                                        </select>
                                      </div>
                                      
                                      <div className="flex justify-between">
                                        <button
                                          onClick={() => {
                                            const formData = imageFormData.get(index);
                                            const conceptTypeSelect = document.querySelector(`select[data-concept-type="${index}"]`) as HTMLSelectElement;
                                            const conceptType = (conceptTypeSelect?.value as 'pose' | 'clothing' | 'general' | 'expression' | 'action') || 'general';
                                            handleSaveUploadedConcept(url, formData?.description || '', formData?.relevanceScale || 3, conceptType);
                                            removeUploadedImage(index);
                                          }}
                                          disabled={isUploading || hasError}
                                          className={cn(
                                            "text-xs px-2 py-1 rounded transition-colors",
                                            isUploading || hasError
                                              ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                                              : "bg-green-600 text-white hover:bg-green-700"
                                          )}
                                        >
                                          Save
                                        </button>
                    <button
                                          onClick={() => removeUploadedImage(index)}
                                          className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700"
                    >
                                          Remove
                    </button>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                  </div>

                  {/* Generation Panel */}
                  <div className="border border-gray-200 rounded-lg p-6">
                    <h4 className="text-lg font-medium text-gray-900 mb-4">Generate Concept Art</h4>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Prompt
                        </label>
                        <textarea
                          value={generationPrompt}
                          onChange={(e) => setGenerationPrompt(e.target.value)}
                          placeholder="Describe how you want the character to look..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                          rows={3}
                        />
                      </div>
                      
                      <button
                        onClick={handleGenerateConcept}
                        disabled={isGenerating || !generationPrompt.trim()}
                        className={cn(
                          "flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors",
                          isGenerating || !generationPrompt.trim()
                            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                            : "bg-indigo-600 text-white hover:bg-indigo-700"
                        )}
                      >
                        {isGenerating ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>Generating...</span>
                          </>
                        ) : (
                          <>
                            <Wand2 className="w-4 h-4" />
                            <span>Generate</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Generated Image */}
                    {generatedImage && (
                      <div className="mt-6 space-y-4">
                        <img
                          src={generatedImage}
                          alt="Generated concept"
                          className="w-full max-w-md rounded-lg"
                        />
                        <div className="flex space-x-3">
                          <input
                            type="text"
                            value={newConceptName}
                            onChange={(e) => setNewConceptName(e.target.value)}
                            placeholder="Concept name..."
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                          />
                          <button
                            onClick={handleSaveConcept}
                            disabled={!newConceptName.trim()}
                            className={cn(
                              "px-4 py-2 rounded-lg font-medium transition-colors",
                              newConceptName.trim()
                                ? "bg-green-600 text-white hover:bg-green-700"
                                : "bg-gray-100 text-gray-400 cursor-not-allowed"
                            )}
                          >
                            Save Concept
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                    {/* Concepts Gallery */}
                    {character.concepts.length > 0 ? (
                      <div className="space-y-6">
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="text-xl font-semibold text-gray-900">
                                Concept Gallery
                              </h4>
                              <p className="text-sm text-gray-600 mt-1">
                                {getSortedConcepts().length} of {character.concepts.length} concepts
                              </p>
                            </div>
                            
                            {/* View Mode Toggle */}
                            <div className="flex items-center border border-gray-300 rounded">
                              <button
                                onClick={() => setViewMode('grid')}
                                className={cn(
                                  "p-2 transition-colors",
                                  viewMode === 'grid'
                                    ? "bg-indigo-100 text-indigo-600"
                                    : "text-gray-500 hover:text-gray-700"
                                )}
                              >
                                <Grid3X3 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setViewMode('list')}
                                className={cn(
                                  "p-2 transition-colors",
                                  viewMode === 'list'
                                    ? "bg-indigo-100 text-indigo-600"
                                    : "text-gray-500 hover:text-gray-700"
                                )}
                              >
                                <List className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          
                          {/* Category Filters */}
                          <div className="flex flex-wrap gap-2">
                            {(['all', 'pose', 'clothing', 'general', 'expression', 'action'] as const).map((type) => {
                              const counts = getConceptCounts();
                              return (
                                <button
                                  key={type}
                                  onClick={() => setSelectedConceptType(type)}
                                  className={cn(
                                    "px-3 py-1 text-sm rounded-full transition-colors",
                                    selectedConceptType === type
                                      ? "bg-indigo-600 text-white"
                                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                                  )}
                                >
                                  {type === 'all' ? 'All' : type.charAt(0).toUpperCase() + type.slice(1)} ({counts[type]})
                                </button>
                              );
                            })}
                          </div>
                          
                          {/* Sort Controls */}
                          <div className="flex items-center space-x-3">
                            <Filter className="w-4 h-4 text-gray-500" />
                            <select
                              value={sortBy}
                              onChange={(e) => setSortBy(e.target.value as 'newest' | 'oldest' | 'relevance' | 'name')}
                              className="text-sm border border-gray-300 rounded px-2 py-1 focus:ring-1 focus:ring-indigo-500 focus:border-transparent"
                            >
                              <option value="newest">Newest First</option>
                              <option value="oldest">Oldest First</option>
                              <option value="relevance">Relevance</option>
                              <option value="name">Name A-Z</option>
                            </select>
                          </div>
                        </div>
                        
                        {/* Concepts Display */}
                        <div className={cn(
                          "gap-4",
                          viewMode === 'grid' 
                            ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3" 
                            : "space-y-4"
                        )}>
                          {getSortedConcepts().map((concept) => (
                            <div 
                              key={concept.id} 
                              className={cn(
                                "border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm hover:shadow-md transition-all duration-200 hover:border-indigo-300",
                                viewMode === 'list' && "flex"
                              )}
                            >
                        {concept.imageUrl && (
                                <div className={cn(
                                  "relative",
                                  viewMode === 'list' ? "w-32 h-32 flex-shrink-0" : "w-full h-48"
                                )}>
                          <img
                            src={concept.imageUrl}
                            alt={concept.name}
                                    className={cn(
                                      "object-cover",
                                      viewMode === 'list' ? "w-full h-full" : "w-full h-full"
                                    )}
                                  />
                                  {concept.relevanceScale && (
                                    <div className="absolute top-2 right-2 bg-white bg-opacity-90 rounded-full px-2 py-1">
                                      <div className="flex items-center space-x-1">
                                        <div className="flex space-x-0.5">
                                          {[1, 2, 3, 4, 5].map((star) => (
                                            <div
                                              key={star}
                                              className={cn(
                                                "w-2 h-2 rounded-full",
                                                star <= concept.relevanceScale!
                                                  ? "bg-yellow-400"
                                                  : "bg-gray-200"
                                              )}
                                            />
                                          ))}
                                        </div>
                                        <span className="text-xs font-medium text-gray-700">
                                          {concept.relevanceScale}
                                        </span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                              
                              <div className={cn(
                                "p-4",
                                viewMode === 'list' && "flex-1"
                              )}>
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <div className="flex items-center space-x-2 mb-2">
                          <h5 className="font-medium text-gray-900">{concept.name}</h5>
                                      {concept.conceptType && (
                                        <span className={cn(
                                          "px-2 py-1 text-xs font-medium rounded-full",
                                          concept.conceptType === 'pose' && "bg-blue-100 text-blue-800",
                                          concept.conceptType === 'clothing' && "bg-green-100 text-green-800",
                                          concept.conceptType === 'general' && "bg-gray-100 text-gray-800",
                                          concept.conceptType === 'expression' && "bg-yellow-100 text-yellow-800",
                                          concept.conceptType === 'action' && "bg-purple-100 text-purple-800"
                                        )}>
                                          {concept.conceptType}
                                        </span>
                                      )}
                                    </div>
                          {concept.description && (
                                      <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                                        {concept.description}
                                      </p>
                                    )}
                                    
                                    {/* Metadata */}
                                    <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                                      <span>
                                        {new Date(concept.createdAt).toLocaleDateString()}
                                      </span>
                                      {concept.relevanceScale && (
                                        <span>
                                          Relevance: {concept.relevanceScale}/5
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  
                            <button
                              onClick={() => onDeleteConcept(concept.id)}
                                    className="p-1 text-gray-400 hover:text-red-600 transition-colors ml-2"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-12">
                        <div className="mx-auto w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                          <span className="text-4xl">🎨</span>
                        </div>
                        <h4 className="text-lg font-medium text-gray-900 mb-2">No concepts yet</h4>
                        <p className="text-gray-600 mb-4">
                          Upload your first concept image to get started
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
