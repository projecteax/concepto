'use client';

import { useState, useEffect } from 'react';
import { Show, Episode, EpisodeScene, SceneShot, Character, GlobalAsset } from '@/types';
import { 
  Plus, 
  Camera, 
  Palette, 
  X, 
  ArrowLeft, 
  ImageIcon,
  Edit3,
  Save,
  Trash2,
  MessageCircle,
  Upload
} from 'lucide-react';
import StoryboardDrawer from './StoryboardDrawer';
import CommentThread from './CommentThread';
import { useS3Upload } from '@/hooks/useS3Upload';

interface EpisodeDetailProps {
  episode: Episode;
  show: Show;
  globalAssets: GlobalAsset[];
  onBack: () => void;
  onSave: (episode: Episode) => void;
  onAddCharacter: (character: Character) => void;
  onAddLocation: (location: GlobalAsset) => void;
}

export default function EpisodeDetail({
  episode,
  show,
  globalAssets,
  onBack,
  onSave,
  onAddCharacter,
  onAddLocation,
}: EpisodeDetailProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'script' | 'characters' | 'locations' | 'gadgets'>('overview');
  const [localEpisode, setLocalEpisode] = useState<Episode>(episode);
  
  // Script editing states
  const [editingScripts, setEditingScripts] = useState<{[sceneId: string]: string}>({});
  
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

  // Sync local episode with prop
  useEffect(() => {
    setLocalEpisode(episode);
  }, [episode]);

  const updateEpisodeAndSave = (updatedEpisode: Episode) => {
    setLocalEpisode(updatedEpisode);
    onSave(updatedEpisode);
  };

  const handleAddScene = () => {
    const newSceneNumber = (localEpisode.scenes?.length || 0) + 1;
    const newScene: EpisodeScene = {
      id: `scene-${Date.now()}`,
      sceneNumber: newSceneNumber,
      title: `Scene ${newSceneNumber}`,
      description: '',
      script: '',
      location: null,
      characters: [],
      gadgets: [],
      shots: [],
    };

    const updatedEpisode: Episode = {
      ...localEpisode,
      scenes: [...(localEpisode.scenes || []), newScene],
    };
    updateEpisodeAndSave(updatedEpisode);
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
    const newShot: SceneShot = {
      id: `shot-${Date.now()}`,
      shotNumber: newShotNumber,
      description: '',
      duration: 0,
      storyboards: [],
      inspirationImages: [],
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
  };

  const handleDeleteShot = (sceneId: string, shotId: string) => {
    const updatedScenes = (localEpisode.scenes || []).map(s => {
      if (s.id === sceneId) {
        return {
          ...s,
          shots: (s.shots || []).filter(shot => shot.id !== shotId),
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

  const handleOpenDrawer = (shotId: string, sceneId: string, type: 'storyboard' | 'inspiration') => {
    setDrawingContext({ shotId, sceneId, type });
    setShowDrawer(true);
  };

  const handleSaveDrawing = async (imageData: string) => {
    if (!drawingContext) return;

    setUploadingDrawing(true);
    try {
      // Convert data URL to File
      const response = await fetch(imageData);
      const blob = await response.blob();
      const file = new File([blob], `drawing-${Date.now()}.png`, { type: 'image/png' });

      // For now, store as data URL (in production, upload to R2)
      const uploadedUrl = imageData;

      const updatedScenes = (localEpisode.scenes || []).map(s => {
        if (s.id === drawingContext.sceneId) {
          return {
            ...s,
            shots: (s.shots || []).map(shot => {
              if (shot.id === drawingContext.shotId) {
                if (drawingContext.type === 'storyboard') {
                  return {
                    ...shot,
                    storyboards: [...(shot.storyboards || []), uploadedUrl],
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
                        storyboards: [...(shot.storyboards || []), result.url],
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

  const handleScriptChange = (sceneId: string, script: string) => {
    setEditingScripts(prev => ({
      ...prev,
      [sceneId]: script,
    }));
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
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{localEpisode.title}</h1>
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
                onClick={() => setActiveTab(tab.id as any)}
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
              <p className="text-gray-600">{localEpisode.description || 'No description available.'}</p>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">Characters</h2>
              {localEpisode.characters && localEpisode.characters.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {localEpisode.characters.map((char) => {
                    const characterAsset = globalAssets.find(asset => 
                      asset.category === 'character' && asset.id === char.characterId
                    ) as Character | undefined;
                    return (
                      <div key={char.id} className="border rounded-lg p-4">
                        <div className="flex items-center space-x-3">
                          {characterAsset?.mainImage && (
                            <img
                              src={characterAsset.mainImage}
                              alt={characterAsset.general.name}
                              className="w-12 h-12 rounded-full object-cover"
                            />
                          )}
                          <div>
                            <h3 className="font-medium">{characterAsset?.general.name || 'Unknown Character'}</h3>
                            <p className="text-sm text-gray-500">{char.role}</p>
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
                      <div key={loc.id} className="border rounded-lg p-4">
                        <h3 className="font-medium">{locationAsset?.general.name || 'Unknown Location'}</h3>
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
                    <div key={scene.id} className="border rounded-lg p-6">
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
                              onClick={() => setEditingScripts(prev => ({ ...prev, [scene.id]: scene.script || '' }))}
                              className="flex items-center space-x-1 px-3 py-1 text-indigo-600 text-sm rounded hover:bg-indigo-50"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>Edit</span>
                            </button>
                          )}
                        </div>
                        <textarea
                          value={editingScripts[scene.id] !== undefined ? editingScripts[scene.id] : (scene.script || '')}
                          onChange={(e) => handleScriptChange(scene.id, e.target.value)}
                          placeholder="Enter scene script..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                          rows={4}
                          readOnly={editingScripts[scene.id] === undefined}
                        />
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
                              <div key={shot.id} className="border rounded-lg p-4 bg-gray-50">
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
                                    onClick={() => handleDeleteShot(scene.id, shot.id)}
                                    className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>

                                <div className="mb-3">
                                  <textarea
                                    value={shot.description || ''}
                                    placeholder="Shot description..."
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                    rows={2}
                                  />
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
                                        <div key={index} className="relative">
                                          <img
                                            src={storyboard}
                                            alt={`Storyboard ${index + 1}`}
                                            className="w-20 h-20 object-cover rounded border"
                                          />
                                          <CommentThread 
                                            targetType="storyboard" 
                                            targetId={`${shot.id}-storyboard-${index}`}
                                            className="absolute -top-1 -right-1"
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
                                        <div key={index} className="relative">
                                          <img
                                            src={image}
                                            alt={`Inspiration ${index + 1}`}
                                            className="w-20 h-20 object-cover rounded border"
                                          />
                                          <CommentThread 
                                            targetType="inspiration" 
                                            targetId={`${shot.id}-inspiration-${index}`}
                                            className="absolute -top-1 -right-1"
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

        {activeTab === 'characters' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Characters</h2>
            <p className="text-gray-500">Character management will be implemented here.</p>
          </div>
        )}

        {activeTab === 'locations' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Locations</h2>
            <p className="text-gray-500">Location management will be implemented here.</p>
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
    </div>
  );
}