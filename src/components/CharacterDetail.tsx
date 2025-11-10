'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Character, AssetConcept, CharacterGeneral, CharacterClothing, CharacterPose, CharacterVoice } from '@/types';
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
  Users,
  Shirt,
  Image as ImageIcon,
  Box,
  Settings,
  Grid3X3,
  List,
  Plus,
  X,
  Download,
  Mic,
  Video
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useS3Upload } from '@/hooks/useS3Upload';
import { GLTFViewer } from './BabylonOnlyViewer';

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
  const [activeTab, setActiveTab] = useState<'general' | 'clothing' | 'gallery' | 'pose-concepts' | '3d-models' | 'production' | 'voice' | 'video-examples'>('general');
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Autosave ref
  const isFirstRenderRef = useRef(true);
  const autosaveTimerRef = useRef<number | null>(null);
  
  // Form states
  const [general, setGeneral] = useState<CharacterGeneral>(character.general || {});
  const [clothing, setClothing] = useState<CharacterClothing>(character.clothing || {});
  const [pose, setPose] = useState<CharacterPose>(character.pose || { defaultPose: 'T-pose' });
  const [voice, setVoice] = useState<CharacterVoice>(character.voice || {});
  
  // Concept generation
  const [generationPrompt, setGenerationPrompt] = useState('');
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [newConceptName, setNewConceptName] = useState('');
  
  // Image upload states
  const [uploadedImages, setUploadedImages] = useState<File[]>([]);
  const [uploadedImageUrls, setUploadedImageUrls] = useState<string[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState<Map<string, { progress: number; error?: string }>>(new Map());
  const [imageFormData, setImageFormData] = useState<Map<number, { description: string; relevanceScale: number; conceptType?: 'pose' | 'clothing' | 'general' | 'expression' | 'action' }>>(new Map());
  
  // Video upload states for concepts
  const [uploadedVideos, setUploadedVideos] = useState<File[]>([]);
  const [uploadedVideoUrls, setUploadedVideoUrls] = useState<string[]>([]);
  
  // Gallery states
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'relevance' | 'name'>('newest');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedConceptType, setSelectedConceptType] = useState<'all' | 'pose' | 'clothing' | 'general' | 'expression' | 'action'>('all');
  const [selectedImage, setSelectedImage] = useState<{ url: string; alt: string } | null>(null);
  const [editingConcept, setEditingConcept] = useState<string | null>(null);
  
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
  
  // Character video gallery state
  const [characterVideoGallery, setCharacterVideoGallery] = useState<string[]>(character.characterVideoGallery || []);
  
  // Video Examples state - separate for concepts and renders
  const [conceptVideos, setConceptVideos] = useState<string[]>(character.conceptVideos || []);
  const [renderVideos, setRenderVideos] = useState<string[]>(character.renderVideos || []);
  
  // Video upload state
  const [uploadingVideos, setUploadingVideos] = useState<Map<string, { progress: number; error?: string; type: 'concept' | 'render' }>>(new Map());
  
  // 3D model upload state
  const [uploadedModels, setUploadedModels] = useState<Array<{url: string, filename: string, size: number, uploadDate: Date}>>(character.uploadedModels || []);
  
  // Voice upload states
  const [uploadedVoiceFiles, setUploadedVoiceFiles] = useState<File[]>([]);
  const [uploadingVoiceFiles, setUploadingVoiceFiles] = useState<Map<string, { progress: number; error?: string }>>(new Map());
  const [voiceFormData, setVoiceFormData] = useState<Map<number, { description: string; language: string }>>(new Map());
  
  // Update uploadedModels state when character data changes
  useEffect(() => {
    if (character.uploadedModels) {
      setUploadedModels(character.uploadedModels);
    }
  }, [character.uploadedModels]);

  // Update voice state when character data changes
  useEffect(() => {
    if (character.voice) {
      setVoice(character.voice);
    }
  }, [character.voice]);

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
  
  // S3 upload hook
  const { uploadFile, uploadState } = useS3Upload();

  const handleSave = useCallback(() => {
    console.log('💾 Saving character with uploadedModels:', uploadedModels);
    const updatedCharacter: Character = {
      ...character,
      general,
      clothing,
      pose,
      voice,
      mainImage: mainImageUrl || undefined,
      modelFiles,
      characterGallery,
      characterVideoGallery,
      conceptVideos,
      renderVideos,
      uploadedModels,
    };
    console.log('💾 Updated character data:', updatedCharacter);
    console.log('💾 Uploaded models being saved:', updatedCharacter.uploadedModels);
    onSave(updatedCharacter);
  }, [character, general, clothing, pose, voice, mainImageUrl, modelFiles, characterGallery, characterVideoGallery, conceptVideos, renderVideos, uploadedModels, onSave]);

  // Autosave on voice changes with debounce
  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
    }
    autosaveTimerRef.current = window.setTimeout(() => {
      handleSave();
    }, 800);
    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [voice, general, clothing, pose, modelFiles, characterGallery, uploadedModels, mainImageUrl, handleSave]);

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
      const result = await uploadFile(file, `characters/${character.id}/gallery/`);
      if (result && result.url) {
        setCharacterGallery(prev => [...prev, result.url]);
      }
    } catch (error) {
      console.error('Failed to upload gallery image:', error);
    }
  };

  const handleRemoveGalleryImage = (index: number) => {
    const confirmed = typeof window !== 'undefined' ? window.confirm('Delete this image from the gallery?') : true;
    if (!confirmed) return;
    setCharacterGallery(prev => prev.filter((_, i) => i !== index));
  };

  const handleGalleryVideoUpload = async (file: File) => {
    try {
      const result = await uploadFile(file, `characters/${character.id}/gallery/videos/`);
      if (result && result.url) {
        setCharacterGallery(prev => [...prev, result.url]);
      }
    } catch (error) {
      console.error('Failed to upload gallery video:', error);
    }
  };

  const handleVideoGalleryUpload = async (file: File) => {
    try {
      const result = await uploadFile(file, `characters/${character.id}/video-gallery/`);
      if (result && result.url) {
        setCharacterVideoGallery(prev => [...prev, result.url]);
      }
    } catch (error) {
      console.error('Failed to upload video:', error);
    }
  };

  const handleRemoveVideoGalleryItem = (index: number) => {
    const confirmed = typeof window !== 'undefined' ? window.confirm('Delete this video from the gallery?') : true;
    if (!confirmed) return;
    setCharacterVideoGallery(prev => prev.filter((_, i) => i !== index));
  };

  const handleVideoUpload = async (file: File, type: 'concept' | 'render') => {
    const fileId = `${Date.now()}-${file.name}`;
    
    // Initialize upload state
    setUploadingVideos(prev => new Map(prev.set(fileId, { progress: 0, type })));
    
    // Simulate progress updates
    const progressInterval = setInterval(() => {
      setUploadingVideos(prev => {
        const current = prev.get(fileId);
        if (current && current.progress < 90 && !current.error) {
          // Increment progress gradually up to 90%
          const newProgress = Math.min(current.progress + 10, 90);
          return new Map(prev.set(fileId, { ...current, progress: newProgress }));
        }
        return prev;
      });
    }, 300);
    
    try {
      const result = await uploadFile(file, `characters/${character.id}/video-examples/${type}/`);
      
      // Clear progress interval
      clearInterval(progressInterval);
      
      if (result && result.url) {
        // Mark as completed
        setUploadingVideos(prev => new Map(prev.set(fileId, { progress: 100, type })));
        
        // Update the appropriate video array
        if (type === 'concept') {
          setConceptVideos(prev => [...prev, result.url]);
        } else {
          setRenderVideos(prev => [...prev, result.url]);
        }
        
        // Remove from uploading after a delay
        setTimeout(() => {
          setUploadingVideos(prev => {
            const newMap = new Map(prev);
            newMap.delete(fileId);
            return newMap;
          });
        }, 1500);
      } else {
        // Mark as error
        setUploadingVideos(prev => new Map(prev.set(fileId, { progress: 0, error: 'Upload failed', type })));
      }
    } catch (error) {
      clearInterval(progressInterval);
      console.error('Video upload error:', error);
      setUploadingVideos(prev => new Map(prev.set(fileId, { progress: 0, error: 'Upload failed', type })));
    }
  };

  const handleRemoveConceptVideo = (index: number) => {
    const confirmed = typeof window !== 'undefined' ? window.confirm('Delete this concept video?') : true;
    if (!confirmed) return;
    setConceptVideos(prev => prev.filter((_, i) => i !== index));
  };

  const handleRemoveRenderVideo = (index: number) => {
    const confirmed = typeof window !== 'undefined' ? window.confirm('Delete this render video?') : true;
    if (!confirmed) return;
    setRenderVideos(prev => prev.filter((_, i) => i !== index));
  };

  // Paste-to-upload for gallery
  const handleGalleryPaste = async (event: React.ClipboardEvent<HTMLDivElement>) => {
    try {
      const items = event.clipboardData?.items || [];
      let handled = false;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            handled = true;
            await handleGalleryImageUpload(file);
          }
        }
      }
      if (handled) {
        event.preventDefault();
        event.stopPropagation();
      }
    } catch (err) {
      console.error('Failed to paste image to gallery:', err);
    }
  };

  const handleModelUpload = async (file: File) => {
    try {
      console.log('🚀 Starting 3D model upload...', { filename: file.name, size: file.size });
      const result = await uploadFile(file, `characters/${character.id}/models/`);
      
      if (result && result.url) {
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
          const result = await uploadFile(file, `characters/${character.id}/concepts`);
          
          if (result && result.url) {
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

  const handleSaveUploadedConcept = (imageUrl: string | null, videoUrl: string | null, description: string = '', relevanceScale: number = 3, conceptType: 'pose' | 'clothing' | 'general' | 'expression' | 'action' = 'general') => {
    // Generate a name based on the file or use a default
    const file = uploadedImages[0] || uploadedVideos[0];
    const fileName = file?.name || 'Uploaded Media';
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
      imageUrl: imageUrl || undefined,
      videoUrl: videoUrl || undefined,
      prompt: 'User uploaded media',
    };
    
    onAddConcept(newConcept);
  };

  const handleMainImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setMainImageUrl(URL.createObjectURL(file));
      setIsUploadingMainImage(true);
      
      try {
        console.log('🖼️ Uploading main character image...', file.name);
        const result = await uploadFile(file, `characters/${character.id}/main`);
        if (result && result.url) {
          console.log('✅ Main image uploaded successfully:', result.url);
          setMainImageUrl(result.url);
          // Update character with new main image
          const updatedCharacter = {
            ...character,
            mainImage: result.url
          };
          onSave(updatedCharacter);
        } else {
          console.error('❌ Main image upload failed: No URL returned');
          setMainImageUrl(character.mainImage || null);
        }
      } catch (error) {
        console.error('❌ Main image upload failed:', error);
        setMainImageUrl(character.mainImage || null);
      } finally {
        setIsUploadingMainImage(false);
      }
    }
  };

  const handleUpdateConcept = async (conceptId: string, updates: { name?: string; description?: string; relevanceScale?: number }) => {
    try {
      console.log('🔄 Updating concept:', conceptId, 'with updates:', updates);
      console.log('📊 Current character concepts:', character.concepts);
      
      const updatedConcepts = (character.concepts || []).map(concept => 
        concept.id === conceptId 
          ? { ...concept, ...updates, updatedAt: new Date() }
          : concept
      );
      
      console.log('📊 Updated concepts:', updatedConcepts);
      
      const updatedCharacter = { ...character, concepts: updatedConcepts };
      console.log('💾 Saving updated character:', updatedCharacter);
      
      onSave(updatedCharacter);
      setEditingConcept(null);
      
      console.log('✅ Concept update completed');
    } catch (error) {
      console.error('❌ Failed to update concept:', error);
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

  const handleVoiceUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length > 0) {
      setUploadedVoiceFiles(prev => [...prev, ...files]);
      
      // Upload each file to S3
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileId = `${Date.now()}-${Math.random()}-${i}`;
        
        setUploadingVoiceFiles(prev => new Map(prev.set(fileId, { progress: 0 })));
        
        try {
          const result = await uploadFile(file, `characters/${character.id}/voice`);
          if (result && result.url) {
            // Add uploaded file to voice samples
            const newSample = {
              url: result.url,
              description: voiceFormData.get(i)?.description || '',
              filename: file.name,
              language: voiceFormData.get(i)?.language || ''
            };
            setVoice(prev => ({
              ...prev,
              samples: [...(prev.samples || []), newSample]
            }));
            
            setUploadingVoiceFiles(prev => new Map(prev.set(fileId, { progress: 100 })));
          } else {
            setUploadingVoiceFiles(prev => new Map(prev.set(fileId, { progress: 0, error: 'Upload failed' })));
          }
        } catch (error) {
          console.error('Error uploading voice file:', error);
          setUploadingVoiceFiles(prev => new Map(prev.set(fileId, { progress: 0, error: 'Upload failed' })));
        }
      }
      
      // Clean up
      setUploadedVoiceFiles([]);
      setVoiceFormData(new Map());
      event.target.value = '';
    }
  };

  const handleRemoveVoiceSample = (index: number) => {
    setVoice(prev => ({
      ...prev,
      samples: prev.samples?.filter((_, i) => i !== index) || []
    }));
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
    { id: 'general', label: 'General', icon: Users },
    { id: 'clothing', label: 'Clothing', icon: Shirt },
    { id: 'gallery', label: 'Gallery', icon: ImageIcon },
    { id: 'pose-concepts', label: 'Concepts', icon: ImageIcon },
    { id: 'video-examples', label: 'Video Examples', icon: Video },
    { id: '3d-models', label: '3D Models', icon: Box },
    { id: 'production', label: 'Production', icon: Settings },
    { id: 'voice', label: 'Voice', icon: Mic },
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

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
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

              {/* Gallery Tab */}
              {activeTab === 'gallery' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-semibold text-gray-900">Character Gallery</h3>
                    <div className="flex items-center space-x-2">
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
                        <span>{uploadState.isUploading ? 'Uploading...' : 'Add Image'}</span>
                      </label>
                      <input
                        type="file"
                        accept="video/*"
                        onChange={(async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            await handleGalleryVideoUpload(file);
                          }
                        })}
                        className="hidden"
                        id="gallery-video-upload"
                      />
                      <label
                        htmlFor="gallery-video-upload"
                        className="flex items-center space-x-1 px-3 py-1 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 cursor-pointer"
                      >
                        <Video className="w-4 h-4" />
                        <span>Add Video</span>
                      </label>
                    </div>
                  </div>

                  <div
                    className="rounded-lg"
                    onPaste={handleGalleryPaste}
                    tabIndex={0}
                  >
                    <div className="text-xs text-gray-500 mb-3 flex items-center gap-2">
                      <span className="px-2 py-0.5 border border-gray-300 rounded bg-gray-50">Ctrl</span>
                      +
                      <span className="px-2 py-0.5 border border-gray-300 rounded bg-gray-50">V</span>
                      <span>Paste image from clipboard to upload</span>
                    </div>

                    {characterGallery.length > 0 ? (
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {characterGallery.map((mediaUrl, index) => {
                          const isVideo = mediaUrl.match(/\.(mp4|webm|ogg|mov)$/i) || mediaUrl.includes('video');
                          return (
                            <div key={index} className="relative group">
                              {isVideo ? (
                                <video
                                  src={mediaUrl}
                                  controls
                                  className="w-full h-32 object-cover rounded-lg border"
                                />
                              ) : (
                                <img
                                  src={mediaUrl}
                                  alt={`Character render ${index + 1}`}
                                  className="w-full h-32 object-cover rounded-lg border cursor-pointer"
                                  onClick={() => setSelectedImage({ url: mediaUrl, alt: `Character render ${index + 1}` })}
                                />
                              )}
                              <button
                                onClick={() => handleRemoveGalleryImage(index)}
                                className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
                        <p className="text-gray-500">No images or videos in the gallery yet.</p>
                        <p className="text-sm text-gray-400 mt-1">Upload images/videos or paste images with Ctrl+V.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Video Examples Tab */}
              {activeTab === 'video-examples' && (
                <div className="space-y-8">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-semibold text-gray-900">Video Examples</h3>
                  </div>

                  {/* Concepts Section */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-lg font-medium text-gray-900">Concepts</h4>
                      <div className="flex items-center space-x-2">
                        <input
                          type="file"
                          accept="video/*"
                          onChange={(async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              await handleVideoUpload(file, 'concept');
                            }
                            // Reset input
                            e.target.value = '';
                          })}
                          className="hidden"
                          id="concept-video-upload"
                        />
                        <label
                          htmlFor="concept-video-upload"
                          className="flex items-center space-x-1 px-3 py-1 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 cursor-pointer"
                        >
                          <Upload className="w-4 h-4" />
                          <span>Add Concept Video</span>
                        </label>
                      </div>
                    </div>

                    {/* Uploading Videos Progress */}
                    {Array.from(uploadingVideos.entries()).filter(([_, info]) => info.type === 'concept').length > 0 && (
                      <div className="space-y-2">
                        {Array.from(uploadingVideos.entries())
                          .filter(([_, info]) => info.type === 'concept')
                          .map(([fileId, info]) => (
                            <div key={fileId} className="border border-gray-200 rounded-lg p-3">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-gray-700">Uploading concept video...</span>
                                {info.error ? (
                                  <span className="text-xs text-red-600">Error: {info.error}</span>
                                ) : (
                                  <span className="text-xs text-gray-500">{info.progress}%</span>
                                )}
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                  className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                                  style={{ width: `${info.progress}%` }}
                                />
                              </div>
                            </div>
                          ))}
                      </div>
                    )}

                    {conceptVideos.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {conceptVideos.map((videoUrl, index) => (
                          <div key={index} className="relative group">
                            <video
                              src={videoUrl}
                              controls
                              className="w-full h-48 object-cover rounded-lg border"
                            />
                            <button
                              onClick={() => handleRemoveConceptVideo(index)}
                              className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
                        <Video className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                        <p className="text-sm text-gray-500">No concept videos yet.</p>
                      </div>
                    )}
                  </div>

                  {/* Renders Section */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-lg font-medium text-gray-900">Renders</h4>
                      <div className="flex items-center space-x-2">
                        <input
                          type="file"
                          accept="video/*"
                          onChange={(async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              await handleVideoUpload(file, 'render');
                            }
                            // Reset input
                            e.target.value = '';
                          })}
                          className="hidden"
                          id="render-video-upload"
                        />
                        <label
                          htmlFor="render-video-upload"
                          className="flex items-center space-x-1 px-3 py-1 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 cursor-pointer"
                        >
                          <Upload className="w-4 h-4" />
                          <span>Add Render Video</span>
                        </label>
                      </div>
                    </div>

                    {/* Uploading Videos Progress */}
                    {Array.from(uploadingVideos.entries()).filter(([_, info]) => info.type === 'render').length > 0 && (
                      <div className="space-y-2">
                        {Array.from(uploadingVideos.entries())
                          .filter(([_, info]) => info.type === 'render')
                          .map(([fileId, info]) => (
                            <div key={fileId} className="border border-gray-200 rounded-lg p-3">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-gray-700">Uploading render video...</span>
                                {info.error ? (
                                  <span className="text-xs text-red-600">Error: {info.error}</span>
                                ) : (
                                  <span className="text-xs text-gray-500">{info.progress}%</span>
                                )}
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                  className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                                  style={{ width: `${info.progress}%` }}
                                />
                              </div>
                            </div>
                          ))}
                      </div>
                    )}

                    {renderVideos.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {renderVideos.map((videoUrl, index) => (
                          <div key={index} className="relative group">
                            <video
                              src={videoUrl}
                              controls
                              className="w-full h-48 object-cover rounded-lg border"
                            />
                            <button
                              onClick={() => handleRemoveRenderVideo(index)}
                              className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
                        <Video className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                        <p className="text-sm text-gray-500">No render videos yet.</p>
                      </div>
                    )}
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
                      <h4 className="text-lg font-medium text-gray-900 mb-4">Upload Images & Videos</h4>
                      <div className="space-y-4">
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                      <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                          <p className="text-sm text-gray-600 mb-2">Upload your own images or videos</p>
                      <div className="flex items-center justify-center space-x-2">
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
                          Choose Images
                        </label>
                        <input
                          type="file"
                          accept="video/*"
                          multiple
                          onChange={async (e) => {
                            const files = e.target.files;
                            if (files && files.length > 0) {
                              setUploadedVideos(Array.from(files));
                              const videoFiles = Array.from(files);
                              for (let i = 0; i < videoFiles.length; i++) {
                                const file = videoFiles[i];
                                const fileId = `${Date.now()}-video-${i}`;
                                setUploadingFiles(prev => new Map(prev.set(fileId, { progress: 0 })));
                                try {
                                  const result = await uploadFile(file, `characters/${character.id}/concepts/videos`);
                                  if (result && result.url) {
                                    setUploadedVideoUrls(prev => [...prev, result.url]);
                                    setUploadingFiles(prev => new Map(prev.set(fileId, { progress: 100 })));
                                  } else {
                                    setUploadingFiles(prev => new Map(prev.set(fileId, { progress: 0, error: 'Upload failed' })));
                                  }
                                } catch (error) {
                                  console.error('Video upload error:', error);
                                  setUploadingFiles(prev => new Map(prev.set(fileId, { progress: 0, error: 'Upload failed' })));
                                }
                              }
                            }
                          }}
                          className="hidden"
                          id="video-upload"
                        />
                        <label
                          htmlFor="video-upload"
                          className="inline-block px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 cursor-pointer transition-colors"
                        >
                          Choose Videos
                        </label>
                      </div>
                    </div>

                        {/* Uploaded Videos Preview */}
                        {uploadedVideoUrls.length > 0 && (
                          <div className="space-y-4">
                            <h5 className="text-sm font-medium text-gray-700">Uploaded Videos</h5>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                              {uploadedVideoUrls.map((url, index) => {
                                const fileId = `${Date.now()}-video-${index}`;
                                const uploadInfo = uploadingFiles.get(fileId);
                                const isUploading = uploadInfo && uploadInfo.progress < 100;
                                const hasError = uploadInfo?.error;
                                
                                return (
                                  <div key={index} className="relative border border-gray-200 rounded-lg overflow-hidden">
                                    <div className="relative">
                                      <video
                                        src={url}
                                        controls
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
                                        value={imageFormData.get(index + 1000)?.description || ''}
                                        onChange={(e) => {
                                          const currentData = imageFormData.get(index + 1000) || { description: '', relevanceScale: 3 };
                                          setImageFormData(new Map(imageFormData.set(index + 1000, { ...currentData, description: e.target.value })));
                                        }}
                                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-transparent resize-none"
                                        rows={2}
                                      />
                                      
                                      <div className="flex items-center space-x-2">
                                        <label className="text-xs text-gray-600">Type:</label>
                                        <select 
                                          data-concept-type={index + 1000}
                                          className="text-xs border border-gray-300 rounded px-1 py-1"
                                          onChange={(e) => {
                                            const currentData = imageFormData.get(index + 1000) || { description: '', relevanceScale: 3 };
                                            setImageFormData(new Map(imageFormData.set(index + 1000, { ...currentData, conceptType: e.target.value as 'pose' | 'clothing' | 'general' | 'expression' | 'action' })));
                                          }}
                                        >
                                          <option value="general">General</option>
                                          <option value="pose">Pose</option>
                                          <option value="clothing">Clothing</option>
                                          <option value="expression">Expression</option>
                                          <option value="action">Action</option>
                                        </select>
                                      </div>
                                      
                                      <div className="flex items-center justify-between">
                                        <button
                                          onClick={() => {
                                            const formData = imageFormData.get(index + 1000);
                                            const conceptTypeSelect = document.querySelector(`select[data-concept-type="${index + 1000}"]`) as HTMLSelectElement;
                                            const conceptType = (conceptTypeSelect?.value as 'pose' | 'clothing' | 'general' | 'expression' | 'action') || 'general';
                                            handleSaveUploadedConcept(null, url, formData?.description || '', formData?.relevanceScale || 3, conceptType);
                                            setUploadedVideoUrls(prev => prev.filter((_, i) => i !== index));
                                            setImageFormData(prev => {
                                              const newMap = new Map(prev);
                                              newMap.delete(index + 1000);
                                              return newMap;
                                            });
                                          }}
                                          className="px-3 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700"
                                        >
                                          Save as Concept
                                        </button>
                                        <button
                                          onClick={() => {
                                            setUploadedVideoUrls(prev => prev.filter((_, i) => i !== index));
                                            setImageFormData(prev => {
                                              const newMap = new Map(prev);
                                              newMap.delete(index + 1000);
                                              return newMap;
                                            });
                                          }}
                                          className="px-3 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
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
                                            handleSaveUploadedConcept(url, null, formData?.description || '', formData?.relevanceScale || 3, conceptType);
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
                                  "relative group overflow-hidden",
                                  viewMode === 'list' ? "w-32 h-32 flex-shrink-0" : "w-full h-48"
                                )}>
                          <img
                            src={concept.imageUrl}
                            alt={concept.name}
                            className={cn(
                              "object-contain cursor-pointer",
                              viewMode === 'list' ? "w-full h-full" : "w-full h-full"
                            )}
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
                              minHeight: viewMode === 'list' ? '128px' : '192px',
                              backgroundColor: '#f8f9fa'
                            }}
                          />
                        </div>
                              )}
                        {concept.videoUrl && (
                          <div className={cn(
                            "relative group overflow-hidden",
                            viewMode === 'list' ? "w-32 h-32 flex-shrink-0" : "w-full h-48"
                          )}>
                            <video
                              src={concept.videoUrl}
                              controls
                              className={cn(
                                "object-contain",
                                viewMode === 'list' ? "w-full h-full" : "w-full h-full"
                              )}
                              style={{ 
                                minHeight: viewMode === 'list' ? '128px' : '192px',
                                backgroundColor: '#f8f9fa'
                              }}
                            />
                          </div>
                        )}
                              
                              <div className={cn(
                                "p-4",
                                viewMode === 'list' && "flex-1"
                              )}>
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <div className="flex items-center space-x-2 mb-2">
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
                                        <h5 
                                          className="font-medium text-gray-900 cursor-pointer hover:text-indigo-600"
                                          onClick={() => setEditingConcept(concept.id)}
                                        >
                                          {concept.name}
                                        </h5>
                                      )}
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
                                    
                                    {editingConcept === concept.id ? (
                                      <textarea
                                        defaultValue={concept.description || ''}
                                        className="text-sm text-gray-600 mt-1 w-full bg-transparent border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
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
                                        className="text-sm text-gray-600 mt-1 line-clamp-2 cursor-pointer hover:text-indigo-600 min-h-[1.5rem]"
                                        onClick={() => setEditingConcept(concept.id)}
                                      >
                                        {concept.description || 'Click to add description...'}
                                      </p>
                                    )}
                                    
                                    {/* Metadata */}
                                    <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                                      <span>
                                        {new Date(concept.createdAt).toLocaleDateString()}
                                      </span>
                                      <div className="flex items-center space-x-2">
                                        <span>Relevance:</span>
                                        {editingConcept === concept.id ? (
                                          <select
                                            value={concept.relevanceScale || 5}
                                            onChange={(e) => handleUpdateConcept(concept.id, { relevanceScale: parseInt(e.target.value) })}
                                            className="bg-transparent border border-gray-300 rounded px-1 py-0.5 text-xs"
                                          >
                                            {[1,2,3,4,5].map(num => (
                                              <option key={num} value={num}>{num}</option>
                                            ))}
                                          </select>
                                        ) : (
                                          <span 
                                            className="cursor-pointer hover:text-indigo-600"
                                            onClick={() => setEditingConcept(concept.id)}
                                          >
                                            {concept.relevanceScale || 5}/5
                                          </span>
                                        )}
                                      </div>
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

              {/* Voice Tab */}
              {activeTab === 'voice' && (
                <div className="space-y-8">
                  <h3 className="text-xl font-semibold text-gray-900">Voice</h3>

                  {/* Voice Description */}
                  <div className="border border-gray-200 rounded-lg p-6">
                    <h4 className="text-lg font-medium text-gray-900 mb-4">Voice Description</h4>
                    <textarea
                      value={voice.description || ''}
                      onChange={(e) => setVoice(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Describe the character's voice (tone, pitch, accent, etc.)..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                      rows={4}
                    />
                  </div>

                  {/* Voice Samples */}
                  <div className="border border-gray-200 rounded-lg p-6">
                    <h4 className="text-lg font-medium text-gray-900 mb-4">Voice Samples</h4>
                    <div className="space-y-4">
                      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                        <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-sm text-gray-600 mb-2">Upload audio files</p>
                        <input
                          type="file"
                          accept="audio/*"
                          multiple
                          onChange={handleVoiceUpload}
                          className="hidden"
                          id="voice-upload"
                        />
                        <label
                          htmlFor="voice-upload"
                          className="inline-block px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 cursor-pointer transition-colors"
                        >
                          Choose Files
                        </label>
                      </div>

                      {/* Voice Samples List */}
                      {voice.samples && voice.samples.length > 0 && (
                        <div className="space-y-4">
                          <h5 className="text-sm font-medium text-gray-700">Uploaded Voice Samples</h5>
                          <div className="space-y-4">
                            {voice.samples.map((sample, index) => (
                              <div key={index} className="border border-gray-200 rounded-lg p-4">
                                <div className="flex items-start space-x-4 mb-3">
                                  <div className="flex-1">
                                    <div className="flex items-center space-x-2 mb-2">
                                      <audio controls className="w-full max-w-md">
                                        <source src={sample.url} />
                                      </audio>
                                    </div>
                                    <input
                                      type="text"
                                      value={sample.language || ''}
                                      onChange={(e) => {
                                        const updatedSamples = [...(voice.samples || [])];
                                        updatedSamples[index] = { ...updatedSamples[index], language: e.target.value };
                                        setVoice(prev => ({ ...prev, samples: updatedSamples }));
                                      }}
                                      placeholder="Language (e.g., English, Polish, etc.)"
                                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-transparent"
                                    />
                                    <textarea
                                      value={sample.description || ''}
                                      onChange={(e) => {
                                        const updatedSamples = [...(voice.samples || [])];
                                        updatedSamples[index] = { ...updatedSamples[index], description: e.target.value };
                                        setVoice(prev => ({ ...prev, samples: updatedSamples }));
                                      }}
                                      placeholder="Description..."
                                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-transparent resize-none mt-2"
                                      rows={2}
                                    />
                                    <p className="text-xs text-gray-500 mt-2">{sample.filename}</p>
                                  </div>
                                  <button
                                    onClick={() => handleRemoveVoiceSample(index)}
                                    className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
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
                              disabled={uploadState.isUploading}
                            />
                            <label
                              htmlFor="model-upload"
                              className={`cursor-pointer flex flex-col items-center space-y-2 ${
                                uploadState.isUploading ? 'opacity-50 cursor-not-allowed' : ''
                              }`}
                            >
                              <Upload className="w-8 h-8 text-gray-400" />
                              <span className="text-sm text-gray-600">
                                {uploadState.isUploading ? 'Uploading...' : 'Click to upload 3D model'}
                              </span>
                              <span className="text-xs text-gray-500">Supports .fbx, .usdz, .blend, .glb, .gltf files</span>
                            </label>
                            
                            {/* Progress Bar */}
                            {uploadState.isUploading && (
                              <div className="w-full mt-4">
                                <div className="bg-gray-200 rounded-full h-2">
                                  <div 
                                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                    style={{ width: `${uploadState.progress}%` }}
                                  ></div>
                                </div>
                                <span className="text-xs text-gray-500 mt-1">{uploadState.progress}%</span>
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

                  {/* Character Gallery moved to its own tab */}

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
                <GLTFViewer
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

      {/* Image Modal */}
      {selectedImage && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="relative max-w-4xl max-h-full">
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute top-4 right-4 text-white hover:text-gray-300 z-10"
            >
              <X className="w-8 h-8" />
            </button>
            <img
              src={selectedImage.url}
              alt={selectedImage.alt}
              className="max-w-full max-h-full object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}
