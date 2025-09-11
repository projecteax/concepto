'use client';

import { useState, useEffect } from 'react';
import { Character, AssetConcept, CharacterGeneral, CharacterClothing, CharacterPose } from '@/types';
import { 
  ArrowLeft, 
  Save, 
  Upload,
  Trash2,
  Wand2,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Filter,
  Grid3X3,
  List,
  Plus,
  X,
  Download
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useS3Upload } from '@/hooks/useS3Upload';
import { ModelViewer } from './ModelViewer';

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
  const [activeTab, setActiveTab] = useState<'general' | 'clothing' | 'pose-concepts' | '3d-models' | 'production'>('general');
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
  const [imageFormData, setImageFormData] = useState<Map<number, { description: string; relevanceScale: number; conceptType?: 'pose' | 'clothing' | 'general' | 'expression' | 'action' }>>(new Map());
  
  // Gallery states
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'relevance' | 'name'>('newest');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedConceptType, setSelectedConceptType] = useState<'all' | 'pose' | 'clothing' | 'general' | 'expression' | 'action'>('all');
  
  // Main character image state
  const [mainImageUrl, setMainImageUrl] = useState<string | null>(character.mainImage || null);
  const [isUploadingMainImage, setIsUploadingMainImage] = useState(false);
  
  // 3D Model fields state
  const [modelFiles, setModelFiles] = useState({
    fullBodyBlender: character.modelFiles?.fullBodyBlender || '',
    fullBodyFBX: character.modelFiles?.fullBodyFBX || '',
    skinnedCharacter: character.modelFiles?.skinnedCharacter || '',
    mainExpressions: character.modelFiles?.mainExpressions || '',
    additionalExpressions: character.modelFiles?.additionalExpressions || [],
    productionModel: character.modelFiles?.productionModel || '',
  });
  
  // Character gallery state
  const [characterGallery, setCharacterGallery] = useState<string[]>(character.characterGallery || []);
  
  // 3D model upload state
  const [uploadedModels, setUploadedModels] = useState<Array<{url: string, filename: string, size: number, uploadDate: Date}>>(character.uploadedModels || []);
  
  // Update uploadedModels state when character data changes
  useEffect(() => {
    if (character.uploadedModels) {
      setUploadedModels(character.uploadedModels);
    }
  }, [character.uploadedModels]);
  
  // S3 upload hooks
  const { uploadFile: uploadModelFile, uploadState: modelUploadState } = useS3Upload();
  const { uploadFile: uploadGalleryFile, uploadState: galleryUploadState } = useS3Upload();
  const { uploadFile: uploadConceptFile } = useS3Upload();
  const { uploadFile: uploadMainImageFile } = useS3Upload();

  const handleSave = () => {
    console.log('💾 Saving character with uploadedModels:', uploadedModels);
    const updatedCharacter: Character = {
      ...character,
      general,
      clothing,
      pose,
      mainImage: mainImageUrl || undefined,
      modelFiles,
      characterGallery,
      uploadedModels,
    };
    console.log('💾 Updated character data:', updatedCharacter);
    console.log('💾 Uploaded models being saved:', updatedCharacter.uploadedModels);
    onSave(updatedCharacter);
  };

  const handleAddExpression = () => {
    setModelFiles(prev => ({
      ...prev,
      additionalExpressions: [...prev.additionalExpressions, ''],
    }));
  };

  const handleRemoveExpression = (index: number) => {
    setModelFiles(prev => ({
      ...prev,
      additionalExpressions: prev.additionalExpressions.filter((_, i) => i !== index),
    }));
  };

  const handleExpressionChange = (index: number, value: string) => {
    setModelFiles(prev => ({
      ...prev,
      additionalExpressions: prev.additionalExpressions.map((expr, i) => 
        i === index ? value : expr
      ),
    }));
  };

  const handleGalleryImageUpload = async (file: File) => {
    try {
      const result = await uploadGalleryFile(file, `characters/${character.id}/gallery/`);
      if (result) {
        setCharacterGallery(prev => [...prev, result.url]);
      }
    } catch (error) {
      console.error('Failed to upload gallery image:', error);
    }
  };

  const handleRemoveGalleryImage = (index: number) => {
    setCharacterGallery(prev => prev.filter((_, i) => i !== index));
  };

  const handleModelUpload = async (file: File) => {
    try {
      console.log('🚀 Starting 3D model upload...', { filename: file.name, size: file.size });
      const result = await uploadModelFile(file, `characters/${character.id}/models/`);
      
      if (result) {
        console.log('✅ 3D model upload successful!', result);
        const newModel = {
          url: result.url,
          filename: file.name,
          size: file.size,
          uploadDate: new Date(),
        };
        console.log('📝 Adding model to state:', newModel);
        setUploadedModels(prev => {
          const updated = [...prev, newModel];
          console.log('📝 Updated uploadedModels state:', updated);
          return updated;
        });
      } else {
        console.error('❌ Upload result is null');
      }
    } catch (error) {
      console.error('❌ Failed to upload 3D model:', error);
    }
  };

  const handleRemoveModel = (index: number) => {
    setUploadedModels(prev => prev.filter((_, i) => i !== index));
  };

  const handleDownloadModel = (url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
          const result = await uploadConceptFile(file, `characters/${character.id}/concepts`);
          
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
        const result = await uploadMainImageFile(file, `characters/${character.id}/main`);
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
    { id: '3d-models', label: '3D Models', icon: '🎭' },
    { id: 'production', label: 'Production', icon: '🎬' },
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
              <button
                onClick={handleSave}
                className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <Save className="w-4 h-4" />
                <span>Save Changes</span>
              </button>
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
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
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
                                          disabled={isUploading || !!hasError}
                                          className={cn(
                                            "text-xs px-2 py-1 rounded transition-colors",
                                            isUploading || !!hasError
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

              {/* 3D Models Tab */}
              {activeTab === '3d-models' && (
                <div className="space-y-8">
                  <h3 className="text-xl font-semibold text-gray-900">3D Model Files</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Full Body Models */}
                    <div className="space-y-4">
                      <h4 className="text-lg font-medium text-gray-800">Full Body Models</h4>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Blender File (.blend)
                        </label>
                        <input
                          type="text"
                          value={modelFiles.fullBodyBlender}
                          onChange={(e) => setModelFiles(prev => ({ ...prev, fullBodyBlender: e.target.value }))}
                          placeholder="e.g., character_main_v2.blend"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          FBX File (.fbx)
                        </label>
                        <input
                          type="text"
                          value={modelFiles.fullBodyFBX}
                          onChange={(e) => setModelFiles(prev => ({ ...prev, fullBodyFBX: e.target.value }))}
                          placeholder="e.g., character_main_v2.fbx"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                      </div>
                    </div>

                    {/* Character Creation */}
                    <div className="space-y-4">
                      <h4 className="text-lg font-medium text-gray-800">Character Creation</h4>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Skinned Character (CC file)
                        </label>
                        <input
                          type="text"
                          value={modelFiles.skinnedCharacter}
                          onChange={(e) => setModelFiles(prev => ({ ...prev, skinnedCharacter: e.target.value }))}
                          placeholder="e.g., character_skinned_v1.cc"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Main Expressions (FBX)
                        </label>
                        <input
                          type="text"
                          value={modelFiles.mainExpressions}
                          onChange={(e) => setModelFiles(prev => ({ ...prev, mainExpressions: e.target.value }))}
                          placeholder="e.g., character_expressions_main.fbx"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Additional Expressions */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-lg font-medium text-gray-800">Additional Expressions</h4>
                      <button
                        onClick={handleAddExpression}
                        className="flex items-center space-x-1 px-3 py-1 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Add Expression</span>
                      </button>
                    </div>
                    
                    {modelFiles.additionalExpressions.length > 0 ? (
                      <div className="space-y-3">
                        {modelFiles.additionalExpressions.map((expression, index) => (
                          <div key={index} className="flex items-center space-x-3">
                            <input
                              type="text"
                              value={expression}
                              onChange={(e) => handleExpressionChange(index, e.target.value)}
                              placeholder={`Additional expression ${index + 1}...`}
                              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            />
                            <button
                              onClick={() => handleRemoveExpression(index)}
                              className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-sm">No additional expressions added yet.</p>
                    )}
                  </div>
                </div>
              )}

              {/* Production Tab */}
              {activeTab === 'production' && (
                <div className="space-y-8">
                  <h3 className="text-xl font-semibold text-gray-900">Production Files</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Production Model */}
                    <div className="space-y-4">
                      <h4 className="text-lg font-medium text-gray-800">Production Model</h4>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Fully Rigged & Skinned Model
                        </label>
                        <input
                          type="text"
                          value={modelFiles.productionModel}
                          onChange={(e) => setModelFiles(prev => ({ ...prev, productionModel: e.target.value }))}
                          placeholder="e.g., character_production_final.fbx"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Ready for animation with all rigging and skinning complete
                        </p>
                      </div>
                    </div>

                    {/* File Upload & Viewer */}
                    <div className="space-y-4">
                      <h4 className="text-lg font-medium text-gray-800">3D Model Upload</h4>
                      
                      {/* Only show upload field if no models are uploaded */}
                      {uploadedModels.length === 0 && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Upload FBX/USDZ File
                          </label>
                          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                            <input
                              type="file"
                              accept=".fbx,.usdz,.blend,.glb,.gltf"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  handleModelUpload(file);
                                }
                              }}
                              className="hidden"
                              id="model-upload"
                              disabled={modelUploadState.isUploading}
                            />
                            <label
                              htmlFor="model-upload"
                              className={`cursor-pointer flex flex-col items-center space-y-2 ${
                                modelUploadState.isUploading ? 'opacity-50 cursor-not-allowed' : ''
                              }`}
                            >
                              <Upload className="w-8 h-8 text-gray-400" />
                              <span className="text-sm text-gray-600">
                                {modelUploadState.isUploading ? 'Uploading...' : 'Click to upload 3D model'}
                              </span>
                              <span className="text-xs text-gray-500">Supports .fbx, .usdz, .blend, .glb, .gltf files</span>
                            </label>
                            
                            {/* Progress Bar */}
                            {modelUploadState.isUploading && (
                              <div className="w-full mt-4">
                                <div className="bg-gray-200 rounded-full h-2">
                                  <div 
                                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                    style={{ width: `${modelUploadState.progress}%` }}
                                  ></div>
                                </div>
                                <span className="text-xs text-gray-500 mt-1">{modelUploadState.progress}%</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Uploaded Models List */}
                      {uploadedModels.length > 0 && (
                        <div className="space-y-2">
                          <h5 className="text-sm font-medium text-gray-700">Uploaded Models</h5>
                          <div className="space-y-2">
                            {uploadedModels.map((model, index) => (
                              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                                <div className="flex items-center space-x-3">
                                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                                    <span className="text-xs font-medium text-blue-600">3D</span>
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-gray-900">{model.filename}</p>
                                    <div className="flex items-center space-x-2 text-xs text-gray-500">
                                      <span>{(model.size / 1024 / 1024).toFixed(2)} MB</span>
                                      <span>•</span>
                                      <span>{model.uploadDate.toLocaleDateString()}</span>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <button
                                    onClick={() => handleDownloadModel(model.url, model.filename)}
                                    className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded"
                                    title="Download model"
                                  >
                                    <Download className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => handleRemoveModel(index)}
                                    className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                                    title="Remove model"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Character Gallery */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-lg font-medium text-gray-800">Character Gallery</h4>
                      <div>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              await handleGalleryImageUpload(file);
                            }
                          })}
                          className="hidden"
                          id="gallery-upload"
                        />
                        <label
                          htmlFor="gallery-upload"
                          className="flex items-center space-x-1 px-3 py-1 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 cursor-pointer"
                        >
                          <Upload className="w-4 h-4" />
                          <span>{galleryUploadState.isUploading ? 'Uploading...' : 'Add Image'}</span>
                        </label>
                      </div>
                    </div>
                    
                    {characterGallery.length > 0 ? (
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {characterGallery.map((imageUrl, index) => (
                          <div key={index} className="relative group">
                            <img
                              src={imageUrl}
                              alt={`Character render ${index + 1}`}
                              className="w-full h-32 object-cover rounded-lg border"
                            />
                            <button
                              onClick={() => handleRemoveGalleryImage(index)}
                              className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
                        <p className="text-gray-500">No character renders uploaded yet.</p>
                        <p className="text-sm text-gray-400 mt-1">Upload images to create a character gallery.</p>
                      </div>
                    )}
                  </div>

                  {/* 3D Model Viewer */}
                  {uploadedModels.length > 0 && (
                    <div className="space-y-4">
                      <h4 className="text-lg font-medium text-gray-800">3D Model Viewer</h4>
                      <div className="space-y-4">
                        {uploadedModels.map((model, index) => (
                          <div key={index} className="space-y-2">
                            <div className="flex items-center justify-between">
                              <h5 className="text-sm font-medium text-gray-700">{model.filename}</h5>
                              <div className="flex items-center space-x-2 text-xs text-gray-500">
                                <span>{(model.size / 1024 / 1024).toFixed(2)} MB</span>
                                <span>•</span>
                                <span>{model.uploadDate.toLocaleDateString()}</span>
                              </div>
                            </div>
                            <ModelViewer 
                              modelUrl={model.url} 
                              filename={model.filename}
                              className="border border-gray-200 rounded-lg"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
