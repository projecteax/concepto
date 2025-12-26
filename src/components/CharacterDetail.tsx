'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Character, AssetConcept, CharacterGeneral, CharacterClothing, CharacterPose, CharacterVoice, AIRefImages } from '@/types';
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
  Video,
  Edit3,
  Sparkles,
  Star,
  ZoomIn
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useS3Upload } from '@/hooks/useS3Upload';
import { GLTFViewer } from './BabylonOnlyViewer';
import { Show } from '@/types';
import { BackstoryGenerationDialog } from './BackstoryGenerationDialog';
import { AssetConceptGenerationDialog } from './AssetConceptGenerationDialog';
import { GlobalAsset } from '@/types';
import { AppBreadcrumbHeader } from './AppBreadcrumbHeader';
import { useBasePath } from '@/hooks/useBasePath';

interface CharacterDetailProps {
  show: Show;
  character: Character;
  onBack: () => void;
  onSave: (character: Character) => void;
  onAddConcept: (concept: Omit<AssetConcept, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onDeleteConcept: (conceptId: string) => void;
  globalAssets?: GlobalAsset[]; // For image generation context
}

export function CharacterDetail({
  show,
  character,
  onBack,
  onSave,
  onAddConcept,
  onDeleteConcept,
  globalAssets = []
}: CharacterDetailProps) {
  const basePath = useBasePath();
  const headerIsDark = Boolean(show.coverImageUrl);
  const [activeTab, setActiveTab] = useState<'general' | 'clothing' | 'gallery' | 'pose-concepts' | '3d-models' | 'production' | 'voice' | 'video-examples' | 'ai-ref'>('general');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(character.name);
  const [isMainCharacter, setIsMainCharacter] = useState<boolean>(Boolean(character.isMainCharacter));
  
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
  
  // AI Reference Images state
  const [aiRefImages, setAiRefImages] = useState<AIRefImages>(character.aiRefImages || {});
  
  // AI Ref upload progress tracking
  const [uploadingAIRefImages, setUploadingAIRefImages] = useState<Map<string, { progress: number; category: 'fullBody' | 'multipleAngles' | 'head' | 'expressions'; file: File }>>(new Map());
  
  // Sync video arrays when character prop changes (e.g., after reload)
  const prevConceptVideosRef = useRef<string[]>(character.conceptVideos || []);
  const prevRenderVideosRef = useRef<string[]>(character.renderVideos || []);
  
  useEffect(() => {
    const conceptVideosFromProp = character.conceptVideos || [];
    const renderVideosFromProp = character.renderVideos || [];
    
    // Only update if arrays are different
    const conceptChanged = conceptVideosFromProp.length !== prevConceptVideosRef.current.length ||
      conceptVideosFromProp.some((url, idx) => url !== prevConceptVideosRef.current[idx]);
    const renderChanged = renderVideosFromProp.length !== prevRenderVideosRef.current.length ||
      renderVideosFromProp.some((url, idx) => url !== prevRenderVideosRef.current[idx]);
    
    if (conceptChanged) {
      prevConceptVideosRef.current = conceptVideosFromProp;
      setConceptVideos(conceptVideosFromProp);
    }
    if (renderChanged) {
      prevRenderVideosRef.current = renderVideosFromProp;
      setRenderVideos(renderVideosFromProp);
    }
  }, [character.conceptVideos, character.renderVideos]);
  
  // 3D model upload state
  const [uploadedModels, setUploadedModels] = useState<Array<{url: string, filename: string, size: number, uploadDate: Date}>>(character.uploadedModels || []);
  
  // Voice upload states
  const [uploadedVoiceFiles, setUploadedVoiceFiles] = useState<File[]>([]);
  const [uploadingVoiceFiles, setUploadingVoiceFiles] = useState<Map<string, { progress: number; error?: string }>>(new Map());
  const [voiceFormData, setVoiceFormData] = useState<Map<number, { description: string; language: string }>>(new Map());

  // Backstory generation dialog
  const [showBackstoryDialog, setShowBackstoryDialog] = useState(false);
  
  // Image generation state
  const [showImageGenerationDialog, setShowImageGenerationDialog] = useState(false);
  const [selectedConceptIds, setSelectedConceptIds] = useState<Set<string>>(new Set());
  
  // REF assignment modal state
  const [refAssignmentModal, setRefAssignmentModal] = useState<{ conceptId: string; imageUrl: string; conceptName: string } | null>(null);
  
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

  // Keep main-character flag in sync when navigating between characters
  useEffect(() => {
    setIsMainCharacter(Boolean(character.isMainCharacter));
  }, [character.id, character.isMainCharacter]);

  // Update AI ref images state when character data changes
  useEffect(() => {
    if (character.aiRefImages) {
      setAiRefImages(character.aiRefImages);
    } else {
      setAiRefImages({});
    }
  }, [character.aiRefImages]);

  // Migrate relationships to relations for backward compatibility
  useEffect(() => {
    if (general.relationships && !general.relations) {
      setGeneral(prev => ({ ...prev, relations: prev.relationships }));
    }
  }, [general.relationships, general.relations]);

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

  const handleBackstoryGenerated = useCallback((backstory: string) => {
    setGeneral(prev => ({ ...prev, backstory }));
  }, []);

  const handleSave = useCallback(() => {
    console.log('💾 Saving character with uploadedModels:', uploadedModels);
    // Ensure relations is set (migrate from relationships if needed)
    // Remove undefined values to prevent Firestore errors
    const relationsValue = general.relations || general.relationships;
    const generalToSave: CharacterGeneral = {};
    
    // Only include defined fields
    if (general.nickname !== undefined) generalToSave.nickname = general.nickname;
    if (general.visualDescription !== undefined) generalToSave.visualDescription = general.visualDescription;
    if (general.age !== undefined) generalToSave.age = general.age;
    if (general.personality !== undefined) generalToSave.personality = general.personality;
    if (general.backstory !== undefined) generalToSave.backstory = general.backstory;
    if (general.specialAbilities !== undefined) generalToSave.specialAbilities = general.specialAbilities;
    if (relationsValue !== undefined && relationsValue !== '') {
      generalToSave.relations = relationsValue;
    }
    // Keep relationships for backward compatibility if it exists
    if (general.relationships !== undefined && general.relationships !== '') {
      generalToSave.relationships = general.relationships;
    }
    
    const updatedCharacter: Character = {
      ...character,
      name: name.trim(),
      isMainCharacter,
      general: generalToSave,
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
      aiRefImages,
    };
    console.log('💾 Updated character data:', updatedCharacter);
    console.log('💾 Uploaded models being saved:', updatedCharacter.uploadedModels);
    onSave(updatedCharacter);
    setIsEditing(false);
  }, [character, name, isMainCharacter, general, clothing, pose, voice, mainImageUrl, modelFiles, characterGallery, characterVideoGallery, conceptVideos, renderVideos, uploadedModels, aiRefImages, onSave]);

  // Autosave on voice changes with debounce (30 seconds - backup save only)
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
    }, 30000); // 30 seconds - backup save to prevent Firebase quota issues
    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [voice, general, clothing, pose, modelFiles, characterGallery, characterVideoGallery, conceptVideos, renderVideos, uploadedModels, mainImageUrl, handleSave]);

  // Immediate save when videos are added (separate from autosave to ensure videos are saved)
  const conceptVideosRef = useRef<string[]>(conceptVideos);
  const renderVideosRef = useRef<string[]>(renderVideos);
  const isInitialMountRef = useRef(true);
  
  useEffect(() => {
    // Check if videos actually changed
    const conceptChanged = conceptVideosRef.current.length !== conceptVideos.length || 
      conceptVideosRef.current.some((url, idx) => url !== conceptVideos[idx]);
    const renderChanged = renderVideosRef.current.length !== renderVideos.length || 
      renderVideosRef.current.some((url, idx) => url !== renderVideos[idx]);
    
    if (conceptChanged || renderChanged) {
      conceptVideosRef.current = conceptVideos;
      renderVideosRef.current = renderVideos;
      
      // Skip save on initial mount
      if (isInitialMountRef.current) {
        isInitialMountRef.current = false;
        return;
      }
      
      // Save immediately when videos change
      const saveTimer = setTimeout(() => {
        handleSave();
      }, 300);
      
      return () => clearTimeout(saveTimer);
    }
  }, [conceptVideos, renderVideos, handleSave]);

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
        
        // Update the appropriate video array and save immediately
        if (type === 'concept') {
          setConceptVideos(prev => {
            const updated = [...prev, result.url];
            // Save immediately with updated video array
            setTimeout(() => {
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
                conceptVideos: updated,
                renderVideos,
                uploadedModels,
              };
              onSave(updatedCharacter);
            }, 100);
            return updated;
          });
        } else {
          setRenderVideos(prev => {
            const updated = [...prev, result.url];
            // Save immediately with updated video array
            setTimeout(() => {
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
                renderVideos: updated,
                uploadedModels,
              };
              onSave(updatedCharacter);
            }, 100);
            return updated;
          });
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

  // AI Ref Image upload handlers
  const handleAIRefImageUpload = async (file: File, category: 'fullBody' | 'multipleAngles' | 'head' | 'expressions') => {
    const uploadId = `${category}-${Date.now()}-${Math.random()}`;
    
    // Create preview URL for immediate display
    const previewUrl = URL.createObjectURL(file);
    
    // Add to uploading state with 0 progress
    setUploadingAIRefImages(prev => new Map(prev).set(uploadId, { progress: 0, category, file }));
    
    // Generate structured filename
    const extension = file.name.split('.').pop() || 'jpg';
    const categoryName = category === 'fullBody' ? 'full_body' : 
                        category === 'multipleAngles' ? 'multiple_angles' :
                        category === 'head' ? 'head' : 'expressions';
    const customFileName = `${name}_${categoryName}`;
    
    // Simulate progress updates
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
      const result = await uploadFile(file, `characters/${character.id}/ai-ref`, customFileName);
      
      if (progressInterval) {
        clearInterval(progressInterval);
      }
      
      // Set to 100% before removing
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
        const updatedCharacter: Character = {
          ...character,
          aiRefImages: updatedAiRefImages,
        };
        onSave(updatedCharacter);
        
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

  const handleRemoveAIRefImage = (category: 'fullBody' | 'multipleAngles' | 'head' | 'expressions', index: number) => {
    const updatedAiRefImages = {
      ...aiRefImages,
      [category]: (aiRefImages[category] || []).filter((_, i) => i !== index)
    };
    setAiRefImages(updatedAiRefImages);
    
    // Save to database
    const updatedCharacter = { ...character, aiRefImages: updatedAiRefImages };
    onSave(updatedCharacter);
  };

  const handleAssignToAIRef = (category: 'fullBody' | 'multipleAngles' | 'head' | 'expressions') => {
    if (!refAssignmentModal) return;
    
    const { imageUrl } = refAssignmentModal;
    const updatedAiRefImages = {
      ...aiRefImages,
      [category]: [...(aiRefImages[category] || []), imageUrl]
    };
    setAiRefImages(updatedAiRefImages);
    
    // Save to database
    const updatedCharacter = { ...character, aiRefImages: updatedAiRefImages };
    onSave(updatedCharacter);
    
    // Close modal
    setRefAssignmentModal(null);
  };

  const handleRemoveVoiceSample = (index: number) => {
    setVoice(prev => ({
      ...prev,
      samples: prev.samples?.filter((_, i) => i !== index) || []
    }));
  };

  // Sort and filter concepts based on selected criteria
  const getSortedConcepts = () => {
    let concepts = [...(character.concepts || [])];
    
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
    const concepts = character.concepts || [];
    const counts = {
      all: concepts.length,
      pose: concepts.filter(c => c.conceptType === 'pose').length,
      clothing: concepts.filter(c => c.conceptType === 'clothing').length,
      general: concepts.filter(c => c.conceptType === 'general').length,
      expression: concepts.filter(c => c.conceptType === 'expression').length,
      action: concepts.filter(c => c.conceptType === 'action').length,
    };
    return counts;
  };

  const tabs = [
    { id: 'general', label: 'General', icon: Users },
    { id: 'gallery', label: 'Gallery', icon: ImageIcon },
    { id: 'pose-concepts', label: 'Concepts', icon: ImageIcon },
    { id: 'video-examples', label: 'Video Examples', icon: Video },
    { id: 'ai-ref', label: 'AI ref', icon: Sparkles },
    { id: '3d-models', label: '3D Models', icon: Box },
    { id: 'production', label: 'Production', icon: Settings },
    { id: 'voice', label: 'Voice', icon: Mic },
  ] as const;

  return (
    <div className="min-h-screen bg-gray-50">
      <AppBreadcrumbHeader
        coverImageUrl={show.coverImageUrl}
        logoUrl={show.logoUrl}
        backHref={`${basePath}/shows/${show.id}/assets?category=character`}
        items={[
          { label: show.name, href: `${basePath}/shows/${show.id}` },
          { label: 'Assets', href: `${basePath}/shows/${show.id}/assets` },
          { label: 'Characters', href: `${basePath}/shows/${show.id}/assets?category=character` },
          { label: character.name || 'Character' },
        ]}
        subtitle="Character details"
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const next = !isMainCharacter;
                setIsMainCharacter(next);
                onSave({ ...character, isMainCharacter: next });
              }}
              className={cn(
                "px-3 py-2 rounded-lg transition-colors",
                headerIsDark ? "hover:bg-white/10" : "hover:bg-accent",
                isMainCharacter ? "text-amber-500" : (headerIsDark ? "text-white/80" : "text-muted-foreground"),
              )}
              title={isMainCharacter ? "Main character (click to unstar)" : "Mark as main character"}
              aria-label={isMainCharacter ? "Unmark main character" : "Mark as main character"}
            >
              <Star className={cn("w-4 h-4", isMainCharacter ? "fill-current" : "")} />
            </button>
            {isEditing ? (
              <>
                <button
                  onClick={() => {
                    setName(character.name);
                    setIsEditing(false);
                  }}
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
              <>
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-3 py-2 text-white/90 hover:text-white rounded-lg hover:bg-white/10"
                  title="Edit"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
                <button
                  onClick={handleSave}
                  className="px-3 py-2 bg-white/90 text-gray-900 rounded-lg hover:bg-white flex items-center gap-2"
                  title="Save changes"
                >
                  <Save className="w-4 h-4" />
                  <span className="hidden sm:inline">Save</span>
                </button>
              </>
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
              {character.name}
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
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
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
        <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6">
              {/* General Tab */}
              {activeTab === 'general' && (
                <div className="space-y-6">
                  <h3 className="text-xl font-semibold text-gray-900">General Information</h3>
                  
                  {/* Main Character Image */}
                  <div className="space-y-4">
                    <h4 className="text-lg font-medium text-gray-900">Main Character Image</h4>
                    <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6">
                      {/* Current Image */}
                      <div className="flex-shrink-0 mx-auto sm:mx-0">
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
                      <div className="flex-1 w-full sm:w-auto">
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
                  
                  {/* Character Name - Display only */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      NAME
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Character name"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-semibold"
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        NICKNAME
                      </label>
                      <input
                        type="text"
                        value={general.nickname || ''}
                        onChange={(e) => setGeneral(prev => ({ ...prev, nickname: e.target.value }))}
                        placeholder="e.g., Sparky, The Brave One"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                    </div>
                    
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
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      VISUAL DESCRIPTION
                    </label>
                    <textarea
                      value={general.visualDescription || ''}
                      onChange={(e) => setGeneral(prev => ({ ...prev, visualDescription: e.target.value }))}
                      placeholder="Describe the character's appearance, including physical features, clothing style, colors, etc."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                      rows={4}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center justify-between">
                      <span>BACKSTORY</span>
                      <button
                        onClick={() => setShowBackstoryDialog(true)}
                        className="flex items-center space-x-1 px-2 py-1 text-xs bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors"
                        title="Generate backstory with AI"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>Generate</span>
                      </button>
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
                      PERSONALITY
                    </label>
                    <input
                      type="text"
                      value={general.personality || ''}
                      onChange={(e) => setGeneral(prev => ({ ...prev, personality: e.target.value }))}
                      placeholder="e.g., Brave, curious, friendly"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      RELATIONS
                    </label>
                    <textarea
                      value={general.relations || general.relationships || ''}
                      onChange={(e) => setGeneral(prev => ({ ...prev, relations: e.target.value, relationships: e.target.value }))}
                      placeholder="Describe relationships with other characters..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                      rows={3}
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
                </div>
              )}

              {/* Gallery Tab */}
              {activeTab === 'gallery' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-semibold text-gray-900">Character Gallery</h3>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setShowImageGenerationDialog(true)}
                        className="flex items-center space-x-1 px-3 py-1 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 cursor-pointer"
                        title="Generate image based on character description"
                      >
                        <Sparkles className="w-4 h-4" />
                        <span>Generate Image</span>
                      </button>
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

              {/* Concepts Tab */}
              {activeTab === 'pose-concepts' && (
                <div className="space-y-6">
                  {/* Concepts Section - Redesigned to match dialog */}
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-xl font-semibold text-gray-900">Concept Art Gallery</h3>
                        <p className="text-sm text-gray-500 mt-1">
                          {(character.concepts || []).length} {(character.concepts || []).length === 1 ? 'concept' : 'concepts'}
                          {mainImageUrl && (
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
                      {/* Left Panel - Filters and Controls (matching dialog left panel) */}
                      <div className="lg:col-span-1 space-y-4">
                        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                          <h4 className="text-sm font-semibold text-gray-900 mb-4">Filters</h4>
                          
                          {/* Concept Type Filter */}
                          <div className="space-y-3 mb-4">
                            <label className="block text-xs font-medium text-gray-700">Concept Type</label>
                            <div className="space-y-2">
                            {(['all', 'pose', 'clothing', 'general', 'expression', 'action'] as const).map((type) => {
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
                          
                          {/* Style Filter (for AI-generated concepts) */}
                          <div className="space-y-3 mb-4">
                            <label className="block text-xs font-medium text-gray-700">Art Style</label>
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
                          {mainImageUrl && (
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
                                      
                      {/* Right Panel - Concepts Grid (matching dialog right panel) */}
                      <div className="lg:col-span-3">
                        {(character.concepts || []).length > 0 ? (
                          <div className="space-y-4">
                            {/* Concepts Grid - Exact match to dialog style */}
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                              {getSortedConcepts().map((concept) => {
                                const isMainConcept = concept.imageUrl === mainImageUrl;
                                // Extract style from tags if available
                                const conceptStyle = concept.tags?.find(tag => 
                                  ['2d-disney', '3d-pixar', 'studio-ghibli', '2d-cartoon', '3d-realistic', 'watercolor', 'digital-painting'].includes(tag)
                                );
                                const styleLabel = conceptStyle 
                                  ? conceptStyle.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
                                  : null;

                                return (
                            <div 
                              key={concept.id} 
                                    className={`relative group border-2 rounded-lg overflow-hidden cursor-pointer transition-all bg-white ${
                                      isMainConcept
                                        ? 'border-green-500 ring-2 ring-green-200 shadow-lg'
                                        : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
                                    }`}
                                    onClick={(e) => {
                                      // If clicking on checkbox, don't trigger image preview
                                      if ((e.target as HTMLElement).closest('input[type="checkbox"]')) {
                                        return;
                                      }
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
                                    ) : concept.videoUrl ? (
                            <video
                              src={concept.videoUrl}
                                        className="w-full h-64 object-cover"
                                        muted
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

                                    {/* Style Badge (for AI-generated) */}
                                    {concept.isGenerated && styleLabel && (
                                      <div className="absolute top-2 right-2 bg-indigo-600 text-white px-2 py-1 rounded text-xs font-medium shadow-lg z-10">
                                        {styleLabel}
                            </div>
                                    )}
                            
                                    {/* Overlay Actions - Matching dialog */}
                                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                                      <div className="flex space-x-2">
                              <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (concept.imageUrl) {
                                              setMainImageUrl(concept.imageUrl);
                                              const updatedCharacter: Character = {
                                                ...character,
                                                mainImage: concept.imageUrl,
                                              };
                                              onSave(updatedCharacter);
                                            }
                                          }}
                                          className="p-2 bg-white rounded-lg hover:bg-gray-100 transition-colors"
                                          title={isMainConcept ? "Main Concept" : "Set as Main Concept"}
                                        >
                                          <Star className={`w-5 h-5 ${isMainConcept ? 'text-yellow-500 fill-current' : 'text-gray-700'}`} />
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
                        
                                    {/* Concept Info Overlay - Matching dialog */}
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
                              Generate or upload your first concept art to get started. Concepts will appear here in a gallery matching the generation dialog.
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

              {activeTab === 'ai-ref' && (
                <div className="space-y-6">
                  <h3 className="text-xl font-semibold text-gray-900">AI Reference Gallery</h3>
                  <p className="text-sm text-gray-600">Upload reference images organized by category for AI generation tools.</p>
                  
                  {/* Full Body Gallery */}
                  <div className="bg-gray-50 rounded-lg border border-gray-200 p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-lg font-medium text-gray-900">Full Body</h4>
                      <label className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer text-sm">
                        <Upload className="w-4 h-4 inline mr-2" />
                        Upload
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleAIRefImageUpload(file, 'fullBody');
                          }}
                          className="hidden"
                        />
                      </label>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {(aiRefImages.fullBody || []).map((url, index) => (
                        <div key={index} className="relative group bg-gray-100 rounded-lg border border-gray-200 overflow-hidden">
                          <img
                            src={url}
                            alt={`Full body ${index + 1}`}
                            className="w-full h-48 object-contain cursor-pointer hover:opacity-90"
                            onClick={() => setSelectedImage({ url, alt: `Full body ${index + 1}` })}
                          />
                          <button
                            onClick={() => handleRemoveAIRefImage('fullBody', index)}
                            className="absolute top-2 right-2 p-1 bg-red-600 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      {Array.from(uploadingAIRefImages.entries())
                        .filter(([_, data]) => data.category === 'fullBody')
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
                      {(!aiRefImages.fullBody || aiRefImages.fullBody.length === 0) && 
                       Array.from(uploadingAIRefImages.values()).filter(d => d.category === 'fullBody').length === 0 && (
                        <div className="col-span-full text-center py-8 text-gray-500">
                          <ImageIcon className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                          <p>No full body images uploaded</p>
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
                            if (file) handleAIRefImageUpload(file, 'multipleAngles');
                          }}
                          className="hidden"
                        />
                      </label>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {(aiRefImages.multipleAngles || []).map((url, index) => (
                        <div key={index} className="relative group bg-gray-100 rounded-lg border border-gray-200 overflow-hidden">
                          <img
                            src={url}
                            alt={`Multiple angles ${index + 1}`}
                            className="w-full h-48 object-contain cursor-pointer hover:opacity-90"
                            onClick={() => setSelectedImage({ url, alt: `Multiple angles ${index + 1}` })}
                          />
                          <button
                            onClick={() => handleRemoveAIRefImage('multipleAngles', index)}
                            className="absolute top-2 right-2 p-1 bg-red-600 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      {Array.from(uploadingAIRefImages.entries())
                        .filter(([_, data]) => data.category === 'multipleAngles')
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
                      {(!aiRefImages.multipleAngles || aiRefImages.multipleAngles.length === 0) && 
                       Array.from(uploadingAIRefImages.values()).filter(d => d.category === 'multipleAngles').length === 0 && (
                        <div className="col-span-full text-center py-8 text-gray-500">
                          <ImageIcon className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                          <p>No multiple angles images uploaded</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Head Gallery */}
                  <div className="bg-gray-50 rounded-lg border border-gray-200 p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-lg font-medium text-gray-900">Head</h4>
                      <label className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer text-sm">
                        <Upload className="w-4 h-4 inline mr-2" />
                        Upload
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleAIRefImageUpload(file, 'head');
                          }}
                          className="hidden"
                        />
                      </label>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {(aiRefImages.head || []).map((url, index) => (
                        <div key={index} className="relative group bg-gray-100 rounded-lg border border-gray-200 overflow-hidden">
                          <img
                            src={url}
                            alt={`Head ${index + 1}`}
                            className="w-full h-48 object-contain cursor-pointer hover:opacity-90"
                            onClick={() => setSelectedImage({ url, alt: `Head ${index + 1}` })}
                          />
                          <button
                            onClick={() => handleRemoveAIRefImage('head', index)}
                            className="absolute top-2 right-2 p-1 bg-red-600 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      {Array.from(uploadingAIRefImages.entries())
                        .filter(([_, data]) => data.category === 'head')
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
                      {(!aiRefImages.head || aiRefImages.head.length === 0) && 
                       Array.from(uploadingAIRefImages.values()).filter(d => d.category === 'head').length === 0 && (
                        <div className="col-span-full text-center py-8 text-gray-500">
                          <ImageIcon className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                          <p>No head images uploaded</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Expressions Gallery */}
                  <div className="bg-gray-50 rounded-lg border border-gray-200 p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-lg font-medium text-gray-900">Expressions</h4>
                      <label className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer text-sm">
                        <Upload className="w-4 h-4 inline mr-2" />
                        Upload
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleAIRefImageUpload(file, 'expressions');
                          }}
                          className="hidden"
                        />
                      </label>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {(aiRefImages.expressions || []).map((url, index) => (
                        <div key={index} className="relative group bg-gray-100 rounded-lg border border-gray-200 overflow-hidden">
                          <img
                            src={url}
                            alt={`Expression ${index + 1}`}
                            className="w-full h-48 object-contain cursor-pointer hover:opacity-90"
                            onClick={() => setSelectedImage({ url, alt: `Expression ${index + 1}` })}
                          />
                          <button
                            onClick={() => handleRemoveAIRefImage('expressions', index)}
                            className="absolute top-2 right-2 p-1 bg-red-600 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      {Array.from(uploadingAIRefImages.entries())
                        .filter(([_, data]) => data.category === 'expressions')
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
                      {(!aiRefImages.expressions || aiRefImages.expressions.length === 0) && 
                       Array.from(uploadingAIRefImages.values()).filter(d => d.category === 'expressions').length === 0 && (
                        <div className="col-span-full text-center py-8 text-gray-500">
                          <ImageIcon className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                          <p>No expression images uploaded</p>
                        </div>
                      )}
                    </div>
                  </div>
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
                onClick={() => handleAssignToAIRef('fullBody')}
                className="w-full px-4 py-3 text-left bg-gray-50 hover:bg-indigo-50 border border-gray-200 hover:border-indigo-300 rounded-lg transition-colors"
              >
                <div className="font-medium text-gray-900">Full Body</div>
                <div className="text-sm text-gray-500">Add to Full Body section</div>
              </button>
              <button
                onClick={() => handleAssignToAIRef('multipleAngles')}
                className="w-full px-4 py-3 text-left bg-gray-50 hover:bg-indigo-50 border border-gray-200 hover:border-indigo-300 rounded-lg transition-colors"
              >
                <div className="font-medium text-gray-900">Multiple Angles</div>
                <div className="text-sm text-gray-500">Add to Multiple Angles section</div>
              </button>
              <button
                onClick={() => handleAssignToAIRef('head')}
                className="w-full px-4 py-3 text-left bg-gray-50 hover:bg-indigo-50 border border-gray-200 hover:border-indigo-300 rounded-lg transition-colors"
              >
                <div className="font-medium text-gray-900">Head</div>
                <div className="text-sm text-gray-500">Add to Head section</div>
              </button>
              <button
                onClick={() => handleAssignToAIRef('expressions')}
                className="w-full px-4 py-3 text-left bg-gray-50 hover:bg-indigo-50 border border-gray-200 hover:border-indigo-300 rounded-lg transition-colors"
              >
                <div className="font-medium text-gray-900">Expressions</div>
                <div className="text-sm text-gray-500">Add to Expressions section</div>
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

      {/* Backstory Generation Dialog */}
      <BackstoryGenerationDialog
        isOpen={showBackstoryDialog}
        onClose={() => setShowBackstoryDialog(false)}
        onBackstoryGenerated={handleBackstoryGenerated}
        characterName={name}
        characterAge={general.age}
        showName={show.name}
        showDescription={show.description}
        currentBackstory={general.backstory}
      />

      {/* Asset Concept Generation Dialog */}
      {showImageGenerationDialog && (() => {
        // Build comprehensive character description for concept generation with ALL fields
        const characterDescriptionParts: string[] = [];
        
        if (name) characterDescriptionParts.push(`Name: ${name}`);
        if (general.nickname) characterDescriptionParts.push(`Nickname: ${general.nickname}`);
        if (general.age) characterDescriptionParts.push(`Age: ${general.age}`);
        if (general.visualDescription) {
          characterDescriptionParts.push(`Visual Description: ${general.visualDescription}`);
        } else if (character.description) {
          characterDescriptionParts.push(`Description: ${character.description}`);
        }
        if (general.personality) characterDescriptionParts.push(`Personality: ${general.personality}`);
        if (general.backstory) characterDescriptionParts.push(`Backstory: ${general.backstory}`);
        if (general.relations || general.relationships) {
          characterDescriptionParts.push(`Relations: ${general.relations || general.relationships}`);
        }
        if (general.specialAbilities) {
          characterDescriptionParts.push(`Special Abilities: ${general.specialAbilities}`);
        }
        
        const characterDescription = characterDescriptionParts.length > 0
          ? characterDescriptionParts.join('\n')
          : `Character: ${name}`;
        
        // Get selected concept images
        const selectedConcepts = (character.concepts || []).filter(c => selectedConceptIds.has(c.id));
        const selectedConceptImages = selectedConcepts
          .map(c => c.imageUrl)
          .filter((url): url is string => !!url);
        
        return (
          <AssetConceptGenerationDialog
            isOpen={showImageGenerationDialog}
            onClose={() => {
              setShowImageGenerationDialog(false);
              // Optionally clear selection after closing
              // setSelectedConceptIds(new Set());
            }}
            selectedReferenceImages={selectedConceptImages}
            onImageGenerated={async (imageUrl, isMainConcept) => {
              if (imageUrl) {
                // If set as main concept, update main image
                if (isMainConcept) {
                  setMainImageUrl(imageUrl);
                  // Save immediately to persist main concept
                  const updatedCharacter: Character = {
                    ...character,
                    name: name.trim(),
                    general,
                    clothing,
                    pose,
                    voice,
                    mainImage: imageUrl,
                    characterGallery: characterGallery,
                  };
                  onSave(updatedCharacter);
                }
              }
            }}
            onConceptCreated={(conceptData) => {
              // Save the generated image as a concept
              onAddConcept(conceptData);
            }}
            asset={character}
            assetDescription={characterDescription}
            globalAssets={globalAssets}
            showId={character.showId}
          />
        );
      })()}
    </div>
  );
}
