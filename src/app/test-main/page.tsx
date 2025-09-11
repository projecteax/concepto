'use client';

import { useState } from 'react';
import { Show, Episode, EpisodeScene, SceneShot } from '@/types';
import { Plus, Camera, Palette, X, ArrowLeft, ImageIcon } from 'lucide-react';
import StoryboardDrawer from '@/components/StoryboardDrawer';
import ProtectedRoute from '@/components/ProtectedRoute';
import UserHeader from '@/components/UserHeader';
import CommentThread from '@/components/CommentThread';

export default function TestMainPage() {
  const [currentView, setCurrentView] = useState<'shows' | 'episode-detail'>('shows');
  const [selectedShow, setSelectedShow] = useState<Show | null>(null);
  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);
  
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

  const demoShow: Show = {
    id: 'demo-show',
    name: 'Demo Show',
    description: 'A demo show for testing',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const demoEpisode: Episode = {
    id: 'demo-episode',
    showId: 'demo-show',
    title: 'Demo Episode',
    episodeNumber: 1,
    description: 'A demo episode for testing scenes',
    script: '',
    characters: [],
    locations: [],
    scenes: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const handleSelectShow = (show: Show) => {
    setSelectedShow(show);
    setSelectedEpisode(demoEpisode);
    setCurrentView('episode-detail');
  };

  const handleAddScene = () => {
    if (!selectedEpisode) return;
    
    const currentScenes = selectedEpisode.scenes || [];
    const sceneNumber = currentScenes.length + 1;
    const newScene: EpisodeScene = {
      id: `scene-${Date.now()}`,
      sceneNumber: sceneNumber,
      title: `SCENE_${sceneNumber.toString().padStart(2, '0')}`,
      description: '',
      script: '',
      characters: [],
      gadgets: [],
      shots: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    setSelectedEpisode({
      ...selectedEpisode,
      scenes: [...currentScenes, newScene],
    });
  };

  const handleAddShot = (sceneId: string) => {
    if (!selectedEpisode) return;
    
    const currentScenes = selectedEpisode.scenes || [];
    const updatedScenes = currentScenes.map(scene => {
      if (scene.id === sceneId) {
        const shotNumber = scene.shots.length + 1;
        const newShot: SceneShot = {
          id: `shot-${Date.now()}`,
          shotNumber: shotNumber,
          title: `SHOT_${shotNumber.toString().padStart(2, '0')}`,
          description: '',
          storyboards: [],
          inspirationImages: [],
          cameraShot: {
            id: `camera-${Date.now()}`,
            shotType: 'MEDIUM',
            description: '',
            cameraMovement: 'STATIC',
            duration: 0,
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        return {
          ...scene,
          shots: [...scene.shots, newShot],
          updatedAt: new Date(),
        };
      }
      return scene;
    });
    
    setSelectedEpisode({
      ...selectedEpisode,
      scenes: updatedScenes,
    });
  };

  // Script editing functions
  const handleScriptChange = (sceneId: string, value: string) => {
    setEditingScripts(prev => ({
      ...prev,
      [sceneId]: value
    }));
  };

  const handleSaveScript = (sceneId: string) => {
    const scriptContent = editingScripts[sceneId];
    if (scriptContent !== undefined && selectedEpisode && selectedEpisode.scenes) {
      const updatedScenes = selectedEpisode.scenes.map(s => 
        s.id === sceneId ? { ...s, script: scriptContent, updatedAt: new Date() } : s
      );
      setSelectedEpisode({
        ...selectedEpisode,
        scenes: updatedScenes
      });
      
      // Clear the editing state
      setEditingScripts(prev => {
        const newState = { ...prev };
        delete newState[sceneId];
        return newState;
      });
    }
  };

  const handleCancelScriptEdit = (sceneId: string) => {
    setEditingScripts(prev => {
      const newState = { ...prev };
      delete newState[sceneId];
      return newState;
    });
  };

  // Drawing functions
  const handleOpenDrawer = (shotId: string, sceneId: string, type: 'storyboard' | 'inspiration') => {
    setDrawingContext({ shotId, sceneId, type });
    setShowDrawer(true);
  };

  const handleSaveDrawing = async (imageData: string) => {
    if (!drawingContext || !selectedEpisode) return;

    setUploadingDrawing(true);
    try {
      // Check if R2 is properly configured
      const hasValidR2Config = process.env.NEXT_PUBLIC_R2_BUCKET && 
                               process.env.NEXT_PUBLIC_R2_BUCKET !== 'your-r2-bucket-name' &&
                               process.env.NEXT_PUBLIC_R2_ACCESS_KEY_ID &&
                               process.env.NEXT_PUBLIC_R2_ACCESS_KEY_ID !== 'your-r2-access-key-id';

      let uploadedUrl = imageData; // Default to data URL

      if (hasValidR2Config) {
        // Convert data URL to File object for upload
        const response = await fetch(imageData);
        const blob = await response.blob();
        const file = new File([blob], `storyboard-${Date.now()}.png`, { type: 'image/png' });

        // Upload to R2
        const { uploadToS3 } = await import('@/lib/s3-service');
        const uploadResult = await uploadToS3(file, 'storyboards/');
        uploadedUrl = uploadResult.url;
      } else {
        console.log('R2 not configured, using local storage');
      }

      const currentScenes = selectedEpisode.scenes || [];
      const updatedScenes = currentScenes.map(scene => {
        if (scene.id === drawingContext.sceneId) {
          return {
            ...scene,
            shots: scene.shots.map(shot => {
              if (shot.id === drawingContext.shotId) {
                if (drawingContext.type === 'storyboard') {
                  const newStoryboard = {
                    id: `storyboard-${Date.now()}`,
                    imageUrl: uploadedUrl,
                    description: 'Drawn storyboard',
                  };
                  return {
                    ...shot,
                    storyboards: [...shot.storyboards, newStoryboard],
                    updatedAt: new Date(),
                  };
                } else {
                  return {
                    ...shot,
                    inspirationImages: [...shot.inspirationImages, uploadedUrl],
                    updatedAt: new Date(),
                  };
                }
              }
              return shot;
            }),
            updatedAt: new Date(),
          };
        }
        return scene;
      });

      setSelectedEpisode({
        ...selectedEpisode,
        scenes: updatedScenes,
      });
      setShowDrawer(false);
      setDrawingContext(null);
    } catch (error) {
      console.error('Error saving drawing:', error);
      
      // Show user-friendly error message
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('not configured')) {
        alert(`Configuration Error: ${errorMessage}\n\nPlease check your .env.local file and ensure all R2 credentials are properly set.`);
      } else {
        alert(`Upload Error: ${errorMessage}\n\nFalling back to local storage.`);
      }
      
      // Fallback: save as data URL if upload fails
      const currentScenes = selectedEpisode.scenes || [];
      const updatedScenes = currentScenes.map(scene => {
        if (scene.id === drawingContext.sceneId) {
          return {
            ...scene,
            shots: scene.shots.map(shot => {
              if (shot.id === drawingContext.shotId) {
                if (drawingContext.type === 'storyboard') {
                  const newStoryboard = {
                    id: `storyboard-${Date.now()}`,
                    imageUrl: imageData,
                    description: 'Drawn storyboard (local)',
                  };
                  return {
                    ...shot,
                    storyboards: [...shot.storyboards, newStoryboard],
                    updatedAt: new Date(),
                  };
                } else {
                  return {
                    ...shot,
                    inspirationImages: [...shot.inspirationImages, imageData],
                    updatedAt: new Date(),
                  };
                }
              }
              return shot;
            }),
            updatedAt: new Date(),
          };
        }
        return scene;
      });

      setSelectedEpisode({
        ...selectedEpisode,
        scenes: updatedScenes,
      });
      setShowDrawer(false);
      setDrawingContext(null);
    } finally {
      setUploadingDrawing(false);
    }
  };

  const handleCloseDrawer = () => {
    setShowDrawer(false);
    setDrawingContext(null);
  };

  if (currentView === 'shows') {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50">
          <UserHeader />
          <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 80px)' }}>
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-6 text-center">Demo Shows</h1>
          <div className="space-y-4">
            <button
              onClick={() => handleSelectShow(demoShow)}
              className="w-full p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left"
            >
              <h3 className="font-semibold text-gray-900">{demoShow.name}</h3>
              <p className="text-sm text-gray-500 mt-1">{demoShow.description}</p>
            </button>
          </div>
        </div>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  if (currentView === 'episode-detail' && selectedEpisode) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50">
          <UserHeader />
        {/* Header */}
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => setCurrentView('shows')}
                  className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                  <h1 className="text-xl font-semibold text-gray-900">{selectedEpisode.title}</h1>
                  <p className="text-sm text-gray-500">Episode {selectedEpisode.episodeNumber} • {selectedShow?.name}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="space-y-6">
            {/* Scene-by-Scene Script */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-medium text-gray-900">Scene-by-Scene Script</h3>
                <button
                  onClick={handleAddScene}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center space-x-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Scene</span>
                </button>
              </div>

              <div className="space-y-6">
                {(selectedEpisode.scenes || []).map((scene) => (
                  <div key={scene.id} className="border border-gray-200 rounded-lg p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div className="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-sm font-medium font-mono">
                              SCENE_{scene.sceneNumber.toString().padStart(2, '0')}
                            </div>
                            <h3 className="text-lg font-medium text-gray-900">{scene.title}</h3>
                            <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-medium">
                              EDIT MODE
                            </span>
                          </div>
                          <CommentThread targetType="scene" targetId={scene.id} />
                        </div>
                    </div>

                    {/* Script Section */}
                    <div className="mb-6">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Scene Script
                      </label>
                      <div className="relative">
                        <textarea
                          value={editingScripts[scene.id] !== undefined ? editingScripts[scene.id] : (scene.script || '')}
                          onChange={(e) => handleScriptChange(scene.id, e.target.value)}
                          placeholder={`SCENE_${scene.sceneNumber.toString().padStart(2, '0')}\n\nFADE IN:\n\nINT. LOCATION - DAY\n\n[Enter your script here...]`}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none font-mono text-sm"
                          rows={6}
                        />
                        
                        {/* Save/Cancel buttons - only show when editing */}
                        {editingScripts[scene.id] !== undefined && (
                          <div className="absolute top-2 right-2 flex space-x-2">
                            <button
                              onClick={() => handleSaveScript(scene.id)}
                              className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 transition-colors flex items-center space-x-1"
                            >
                              <span>Save</span>
                            </button>
                            <button
                              onClick={() => handleCancelScriptEdit(scene.id)}
                              className="px-3 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600 transition-colors flex items-center space-x-1"
                            >
                              <span>Cancel</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Shots Section */}
                    <div className="mb-6">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-md font-medium text-gray-900">Shots</h4>
                        <button
                          onClick={() => handleAddShot(scene.id)}
                          className="px-3 py-1 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center space-x-2 text-sm"
                        >
                          <Camera className="w-3 h-3" />
                          <span>Add Shot</span>
                        </button>
                      </div>

                      {scene.shots.length > 0 ? (
                        <div className="space-y-4">
                          {scene.shots.map((shot) => (
                            <div key={shot.id} className="border border-gray-200 rounded-lg p-4">
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center space-x-2">
                                  <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-mono">
                                    {shot.title}
                                  </span>
                                  <span className="text-sm text-gray-600">
                                    {shot.cameraShot.shotType}
                                  </span>
                                </div>
                              </div>
                              
                              <div className="space-y-3">
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Shot Description
                                  </label>
                                  <textarea
                                    value={shot.description || ''}
                                    onChange={(e) => {
                                      const currentScenes = selectedEpisode.scenes || [];
                                      const updatedScenes = currentScenes.map(s => {
                                        if (s.id === scene.id) {
                                          return {
                                            ...s,
                                            shots: s.shots.map(sh => 
                                              sh.id === shot.id 
                                                ? { ...sh, description: e.target.value, updatedAt: new Date() }
                                                : sh
                                            ),
                                            updatedAt: new Date(),
                                          };
                                        }
                                        return s;
                                      });
                                      
                                      setSelectedEpisode({
                                        ...selectedEpisode,
                                        scenes: updatedScenes,
                                      });
                                    }}
                                    placeholder="Describe what happens in this shot..."
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none text-sm"
                                    rows={2}
                                  />
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                      Storyboards
                                    </label>
                                    <div className="space-y-2">
                                      {shot.storyboards.length > 0 && (
                                        <div className="grid grid-cols-2 gap-2">
                                          {shot.storyboards.map((storyboard) => (
                                            <div key={storyboard.id} className="relative">
                                              <img 
                                                src={storyboard.imageUrl} 
                                                alt={storyboard.description || 'Storyboard'}
                                                className="w-full h-24 object-cover rounded border"
                                              />
                                              <button
                                                className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                                              >
                                                <X className="w-3 h-3" />
                                              </button>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                      
                                      <div className="space-y-2">
                                        <button
                                          onClick={() => handleOpenDrawer(shot.id, scene.id, 'storyboard')}
                                          className="w-full border-2 border-dashed border-gray-300 rounded-lg p-3 text-center hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
                                        >
                                          <Palette className="w-5 h-5 text-gray-400 mx-auto mb-1" />
                                          <p className="text-sm text-gray-600">Draw Storyboard</p>
                                          <p className="text-xs text-gray-400">Use Apple Pencil or mouse</p>
                                        </button>
                                        <button
                                          className="w-full border-2 border-dashed border-gray-300 rounded-lg p-3 text-center hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
                                        >
                                          <ImageIcon className="w-5 h-5 text-gray-400 mx-auto mb-1" />
                                          <p className="text-sm text-gray-600">Upload Image</p>
                                          <p className="text-xs text-gray-400">Choose from device</p>
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                  
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                      Inspiration Images
                                    </label>
                                    <div className="space-y-2">
                                      {shot.inspirationImages.length > 0 && (
                                        <div className="grid grid-cols-2 gap-2">
                                          {shot.inspirationImages.map((imageUrl, index) => (
                                            <div key={index} className="relative">
                                              <img 
                                                src={imageUrl} 
                                                alt={`Inspiration ${index + 1}`}
                                                className="w-full h-24 object-cover rounded border"
                                              />
                                              <button
                                                className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                                              >
                                                <X className="w-3 h-3" />
                                              </button>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                      
                                      <button
                                        className="w-full border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
                                      >
                                        <ImageIcon className="w-6 h-6 text-gray-400 mx-auto mb-2" />
                                        <p className="text-sm text-gray-600">Upload Image</p>
                                        <p className="text-xs text-gray-400">Choose from device</p>
                                      </button>
                                    </div>
                                  </div>
                                </div>
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

                {/* Empty State */}
                {(selectedEpisode.scenes || []).length === 0 && (
                  <div className="text-center py-12">
                    <div className="text-gray-400 mb-4">
                      <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No scenes yet</h3>
                    <p className="text-gray-500 mb-4">Start building your episode by adding your first scene.</p>
                    <button
                      onClick={handleAddScene}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add SCENE_01
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
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
      </ProtectedRoute>
    );
  }

  return null;
}
