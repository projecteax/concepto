'use client';

import { useState } from 'react';
import { Episode, EpisodeScene, SceneShot } from '@/types';
import { Plus, Camera, Palette, X } from 'lucide-react';

export default function TestScenesPage() {
  const [episode, setEpisode] = useState<Episode>({
    id: 'test-episode',
    showId: 'test-show',
    title: 'Test Episode',
    episodeNumber: 1,
    description: 'A test episode for debugging',
    script: '',
    characters: [],
    locations: [],
    scenes: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const handleAddScene = () => {
    const currentScenes = episode.scenes || [];
    const sceneNumber = currentScenes.length + 1;
    const newScene: EpisodeScene = {
      id: `scene-${Date.now()}`,
      sceneNumber: sceneNumber,
      title: `SCENE_${sceneNumber.toString().padStart(2, '0')}`,
      description: '',
      script: '',
      characters: [],
      sceneCharacters: [],
      gadgets: [],
      shots: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    setEpisode({
      ...episode,
      scenes: [...currentScenes, newScene],
    });
  };

  const handleAddShot = (sceneId: string) => {
    const currentScenes = episode.scenes || [];
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
    
    setEpisode({
      ...episode,
      scenes: updatedScenes,
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Scene Test Page</h1>
        
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Scenes</h2>
            <button
              onClick={handleAddScene}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>Add Scene</span>
            </button>
          </div>

          <div className="space-y-6">
            {(episode.scenes || []).map((scene) => (
              <div key={scene.id} className="border border-gray-200 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-sm font-medium font-mono">
                      SCENE_{scene.sceneNumber.toString().padStart(2, '0')}
                    </div>
                    <h3 className="text-lg font-medium text-gray-900">{scene.title}</h3>
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
                                  const currentScenes = episode.scenes || [];
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
                                  
                                  setEpisode({
                                    ...episode,
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
                                  
                                  <button
                                    className="w-full border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
                                  >
                                    <Palette className="w-6 h-6 text-gray-400 mx-auto mb-2" />
                                    <p className="text-sm text-gray-600">Draw Storyboard</p>
                                    <p className="text-xs text-gray-400">Use Apple Pencil or mouse</p>
                                  </button>
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
                                    <Palette className="w-6 h-6 text-gray-400 mx-auto mb-2" />
                                    <p className="text-sm text-gray-600">Draw Inspiration</p>
                                    <p className="text-xs text-gray-400">Use Apple Pencil or mouse</p>
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
            {(episode.scenes || []).length === 0 && (
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

        {/* Debug Info */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Debug Info</h3>
          <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">
            {JSON.stringify(episode, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
