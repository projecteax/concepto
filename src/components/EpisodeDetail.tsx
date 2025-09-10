'use client';

import { useState } from 'react';
import { Show, Episode, EpisodeCharacter, EpisodeLocation, GlobalAsset } from '@/types';
import { 
  ArrowLeft, 
  Save, 
  Plus, 
  Edit3,
  Trash2,
  Users,
  MapPin,
  FileText,
  Play,
  UserPlus,
  MapPinPlus
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
  const [activeTab, setActiveTab] = useState<'overview' | 'script' | 'characters' | 'locations'>('overview');
  const [isEditing, setIsEditing] = useState(false);
  
  // Form states
  const [title, setTitle] = useState(episode.title);
  const [description, setDescription] = useState(episode.description || '');
  const [script, setScript] = useState(episode.script || '');
  
  // Character assignment
  const [showAddCharacter, setShowAddCharacter] = useState(false);
  const [selectedCharacter, setSelectedCharacter] = useState('');
  const [characterType, setCharacterType] = useState<'recurring' | 'episodic'>('recurring');
  const [characterRole, setCharacterRole] = useState('');
  
  // Location assignment
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [locationDescription, setLocationDescription] = useState('');

  const availableCharacters = globalAssets.filter(asset => asset.category === 'character');
  const availableLocations = globalAssets.filter(asset => asset.category === 'location');

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

  const handleAddCharacter = () => {
    if (selectedCharacter) {
      const character = availableCharacters.find(c => c.id === selectedCharacter);
      if (character) {
        onAddCharacter({
          characterId: character.id,
          characterName: character.name,
          type: characterType,
          role: characterRole || undefined,
        });
        setSelectedCharacter('');
        setCharacterRole('');
        setShowAddCharacter(false);
      }
    }
  };

  const handleAddLocation = () => {
    if (selectedLocation) {
      const location = availableLocations.find(l => l.id === selectedLocation);
      if (location) {
        onAddLocation({
          locationId: location.id,
          locationName: location.name,
          description: locationDescription || undefined,
        });
        setSelectedLocation('');
        setLocationDescription('');
        setShowAddLocation(false);
      }
    }
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: '📋' },
    { id: 'script', label: 'Script', icon: '📝' },
    { id: 'characters', label: 'Characters', icon: '👥' },
    { id: 'locations', label: 'Locations', icon: '📍' },
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
                <h1 className="text-2xl font-bold text-gray-900">
                  Episode {episode.episodeNumber}: {title}
                </h1>
                <p className="text-sm text-gray-600">{show.name}</p>
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
                    className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <Save className="w-4 h-4" />
                    <span>Save</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  <Edit3 className="w-4 h-4" />
                  <span>Edit</span>
                </button>
              )}
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
                        ? "bg-green-100 text-green-700"
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
              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  <h3 className="text-xl font-semibold text-gray-900">Episode Overview</h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Episode Title
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      disabled={!isEditing}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:bg-gray-50"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Description
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Describe the episode's plot and key events..."
                      disabled={!isEditing}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none disabled:bg-gray-50"
                      rows={4}
                    />
                  </div>

                  {/* Episode Stats */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <Users className="w-5 h-5 text-green-600" />
                        <span className="font-medium text-gray-900">Characters</span>
                      </div>
                      <div className="text-2xl font-bold text-gray-900">{episode.characters.length}</div>
                      <div className="text-sm text-gray-600">
                        {episode.characters.filter(c => c.type === 'recurring').length} recurring, {' '}
                        {episode.characters.filter(c => c.type === 'episodic').length} episodic
                      </div>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <MapPin className="w-5 h-5 text-blue-600" />
                        <span className="font-medium text-gray-900">Locations</span>
                      </div>
                      <div className="text-2xl font-bold text-gray-900">{episode.locations.length}</div>
                      <div className="text-sm text-gray-600">Unique locations</div>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <FileText className="w-5 h-5 text-purple-600" />
                        <span className="font-medium text-gray-900">Script</span>
                      </div>
                      <div className="text-2xl font-bold text-gray-900">
                        {episode.script ? Math.ceil(episode.script.length / 1000) : 0}
                      </div>
                      <div className="text-sm text-gray-600">Pages (approx.)</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Script Tab */}
              {activeTab === 'script' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-semibold text-gray-900">Script</h3>
                    <div className="flex items-center space-x-2 text-sm text-gray-500">
                      <FileText className="w-4 h-4" />
                      <span>{script.length} characters</span>
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Script Content
                    </label>
                    <textarea
                      value={script}
                      onChange={(e) => setScript(e.target.value)}
                      placeholder="Write your episode script here...&#10;&#10;You can use standard script formatting:&#10;&#10;FADE IN:&#10;&#10;INT. LIVING ROOM - DAY&#10;&#10;CHARACTER NAME&#10;Dialogue goes here.&#10;&#10;(Action description)&#10;&#10;CHARACTER NAME&#10;More dialogue.&#10;&#10;FADE OUT."
                      disabled={!isEditing}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none font-mono text-sm disabled:bg-gray-50"
                      rows={20}
                    />
                  </div>

                  {!isEditing && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-center space-x-2 text-blue-800">
                        <Edit3 className="w-4 h-4" />
                        <span className="font-medium">Script Tips</span>
                      </div>
                      <ul className="mt-2 text-sm text-blue-700 space-y-1">
                        <li>• Use standard script formatting for better readability</li>
                        <li>• Include scene headings (INT./EXT. LOCATION - TIME)</li>
                        <li>• Write character names in CAPS for dialogue</li>
                        <li>• Use action descriptions in parentheses</li>
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Characters Tab */}
              {activeTab === 'characters' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-semibold text-gray-900">Characters</h3>
                    <button
                      onClick={() => setShowAddCharacter(true)}
                      className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    >
                      <UserPlus className="w-4 h-4" />
                      <span>Add Character</span>
                    </button>
                  </div>

                  <div className="space-y-4">
                    {episode.characters.map((character) => (
                      <div key={character.characterId} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-medium text-gray-900">{character.characterName}</h4>
                            <div className="flex items-center space-x-4 text-sm text-gray-600 mt-1">
                              <span className={cn(
                                "px-2 py-1 rounded-full text-xs",
                                character.type === 'recurring' 
                                  ? "bg-blue-100 text-blue-700" 
                                  : "bg-orange-100 text-orange-700"
                              )}>
                                {character.type}
                              </span>
                              {character.role && (
                                <span>Role: {character.role}</span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => onRemoveCharacter(character.characterId)}
                            className="p-1 text-gray-400 hover:text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}

                    {episode.characters.length === 0 && (
                      <div className="text-center py-8 text-gray-500">
                        <Users className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                        <p>No characters assigned to this episode yet.</p>
                        <p className="text-sm">Add characters from your global assets.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Locations Tab */}
              {activeTab === 'locations' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-semibold text-gray-900">Locations</h3>
                    <button
                      onClick={() => setShowAddLocation(true)}
                      className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    >
                      <MapPinPlus className="w-4 h-4" />
                      <span>Add Location</span>
                    </button>
                  </div>

                  <div className="space-y-4">
                    {episode.locations.map((location) => (
                      <div key={location.locationId} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-medium text-gray-900">{location.locationName}</h4>
                            {location.description && (
                              <p className="text-sm text-gray-600 mt-1">{location.description}</p>
                            )}
                          </div>
                          <button
                            onClick={() => onRemoveLocation(location.locationId)}
                            className="p-1 text-gray-400 hover:text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}

                    {episode.locations.length === 0 && (
                      <div className="text-center py-8 text-gray-500">
                        <MapPin className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                        <p>No locations assigned to this episode yet.</p>
                        <p className="text-sm">Add locations from your global assets.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Add Character Modal */}
      {showAddCharacter && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Character</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Character
                  </label>
                  <select
                    value={selectedCharacter}
                    onChange={(e) => setSelectedCharacter(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  >
                    <option value="">Select a character...</option>
                    {availableCharacters.map((character) => (
                      <option key={character.id} value={character.id}>
                        {character.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Type
                  </label>
                  <div className="flex space-x-4">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        value="recurring"
                        checked={characterType === 'recurring'}
                        onChange={(e) => setCharacterType(e.target.value as 'recurring' | 'episodic')}
                        className="mr-2"
                      />
                      Recurring
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        value="episodic"
                        checked={characterType === 'episodic'}
                        onChange={(e) => setCharacterType(e.target.value as 'recurring' | 'episodic')}
                        className="mr-2"
                      />
                      Episodic
                    </label>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Role (Optional)
                  </label>
                  <input
                    type="text"
                    value={characterRole}
                    onChange={(e) => setCharacterRole(e.target.value)}
                    placeholder="e.g., Main character, Villain, Helper..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
                <div className="flex space-x-3">
                  <button
                    onClick={handleAddCharacter}
                    disabled={!selectedCharacter}
                    className={cn(
                      "flex-1 px-4 py-2 rounded-lg font-medium transition-colors",
                      selectedCharacter
                        ? "bg-green-600 text-white hover:bg-green-700"
                        : "bg-gray-100 text-gray-400 cursor-not-allowed"
                    )}
                  >
                    Add Character
                  </button>
                  <button
                    onClick={() => setShowAddCharacter(false)}
                    className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Location Modal */}
      {showAddLocation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Location</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Location
                  </label>
                  <select
                    value={selectedLocation}
                    onChange={(e) => setSelectedLocation(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  >
                    <option value="">Select a location...</option>
                    {availableLocations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Episode-specific Description (Optional)
                  </label>
                  <textarea
                    value={locationDescription}
                    onChange={(e) => setLocationDescription(e.target.value)}
                    placeholder="Describe how this location appears in this episode..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                    rows={3}
                  />
                </div>
                <div className="flex space-x-3">
                  <button
                    onClick={handleAddLocation}
                    disabled={!selectedLocation}
                    className={cn(
                      "flex-1 px-4 py-2 rounded-lg font-medium transition-colors",
                      selectedLocation
                        ? "bg-green-600 text-white hover:bg-green-700"
                        : "bg-gray-100 text-gray-400 cursor-not-allowed"
                    )}
                  >
                    Add Location
                  </button>
                  <button
                    onClick={() => setShowAddLocation(false)}
                    className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
