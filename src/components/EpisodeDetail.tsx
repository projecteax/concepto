'use client';

import { useState, useEffect } from 'react';
import { Show, Episode, EpisodeScene, SceneShot, Character, GlobalAsset } from '@/types';
import { 
  Plus, 
  Camera, 
  Palette, 
  X, 
  ArrowLeft, 
  Edit3,
  Save,
  Trash2,
  Upload
} from 'lucide-react';
import StoryboardDrawer from './StoryboardDrawer';
import CommentThread from './CommentThread';
import { AVScriptEditor } from './AVScriptEditor';
import { useS3Upload } from '@/hooks/useS3Upload';

interface EpisodeDetailProps {
  episode: Episode;
  show: Show;
  globalAssets: GlobalAsset[];
  onBack: () => void;
  onSave?: (episode: Episode) => void;
  isPublicMode?: boolean;
}

export default function EpisodeDetail({
  episode,
  show,
  globalAssets,
  onBack,
  onSave,
  isPublicMode = false,
}: EpisodeDetailProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'script' | 'av-script' | 'characters' | 'locations' | 'gadgets'>('overview');
  const [localEpisode, setLocalEpisode] = useState<Episode>(episode);
  
  // Script editing states
  const [editingScripts, setEditingScripts] = useState<{[sceneId: string]: string}>({});
  const [showContextMenu, setShowContextMenu] = useState<{sceneId: string, x: number, y: number, selectedText: string, selectionStart: number, selectionEnd: number} | null>(null);
  const [showShotPopup, setShowShotPopup] = useState<{sceneId: string, selectedText: string, selectionStart: number, selectionEnd: number} | null>(null);
  const [shotFormData, setShotFormData] = useState<{
    shotNumber: string;
    description: string;
    images: string[];
    featuredImage: string;
  }>({
    shotNumber: '',
    description: '',
    images: [],
    featuredImage: ''
  });
  const [uploadingShotImages, setUploadingShotImages] = useState(false);
  const [hoveredShot, setHoveredShot] = useState<{shotId: string, x: number, y: number} | null>(null);
  
  // Inline editing states
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [tempTitle, setTempTitle] = useState(episode.title);
  const [tempDescription, setTempDescription] = useState(episode.description || '');
  
  // Drawing states
  const [showDrawer, setShowDrawer] = useState(false);
  const [drawingContext, setDrawingContext] = useState<{
    shotId: string;
    sceneId: string;
    type: 'storyboard' | 'inspiration';
  } | null>(null);
  const [uploadingDrawing, setUploadingDrawing] = useState(false);

  // Image upload states
  const [uploadingImages, setUploadingImages] = useState<{[key: string]: boolean}>({});
  const { uploadFile } = useS3Upload();

  // Image popup states
  const [selectedImage, setSelectedImage] = useState<{
    url: string;
    alt: string;
  } | null>(null);

  // Delete confirmation states
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [sceneToDelete, setSceneToDelete] = useState<string | null>(null);

  // Character popup states
  const [showCharacterPopup, setShowCharacterPopup] = useState(false);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);

  // Rich text editor refs (currently unused but kept for future use)
  // const scriptEditorRefs = useRef<{[sceneId: string]: HTMLDivElement | null}>({});

  // Sync local episode with prop
  useEffect(() => {
    setLocalEpisode(episode);
  }, [episode]);

  const updateEpisodeAndSave = (updatedEpisode: Episode) => {
    setLocalEpisode(updatedEpisode);
    onSave?.(updatedEpisode);
  };

  // Inline editing handlers
  const handleSaveTitle = () => {
    if (tempTitle.trim() !== localEpisode.title) {
      const updatedEpisode = { ...localEpisode, title: tempTitle.trim() };
      updateEpisodeAndSave(updatedEpisode);
    }
    setEditingTitle(false);
  };

  const handleCancelTitle = () => {
    setTempTitle(localEpisode.title);
    setEditingTitle(false);
  };

  const handleSaveDescription = () => {
    if (tempDescription.trim() !== (localEpisode.description || '')) {
      const updatedEpisode = { ...localEpisode, description: tempDescription.trim() };
      updateEpisodeAndSave(updatedEpisode);
    }
    setEditingDescription(false);
  };

  const handleCancelDescription = () => {
    setTempDescription(localEpisode.description || '');
    setEditingDescription(false);
  };

  const handleAddScene = () => {
    const currentScenes = localEpisode.scenes || [];
    const newSceneNumber = currentScenes.length + 1;
    const newSceneId = `scene-${Date.now()}`;
    const newScene: EpisodeScene = {
      id: newSceneId,
      sceneNumber: newSceneNumber,
      title: `Scene ${newSceneNumber}`,
      description: '',
      actionDescription: '',
      script: '',
      locationName: '',
      characters: [],
      sceneCharacters: [],
      gadgets: [],
      shots: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const updatedEpisode: Episode = {
      ...localEpisode,
      scenes: [...currentScenes, newScene],
    };
    updateEpisodeAndSave(updatedEpisode);

    // Scroll to the newly created scene after a short delay to ensure DOM update
    setTimeout(() => {
      const sceneElement = document.getElementById(`scene-${newSceneId}`);
      if (sceneElement) {
        sceneElement.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start',
          inline: 'nearest'
        });
      }
    }, 100);
  };

  const handleDeleteScene = (sceneId: string) => {
    setSceneToDelete(sceneId);
    setShowDeleteConfirm(true);
  };

  const confirmDeleteScene = () => {
    if (sceneToDelete) {
      const updatedScenes = (localEpisode.scenes || []).filter(s => s.id !== sceneToDelete);
      const updatedEpisode: Episode = {
        ...localEpisode,
        scenes: updatedScenes,
      };
      updateEpisodeAndSave(updatedEpisode);
    }
    setShowDeleteConfirm(false);
    setSceneToDelete(null);
  };

  const cancelDeleteScene = () => {
    setShowDeleteConfirm(false);
    setSceneToDelete(null);
  };

  // Character popup handlers
  const handleCharacterClick = (characterId: string) => {
    const character = globalAssets.find(asset => asset.id === characterId && asset.category === 'character') as Character;
    if (character) {
      setSelectedCharacter(character);
      setShowCharacterPopup(true);
    }
  };

  const handleCloseCharacterPopup = () => {
    setShowCharacterPopup(false);
    setSelectedCharacter(null);
  };

  // Scene field handlers
  const handleSceneFieldChange = (sceneId: string, field: string, value: string) => {
    const updatedScenes = (localEpisode.scenes || []).map(s => {
      if (s.id === sceneId) {
        return {
          ...s,
          [field]: value,
          updatedAt: new Date(),
        };
      }
      return s;
    });

    const updatedEpisode: Episode = {
      ...localEpisode,
      scenes: updatedScenes,
    };
    updateEpisodeAndSave(updatedEpisode);
  };

  // Character handlers
  const handleAddCharacter = (sceneId: string, characterId: string) => {
    const character = globalAssets.find(asset => asset.id === characterId && asset.category === 'character');
    if (!character) return;

    const newSceneCharacter = {
      characterId: character.id,
      characterName: character.name,
      role: '',
      isPresent: true,
    };

    const updatedScenes = (localEpisode.scenes || []).map(s => {
      if (s.id === sceneId) {
        return {
          ...s,
          sceneCharacters: [...(s.sceneCharacters || []), newSceneCharacter],
          updatedAt: new Date(),
        };
      }
      return s;
    });

    const updatedEpisode: Episode = {
      ...localEpisode,
      scenes: updatedScenes,
    };
    updateEpisodeAndSave(updatedEpisode);
  };


  const handleRemoveCharacter = (sceneId: string, characterId: string) => {
    const updatedScenes = (localEpisode.scenes || []).map(s => {
      if (s.id === sceneId) {
        return {
          ...s,
          sceneCharacters: (s.sceneCharacters || []).filter(char => char.characterId !== characterId),
          updatedAt: new Date(),
        };
      }
      return s;
    });

    const updatedEpisode: Episode = {
      ...localEpisode,
      scenes: updatedScenes,
    };
    updateEpisodeAndSave(updatedEpisode);
  };

  const handleAddShot = (sceneId: string) => {
    const scene = (localEpisode.scenes || []).find(s => s.id === sceneId);
    if (!scene) return;

    const newShotNumber = (scene.shots?.length || 0) + 1;
    const newShotId = `shot-${Date.now()}`;
    const newShot: SceneShot = {
      id: newShotId,
      shotNumber: newShotNumber,
      title: `Shot ${newShotNumber}`,
      description: '',
      storyboards: [],
      inspirationImages: [],
      cameraShot: {
        id: `camera-${Date.now()}`,
        shotType: 'WIDE',
        description: '',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const updatedScenes = (localEpisode.scenes || []).map(s => {
      if (s.id === sceneId) {
        return {
          ...s,
          shots: [...(s.shots || []), newShot],
        };
      }
      return s;
    });

    const updatedEpisode: Episode = {
      ...localEpisode,
      scenes: updatedScenes,
    };
    updateEpisodeAndSave(updatedEpisode);

    // Scroll to the newly created shot after a short delay to ensure DOM update
    setTimeout(() => {
      const shotElement = document.getElementById(`shot-${newShotId}`);
      if (shotElement) {
        shotElement.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start',
          inline: 'nearest'
        });
      }
    }, 100);
  };

  const handleDeleteShot = (sceneId: string, shotId: string) => {
    const updatedScenes = (localEpisode.scenes || []).map(s => {
      if (s.id === sceneId) {
        const filteredShots = (s.shots || []).filter(shot => shot.id !== shotId);
        // Renumber shots after deletion
        const renumberedShots = filteredShots.map((shot, index) => ({
          ...shot,
          shotNumber: index + 1,
          updatedAt: new Date(),
        }));
        return {
          ...s,
          shots: renumberedShots,
        };
      }
      return s;
    });

    const updatedEpisode: Episode = {
      ...localEpisode,
      scenes: updatedScenes,
    };
    updateEpisodeAndSave(updatedEpisode);
  };

  const handleShotDescriptionChange = (sceneId: string, shotId: string, description: string) => {
    const updatedScenes = (localEpisode.scenes || []).map(s => {
      if (s.id === sceneId) {
        return {
          ...s,
          shots: (s.shots || []).map(shot => {
            if (shot.id === shotId) {
              return {
                ...shot,
                description,
                updatedAt: new Date(),
              };
            }
            return shot;
          }),
        };
      }
      return s;
    });

    const updatedEpisode: Episode = {
      ...localEpisode,
      scenes: updatedScenes,
    };
    updateEpisodeAndSave(updatedEpisode);
  };

  const handleShotTypeChange = (sceneId: string, shotId: string, shotType: string) => {
    const updatedScenes = (localEpisode.scenes || []).map(s => {
      if (s.id === sceneId) {
        return {
          ...s,
          shots: (s.shots || []).map(shot => {
            if (shot.id === shotId) {
              return {
                ...shot,
                cameraShot: {
                  ...shot.cameraShot,
                  shotType: shotType as 'WIDE' | 'MEDIUM' | 'CLOSE_UP' | 'EXTREME_CLOSE_UP' | 'OVER_THE_SHOULDER' | 'POV' | 'ESTABLISHING' | 'CUSTOM',
                  updatedAt: new Date(),
                },
                updatedAt: new Date(),
              };
            }
            return shot;
          }),
        };
      }
      return s;
    });

    const updatedEpisode: Episode = {
      ...localEpisode,
      scenes: updatedScenes,
    };
    updateEpisodeAndSave(updatedEpisode);
  };

  const handleAddCharacterToEpisode = (characterId: string) => {
    const characterAsset = globalAssets.find(asset => 
      asset.category === 'character' && asset.id === characterId
    ) as Character | undefined;
    
    if (!characterAsset) return;

    const newCharacter = {
      characterId: characterAsset.id,
      characterName: characterAsset.name,
      type: 'recurring' as const,
      role: '',
    };

    const updatedEpisode: Episode = {
      ...localEpisode,
      characters: [...(localEpisode.characters || []), newCharacter],
    };
    updateEpisodeAndSave(updatedEpisode);
  };

  const handleRemoveCharacterFromEpisode = (characterId: string) => {
    const updatedEpisode: Episode = {
      ...localEpisode,
      characters: (localEpisode.characters || []).filter(c => c.characterId !== characterId),
    };
    updateEpisodeAndSave(updatedEpisode);
  };

  const handleAddLocationToEpisode = (locationId: string) => {
    const locationAsset = globalAssets.find(asset => 
      asset.category === 'location' && asset.id === locationId
    );
    
    if (!locationAsset) return;

    const newLocation = {
      locationId: locationAsset.id,
      locationName: locationAsset.name,
      description: '',
    };

    const updatedEpisode: Episode = {
      ...localEpisode,
      locations: [...(localEpisode.locations || []), newLocation],
    };
    updateEpisodeAndSave(updatedEpisode);
  };

  const handleRemoveLocationFromEpisode = (locationId: string) => {
    const updatedEpisode: Episode = {
      ...localEpisode,
      locations: (localEpisode.locations || []).filter(l => l.locationId !== locationId),
    };
    updateEpisodeAndSave(updatedEpisode);
  };

  const handleOpenDrawer = (shotId: string, sceneId: string, type: 'storyboard' | 'inspiration') => {
    setDrawingContext({ shotId, sceneId, type });
    setShowDrawer(true);
  };

  const handleSaveDrawing = async (imageData: string) => {
    if (!drawingContext) return;

    setUploadingDrawing(true);
    try {
      // Convert data URL to blob and upload to R2
      const response = await fetch(imageData);
      const blob = await response.blob();
      const file = new File([blob], `drawing-${Date.now()}.png`, { type: 'image/png' });
      
      const fileKey = `episodes/${episode.id}/scenes/${drawingContext.sceneId}/shots/${drawingContext.shotId}/${drawingContext.type}/${Date.now()}-drawing.png`;
      const result = await uploadFile(file, fileKey);
      
      const uploadedUrl = result ? result.url : imageData;

      const updatedScenes = (localEpisode.scenes || []).map(s => {
        if (s.id === drawingContext.sceneId) {
          return {
            ...s,
            shots: (s.shots || []).map(shot => {
              if (shot.id === drawingContext.shotId) {
                if (drawingContext.type === 'storyboard') {
                  return {
                    ...shot,
                    storyboards: [...(shot.storyboards || []), {
                      id: `storyboard-${Date.now()}`,
                      imageUrl: uploadedUrl,
                      description: ''
                    }],
                  };
                } else {
                  return {
                    ...shot,
                    inspirationImages: [...(shot.inspirationImages || []), uploadedUrl],
                  };
                }
              }
              return shot;
            }),
          };
        }
        return s;
      });

      const updatedEpisode: Episode = {
        ...localEpisode,
        scenes: updatedScenes,
      };
      updateEpisodeAndSave(updatedEpisode);
    } catch (error) {
      console.error('Error saving drawing:', error);
    } finally {
      setUploadingDrawing(false);
      setShowDrawer(false);
      setDrawingContext(null);
    }
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>, shotId: string, sceneId: string, type: 'storyboard' | 'inspiration') => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    const uploadKey = `${shotId}-${type}`;
    setUploadingImages(prev => ({ ...prev, [uploadKey]: true }));

    try {
      for (const file of files) {
        // Generate unique key for the file
        const fileKey = `episodes/${episode.id}/scenes/${sceneId}/shots/${shotId}/${type}/${Date.now()}-${file.name}`;
        
        // Upload to S3
        const result = await uploadFile(file, fileKey);
        
        if (result) {
          // Update the shot with the new image URL
          const updatedScenes = localEpisode.scenes?.map(s => {
            if (s.id === sceneId) {
              return {
                ...s,
                shots: s.shots?.map(shot => {
                  if (shot.id === shotId) {
                    if (type === 'storyboard') {
                      return {
                        ...shot,
                        storyboards: [...(shot.storyboards || []), {
                          id: `storyboard-${Date.now()}`,
                          imageUrl: result.url,
                          description: ''
                        }],
                      };
                    } else {
                      return {
                        ...shot,
                        inspirationImages: [...(shot.inspirationImages || []), result.url],
                      };
                    }
                  }
                  return shot;
                }),
              };
            }
            return s;
          });

          const updatedEpisode: Episode = {
            ...localEpisode,
            scenes: updatedScenes,
          };
          updateEpisodeAndSave(updatedEpisode);
        }
      }
    } catch (error) {
      console.error('Error uploading image:', error);
    } finally {
      setUploadingImages(prev => ({ ...prev, [uploadKey]: false }));
    }
  };

  const handleCloseDrawer = () => {
    setShowDrawer(false);
    setDrawingContext(null);
  };

  // Image removal function
  const handleRemoveImage = (sceneId: string, shotId: string, imageUrl: string, type: 'storyboard' | 'inspiration') => {
    const updatedScenes = (localEpisode.scenes || []).map(s => {
      if (s.id === sceneId) {
        return {
          ...s,
          shots: (s.shots || []).map(shot => {
            if (shot.id === shotId) {
              if (type === 'storyboard') {
                return {
                  ...shot,
                  storyboards: (shot.storyboards || []).filter(storyboard => storyboard.imageUrl !== imageUrl),
                };
              } else {
                return {
                  ...shot,
                  inspirationImages: (shot.inspirationImages || []).filter(url => url !== imageUrl),
                };
              }
            }
            return shot;
          }),
        };
      }
      return s;
    });

    const updatedEpisode: Episode = {
      ...localEpisode,
      scenes: updatedScenes,
    };
    updateEpisodeAndSave(updatedEpisode);
  };

  // Image popup functions
  const handleImageClick = (url: string, alt: string) => {
    setSelectedImage({ url, alt });
  };

  const handleCloseImagePopup = () => {
    setSelectedImage(null);
  };

  // Handle ESC key for image popup and click outside for context menu
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && selectedImage) {
        handleCloseImagePopup();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (showContextMenu) {
        setShowContextMenu(null);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [selectedImage, showContextMenu]);

  const handleScriptChange = (sceneId: string, script: string) => {
    setEditingScripts(prev => ({
      ...prev,
      [sceneId]: script,
    }));
  };

  // Context menu handlers
  const handleTextareaContextMenu = (e: React.MouseEvent<HTMLTextAreaElement>, sceneId: string) => {
    e.preventDefault();
    const textarea = e.target as HTMLTextAreaElement;
    const selectedText = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd);
    
    if (selectedText.trim()) {
      setShowContextMenu({
        sceneId,
        x: e.clientX,
        y: e.clientY,
        selectedText,
        selectionStart: textarea.selectionStart,
        selectionEnd: textarea.selectionEnd
      });
    }
  };

  const handleAddShotFromText = (sceneId: string, selectedText: string, selectionStart: number, selectionEnd: number) => {
    setShowContextMenu(null);
    setShowShotPopup({
      sceneId,
      selectedText,
      selectionStart,
      selectionEnd
    });
  };

  const handleCloseContextMenu = () => {
    setShowContextMenu(null);
  };

  const handleCloseShotPopup = () => {
    setShowShotPopup(null);
    setShotFormData({
      shotNumber: '',
      description: '',
      images: [],
      featuredImage: ''
    });
  };

  // Shot image upload handlers
  const handleShotImageUpload = async (files: FileList) => {
    if (!files.length) return;
    
    setUploadingShotImages(true);
    const uploadPromises = Array.from(files).map(file => uploadFile(file, `shot-images/${Date.now()}-${file.name}`));
    
    try {
      const uploadResults = await Promise.all(uploadPromises);
      const uploadedUrls = uploadResults
        .filter((result): result is { url: string; key: string; size: number } => result !== null)
        .map(result => result.url);
      
      setShotFormData(prev => ({
        ...prev,
        images: [...prev.images, ...uploadedUrls]
      }));
    } catch (error) {
      console.error('Error uploading images:', error);
    } finally {
      setUploadingShotImages(false);
    }
  };

  const handleRemoveShotImage = (imageUrl: string) => {
    setShotFormData(prev => ({
      ...prev,
      images: prev.images.filter(img => img !== imageUrl),
      featuredImage: prev.featuredImage === imageUrl ? '' : prev.featuredImage
    }));
  };

  const handleSetShotFeaturedImage = (imageUrl: string) => {
    setShotFormData(prev => ({
      ...prev,
      featuredImage: imageUrl
    }));
  };

  // Shot creation handler
  const handleCreateShot = async () => {
    if (!showShotPopup || !shotFormData.shotNumber || !shotFormData.description) return;

    const newShot: SceneShot = {
      id: `shot-${Date.now()}`,
      shotNumber: parseInt(shotFormData.shotNumber) || 1,
      title: `Shot ${parseInt(shotFormData.shotNumber) || 1}`,
      description: shotFormData.description,
      storyboards: [],
      inspirationImages: shotFormData.images,
      featuredImage: shotFormData.featuredImage || shotFormData.images[0] || '',
      cameraShot: {
        id: `camera-${Date.now()}`,
        shotType: 'MEDIUM',
        duration: 0
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Add shot to the scene
    const updatedScenes = (localEpisode.scenes || []).map(scene => {
      if (scene.id === showShotPopup.sceneId) {
        return {
          ...scene,
          shots: [...(scene.shots || []), newShot]
        };
      }
      return scene;
    });

    // Replace selected text with shot reference
    const currentScript = editingScripts[showShotPopup.sceneId] || '';
    const shotReference = `[${shotFormData.shotNumber}]`;
    const newScript = currentScript.slice(0, showShotPopup.selectionStart) + 
                     shotReference + 
                     currentScript.slice(showShotPopup.selectionEnd);

    setLocalEpisode(prev => ({
      ...prev,
      scenes: updatedScenes
    }));

    setEditingScripts(prev => ({
      ...prev,
      [showShotPopup.sceneId]: newScript
    }));

    handleCloseShotPopup();
  };

  // Function to render script with shot highlights
  const renderScriptWithShots = (script: string, sceneId: string) => {
    if (!script) return script;
    
    const scene = localEpisode.scenes?.find(s => s.id === sceneId);
    if (!scene?.shots) return script;

    let highlightedScript = script;
    
    // Replace shot references with highlighted versions
    scene.shots.forEach(shot => {
      const shotPattern = new RegExp(`\\[${shot.shotNumber}\\]`, 'g');
      highlightedScript = highlightedScript.replace(shotPattern, `[${shot.shotNumber}]`);
    });

    return highlightedScript;
  };

  // Function to get shot by reference
  const getShotByReference = (shotRef: string, sceneId: string) => {
    const scene = localEpisode.scenes?.find(s => s.id === sceneId);
    if (!scene?.shots) return null;
    
    const shotNumber = shotRef.replace(/[\[\]]/g, '');
    return scene.shots.find(shot => shot.shotNumber === parseInt(shotNumber));
  };


  // Initialize editor content when editing starts
  const handleStartEditing = (sceneId: string) => {
    const script = localEpisode.scenes?.find(s => s.id === sceneId)?.script || '';
    setEditingScripts(prev => ({ ...prev, [sceneId]: script }));
  };


  const handleSaveScript = (sceneId: string) => {
    const script = editingScripts[sceneId];
    if (script === undefined) return;

    const updatedScenes = (localEpisode.scenes || []).map(s => {
      if (s.id === sceneId) {
        return {
          ...s,
          script: script.trim() || '',
        };
      }
      return s;
    });

    const updatedEpisode: Episode = {
      ...localEpisode,
      scenes: updatedScenes,
    };
    updateEpisodeAndSave(updatedEpisode);

    // Clear editing state
    setEditingScripts(prev => {
      const newState = { ...prev };
      delete newState[sceneId];
      return newState;
    });
  };

  const handleCancelScriptEdit = (sceneId: string) => {
    setEditingScripts(prev => {
      const newState = { ...prev };
      delete newState[sceneId];
      return newState;
    });
  };

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'script', label: 'Script' },
    { id: 'av-script', label: 'AV Script' },
    { id: 'characters', label: 'Characters' },
    { id: 'locations', label: 'Locations' },
    { id: 'gadgets', label: 'Special Gadgets' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={onBack}
              className="flex items-center space-x-2 text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Back to Episodes</span>
            </button>
            <div className="h-6 w-px bg-gray-300" />
            <div className="flex-1">
              {editingTitle ? (
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={tempTitle}
                    onChange={(e) => setTempTitle(e.target.value)}
                    className="text-2xl font-bold text-gray-900 bg-transparent border-b-2 border-indigo-500 focus:outline-none flex-1"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveTitle();
                      if (e.key === 'Escape') handleCancelTitle();
                    }}
                    onBlur={handleSaveTitle}
                    autoFocus
                  />
                  <button
                    onClick={handleSaveTitle}
                    className="p-1 text-green-600 hover:text-green-700"
                  >
                    <Save className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleCancelTitle}
                    className="p-1 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <h1 
                  className="text-2xl font-bold text-gray-900 cursor-pointer hover:text-indigo-600 transition-colors"
                  onClick={() => setEditingTitle(true)}
                  title="Click to edit title"
                >
                  {localEpisode.title}
                </h1>
              )}
              <p className="text-sm text-gray-500">{show.name} • Episode {localEpisode.episodeNumber}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="px-6">
          <nav className="flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as 'overview' | 'script' | 'av-script' | 'characters' | 'locations' | 'gadgets')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">Episode Description</h2>
              {editingDescription ? (
                <div className="space-y-3">
                  <textarea
                    value={tempDescription}
                    onChange={(e) => setTempDescription(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Enter episode description..."
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') handleCancelDescription();
                    }}
                    autoFocus
                  />
                  <div className="flex space-x-2">
                    <button
                      onClick={handleSaveDescription}
                      className="px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                    >
                      <Save className="w-4 h-4 inline mr-1" />
                      Save
                    </button>
                    <button
                      onClick={handleCancelDescription}
                      className="px-3 py-1 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="cursor-pointer hover:bg-gray-50 p-2 rounded-lg transition-colors"
                  onClick={() => setEditingDescription(true)}
                  title="Click to edit description"
                >
                  <p className="text-gray-600">
                    {localEpisode.description || 'No description available. Click to add one.'}
                  </p>
                  {!localEpisode.description && (
                    <p className="text-sm text-gray-400 mt-1">Click to add description</p>
                  )}
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">Characters</h2>
              {localEpisode.characters && localEpisode.characters.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {localEpisode.characters.map((char) => {
                    const characterAsset = globalAssets.find(asset => 
                      asset.category === 'character' && asset.id === char.characterId
                    ) as Character | undefined;
                    
                    // Try to get character image from multiple sources
                    const characterImage = characterAsset?.mainImage || 
                                         characterAsset?.mainRender || 
                                         characterAsset?.characterGallery?.[0] ||
                                         characterAsset?.galleryImages?.[0];
                    
                    return (
                      <div key={char.characterId} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                        <div className="flex items-center space-x-3">
                          <div className="flex-shrink-0">
                            {characterImage ? (
                              <img
                                src={characterImage}
                                alt={characterAsset?.name || 'Character'}
                                className="w-16 h-16 rounded-full object-cover border-2 border-gray-200"
                                onError={(e) => {
                                  console.error('Character image failed to load:', characterImage);
                                  const img = e.target as HTMLImageElement;
                                  img.style.display = 'none';
                                  // Show fallback div
                                  const fallback = img.nextElementSibling as HTMLElement;
                                  if (fallback) fallback.style.display = 'flex';
                                }}
                              />
                            ) : null}
                            {/* Fallback avatar */}
                            <div 
                              className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center border-2 border-gray-200"
                              style={{ display: characterImage ? 'none' : 'flex' }}
                            >
                              <span className="text-indigo-600 font-semibold text-lg">
                                {(characterAsset?.name || 'U').charAt(0).toUpperCase()}
                              </span>
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-gray-900 truncate">
                              {characterAsset?.name || 'Unknown Character'}
                            </h3>
                            <p className="text-sm text-gray-500 truncate">{char.role || 'No role specified'}</p>
                            {char.type && (
                              <p className="text-xs text-gray-400 capitalize">{char.type} character</p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-gray-500">No characters assigned to this episode.</p>
              )}
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">Locations</h2>
              {localEpisode.locations && localEpisode.locations.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {localEpisode.locations.map((loc) => {
                    const locationAsset = globalAssets.find(asset => asset.id === loc.locationId);
                    return (
                      <div key={loc.locationId} className="border rounded-lg p-4">
                        <h3 className="font-medium">{locationAsset?.name || 'Unknown Location'}</h3>
                        <p className="text-sm text-gray-500">{loc.description}</p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-gray-500">No locations assigned to this episode.</p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'script' && (
          <div className="space-y-6">
            {/* Episode Description Reference */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-blue-900 mb-2">Episode Description (Reference)</h3>
              {editingDescription ? (
                <div className="space-y-3">
                  <textarea
                    value={tempDescription}
                    onChange={(e) => setTempDescription(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                    placeholder="Enter episode description..."
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') handleCancelDescription();
                    }}
                  />
                  <div className="flex space-x-2">
                    <button
                      onClick={handleSaveDescription}
                      className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                    >
                      <Save className="w-4 h-4 inline mr-1" />
                      Save
                    </button>
                    <button
                      onClick={handleCancelDescription}
                      className="px-3 py-1 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="cursor-pointer hover:bg-blue-100 p-2 rounded-lg transition-colors"
                  onClick={() => setEditingDescription(true)}
                  title="Click to edit description"
                >
                  <p className="text-blue-800 text-sm">
                    {localEpisode.description || 'No description available. Click to add one.'}
                  </p>
                  {!localEpisode.description && (
                    <p className="text-xs text-blue-600 mt-1">Click to add description</p>
                  )}
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-medium text-gray-900">Episode Script</h2>
                <button
                  onClick={handleAddScene}
                  className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Scene</span>
                </button>
              </div>

              {localEpisode.scenes && localEpisode.scenes.length > 0 ? (
                <div className="space-y-6">
                  {localEpisode.scenes.map((scene) => (
                    <div key={scene.id} id={`scene-${scene.id}`} className="border rounded-lg p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-4">
                          <h3 className="text-lg font-medium text-gray-900">
                            SCENE {scene.sceneNumber.toString().padStart(2, '0')}
                          </h3>
                          <CommentThread 
                            targetType="scene" 
                            targetId={scene.id}
                            className="inline-block"
                          />
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleDeleteScene(scene.id)}
                            className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                            title="Delete scene"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="mb-4">
                        <h4 className="font-medium text-gray-900 mb-2">{scene.title}</h4>
                        <p className="text-gray-600">{scene.description}</p>
                      </div>

                      {/* Characters Section */}
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-3">
                          <label className="text-sm font-medium text-gray-700">Characters in Scene</label>
                          <select
                            onChange={(e) => {
                              if (e.target.value) {
                                handleAddCharacter(scene.id, e.target.value);
                                e.target.value = '';
                              }
                            }}
                            className="px-3 py-1 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-indigo-500 focus:border-transparent"
                            defaultValue=""
                          >
                            <option value="">Add Character...</option>
                            {globalAssets
                              .filter(asset => asset.category === 'character')
                              .map(character => (
                                <option key={character.id} value={character.id}>
                                  {character.name}
                                </option>
                              ))}
                          </select>
                        </div>
                        
                        <div className="flex flex-wrap gap-2">
                          {scene.sceneCharacters && scene.sceneCharacters.length > 0 ? (
                            scene.sceneCharacters.map((char, index) => {
                              const characterAsset = globalAssets.find(asset => asset.id === char.characterId && asset.category === 'character') as Character;
                              return (
                                <div key={char.characterId || index} className="flex items-center space-x-2 p-2 bg-gray-50 rounded-lg border">
                                  {/* Character Avatar - Clickable */}
                                  <div 
                                    className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center overflow-hidden cursor-pointer hover:bg-gray-300 transition-colors"
                                    onClick={() => handleCharacterClick(char.characterId)}
                                    title="Click to view character details"
                                  >
                                    {characterAsset?.mainImage ? (
                                      <img 
                                        src={characterAsset.mainImage} 
                                        alt={char.characterName}
                                        className="w-full h-full object-cover"
                                      />
                                    ) : (
                                      <span className="text-xs font-medium text-gray-600">
                                        {char.characterName.charAt(0).toUpperCase()}
                                      </span>
                                    )}
                                  </div>
                                  {/* Character Name - Clickable */}
                                  <span 
                                    className="text-sm font-medium text-gray-900 cursor-pointer hover:text-indigo-600 transition-colors"
                                    onClick={() => handleCharacterClick(char.characterId)}
                                    title="Click to view character details"
                                  >
                                    {char.characterName}
                                  </span>
                                  {/* Remove Button */}
                                  <button
                                    onClick={() => handleRemoveCharacter(scene.id, char.characterId)}
                                    className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                                    title="Remove character"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              );
                            })
                          ) : (
                            <p className="text-gray-500 text-sm">No characters added to this scene.</p>
                          )}
                        </div>
                      </div>

                      {/* Location Section */}
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-sm font-medium text-gray-700">Location</label>
                        </div>
                        <div className="border border-gray-300 rounded-lg">
                          <input
                            type="text"
                            value={scene.locationName || ''}
                            onChange={(e) => handleSceneFieldChange(scene.id, 'locationName', e.target.value)}
                            placeholder="Enter scene location..."
                            className="w-full px-3 py-2 text-sm resize-none focus:outline-none border-0 rounded-lg"
                            style={{ 
                              fontFamily: 'Courier New, monospace',
                              color: '#111827',
                            }}
                          />
                        </div>
                      </div>

                      {/* Action Description Section */}
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-sm font-medium text-gray-700">Action Description</label>
                        </div>
                        <div className="border border-gray-300 rounded-lg">
                          <textarea
                            value={scene.actionDescription || ''}
                            onChange={(e) => {
                              handleSceneFieldChange(scene.id, 'actionDescription', e.target.value);
                              // Auto-resize textarea
                              e.target.style.height = 'auto';
                              e.target.style.height = e.target.scrollHeight + 'px';
                            }}
                            placeholder="Describe the action before dialog..."
                            className="w-full px-3 py-2 text-sm resize-none focus:outline-none border-0 rounded-lg overflow-hidden"
                            style={{ 
                              fontFamily: 'Courier New, monospace',
                              color: '#111827',
                              minHeight: '60px',
                              height: 'auto'
                            }}
                            rows={Math.max(2, (scene.actionDescription || '').split('\n').length)}
                          />
                        </div>
                      </div>

                      {/* Script Editor */}
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-sm font-medium text-gray-700">Script</label>
                          {editingScripts[scene.id] !== undefined ? (
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => handleSaveScript(scene.id)}
                                className="flex items-center space-x-1 px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                              >
                                <Save className="w-3 h-3" />
                                <span>Save</span>
                              </button>
                              <button
                                onClick={() => handleCancelScriptEdit(scene.id)}
                                className="px-3 py-1 text-gray-600 text-sm rounded hover:bg-gray-100"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleStartEditing(scene.id)}
                              className="flex items-center space-x-1 px-3 py-1 text-indigo-600 text-sm rounded hover:bg-indigo-50"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>Edit</span>
                            </button>
                          )}
                        </div>
                        
                        {editingScripts[scene.id] !== undefined ? (
                          <div className="space-y-4">
                            {/* Script Editor with Shot Highlighting */}
                            <div
                              contentEditable
                              suppressContentEditableWarning={true}
                              onInput={(e) => {
                                const content = e.currentTarget.textContent || '';
                                handleScriptChange(scene.id, content);
                                // Auto-resize
                                e.currentTarget.style.height = 'auto';
                                e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px';
                              }}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                const selection = window.getSelection();
                                const selectedText = selection?.toString() || '';
                                
                                if (selectedText.trim()) {
                                  setShowContextMenu({
                                    sceneId: scene.id,
                                    x: e.clientX,
                                    y: e.clientY,
                                    selectedText,
                                    selectionStart: 0, // We'll handle this differently for contentEditable
                                    selectionEnd: 0
                                  });
                                }
                              }}
                              onMouseOver={(e) => {
                                const target = e.target as HTMLElement;
                                if (target.classList.contains('shot-reference')) {
                                  const shotRef = target.textContent || '';
                                  const shot = getShotByReference(shotRef, scene.id);
                                  if (shot && shot.featuredImage) {
                                    setHoveredShot({
                                      shotId: shot.id,
                                      x: e.clientX,
                                      y: e.clientY
                                    });
                                  }
                                }
                              }}
                              onMouseOut={(e) => {
                                const target = e.target as HTMLElement;
                                if (target.classList.contains('shot-reference')) {
                                  setHoveredShot(null);
                                }
                              }}
                              className="w-full px-3 py-2 text-sm resize-none focus:outline-none font-mono text-gray-900 border border-gray-300 rounded-lg text-center"
                              style={{ 
                                fontFamily: 'Courier New, monospace',
                                color: '#111827',
                                lineHeight: '1.5',
                                minHeight: '100px',
                                height: 'auto',
                                textAlign: 'center'
                              }}
                              dangerouslySetInnerHTML={{
                                __html: renderScriptWithShots(editingScripts[scene.id] || '', scene.id)
                                  .replace(/\[([^\]]+)\]/g, '<span class="shot-reference bg-yellow-200 underline cursor-pointer hover:bg-yellow-300 transition-colors px-1 rounded">[$1]</span>')
                              }}
                            />
                          </div>
                        ) : (
                          <div 
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono bg-gray-50 text-gray-900 whitespace-pre-wrap text-center"
                            style={{ 
                              fontFamily: 'Courier New, monospace',
                              color: '#111827',
                              lineHeight: '1.5',
                              minHeight: '100px',
                              textAlign: 'center'
                            }}
                          >
                            {scene.script || <span className="text-gray-400">No script available</span>}
                          </div>
                        )}
                      </div>

                      {/* Shots */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium text-gray-900">Shots</h4>
                          <button
                            onClick={() => handleAddShot(scene.id)}
                            className="flex items-center space-x-2 px-3 py-1 bg-gray-600 text-white text-sm rounded hover:bg-gray-700"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Add Shot</span>
                          </button>
                        </div>

                        {scene.shots && scene.shots.length > 0 ? (
                          <div className="space-y-3">
                            {scene.shots.map((shot) => (
                              <div key={shot.id} id={`shot-${shot.id}`} className="border rounded-lg p-4 bg-gray-50">
                                <div className="flex items-center justify-between mb-3">
                                  <div className="flex items-center space-x-3">
                                    <h5 className="font-medium text-gray-900">
                                      SHOT {shot.shotNumber.toString().padStart(2, '0')}
                                    </h5>
                                    <CommentThread 
                                      targetType="shot" 
                                      targetId={shot.id}
                                      className="inline-block"
                                    />
                                  </div>
                                  <button
                                    onClick={() => {
                                      if (confirm(`Are you sure you want to delete Shot ${shot.shotNumber}? This will automatically renumber the remaining shots.`)) {
                                        handleDeleteShot(scene.id, shot.id);
                                      }
                                    }}
                                    className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                                    title="Delete shot (will renumber remaining shots)"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>

                                <div className="mb-3">
                                  <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Shot Description
                                  </label>
                                  <textarea
                                    value={shot.description || ''}
                                    onChange={(e) => handleShotDescriptionChange(scene.id, shot.id, e.target.value)}
                                    placeholder="Describe what happens in this shot..."
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                    rows={2}
                                  />
                                </div>

                                <div className="mb-3">
                                  <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Shot Type
                                  </label>
                                  <select
                                    value={shot.cameraShot.shotType}
                                    onChange={(e) => handleShotTypeChange(scene.id, shot.id, e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                  >
                                    <option value="WIDE">Wide Shot</option>
                                    <option value="MEDIUM">Medium Shot</option>
                                    <option value="CLOSE_UP">Close Up</option>
                                    <option value="EXTREME_CLOSE_UP">Extreme Close Up</option>
                                    <option value="OVER_THE_SHOULDER">Over the Shoulder</option>
                                    <option value="POV">Point of View</option>
                                    <option value="ESTABLISHING">Establishing Shot</option>
                                    <option value="CUSTOM">Custom</option>
                                  </select>
                                  {shot.cameraShot.shotType === 'CUSTOM' && (
                                    <input
                                      type="text"
                                      value={shot.cameraShot.customShotType || ''}
                                      onChange={(e) => {
                                        const updatedScenes = (localEpisode.scenes || []).map(s => {
                                          if (s.id === scene.id) {
                                            return {
                                              ...s,
                                              shots: (s.shots || []).map(sh => {
                                                if (sh.id === shot.id) {
                                                  return {
                                                    ...sh,
                                                    cameraShot: {
                                                      ...sh.cameraShot,
                                                      customShotType: e.target.value,
                                                    },
                                                    updatedAt: new Date(),
                                                  };
                                                }
                                                return sh;
                                              }),
                                            };
                                          }
                                          return s;
                                        });
                                        const updatedEpisode: Episode = {
                                          ...localEpisode,
                                          scenes: updatedScenes,
                                        };
                                        updateEpisodeAndSave(updatedEpisode);
                                      }}
                                      placeholder="Enter custom shot type..."
                                      className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                    />
                                  )}
                                </div>

                                {/* Storyboards */}
                                <div className="mb-3">
                                  <div className="flex items-center justify-between mb-2">
                                    <h6 className="text-sm font-medium text-gray-700">Storyboards</h6>
                                    <div className="flex items-center space-x-2">
                                      <button
                                        onClick={() => handleOpenDrawer(shot.id, scene.id, 'storyboard')}
                                        className="flex items-center space-x-1 px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                                      >
                                        <Palette className="w-3 h-3" />
                                        <span>Draw</span>
                                      </button>
                                      <label className={`flex items-center space-x-1 px-2 py-1 text-white text-xs rounded cursor-pointer ${
                                        uploadingImages[`${shot.id}-storyboard`] 
                                          ? 'bg-gray-400 cursor-not-allowed' 
                                          : 'bg-gray-600 hover:bg-gray-700'
                                      }`}>
                                        <Upload className="w-3 h-3" />
                                        <span>{uploadingImages[`${shot.id}-storyboard`] ? 'Uploading...' : 'Upload'}</span>
                                        <input
                                          type="file"
                                          accept="image/*"
                                          multiple
                                          disabled={uploadingImages[`${shot.id}-storyboard`]}
                                          onChange={(e) => handleImageUpload(e, shot.id, scene.id, 'storyboard')}
                                          className="hidden"
                                        />
                                      </label>
                                    </div>
                                  </div>
                                  {shot.storyboards && shot.storyboards.length > 0 ? (
                                    <div className="flex space-x-2">
                                      {shot.storyboards.map((storyboard, index) => (
                                        <div key={storyboard.id} className="relative group">
                                          <img
                                            src={storyboard.imageUrl}
                                            alt={`Storyboard ${index + 1}`}
                                            className="w-20 h-20 object-cover rounded border cursor-pointer hover:opacity-80 transition-opacity"
                                            onClick={() => handleImageClick(storyboard.imageUrl, `Storyboard ${index + 1}`)}
                                          />
                                          <button
                                            onClick={() => handleRemoveImage(scene.id, shot.id, storyboard.imageUrl, 'storyboard')}
                                            className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                                            title="Remove image"
                                          >
                                            <X className="w-3 h-3" />
                                          </button>
                                          <CommentThread 
                                            targetType="storyboard" 
                                            targetId={`${shot.id}-storyboard-${index}`}
                                            className="absolute -top-1 -left-1"
                                          />
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-xs text-gray-500">No storyboards yet</p>
                                  )}
                                </div>

                                {/* Inspiration Images */}
                                <div>
                                  <div className="flex items-center justify-between mb-2">
                                    <h6 className="text-sm font-medium text-gray-700">Inspiration Images</h6>
                                    <label className={`flex items-center space-x-1 px-2 py-1 text-white text-xs rounded cursor-pointer ${
                                      uploadingImages[`${shot.id}-inspiration`] 
                                        ? 'bg-gray-400 cursor-not-allowed' 
                                        : 'bg-gray-600 hover:bg-gray-700'
                                    }`}>
                                      <Upload className="w-3 h-3" />
                                      <span>{uploadingImages[`${shot.id}-inspiration`] ? 'Uploading...' : 'Upload'}</span>
                                      <input
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        disabled={uploadingImages[`${shot.id}-inspiration`]}
                                        onChange={(e) => handleImageUpload(e, shot.id, scene.id, 'inspiration')}
                                        className="hidden"
                                      />
                                    </label>
                                  </div>
                                  {shot.inspirationImages && shot.inspirationImages.length > 0 ? (
                                    <div className="flex space-x-2">
                                      {shot.inspirationImages.map((image, index) => (
                                        <div key={index} className="relative group">
                                          <img
                                            src={image}
                                            alt={`Inspiration ${index + 1}`}
                                            className="w-20 h-20 object-cover rounded border cursor-pointer hover:opacity-80 transition-opacity"
                                            onClick={() => handleImageClick(image, `Inspiration ${index + 1}`)}
                                          />
                                          <button
                                            onClick={() => handleRemoveImage(scene.id, shot.id, image, 'inspiration')}
                                            className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                                            title="Remove image"
                                          >
                                            <X className="w-3 h-3" />
                                          </button>
                                          <CommentThread 
                                            targetType="storyboard" 
                                            targetId={`${shot.id}-inspiration-${index}`}
                                            className="absolute -top-1 -left-1"
                                          />
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-xs text-gray-500">No inspiration images yet</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
                            <Camera className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                            <p className="text-sm text-gray-500">No shots yet</p>
                            <p className="text-xs text-gray-400">Add shots to break down this scene</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
                  <Camera className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No scenes yet</h3>
                  <p className="text-gray-500 mb-4">Start building your episode by adding scenes</p>
                  <button
                    onClick={handleAddScene}
                    className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 mx-auto"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add First Scene</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'av-script' && (
          <div className="bg-white rounded-lg shadow-sm">
            <AVScriptEditor
              episodeId={episode.id}
              avScript={localEpisode.avScript}
              onSave={(avScript) => {
                setLocalEpisode(prev => ({ ...prev, avScript }));
                onSave?.({ ...localEpisode, avScript });
              }}
            />
          </div>
        )}

        {activeTab === 'characters' && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-gray-900">Characters</h2>
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    handleAddCharacterToEpisode(e.target.value);
                    e.target.value = '';
                  }
                }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                defaultValue=""
              >
                <option value="">Add Character...</option>
                {globalAssets
                  .filter(asset => asset.category === 'character')
                  .filter(asset => !localEpisode.characters?.some(c => c.characterId === asset.id))
                  .map(character => (
                    <option key={character.id} value={character.id}>
                      {character.name}
                    </option>
                  ))}
              </select>
            </div>
            
            {localEpisode.characters && localEpisode.characters.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {localEpisode.characters.map((char) => {
                  const characterAsset = globalAssets.find(asset => 
                    asset.category === 'character' && asset.id === char.characterId
                  ) as Character | undefined;
                  
                  // Try to get character image from multiple sources
                  const characterImage = characterAsset?.mainImage || 
                                       characterAsset?.mainRender || 
                                       characterAsset?.characterGallery?.[0] ||
                                       characterAsset?.galleryImages?.[0];
                  
                  return (
                    <div key={char.characterId} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-start space-x-3 mb-3">
                        <div className="flex-shrink-0">
                          {characterImage ? (
                            <img
                              src={characterImage}
                              alt={characterAsset?.name || 'Character'}
                              className="w-16 h-16 rounded-full object-cover border-2 border-gray-200"
                              onError={(e) => {
                                console.error('Character image failed to load:', characterImage);
                                const img = e.target as HTMLImageElement;
                                img.style.display = 'none';
                                // Show fallback div
                                const fallback = img.nextElementSibling as HTMLElement;
                                if (fallback) fallback.style.display = 'flex';
                              }}
                            />
                          ) : null}
                          {/* Fallback avatar */}
                          <div 
                            className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center border-2 border-gray-200"
                            style={{ display: characterImage ? 'none' : 'flex' }}
                          >
                            <span className="text-indigo-600 font-semibold text-lg">
                              {(characterAsset?.name || 'U').charAt(0).toUpperCase()}
                            </span>
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="font-medium text-gray-900 truncate">{characterAsset?.name || 'Unknown Character'}</h3>
                            <button
                              onClick={() => handleRemoveCharacterFromEpisode(char.characterId)}
                              className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded flex-shrink-0"
                              title="Remove character from episode"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                          <span className="text-sm text-gray-900 capitalize">{char.type}</span>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                          <input
                            type="text"
                            value={char.role || ''}
                            onChange={(e) => {
                              const updatedEpisode: Episode = {
                                ...localEpisode,
                                characters: (localEpisode.characters || []).map(c => 
                                  c.characterId === char.characterId 
                                    ? { ...c, role: e.target.value }
                                    : c
                                ),
                              };
                              updateEpisodeAndSave(updatedEpisode);
                            }}
                            placeholder="Character role..."
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-transparent"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
                <p className="text-gray-500">No characters added to this episode yet.</p>
                <p className="text-sm text-gray-400 mt-1">Use the dropdown above to add characters.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'locations' && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-gray-900">Locations</h2>
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    handleAddLocationToEpisode(e.target.value);
                    e.target.value = '';
                  }
                }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                defaultValue=""
              >
                <option value="">Add Location...</option>
                {globalAssets
                  .filter(asset => asset.category === 'location')
                  .filter(asset => !localEpisode.locations?.some(l => l.locationId === asset.id))
                  .map(location => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
              </select>
            </div>
            
            {localEpisode.locations && localEpisode.locations.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {localEpisode.locations.map((loc) => {
                  const locationAsset = globalAssets.find(asset => asset.id === loc.locationId);
                  return (
                    <div key={loc.locationId} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-medium">{locationAsset?.name || 'Unknown Location'}</h3>
                        <button
                          onClick={() => handleRemoveLocationFromEpisode(loc.locationId)}
                          className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                        <textarea
                          value={loc.description || ''}
                          onChange={(e) => {
                            const updatedEpisode: Episode = {
                              ...localEpisode,
                              locations: (localEpisode.locations || []).map(l => 
                                l.locationId === loc.locationId 
                                  ? { ...l, description: e.target.value }
                                  : l
                              ),
                            };
                            updateEpisodeAndSave(updatedEpisode);
                          }}
                          placeholder="Location description..."
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-transparent resize-none"
                          rows={2}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
                <p className="text-gray-500">No locations added to this episode yet.</p>
                <p className="text-sm text-gray-400 mt-1">Use the dropdown above to add locations.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'gadgets' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Special Gadgets</h2>
            <p className="text-gray-500">No special gadgets assigned to this episode yet.</p>
          </div>
        )}
      </div>

      {/* Storyboard Drawer */}
      {showDrawer && drawingContext && (
        <StoryboardDrawer
          onSave={handleSaveDrawing}
          onClose={handleCloseDrawer}
          title={`Draw ${drawingContext.type === 'storyboard' ? 'Storyboard' : 'Inspiration Image'}`}
          isUploading={uploadingDrawing}
        />
      )}

      {/* Image Popup Modal */}
      {selectedImage && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[60] p-4">
          <div className="relative max-w-4xl max-h-full">
            <button
              onClick={handleCloseImagePopup}
              className="absolute -top-4 -right-4 w-8 h-8 bg-white text-black rounded-full flex items-center justify-center hover:bg-gray-200 transition-colors z-10"
              title="Close (ESC)"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={selectedImage.url}
              alt={selectedImage.alt}
              className="max-w-full max-h-full object-contain rounded-lg"
            />
            <div className="absolute bottom-4 left-4 bg-black bg-opacity-50 text-white px-3 py-1 rounded text-sm">
              {selectedImage.alt}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-gray-900">Delete Scene</h3>
                <p className="text-sm text-gray-500">This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-gray-700 mb-6">
              Are you sure you want to delete this scene? All associated shots, storyboards, and other data will be permanently removed.
            </p>
            <div className="flex space-x-3 justify-end">
              <button
                onClick={cancelDeleteScene}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteScene}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete Scene
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Character Details Modal */}
      {showCharacterPopup && selectedCharacter && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-4">
                  <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center overflow-hidden">
                    {selectedCharacter.mainImage ? (
                      <img 
                        src={selectedCharacter.mainImage} 
                        alt={selectedCharacter.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-xl font-medium text-gray-600">
                        {selectedCharacter.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">{selectedCharacter.name}</h2>
                    <p className="text-gray-600">{selectedCharacter.description}</p>
                  </div>
                </div>
                <button
                  onClick={handleCloseCharacterPopup}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Close"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Character Details */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Character Information */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">Character Details</h3>
                  
                  {selectedCharacter.general && (
                    <div className="space-y-3">
                      {selectedCharacter.general.age && (
                        <div>
                          <label className="text-sm font-medium text-gray-700">Age</label>
                          <p className="text-gray-900">{selectedCharacter.general.age}</p>
                        </div>
                      )}
                      {selectedCharacter.general.personality && (
                        <div>
                          <label className="text-sm font-medium text-gray-700">Personality</label>
                          <p className="text-gray-900">{selectedCharacter.general.personality}</p>
                        </div>
                      )}
                      {selectedCharacter.general.backstory && (
                        <div>
                          <label className="text-sm font-medium text-gray-700">Backstory</label>
                          <p className="text-gray-900">{selectedCharacter.general.backstory}</p>
                        </div>
                      )}
                      {selectedCharacter.general.specialAbilities && (
                        <div>
                          <label className="text-sm font-medium text-gray-700">Special Abilities</label>
                          <p className="text-gray-900">{selectedCharacter.general.specialAbilities}</p>
                        </div>
                      )}
                      {selectedCharacter.general.relationships && (
                        <div>
                          <label className="text-sm font-medium text-gray-700">Relationships</label>
                          <p className="text-gray-900">{selectedCharacter.general.relationships}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {selectedCharacter.clothing && (
                    <div className="space-y-3">
                      <h4 className="text-md font-semibold text-gray-900">Clothing & Style</h4>
                      {selectedCharacter.clothing.defaultOutfit && (
                        <div>
                          <label className="text-sm font-medium text-gray-700">Default Outfit</label>
                          <p className="text-gray-900">{selectedCharacter.clothing.defaultOutfit}</p>
                        </div>
                      )}
                      {selectedCharacter.clothing.accessories && selectedCharacter.clothing.accessories.length > 0 && (
                        <div>
                          <label className="text-sm font-medium text-gray-700">Accessories</label>
                          <p className="text-gray-900">{selectedCharacter.clothing.accessories.join(', ')}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Character Images and Concepts */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">Images & Concepts</h3>
                  
                  {/* Main Image */}
                  {selectedCharacter.mainImage && (
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-2">Main Image</label>
                      <img 
                        src={selectedCharacter.mainImage} 
                        alt={selectedCharacter.name}
                        className="w-full max-h-96 object-contain rounded-lg border cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => setSelectedImage({ url: selectedCharacter.mainImage!, alt: selectedCharacter.name })}
                      />
                    </div>
                  )}

                  {/* Character Gallery */}
                  {selectedCharacter.characterGallery && selectedCharacter.characterGallery.length > 0 && (
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-2">Character Gallery</label>
                      <div className="grid grid-cols-2 gap-2">
                        {selectedCharacter.characterGallery.map((imageUrl, index) => (
                          <img 
                            key={index}
                            src={imageUrl} 
                            alt={`${selectedCharacter.name} - Image ${index + 1}`}
                            className="w-full h-32 object-contain rounded-lg border cursor-pointer hover:opacity-80 transition-opacity bg-gray-50"
                            onClick={() => setSelectedImage({ url: imageUrl, alt: `${selectedCharacter.name} - Image ${index + 1}` })}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Concepts */}
                  {selectedCharacter.concepts && selectedCharacter.concepts.length > 0 && (
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-2">Concepts</label>
                      <div className="space-y-2">
                        {selectedCharacter.concepts.map((concept, index) => (
                          <div key={index} className="border rounded-lg p-3">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="font-medium text-gray-900">{concept.name}</h4>
                              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                                {concept.conceptType || 'General'}
                              </span>
                            </div>
                            {concept.description && (
                              <p className="text-sm text-gray-600 mb-2">{concept.description}</p>
                            )}
                            {concept.imageUrl && (
                              <img 
                                src={concept.imageUrl} 
                                alt={concept.name}
                                className="w-full h-24 object-contain rounded cursor-pointer hover:opacity-80 transition-opacity bg-gray-50"
                                onClick={() => setSelectedImage({ url: concept.imageUrl!, alt: concept.name })}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {showContextMenu && (
        <div
          className="fixed bg-white border border-gray-300 rounded-lg shadow-lg py-1 z-50"
          style={{
            left: showContextMenu.x,
            top: showContextMenu.y,
          }}
          onClick={handleCloseContextMenu}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleAddShotFromText(
                showContextMenu.sceneId,
                showContextMenu.selectedText,
                showContextMenu.selectionStart,
                showContextMenu.selectionEnd
              );
            }}
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center space-x-2"
          >
            <Camera className="w-4 h-4" />
            <span>Add Shot</span>
          </button>
        </div>
      )}

      {/* Shot Creation Popup */}
      {showShotPopup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Create Shot from Text</h3>
              <button
                onClick={handleCloseShotPopup}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Selected Text
                </label>
                 <div className="p-3 bg-gray-50 rounded border text-sm">
                   &quot;{showShotPopup.selectedText}&quot;
                 </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Shot Number
                </label>
                <input
                  type="text"
                  placeholder="e.g., SC1SH1"
                  value={shotFormData.shotNumber}
                  onChange={(e) => setShotFormData(prev => ({ ...prev, shotNumber: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Shot Description
                </label>
                <textarea
                  placeholder="Describe the shot..."
                  rows={3}
                  value={shotFormData.description}
                  onChange={(e) => setShotFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Shot Images
                </label>
                <div 
                  className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
                  onClick={() => document.getElementById('shot-image-upload')?.click()}
                >
                  <input
                    id="shot-image-upload"
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={(e) => e.target.files && handleShotImageUpload(e.target.files)}
                    className="hidden"
                  />
                  {uploadingShotImages ? (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                      <span className="ml-2 text-sm text-gray-600">Uploading...</span>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                      <p className="text-sm text-gray-500">Click to upload images or drag and drop</p>
                    </>
                  )}
                </div>
                
                {/* Display uploaded images */}
                {shotFormData.images.length > 0 && (
                  <div className="mt-4">
                    <div className="grid grid-cols-3 gap-2">
                      {shotFormData.images.map((imageUrl, index) => (
                        <div key={index} className="relative group">
                          <img
                            src={imageUrl}
                            alt={`Shot image ${index + 1}`}
                            className="w-full h-24 object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => handleSetShotFeaturedImage(imageUrl)}
                          />
                          {shotFormData.featuredImage === imageUrl && (
                            <div className="absolute top-1 right-1 bg-indigo-600 text-white text-xs px-1 rounded">
                              ★
                            </div>
                          )}
                          <button
                            onClick={() => handleRemoveShotImage(imageUrl)}
                            className="absolute top-1 left-1 bg-red-500 text-white text-xs px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      Click on an image to set it as featured (★)
                    </p>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={handleCloseShotPopup}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateShot}
                disabled={!shotFormData.shotNumber || !shotFormData.description}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                Create Shot
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shot Hover Preview */}
      {hoveredShot && (
        <div
          className="fixed bg-white border border-gray-300 rounded-lg shadow-lg p-3 z-50 max-w-xs"
          style={{
            left: hoveredShot.x + 10,
            top: hoveredShot.y - 10,
          }}
        >
          {(() => {
            const scene = localEpisode.scenes?.find(s => s.shots?.some(shot => shot.id === hoveredShot.shotId));
            const shot = scene?.shots?.find(shot => shot.id === hoveredShot.shotId);
            
            if (!shot) return null;
            
            return (
              <div className="space-y-2">
                <div className="font-semibold text-sm text-gray-900">
                  {shot.shotNumber}
                </div>
                {shot.featuredImage && (
                  <img
                    src={shot.featuredImage}
                    alt={`Shot ${shot.shotNumber}`}
                    className="w-full h-32 object-cover rounded"
                  />
                )}
                <div className="text-xs text-gray-600">
                  {shot.description}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}