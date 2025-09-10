'use client';

import { useState } from 'react';
import { Show, Episode, EpisodeCharacter, EpisodeLocation, GlobalAsset, EpisodeScene, SceneCharacter, SceneGadget, Character, SceneShot } from '@/types';
import { 
  ArrowLeft, 
  Save, 
  Edit3,
  Trash2,
  Users,
  MapPin,
  FileText,
  UserPlus,
  MapPinPlus,
  Plus,
  Wrench,
  Image as ImageIcon,
  Video,
  Settings,
  Eye,
  X,
  Camera,
  Palette
} from 'lucide-react';
import { cn } from '@/lib/utils';
import StoryboardDrawer from './StoryboardDrawer';

interface EpisodeDetailProps {
  show: Show;
  episode: Episode;
  globalAssets: GlobalAsset[];
  onBack: () => void;
  onSave: (episode: Episode) => void;
  onAddCharacter: (character: EpisodeCharacter) => void;
  onRemoveCharacter: (characterId: string) => void;
  onAddLocation: (location: EpisodeLocation) => void;
  onRemoveLocation: (locationId: string) => void;
}

export default function EpisodeDetail({
  show,
  episode,
  globalAssets,
  onBack,
  onSave,
  onAddCharacter,
  onRemoveCharacter,
  onAddLocation,
  onRemoveLocation
}: EpisodeDetailProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'script' | 'characters' | 'locations' | 'gadgets'>('overview');
  const [isEditing, setIsEditing] = useState(false);
  const [selectedScene, setSelectedScene] = useState<EpisodeScene | null>(null);
  
  // Form states
  const [title, setTitle] = useState(episode.title);
  const [description, setDescription] = useState(episode.description || '');
  const [script, setScript] = useState(episode.script || '');
  
  // Scene states
  const [showAddScene, setShowAddScene] = useState(false);
  const [newSceneTitle, setNewSceneTitle] = useState('');
  const [newSceneDescription, setNewSceneDescription] = useState('');
  const [newSceneScript, setNewSceneScript] = useState('');
  
  // Character and Location states
  const [showAddCharacter, setShowAddCharacter] = useState(false);
  const [showAddLocation, setShowAddLocation] = useState(false);
  
  // Drawing states
  const [showDrawer, setShowDrawer] = useState(false);
  const [drawingContext, setDrawingContext] = useState<{
    shotId: string;
    sceneId: string;
    type: 'storyboard' | 'inspiration';
  } | null>(null);

  const handleSave = () => {
    const updatedEpisode: Episode = {
      ...episode,
      title: title.trim(),
      description: description.trim() || undefined,
      script: script.trim() || undefined,
      updatedAt: new Date(),
    };
    onSave(updatedEpisode);
    setIsEditing(false);
  };

  const handleAddScene = () => {
    if (newSceneTitle.trim()) {
      const currentScenes = episode.scenes || [];
      const sceneNumber = currentScenes.length + 1;
      const newScene: EpisodeScene = {
        id: `scene-${Date.now()}`,
        sceneNumber: sceneNumber,
        title: newSceneTitle.trim() || `SCENE_${sceneNumber.toString().padStart(2, '0')}`,
        description: newSceneDescription.trim() || undefined,
        script: newSceneScript.trim() || undefined,
        characters: [],
        gadgets: [],
        shots: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      const updatedEpisode: Episode = {
        ...episode,
        scenes: [...currentScenes, newScene],
      };
      onSave(updatedEpisode);
      setNewSceneTitle('');
      setNewSceneDescription('');
      setNewSceneScript('');
      setShowAddScene(false);
    }
  };

  const handleDeleteScene = (sceneId: string) => {
    const currentScenes = episode.scenes || [];
    const updatedScenes = currentScenes
      .filter(scene => scene.id !== sceneId)
      .map((scene, index) => ({
        ...scene,
        sceneNumber: index + 1,
        updatedAt: new Date(),
      }));
    
    const updatedEpisode: Episode = {
      ...episode,
      scenes: updatedScenes,
    };
    onSave(updatedEpisode);
  };

  const handleAddCharacterToScene = (sceneId: string, characterId: string) => {
    if (!characterId) return;
    
    const character = episode.characters.find(c => c.characterId === characterId);
    if (!character) return;
    
    const currentScenes = episode.scenes || [];
    const updatedScenes = currentScenes.map(scene => {
      if (scene.id === sceneId) {
        const newSceneCharacter: SceneCharacter = {
          characterId: character.characterId,
          characterName: character.characterName,
          role: character.role,
          isPresent: true,
        };
        return {
          ...scene,
          characters: [...scene.characters, newSceneCharacter],
          updatedAt: new Date(),
        };
      }
      return scene;
    });
    
    const updatedEpisode: Episode = {
      ...episode,
      scenes: updatedScenes,
    };
    onSave(updatedEpisode);
  };

  const handleRemoveCharacterFromScene = (sceneId: string, characterId: string) => {
    const currentScenes = episode.scenes || [];
    const updatedScenes = currentScenes.map(scene => {
      if (scene.id === sceneId) {
        return {
          ...scene,
          characters: scene.characters.filter(char => char.characterId !== characterId),
          updatedAt: new Date(),
        };
      }
      return scene;
    });
    
    const updatedEpisode: Episode = {
      ...episode,
      scenes: updatedScenes,
    };
    onSave(updatedEpisode);
  };

  const handleAddGadgetToScene = (sceneId: string, gadgetId: string) => {
    if (!gadgetId) return;
    
    const gadget = globalAssets.find(asset => asset.id === gadgetId && asset.category === 'gadget');
    if (!gadget) return;
    
    const currentScenes = episode.scenes || [];
    const updatedScenes = currentScenes.map(scene => {
      if (scene.id === sceneId) {
        const newSceneGadget: SceneGadget = {
          gadgetId: gadget.id,
          gadgetName: gadget.name,
          description: gadget.description,
        };
        return {
          ...scene,
          gadgets: [...scene.gadgets, newSceneGadget],
          updatedAt: new Date(),
        };
      }
      return scene;
    });
    
    const updatedEpisode: Episode = {
      ...episode,
      scenes: updatedScenes,
    };
    onSave(updatedEpisode);
  };

  const handleRemoveGadgetFromScene = (sceneId: string, gadgetId: string) => {
    const currentScenes = episode.scenes || [];
    const updatedScenes = currentScenes.map(scene => {
      if (scene.id === sceneId) {
        return {
          ...scene,
          gadgets: scene.gadgets.filter(gadget => gadget.gadgetId !== gadgetId),
          updatedAt: new Date(),
        };
      }
      return scene;
    });
    
    const updatedEpisode: Episode = {
      ...episode,
      scenes: updatedScenes,
    };
    onSave(updatedEpisode);
  };

  const handleAssignLocationToScene = (sceneId: string, locationId: string) => {
    const location = episode.locations.find(l => l.locationId === locationId);
    if (!location) return;
    
    const currentScenes = episode.scenes || [];
    const updatedScenes = currentScenes.map(scene => {
      if (scene.id === sceneId) {
        return {
          ...scene,
          locationId: location.locationId,
          locationName: location.locationName,
          updatedAt: new Date(),
        };
      }
      return scene;
    });
    
    const updatedEpisode: Episode = {
      ...episode,
      scenes: updatedScenes,
    };
    onSave(updatedEpisode);
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
          description: undefined,
          storyboards: [],
          inspirationImages: [],
          cameraShot: {
            id: `camera-${Date.now()}`,
            shotType: 'MEDIUM',
            description: undefined,
            cameraMovement: 'STATIC',
            duration: undefined,
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
    
    const updatedEpisode: Episode = {
      ...episode,
      scenes: updatedScenes,
    };
    onSave(updatedEpisode);
  };

  const handleOpenDrawer = (shotId: string, sceneId: string, type: 'storyboard' | 'inspiration') => {
    setDrawingContext({ shotId, sceneId, type });
    setShowDrawer(true);
  };

  const handleSaveDrawing = (imageData: string) => {
    if (!drawingContext) return;

    const currentScenes = episode.scenes || [];
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

    const updatedEpisode: Episode = {
      ...episode,
      scenes: updatedScenes,
    };
    onSave(updatedEpisode);
    setShowDrawer(false);
    setDrawingContext(null);
  };

  const handleCloseDrawer = () => {
    setShowDrawer(false);
    setDrawingContext(null);
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: FileText },
    { id: 'script', label: 'Script', icon: FileText },
    { id: 'characters', label: 'Characters', icon: Users },
    { id: 'locations', label: 'Locations', icon: MapPin },
    { id: 'gadgets', label: 'Special Gadgets', icon: Wrench },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={onBack}
                className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">{episode.title}</h1>
                <p className="text-sm text-gray-500">Episode {episode.episodeNumber} • {show.name}</p>
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
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center space-x-2"
                  >
                    <Save className="w-4 h-4" />
                    <span>Save</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center space-x-2"
                >
                  <Edit3 className="w-4 h-4" />
                  <span>Edit</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                  <button
                    key={tab.id}
                  onClick={() => setActiveTab(tab.id as 'overview' | 'script' | 'characters' | 'locations' | 'gadgets')}
                    className={cn(
                    "flex items-center space-x-2 py-2 px-1 border-b-2 font-medium text-sm transition-colors",
                      activeTab === tab.id
                      ? "border-indigo-500 text-indigo-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                  </button>
              );
            })}
          </nav>
          </div>

        {/* Tab Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Episode Description */}
                  <div className="bg-white rounded-lg shadow p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-medium text-gray-900">Episode Description</h3>
                      <button
                        onClick={() => setIsEditing(!isEditing)}
                        className="flex items-center space-x-2 text-indigo-600 hover:text-indigo-700"
                      >
                        <Edit3 className="w-4 h-4" />
                        <span>{isEditing ? 'Cancel' : 'Edit'}</span>
                      </button>
                  </div>
                    {isEditing ? (
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                        placeholder="Enter episode description..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                      rows={4}
                    />
                    ) : (
                      <p className="text-gray-700 whitespace-pre-wrap">
                        {episode.description || 'No description available. Click Edit to add one.'}
                      </p>
                    )}
                  </div>

                  {/* Characters */}
                  <div className="bg-white rounded-lg shadow p-6">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Characters</h3>
                    {episode.characters.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {episode.characters.map((char) => {
                          const characterAsset = globalAssets.find(asset => 
                            asset.category === 'character' && asset.id === char.characterId
                          ) as Character | undefined;
                          return (
                            <div key={char.characterId} className="border border-gray-200 rounded-lg p-4">
                              <div className="flex items-center space-x-3">
                                {characterAsset?.mainImage ? (
                                  <img 
                                    src={characterAsset.mainImage} 
                                    alt={char.characterName}
                                    className="w-12 h-12 rounded-full object-cover"
                                  />
                                ) : (
                                  <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
                                    <Users className="w-6 h-6 text-gray-400" />
                      </div>
                                )}
                                <div>
                                  <h4 className="font-medium text-gray-900">{char.characterName}</h4>
                                  <p className="text-sm text-gray-500 capitalize">{char.type}</p>
                                  {char.role && <p className="text-sm text-gray-600">{char.role}</p>}
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

                  {/* Locations */}
                  <div className="bg-white rounded-lg shadow p-6">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Locations</h3>
                    {episode.locations.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {episode.locations.map((location) => {
                          return (
                            <div key={location.locationId} className="border border-gray-200 rounded-lg p-4">
                              <div className="flex items-center space-x-3">
                                <div className="w-12 h-12 rounded-lg bg-gray-200 flex items-center justify-center">
                                  <MapPin className="w-6 h-6 text-gray-400" />
                      </div>
                                <div>
                                  <h4 className="font-medium text-gray-900">{location.locationName}</h4>
                                  {location.description && (
                                    <p className="text-sm text-gray-600">{location.description}</p>
                                  )}
                      </div>
                    </div>
                  </div>
                          );
                        })}
                </div>
                    ) : (
                      <p className="text-gray-500">No locations assigned to this episode.</p>
                    )}
                  </div>

                  {/* Special Gadgets */}
                  <div className="bg-white rounded-lg shadow p-6">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Special Gadgets</h3>
                    <p className="text-gray-500">Gadgets will be shown here when assigned to scenes.</p>
                    </div>
                  </div>
              )}

        {activeTab === 'script' && (
          <div className="space-y-6">
            {/* Episode Description */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Episode Description</h3>
                <button
                  onClick={() => setIsEditing(!isEditing)}
                  className="flex items-center space-x-2 text-indigo-600 hover:text-indigo-700"
                >
                        <Edit3 className="w-4 h-4" />
                  <span>{isEditing ? 'Cancel' : 'Edit'}</span>
                </button>
                      </div>
              {isEditing ? (
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Enter episode description..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                  rows={4}
                />
              ) : (
                <p className="text-gray-700 whitespace-pre-wrap">
                  {episode.description || 'No description available. Click Edit to add one.'}
                </p>
                  )}
                </div>

            {/* Scene-by-Scene Script */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-medium text-gray-900">Scene-by-Scene Script</h3>
                    <button
                  onClick={() => setShowAddScene(true)}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center space-x-2"
                    >
                  <Plus className="w-4 h-4" />
                  <span>Add Scene</span>
                    </button>
                  </div>

              <div className="space-y-6">
                {(episode.scenes || []).map((scene, index) => (
                  <div key={scene.id} className="border border-gray-200 rounded-lg p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <div className="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-sm font-medium font-mono">
                          SCENE_{scene.sceneNumber.toString().padStart(2, '0')}
                            </div>
                        <h3 className="text-lg font-medium text-gray-900">{scene.title}</h3>
                          </div>
                      <div className="flex items-center space-x-2">
                          <button
                          onClick={() => {
                            // Insert new scene after current one
                            const newScene: EpisodeScene = {
                              id: `scene-${Date.now()}`,
                              sceneNumber: scene.sceneNumber + 1,
                              title: `SCENE_${(scene.sceneNumber + 1).toString().padStart(2, '0')}`,
                              description: undefined,
                              script: undefined,
                              characters: [],
                              gadgets: [],
                              shots: [],
                              createdAt: new Date(),
                              updatedAt: new Date(),
                            };
                            
                            const currentScenes = episode.scenes || [];
                            const updatedScenes = [
                              ...currentScenes.slice(0, index + 1),
                              newScene,
                              ...currentScenes.slice(index + 1).map(s => ({
                                ...s,
                                sceneNumber: s.sceneNumber + 1,
                                updatedAt: new Date(),
                              }))
                            ];
                            
                            const updatedEpisode: Episode = {
                              ...episode,
                              scenes: updatedScenes,
                            };
                            onSave(updatedEpisode);
                          }}
                          className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                          title="Insert scene after this one"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteScene(scene.id)}
                          className="p-2 text-red-400 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                    {/* Scene Title */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Scene Title
                      </label>
                      <input
                        type="text"
                        value={scene.title}
                        onChange={(e) => {
                          const updatedScenes = (episode.scenes || []).map(s => 
                            s.id === scene.id ? { ...s, title: e.target.value, updatedAt: new Date() } : s
                          );
                          const updatedEpisode: Episode = { ...episode, scenes: updatedScenes };
                          onSave(updatedEpisode);
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                      </div>

                    {/* Scene Description */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Scene Description
                      </label>
                      <textarea
                        value={scene.description || ''}
                        onChange={(e) => {
                          const updatedScenes = (episode.scenes || []).map(s => 
                            s.id === scene.id ? { ...s, description: e.target.value, updatedAt: new Date() } : s
                          );
                          const updatedEpisode: Episode = { ...episode, scenes: updatedScenes };
                          onSave(updatedEpisode);
                        }}
                        placeholder="Enter scene description..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                        rows={3}
                      />
                    </div>

                    {/* Scene Script */}
                    <div className="mb-6">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Scene Script
                      </label>
                      <div className="border border-gray-300 rounded-lg overflow-hidden">
                        {/* Scene Header */}
                        <div className="bg-gray-50 px-4 py-2 border-b border-gray-300">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-4">
                              <span className="font-mono text-sm font-medium text-gray-700">
                                SCENE_{scene.sceneNumber.toString().padStart(2, '0')}
                              </span>
                              {scene.locationName && (
                                <span className="text-sm text-gray-600">
                                  <MapPin className="w-3 h-3 inline mr-1" />
                                  {scene.locationName}
                                </span>
                              )}
                              {scene.characters.length > 0 && (
                                <span className="text-sm text-gray-600">
                                  <Users className="w-3 h-3 inline mr-1" />
                                  {scene.characters.map(c => c.characterName).join(', ')}
                                </span>
                    )}
                  </div>
                            <div className="text-xs text-gray-500">
                              {scene.title}
                </div>
                          </div>
                        </div>
                        {/* Script Content */}
                        <textarea
                          value={scene.script || ''}
                          onChange={(e) => {
                            const updatedScenes = (episode.scenes || []).map(s => 
                              s.id === scene.id ? { ...s, script: e.target.value, updatedAt: new Date() } : s
                            );
                            const updatedEpisode: Episode = { ...episode, scenes: updatedScenes };
                            onSave(updatedEpisode);
                          }}
                          placeholder={`SCENE_${scene.sceneNumber.toString().padStart(2, '0')}\n\nFADE IN:\n\nINT. ${scene.locationName || 'LOCATION'} - DAY\n\n[Enter your script here...]`}
                          className="w-full px-4 py-3 border-none focus:ring-0 focus:outline-none resize-none font-mono text-sm bg-white"
                          rows={8}
                        />
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
                          <button
                                  onClick={() => {
                                    // Remove shot logic here
                                    const currentScenes = episode.scenes || [];
                                    const updatedScenes = currentScenes.map(s => {
                                      if (s.id === scene.id) {
                                        return {
                                          ...s,
                                          shots: s.shots.filter(sh => sh.id !== shot.id),
                                          updatedAt: new Date(),
                                        };
                                      }
                                      return s;
                                    });
                                    
                                    const updatedEpisode: Episode = {
                                      ...episode,
                                      scenes: updatedScenes,
                                    };
                                    onSave(updatedEpisode);
                                  }}
                                  className="p-1 text-red-400 hover:text-red-600 transition-colors"
                                >
                                  <X className="w-3 h-3" />
                          </button>
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
                                      
                                      const updatedEpisode: Episode = {
                                        ...episode,
                                        scenes: updatedScenes,
                                      };
                                      onSave(updatedEpisode);
                                    }}
                                    placeholder="Describe what happens in this shot..."
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none text-sm"
                                    rows={2}
                                  />
                      </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                      Camera Shot Type
                                    </label>
                                    <select
                                      value={shot.cameraShot.shotType}
                                      onChange={(e) => {
                                        const currentScenes = episode.scenes || [];
                                        const updatedScenes = currentScenes.map(s => {
                                          if (s.id === scene.id) {
                                            return {
                                              ...s,
                                              shots: s.shots.map(sh => 
                                                sh.id === shot.id 
                                                  ? { 
                                                      ...sh, 
                                                      cameraShot: { 
                                                        ...sh.cameraShot, 
                                                        shotType: e.target.value as 'WIDE' | 'MEDIUM' | 'CLOSE_UP' | 'EXTREME_CLOSE_UP' | 'OVER_THE_SHOULDER' | 'POV' | 'ESTABLISHING' | 'CUSTOM',
                                                        updatedAt: new Date()
                                                      },
                                                      updatedAt: new Date()
                                                    }
                                                  : sh
                                              ),
                                              updatedAt: new Date(),
                                            };
                                          }
                                          return s;
                                        });
                                        
                                        const updatedEpisode: Episode = {
                                          ...episode,
                                          scenes: updatedScenes,
                                        };
                                        onSave(updatedEpisode);
                                      }}
                                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
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
                      </div>
                                  
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                      Camera Movement
                                    </label>
                                    <select
                                      value={shot.cameraShot.cameraMovement || 'STATIC'}
                                      onChange={(e) => {
                                        const currentScenes = episode.scenes || [];
                                        const updatedScenes = currentScenes.map(s => {
                                          if (s.id === scene.id) {
                                            return {
                                              ...s,
                                              shots: s.shots.map(sh => 
                                                sh.id === shot.id 
                                                  ? { 
                                                      ...sh, 
                                                      cameraShot: { 
                                                        ...sh.cameraShot, 
                                                        cameraMovement: e.target.value as 'STATIC' | 'PAN' | 'TILT' | 'DOLLY' | 'TRACK' | 'ZOOM' | 'CUSTOM',
                                                        updatedAt: new Date()
                                                      },
                                                      updatedAt: new Date()
                                                    }
                                                  : sh
                                              ),
                                              updatedAt: new Date(),
                                            };
                                          }
                                          return s;
                                        });
                                        
                                        const updatedEpisode: Episode = {
                                          ...episode,
                                          scenes: updatedScenes,
                                        };
                                        onSave(updatedEpisode);
                                      }}
                                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                                    >
                                      <option value="STATIC">Static</option>
                                      <option value="PAN">Pan</option>
                                      <option value="TILT">Tilt</option>
                                      <option value="DOLLY">Dolly</option>
                                      <option value="TRACK">Track</option>
                                      <option value="ZOOM">Zoom</option>
                                      <option value="CUSTOM">Custom</option>
                                    </select>
                  </div>
                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                      Storyboards
                                    </label>
                                    <div className="space-y-2">
                                      {/* Existing Storyboards */}
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
                                                onClick={() => {
                                                  // Remove storyboard logic here
                                                  const currentScenes = episode.scenes || [];
                                                  const updatedScenes = currentScenes.map(s => {
                                                    if (s.id === scene.id) {
                                                      return {
                                                        ...s,
                                                        shots: s.shots.map(sh => 
                                                          sh.id === shot.id 
                                                            ? { 
                                                                ...sh, 
                                                                storyboards: sh.storyboards.filter(sb => sb.id !== storyboard.id),
                                                                updatedAt: new Date()
                                                              }
                                                            : sh
                                                        ),
                                                        updatedAt: new Date(),
                                                      };
                                                    }
                                                    return s;
                                                  });
                                                  
                                                  const updatedEpisode: Episode = {
                                                    ...episode,
                                                    scenes: updatedScenes,
                                                  };
                                                  onSave(updatedEpisode);
                                                }}
                                                className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                                              >
                                                <X className="w-3 h-3" />
                                              </button>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                      
                                      {/* Add Storyboard Button */}
                                      <button
                                        onClick={() => handleOpenDrawer(shot.id, scene.id, 'storyboard')}
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
                                      {/* Existing Inspiration Images */}
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
                                                onClick={() => {
                                                  // Remove inspiration image logic here
                                                  const currentScenes = episode.scenes || [];
                                                  const updatedScenes = currentScenes.map(s => {
                                                    if (s.id === scene.id) {
                                                      return {
                                                        ...s,
                                                        shots: s.shots.map(sh => 
                                                          sh.id === shot.id 
                                                            ? { 
                                                                ...sh, 
                                                                inspirationImages: sh.inspirationImages.filter((_, i) => i !== index),
                                                                updatedAt: new Date()
                                                              }
                                                            : sh
                                                        ),
                                                        updatedAt: new Date(),
                                                      };
                                                    }
                                                    return s;
                                                  });
                                                  
                                                  const updatedEpisode: Episode = {
                                                    ...episode,
                                                    scenes: updatedScenes,
                                                  };
                                                  onSave(updatedEpisode);
                                                }}
                                                className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                                              >
                                                <X className="w-3 h-3" />
                                              </button>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                      
                                      {/* Add Inspiration Image Button */}
                                      <button
                                        onClick={() => handleOpenDrawer(shot.id, scene.id, 'inspiration')}
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

                    {/* Quick Asset Assignment */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-gray-200">
                      {/* Location */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                          Location
                  </label>
                  <select
                          value={scene.locationId || ''}
                          onChange={(e) => handleAssignLocationToScene(scene.id, e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        >
                          <option value="">Select Location</option>
                          {episode.locations.map((location) => (
                            <option key={location.locationId} value={location.locationId}>
                              {location.locationName}
                      </option>
                    ))}
                  </select>
                </div>

                      {/* Characters */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                          Characters
                  </label>
                        <select
                          value=""
                          onChange={(e) => handleAddCharacterToScene(scene.id, e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        >
                          <option value="">Add Character</option>
                          {episode.characters
                            .filter(char => !scene.characters.some(sceneChar => sceneChar.characterId === char.characterId))
                            .map((character) => (
                              <option key={character.characterId} value={character.characterId}>
                                {character.characterName}
                              </option>
                            ))}
                        </select>
                        <div className="mt-2 space-y-1">
                          {scene.characters.map((char) => (
                            <div key={char.characterId} className="flex items-center justify-between bg-gray-50 px-2 py-1 rounded">
                              <span className="text-sm text-gray-600">{char.characterName}</span>
                              <button
                                onClick={() => handleRemoveCharacterFromScene(scene.id, char.characterId)}
                                className="text-red-400 hover:text-red-600"
                              >
                                <X className="w-3 h-3" />
                              </button>
                  </div>
                          ))}
                </div>
                      </div>

                      {/* Gadgets */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                          Gadgets
                  </label>
                        <select
                          value=""
                          onChange={(e) => handleAddGadgetToScene(scene.id, e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        >
                          <option value="">Add Gadget</option>
                          {globalAssets
                            .filter(asset => asset.category === 'gadget')
                            .filter(gadget => !scene.gadgets.some(sceneGadget => sceneGadget.gadgetId === gadget.id))
                            .map((gadget) => (
                              <option key={gadget.id} value={gadget.id}>
                                {gadget.name}
                              </option>
                            ))}
                        </select>
                        <div className="mt-2 space-y-1">
                          {scene.gadgets.map((gadget) => (
                            <div key={gadget.gadgetId} className="flex items-center justify-between bg-gray-50 px-2 py-1 rounded">
                              <span className="text-sm text-gray-600">{gadget.gadgetName}</span>
                              <button
                                onClick={() => handleRemoveGadgetFromScene(scene.id, gadget.gadgetId)}
                                className="text-red-400 hover:text-red-600"
                              >
                                <X className="w-3 h-3" />
                              </button>
                </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Empty State */}
                {(episode.scenes || []).length === 0 && (
                  <div className="text-center py-12">
                    <Video className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No scenes yet</h3>
                    <p className="text-gray-500 mb-4">Start building your episode by adding your first scene.</p>
                  <button
                      onClick={() => setShowAddScene(true)}
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
        )}

        {activeTab === 'characters' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-medium text-gray-900">Episode Characters</h2>
              <button
                onClick={() => setShowAddCharacter(true)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                    Add Character
                  </button>
            </div>

            <div className="grid gap-4">
              {episode.characters.map((character) => (
                <div key={character.characterId} className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center justify-between">
                <div>
                      <h3 className="text-lg font-medium text-gray-900">{character.characterName}</h3>
                      <p className="text-sm text-gray-500">
                        {character.type} • {character.role || 'No specific role'}
                      </p>
                    </div>
                  <button
                      onClick={() => onRemoveCharacter(character.characterId)}
                      className="p-2 text-red-400 hover:text-red-600 transition-colors"
                  >
                      <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'locations' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-medium text-gray-900">Episode Locations</h2>
                  <button
                onClick={() => setShowAddLocation(true)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <MapPinPlus className="w-4 h-4 mr-2" />
                    Add Location
                  </button>
            </div>

            <div className="grid gap-4">
              {episode.locations.map((location) => (
                <div key={location.locationId} className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-medium text-gray-900">{location.locationName}</h3>
                      {location.description && (
                        <p className="text-sm text-gray-500 mt-1">{location.description}</p>
                      )}
                    </div>
                  <button
                      onClick={() => onRemoveLocation(location.locationId)}
                      className="p-2 text-red-400 hover:text-red-600 transition-colors"
                  >
                      <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              ))}
            </div>
        </div>
      )}

        {activeTab === 'gadgets' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-medium text-gray-900">Special Gadgets</h2>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-gray-500">Gadgets will be managed within individual scenes in the Script tab.</p>
            </div>
          </div>
        )}

        {/* Add Scene Modal */}
        {showAddScene && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Add New Scene</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                          Scene Title
                  </label>
                        <input
                          type="text"
                          value={newSceneTitle}
                          onChange={(e) => setNewSceneTitle(e.target.value)}
                          placeholder={`SCENE_${((episode.scenes || []).length + 1).toString().padStart(2, '0')}`}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                          Description (Optional)
                  </label>
                  <textarea
                    value={newSceneDescription}
                    onChange={(e) => setNewSceneDescription(e.target.value)}
                    placeholder="Enter scene description..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                          Script (Optional)
                  </label>
                  <textarea
                    value={newSceneScript}
                    onChange={(e) => setNewSceneScript(e.target.value)}
                    placeholder="Enter scene script..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                    rows={4}
                  />
                </div>
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                  <button
                  onClick={() => {
                    setShowAddScene(false);
                    setNewSceneTitle('');
                    setNewSceneDescription('');
                    setNewSceneScript('');
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                  </button>
                  <button
                  onClick={handleAddScene}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                  Add Scene
                  </button>
              </div>
            </div>
          </div>
          </div>
        )}

        {/* Storyboard Drawer */}
        {showDrawer && drawingContext && (
          <StoryboardDrawer
            onSave={handleSaveDrawing}
            onClose={handleCloseDrawer}
            title={`Draw ${drawingContext.type === 'storyboard' ? 'Storyboard' : 'Inspiration Image'}`}
          />
        )}
        </div>
      </div>
    </div>
  );
}