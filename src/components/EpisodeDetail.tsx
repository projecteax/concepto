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
  Upload,
  Bold,
  Italic,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify
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
  onSave: (episode: Episode) => void;
}

export default function EpisodeDetail({
  episode,
  show,
  globalAssets,
  onBack,
  onSave,
}: EpisodeDetailProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'script' | 'av-script' | 'characters' | 'locations' | 'gadgets'>('overview');
  const [localEpisode, setLocalEpisode] = useState<Episode>(episode);
  
  // Script editing states
  const [editingScripts, setEditingScripts] = useState<{[sceneId: string]: string}>({});
  
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

  // Rich text editor refs (currently unused but kept for future use)
  // const scriptEditorRefs = useRef<{[sceneId: string]: HTMLDivElement | null}>({});

  // Sync local episode with prop
  useEffect(() => {
    setLocalEpisode(episode);
  }, [episode]);

  const updateEpisodeAndSave = (updatedEpisode: Episode) => {
    setLocalEpisode(updatedEpisode);
    onSave(updatedEpisode);
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
      script: '',
      characters: [],
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
    const updatedScenes = (localEpisode.scenes || []).filter(s => s.id !== sceneId);
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

  // Handle ESC key for image popup
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && selectedImage) {
        handleCloseImagePopup();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedImage]);

  const handleScriptChange = (sceneId: string, script: string) => {
    setEditingScripts(prev => ({
      ...prev,
      [sceneId]: script,
    }));
  };

  // Rich text editor functions for textarea
  const handleFormatText = (sceneId: string, format: string) => {
    const currentText = editingScripts[sceneId] || '';
    let newText = currentText;
    
    if (format === 'bold') {
      // Simple bold formatting with **text**
      newText = currentText.replace(/\*\*(.*?)\*\*/g, '$1');
      if (newText === currentText) {
        // No bold text found, add bold markers around selection (or at cursor)
        newText = currentText + '**bold text**';
      }
    } else if (format === 'italic') {
      // Simple italic formatting with *text*
      newText = currentText.replace(/\*(.*?)\*/g, '$1');
      if (newText === currentText) {
        // No italic text found, add italic markers around selection (or at cursor)
        newText = currentText + '*italic text*';
      }
    }
    
    handleScriptChange(sceneId, newText);
  };

  const handleAlignText = (sceneId: string, alignment: string) => {
    // For now, just add alignment markers as comments
    const currentText = editingScripts[sceneId] || '';
    const alignmentMarkers = {
      'Left': '<!-- ALIGN: LEFT -->',
      'Center': '<!-- ALIGN: CENTER -->',
      'Right': '<!-- ALIGN: RIGHT -->',
      'Full': '<!-- ALIGN: JUSTIFY -->'
    };
    
    const newText = currentText + '\n' + alignmentMarkers[alignment as keyof typeof alignmentMarkers];
    handleScriptChange(sceneId, newText);
  };

  const handleFontSize = (sceneId: string, size: string) => {
    // For now, just add font size markers as comments
    const currentText = editingScripts[sceneId] || '';
    const sizeMarkers = {
      '1': '<!-- FONT SIZE: 8px -->',
      '2': '<!-- FONT SIZE: 10px -->',
      '3': '<!-- FONT SIZE: 12px -->',
      '4': '<!-- FONT SIZE: 14px -->',
      '5': '<!-- FONT SIZE: 18px -->',
      '6': '<!-- FONT SIZE: 24px -->',
      '7': '<!-- FONT SIZE: 36px -->'
    };
    
    const newText = currentText + '\n' + sizeMarkers[size as keyof typeof sizeMarkers];
    handleScriptChange(sceneId, newText);
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
                          <div className="border border-gray-300 rounded-lg">
                            {/* Rich Text Editor Toolbar */}
                            <div className="flex items-center space-x-1 p-2 bg-gray-50 border-b border-gray-300 rounded-t-lg">
                              <button
                                onClick={() => handleFormatText(scene.id, 'bold')}
                                className="p-1 hover:bg-gray-200 rounded"
                                title="Bold"
                              >
                                <Bold className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleFormatText(scene.id, 'italic')}
                                className="p-1 hover:bg-gray-200 rounded"
                                title="Italic"
                              >
                                <Italic className="w-4 h-4" />
                              </button>
                              <div className="w-px h-4 bg-gray-300 mx-1" />
                              <button
                                onClick={() => handleAlignText(scene.id, 'Left')}
                                className="p-1 hover:bg-gray-200 rounded"
                                title="Align Left"
                              >
                                <AlignLeft className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleAlignText(scene.id, 'Center')}
                                className="p-1 hover:bg-gray-200 rounded"
                                title="Align Center"
                              >
                                <AlignCenter className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleAlignText(scene.id, 'Right')}
                                className="p-1 hover:bg-gray-200 rounded"
                                title="Align Right"
                              >
                                <AlignRight className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleAlignText(scene.id, 'Full')}
                                className="p-1 hover:bg-gray-200 rounded"
                                title="Justify"
                              >
                                <AlignJustify className="w-4 h-4" />
                              </button>
                              <div className="w-px h-4 bg-gray-300 mx-1" />
                              <select
                                onChange={(e) => handleFontSize(scene.id, e.target.value)}
                                className="text-xs border border-gray-300 rounded px-1 py-1"
                                title="Font Size"
                              >
                                <option value="1">8px</option>
                                <option value="2">10px</option>
                                <option value="3" selected>12px</option>
                                <option value="4">14px</option>
                                <option value="5">18px</option>
                                <option value="6">24px</option>
                                <option value="7">36px</option>
                              </select>
                            </div>
                            
                            {/* Simple Textarea with Rich Text Styling */}
                            <textarea
                              value={editingScripts[scene.id] || ''}
                              onChange={(e) => handleScriptChange(scene.id, e.target.value)}
                              className="w-full px-3 py-2 text-sm resize-none focus:outline-none min-h-[100px] font-mono text-gray-900 border-0"
                              style={{ 
                                fontFamily: 'Courier New, monospace',
                                color: '#111827',
                                lineHeight: '1.5'
                              }}
                              placeholder="Enter scene script..."
                            />
                          </div>
                        ) : (
                          <div 
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[100px] font-mono bg-gray-50 text-gray-900"
                            style={{ 
                              fontFamily: 'Courier New, monospace',
                              color: '#111827',
                              lineHeight: '1.5'
                            }}
                            dangerouslySetInnerHTML={{ __html: scene.script || '<span class="text-gray-400">No script available</span>' }}
                          />
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
                onSave({ ...localEpisode, avScript });
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
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
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
    </div>
  );
}