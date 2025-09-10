'use client';

import { useState } from 'react';
import { Show, Episode, EpisodeCharacter, EpisodeLocation, GlobalAsset, EpisodeScene, SceneCharacter, SceneGadget } from '@/types';
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
  Image as ImageIcon,
  Video,
  Settings,
  Eye
} from 'lucide-react';
import { cn } from '@/lib/utils';

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

export function EpisodeDetail({
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
  const [activeTab, setActiveTab] = useState<'overview' | 'scenes' | 'characters' | 'locations'>('overview');
  const [isEditing, setIsEditing] = useState(false);
  const [selectedScene, setSelectedScene] = useState<EpisodeScene | null>(null);
  
  // Form states
  const [title, setTitle] = useState(episode.title);
  const [description, setDescription] = useState(episode.description || '');
  const [script, setScript] = useState(episode.script || '');
  
  // Scene management
  const [showAddScene, setShowAddScene] = useState(false);
  const [newSceneTitle, setNewSceneTitle] = useState('');
  const [newSceneDescription, setNewSceneDescription] = useState('');
  const [newSceneScript, setNewSceneScript] = useState('');
  
  // Character assignment
  const [showAddCharacter, setShowAddCharacter] = useState(false);
  
  // Location assignment
  const [showAddLocation, setShowAddLocation] = useState(false);

  const characters = globalAssets.filter(asset => asset.category === 'character');
  const locations = globalAssets.filter(asset => asset.category === 'location');
  const gadgets = globalAssets.filter(asset => asset.category === 'gadget');

  const handleSave = () => {
    const updatedEpisode: Episode = {
      ...episode,
      title,
      description: description || undefined,
      script: script || undefined,
    };
    onSave(updatedEpisode);
    setIsEditing(false);
  };

  const handleAddScene = () => {
    if (newSceneTitle.trim()) {
      const newScene: EpisodeScene = {
        id: `scene-${Date.now()}`,
        sceneNumber: episode.scenes.length + 1,
        title: newSceneTitle.trim(),
        description: newSceneDescription.trim() || undefined,
        script: newSceneScript.trim() || undefined,
        characters: [],
        gadgets: [],
        storyboards: [],
        inspirationImages: [],
        cameraShots: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      const updatedEpisode: Episode = {
        ...episode,
        scenes: [...episode.scenes, newScene],
      };
      onSave(updatedEpisode);
      setNewSceneTitle('');
      setNewSceneDescription('');
      setNewSceneScript('');
      setShowAddScene(false);
    }
  };

  const handleDeleteScene = (sceneId: string) => {
    const updatedEpisode: Episode = {
      ...episode,
      scenes: episode.scenes.filter(scene => scene.id !== sceneId),
    };
    onSave(updatedEpisode);
    if (selectedScene?.id === sceneId) {
      setSelectedScene(null);
    }
  };


  const handleAddCharacterToScene = (sceneId: string, characterId: string, role: string) => {
    const character = characters.find(c => c.id === characterId);
    if (!character) return;

    const sceneCharacter: SceneCharacter = {
      characterId: character.id,
      characterName: character.name,
      role: role.trim() || undefined,
      isPresent: true,
    };

    const updatedScenes = episode.scenes.map(scene => {
      if (scene.id === sceneId) {
        return {
          ...scene,
          characters: [...scene.characters, sceneCharacter],
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
    const gadget = gadgets.find(g => g.id === gadgetId);
    if (!gadget) return;

    const sceneGadget: SceneGadget = {
      gadgetId: gadget.id,
      gadgetName: gadget.name,
      description: gadget.description,
    };

    const updatedScenes = episode.scenes.map(scene => {
      if (scene.id === sceneId) {
        return {
          ...scene,
          gadgets: [...scene.gadgets, sceneGadget],
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
    const location = locations.find(l => l.id === locationId);
    if (!location) return;

    const updatedScenes = episode.scenes.map(scene => {
      if (scene.id === sceneId) {
        return {
          ...scene,
          locationId: location.id,
          locationName: location.name,
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

  const tabs = [
    { id: 'overview', label: 'Overview', icon: FileText },
    { id: 'scenes', label: 'Scenes', icon: Video },
    { id: 'characters', label: 'Characters', icon: Users },
    { id: 'locations', label: 'Locations', icon: MapPin },
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
                <h1 className="text-xl font-semibold text-gray-900">
                  {isEditing ? (
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="bg-transparent border-none outline-none text-xl font-semibold"
                    />
                  ) : (
                    episode.title
                  )}
                </h1>
                <p className="text-sm text-gray-500">{show.name} • Episode {episode.episodeNumber}</p>
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
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Save
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  <Edit3 className="w-4 h-4 mr-2" />
                  Edit
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tabs */}
        <div className="border-b border-gray-200 mb-8">
          <nav className="-mb-px flex space-x-8">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as 'overview' | 'scenes' | 'characters' | 'locations')}
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
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {isEditing ? (
              <div className="bg-white rounded-lg shadow p-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Description
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Enter episode description..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                      rows={4}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Script
                    </label>
                    <textarea
                      value={script}
                      onChange={(e) => setScript(e.target.value)}
                      placeholder="Enter episode script..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                      rows={10}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {episode.description && (
                  <div className="bg-white rounded-lg shadow p-6">
                    <h3 className="text-lg font-medium text-gray-900 mb-3">Description</h3>
                    <p className="text-gray-700 whitespace-pre-wrap">{episode.description}</p>
                  </div>
                )}
                {episode.script && (
                  <div className="bg-white rounded-lg shadow p-6">
                    <h3 className="text-lg font-medium text-gray-900 mb-3">Script</h3>
                    <pre className="text-gray-700 whitespace-pre-wrap font-mono text-sm">{episode.script}</pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'scenes' && (
          <div className="space-y-6">
            {/* Add Scene Button */}
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-medium text-gray-900">Scenes</h2>
              <button
                onClick={() => setShowAddScene(true)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Scene
              </button>
            </div>

            {/* Scenes List */}
            <div className="grid gap-4">
              {episode.scenes.map((scene) => (
                <div key={scene.id} className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-medium text-gray-900">
                        Scene {scene.sceneNumber}: {scene.title}
                      </h3>
                      {scene.description && (
                        <p className="text-gray-600 mt-1">{scene.description}</p>
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setSelectedScene(scene)}
                        className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteScene(scene.id)}
                        className="p-2 text-red-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Scene Details */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Location */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">Location</label>
                      {scene.locationName ? (
                        <div className="flex items-center space-x-2">
                          <MapPin className="w-4 h-4 text-gray-400" />
                          <span className="text-sm text-gray-900">{scene.locationName}</span>
                        </div>
                      ) : (
                        <select
                          onChange={(e) => handleAssignLocationToScene(scene.id, e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                          defaultValue=""
                        >
                          <option value="">Select location...</option>
                          {locations.map((location) => (
                            <option key={location.id} value={location.id}>
                              {location.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {/* Characters */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">Characters</label>
                      <div className="space-y-1">
                        {scene.characters.map((char) => (
                          <div key={char.characterId} className="flex items-center space-x-2">
                            <Users className="w-4 h-4 text-gray-400" />
                            <span className="text-sm text-gray-900">{char.characterName}</span>
                            {char.role && (
                              <span className="text-xs text-gray-500">({char.role})</span>
                            )}
                          </div>
                        ))}
                        <select
                          onChange={(e) => {
                            if (e.target.value) {
                              handleAddCharacterToScene(scene.id, e.target.value, '');
                            }
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                          defaultValue=""
                        >
                          <option value="">Add character...</option>
                          {characters
                            .filter(char => !scene.characters.some(sc => sc.characterId === char.id))
                            .map((character) => (
                              <option key={character.id} value={character.id}>
                                {character.name}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>

                    {/* Gadgets */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">Gadgets</label>
                      <div className="space-y-1">
                        {scene.gadgets.map((gadget) => (
                          <div key={gadget.gadgetId} className="flex items-center space-x-2">
                            <Settings className="w-4 h-4 text-gray-400" />
                            <span className="text-sm text-gray-900">{gadget.gadgetName}</span>
                          </div>
                        ))}
                        <select
                          onChange={(e) => {
                            if (e.target.value) {
                              handleAddGadgetToScene(scene.id, e.target.value);
                            }
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                          defaultValue=""
                        >
                          <option value="">Add gadget...</option>
                          {gadgets
                            .filter(gadget => !scene.gadgets.some(sg => sg.gadgetId === gadget.id))
                            .map((gadget) => (
                              <option key={gadget.id} value={gadget.id}>
                                {gadget.name}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Storyboards and Inspiration Images */}
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Storyboards</label>
                      <div className="flex space-x-2">
                        {scene.storyboards.map((storyboard) => (
                          <div key={storyboard.id} className="relative">
                            <img
                              src={storyboard.imageUrl}
                              alt={`Storyboard ${storyboard.shotNumber}`}
                              className="w-16 h-12 object-cover rounded border"
                            />
                            <span className="absolute -top-1 -right-1 bg-indigo-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                              {storyboard.shotNumber}
                            </span>
                          </div>
                        ))}
                        <button className="w-16 h-12 border-2 border-dashed border-gray-300 rounded flex items-center justify-center text-gray-400 hover:border-gray-400 transition-colors">
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Inspiration Images</label>
                      <div className="flex space-x-2">
                        {scene.inspirationImages.map((imageUrl, index) => (
                          <img
                            key={index}
                            src={imageUrl}
                            alt={`Inspiration ${index + 1}`}
                            className="w-16 h-12 object-cover rounded border"
                          />
                        ))}
                        <button className="w-16 h-12 border-2 border-dashed border-gray-300 rounded flex items-center justify-center text-gray-400 hover:border-gray-400 transition-colors">
                          <ImageIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

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
                          placeholder="Enter scene title..."
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
                    <div className="flex space-x-3 mt-6">
                      <button
                        onClick={handleAddScene}
                        disabled={!newSceneTitle.trim()}
                        className={cn(
                          "flex-1 px-4 py-2 rounded-lg font-medium transition-colors",
                          newSceneTitle.trim()
                            ? "bg-indigo-600 text-white hover:bg-indigo-700"
                            : "bg-gray-100 text-gray-400 cursor-not-allowed"
                        )}
                      >
                        Add Scene
                      </button>
                      <button
                        onClick={() => setShowAddScene(false)}
                        className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Characters and Locations tabs remain the same for now */}
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
      </div>
    </div>
  );
}