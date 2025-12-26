'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Show, Episode, EpisodeScene, SceneShot, Character, GlobalAsset, PlotTheme } from '@/types';
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
  Download,
  Eye,
  Users,
  Wand2,
  BookOpen,
  Menu,
  Loader2
} from 'lucide-react';
import StoryboardDrawer from './StoryboardDrawer';
import CommentThread from './CommentThread';
import { AVScriptEditor } from './AVScriptEditor';
import { AVEditing } from './AVEditing';
import { AVPreview } from './AVPreview';
import ScreenplayEditor, { ScreenplayEditorHandle } from './ScreenplayEditor';
import { useS3Upload } from '@/hooks/useS3Upload';
import { useRealtimeEpisode } from '@/hooks/useRealtimeEpisode';
import { EpisodeDescriptionGenerationDialog } from './EpisodeDescriptionGenerationDialog';
import { ScreenplayGenerationDialog, ScreenplayVersion } from './ScreenplayGenerationDialog';
import { NarrativeGenerationDialog } from './NarrativeGenerationDialog';
import { NarrativeReaderDialog } from './NarrativeReaderDialog';
import { AppBreadcrumbHeader } from './AppBreadcrumbHeader';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface EpisodeDetailProps {
  episode: Episode;
  show: Show;
  globalAssets: GlobalAsset[];
  plotThemes?: PlotTheme[];
  onBack: () => void;
  onSave?: (episode: Episode) => void;
  isPublicMode?: boolean;
}

export default function EpisodeDetail({
  episode,
  show,
  globalAssets,
  plotThemes = [],
  onBack,
  onSave,
  isPublicMode = false,
}: EpisodeDetailProps) {
  
  const headerIsDark = Boolean(show.coverImageUrl);
  const [activeTab, setActiveTab] = useState<'overview' | 'av-script' | 'av-preview' | 'av-editing' | 'screenwriting' | 'characters' | 'locations' | 'gadgets'>('overview');
  const [localEpisode, setLocalEpisode] = useState<Episode>(episode);
  const screenplayEditorRef = useRef<ScreenplayEditorHandle | null>(null);
  const [screenplayLastSavedAt, setScreenplayLastSavedAt] = useState<number | null>(null);
  const [screenplayIsSaving, setScreenplayIsSaving] = useState(false);
  const [isTabVisible, setIsTabVisible] = useState(true);
  
  // Track tab visibility to enable/disable real-time sync (saves resources)
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsTabVisible(!document.hidden);
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Real-time episode sync (always enabled when on AV Script tab, regardless of browser tab visibility)
  // Browser tab visibility check removed to ensure sync works across browser tabs/windows
  const isRealtimeEnabled = activeTab === 'av-script';
  
  // Memoize the update callback to prevent infinite loops
  const handleRealtimeUpdate = useCallback((updatedEpisode: Episode) => {
    console.log('📥 handleRealtimeUpdate called in EpisodeDetail:', {
      activeTab,
      episodeId: episode.id,
      updatedEpisodeId: updatedEpisode.id,
      matches: activeTab === 'av-script' && updatedEpisode.id === episode.id,
    });
    
    // Only update if we're on the AV Script tab and the episode ID matches
    if (activeTab === 'av-script' && updatedEpisode.id === episode.id) {
      console.log('✅ Conditions met - updating local episode');
      setLocalEpisode(prev => {
        // Only update if the updatedAt timestamp is newer (prevent loops)
        const prevUpdatedAt = prev.updatedAt instanceof Date ? prev.updatedAt.getTime() : new Date(prev.updatedAt).getTime();
        const newUpdatedAt = updatedEpisode.updatedAt instanceof Date ? updatedEpisode.updatedAt.getTime() : new Date(updatedEpisode.updatedAt).getTime();
        
        console.log('📊 Comparing timestamps:', {
          prevUpdatedAt,
          newUpdatedAt,
          isNewer: newUpdatedAt > prevUpdatedAt,
          difference: newUpdatedAt - prevUpdatedAt,
          prevSegments: prev.avScript?.segments?.length || 0,
          newSegments: updatedEpisode.avScript?.segments?.length || 0,
        });
        
        // Always update if timestamps are different (even if not strictly newer)
        // This handles cases where serverTimestamp() might cause slight timing issues
        // Also check if the content actually changed (not just timestamp)
        const prevAvScriptHash = JSON.stringify({
          segments: prev.avScript?.segments?.length || 0,
          shots: prev.avScript?.segments?.reduce((sum, seg) => sum + (seg.shots?.length || 0), 0) || 0,
        });
        const newAvScriptHash = JSON.stringify({
          segments: updatedEpisode.avScript?.segments?.length || 0,
          shots: updatedEpisode.avScript?.segments?.reduce((sum, seg) => sum + (seg.shots?.length || 0), 0) || 0,
        });
        
        // Update if timestamp is newer OR if content actually changed (even if timestamp is same/older)
        // This ensures we get updates even if there's a timestamp mismatch
        if (newUpdatedAt >= prevUpdatedAt || newAvScriptHash !== prevAvScriptHash) {
          console.log('✅ Updating local episode with new data', {
            timestampNewer: newUpdatedAt >= prevUpdatedAt,
            contentChanged: newAvScriptHash !== prevAvScriptHash,
          });
          return updatedEpisode;
        }
        console.log('⏭️ Skipping update - timestamp is older and content unchanged');
        return prev; // No update needed
      });
    } else {
      console.log('⏭️ Skipping real-time update - wrong tab or episode:', {
        activeTab,
        episodeId: episode.id,
        updatedEpisodeId: updatedEpisode.id,
      });
    }
  }, [activeTab, episode.id]);
  
  const { saveEpisode: saveEpisodeRealtime, saveImmediately: saveImmediatelyRealtime } = useRealtimeEpisode({
    episodeId: episode.id,
    onUpdate: handleRealtimeUpdate,
    enabled: isRealtimeEnabled,
  });
  
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
  const selectedEpisodePlotTheme = plotThemes.find((t) => t.id === localEpisode.plotThemeId) || null;
  const narrativeStoriesPL = localEpisode.narrativeStories || [];
  const narrativeStoriesEN = localEpisode.narrativeStoriesEN || [];

  const selectedNarrativePL =
    (localEpisode.selectedNarrativeStoryId
      ? narrativeStoriesPL.find((s) => s.id === localEpisode.selectedNarrativeStoryId)
      : undefined) || narrativeStoriesPL[0];
  const selectedNarrativeEN =
    (localEpisode.selectedNarrativeStoryIdEN
      ? narrativeStoriesEN.find((s) => s.id === localEpisode.selectedNarrativeStoryIdEN)
      : undefined) || narrativeStoriesEN[0];

  // Back-compat: if legacy narrative exists but no versions array, display it.
  const narrativeText = selectedNarrativePL?.text || localEpisode.narrativeStory || '';
  const narrativeTextEN = selectedNarrativeEN?.text || localEpisode.narrativeStoryEN || '';
  const [showDescriptionDialog, setShowDescriptionDialog] = useState(false);
  const [showScreenplayDialog, setShowScreenplayDialog] = useState(false);
  const [showNarrativeDialog, setShowNarrativeDialog] = useState(false);
  const [showNarrativeReader, setShowNarrativeReader] = useState(false);
  const [narrativeReaderPayload, setNarrativeReaderPayload] = useState<{
    title: string;
    text: string;
    meta?: { wordCount?: number; createdAt?: Date; language?: 'PL' | 'EN'; sourceLabel?: string };
  } | null>(null);
  
  // Store screenplay versions in parent to persist across dialog opens/closes
  const [screenplayVersions, setScreenplayVersions] = useState<ScreenplayVersion[]>([]);
  
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

  // Debounce and change detection for saving episodes
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedEpisodeRef = useRef<string>('');
  const pendingSaveRef = useRef<Episode | null>(null);
  
  // Track if we've initialized to prevent unnecessary updates
  const hasInitializedRef = useRef(false);
  const lastEpisodeHashRef = useRef<string>('');

  // Sync local episode with prop, but only if it actually changed
  useEffect(() => {
    // Create a hash of the episode data (excluding dates that change frequently)
    const episodeHash = JSON.stringify({
      id: episode.id,
      title: episode.title,
      description: episode.description,
      episodeNumber: episode.episodeNumber,
      characters: episode.characters,
      locations: episode.locations,
      scenes: episode.scenes?.map(s => ({
        id: s.id,
        sceneNumber: s.sceneNumber,
        title: s.title,
        description: s.description,
        actionDescription: s.actionDescription,
        script: s.script,
        locationName: s.locationName,
        characters: s.characters,
        sceneCharacters: s.sceneCharacters,
        gadgets: s.gadgets,
        shots: s.shots,
      })),
      avScript: episode.avScript,
      screenplayData: episode.screenplayData,
    });

    // Only update if the episode actually changed (not just a new object reference)
    if (hasInitializedRef.current && lastEpisodeHashRef.current === episodeHash) {
      return;
    }

    // Update local episode only if data actually changed
    if (!hasInitializedRef.current || lastEpisodeHashRef.current !== episodeHash) {
      console.log('🔄 Episode prop changed, updating local episode:', {
        isInitialized: hasInitializedRef.current,
        hashChanged: lastEpisodeHashRef.current !== episodeHash,
        realtimeActive: realtimeSyncActiveRef.current,
      });
      
      setLocalEpisode(episode);
      lastEpisodeHashRef.current = episodeHash;
      hasInitializedRef.current = true;
      
      // Reset pending save if the episode changed from external source
      // This prevents overwriting with stale data when real-time sync is active
      if (realtimeSyncActiveRef.current) {
        console.log('⏭️ Real-time sync active - clearing pending saves to prevent overwrite');
        pendingSaveRef.current = null;
        lastSavedEpisodeRef.current = episodeHash; // Mark as saved to prevent auto-save
      }
      
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    }
  }, [episode]);

  // Optimized hash calculation - excludes dates and uses faster method
  const calculateEpisodeHash = (ep: Episode): string => {
    // Only hash the essential data, excluding dates and metadata
    return JSON.stringify({
      id: ep.id,
      title: ep.title,
      description: ep.description,
      episodeNumber: ep.episodeNumber,
      characters: ep.characters?.map(c => ({ characterId: c.characterId, characterName: c.characterName, type: c.type, role: c.role })),
      locations: ep.locations?.map(l => ({ locationId: l.locationId, locationName: l.locationName })),
      scenes: ep.scenes?.map(s => ({
        id: s.id,
        sceneNumber: s.sceneNumber,
        title: s.title,
        description: s.description,
        actionDescription: s.actionDescription,
        script: s.script,
        locationName: s.locationName,
        characters: s.characters,
        sceneCharacters: s.sceneCharacters?.map(sc => ({ characterId: sc.characterId, characterName: sc.characterName, role: sc.role, isPresent: sc.isPresent })),
        gadgets: s.gadgets?.map(g => ({ gadgetId: g.gadgetId, gadgetName: g.gadgetName })),
        shots: s.shots?.map(sh => ({
          id: sh.id,
          shotNumber: sh.shotNumber,
          title: sh.title,
          description: sh.description,
          featuredImage: sh.featuredImage,
          cameraShot: sh.cameraShot,
          storyboards: sh.storyboards?.map(sb => sb.imageUrl),
          inspirationImages: sh.inspirationImages,
        })),
      })),
      // For avScript and screenplayData, only hash essential fields to avoid expensive serialization
      avScript: ep.avScript ? {
        segments: ep.avScript.segments?.map(seg => ({
          id: seg.id,
          segmentNumber: seg.segmentNumber,
          title: seg.title,
          shots: seg.shots?.map(shot => ({
            id: shot.id,
            shotNumber: shot.shotNumber,
            take: shot.take,
            audio: shot.audio,
            visual: shot.visual,
            duration: shot.duration,
            runtime: shot.runtime,
            imageUrl: shot.imageUrl,
          })),
        })),
      } : null,
      screenplayData: ep.screenplayData ? {
        elements: ep.screenplayData.elements?.length,
        elementsEN: ep.screenplayData.elementsEN?.length,
      } : null,
    });
  };

  // Track if real-time sync is active to prevent overwriting with stale data
  const realtimeSyncActiveRef = useRef(false);
  
  useEffect(() => {
    realtimeSyncActiveRef.current = isRealtimeEnabled;
  }, [isRealtimeEnabled]);

  const updateEpisodeAndSave = async (updatedEpisode: Episode, immediate = false) => {
    // Update local state immediately for UI responsiveness
    setLocalEpisode(updatedEpisode);

    // Calculate hash
    const episodeHash = calculateEpisodeHash(updatedEpisode);

    // Skip if nothing has changed
    if (lastSavedEpisodeRef.current === episodeHash) {
      console.log('Skipping save - no changes detected');
      return;
    }

    // If real-time sync is active, don't use the old save mechanism
    // The real-time hook will handle saving
    if (realtimeSyncActiveRef.current && !immediate) {
      console.log('⏭️ Skipping old save mechanism - real-time sync is active');
      return;
    }

    // If immediate save is requested (e.g., for image generation), save now and update hash
    if (immediate) {
      console.log('Saving episode immediately (critical operation)');
      lastSavedEpisodeRef.current = episodeHash;
      await onSave?.(updatedEpisode);
      return;
    }

    // Store pending save
    pendingSaveRef.current = updatedEpisode;

    // Clear any existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce: Wait 2 minutes before saving (backup save only)
    saveTimeoutRef.current = setTimeout(() => {
      const episodeToSave = pendingSaveRef.current;
      if (episodeToSave) {
        // Re-check hash before saving (in case it changed during debounce)
        const finalHash = calculateEpisodeHash(episodeToSave);

        // Only save if still different from last saved
        if (lastSavedEpisodeRef.current !== finalHash) {
          lastSavedEpisodeRef.current = finalHash;
          console.log('Auto-saving episode (backup save after 2 minutes)');
          onSave?.(episodeToSave);
        } else {
          console.log('Skipping save - no changes detected');
        }
        pendingSaveRef.current = null;
      }
    }, 120000); // 2 minutes - backup save to prevent Firebase quota issues
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

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
    { id: 'av-script', label: 'AV Script' },
    { id: 'av-preview', label: 'AV Preview' },
    // { id: 'av-editing', label: 'AV Editing' }, // Hidden as per request
    { id: 'screenwriting', label: 'Screenwriting' },
    { id: 'characters', label: 'Characters' },
    { id: 'locations', label: 'Locations' },
    { id: 'gadgets', label: 'Special Gadgets' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <AppBreadcrumbHeader
        coverImageUrl={show.coverImageUrl}
        logoUrl={show.logoUrl}
        backHref={`${isPublicMode ? '/public' : '/app'}/shows/${show.id}/episodes`}
        items={[
          { label: show.name, href: `${isPublicMode ? '/public' : '/app'}/shows/${show.id}` },
          { label: 'Episodes', href: `${isPublicMode ? '/public' : '/app'}/shows/${show.id}/episodes` },
          { label: localEpisode.title || 'Episode' },
        ]}
        subtitle={`Episode ${localEpisode.episodeNumber}`}
        title={
          <div className="min-w-0">
              {editingTitle ? (
              <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={tempTitle}
                    onChange={(e) => setTempTitle(e.target.value)}
                  className={`w-full min-w-0 text-xl sm:text-2xl font-bold bg-transparent border-b focus:outline-none ${
                    headerIsDark
                      ? 'border-white/40 focus:border-white text-white placeholder:text-white/70'
                      : 'border-border focus:border-primary text-foreground placeholder:text-muted-foreground'
                  }`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveTitle();
                      if (e.key === 'Escape') handleCancelTitle();
                    }}
                    onBlur={handleSaveTitle}
                    autoFocus
                  />
                  <button
                    onClick={handleSaveTitle}
                  className={`p-1 ${headerIsDark ? 'text-white/90 hover:text-white' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    <Save className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleCancelTitle}
                  className={`p-1 ${headerIsDark ? 'text-white/70 hover:text-white' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
              <button
                type="button"
                className={`text-left w-full text-xl sm:text-2xl font-bold line-clamp-2 ${
                  headerIsDark ? 'text-white hover:text-white/95' : 'text-foreground hover:text-foreground/90'
                }`}
                  onClick={() => setEditingTitle(true)}
                  title="Click to edit title"
                >
                  {localEpisode.title}
              </button>
              )}
            </div>
        }
      />

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="studio-container">
          <nav className="flex space-x-4 sm:space-x-8 overflow-x-auto no-scrollbar">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as 'overview' | 'av-script' | 'av-preview' | 'av-editing' | 'screenwriting' | 'characters' | 'locations' | 'gadgets')}
                className={`py-3 sm:py-4 px-1 border-b-2 font-medium text-xs sm:text-sm whitespace-nowrap ${
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

      {/* Screenwriting action row (separate row under tabs, like AV Script) */}
          {activeTab === 'screenwriting' && (
        <div className="bg-white border-b border-gray-200">
          <div className="studio-container py-3 hidden md:flex items-center justify-end gap-2">
            <div className="text-xs text-gray-500 whitespace-nowrap mr-1">
              {screenplayLastSavedAt ? `Last saved: ${new Date(screenplayLastSavedAt).toLocaleString()}` : 'Not saved yet'}
            </div>

            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={screenplayIsSaving}
              title="Save"
              onClick={async () => {
                if (!screenplayEditorRef.current) return;
                setScreenplayIsSaving(true);
                try {
                  await screenplayEditorRef.current.save();
                } finally {
                  setScreenplayIsSaving(false);
                }
              }}
            >
              {screenplayIsSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="icon" title="More actions">
                  <Menu className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>Screenwriting</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setShowScreenplayDialog(true)}>
                  <Wand2 className="h-4 w-4" />
                <span>Auto-Create</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setShowNarrativeDialog(true)}>
                  <BookOpen className="h-4 w-4" />
                  <span>Narrative descriptions</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => screenplayEditorRef.current?.togglePreview()}>
                  <Eye className="h-4 w-4" />
                <span>Preview</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => screenplayEditorRef.current?.exportPDF()}>
                  <Download className="h-4 w-4" />
                  <span>Export PDF</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => screenplayEditorRef.current?.exportVO()}>
                  <Download className="h-4 w-4" />
                <span>Export VO</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            </div>
        </div>
      )}

      {/* Content */}
      <div className={`${activeTab === 'screenwriting' ? 'py-0' : 'studio-container py-4 sm:py-6'}`}>
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-medium text-gray-900">Episode Description</h2>
                {!editingDescription && (
                  <button
                    onClick={() => setShowDescriptionDialog(true)}
                    className="flex items-center space-x-1 px-3 py-1 text-xs bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors"
                    title="Generate description with AI"
                  >
                    <Wand2 className="w-3 h-3" />
                    <span>Generate</span>
                  </button>
                )}
              </div>

              {/* Plot Theme selector (used by AI description + screenwriting) */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Plot Theme (optional)
                </label>
                <select
                  value={localEpisode.plotThemeId || ''}
                  onChange={(e) => {
                    const nextId = e.target.value || undefined;
                    const updatedEpisode: Episode = {
                      ...localEpisode,
                      plotThemeId: nextId,
                    };
                    updateEpisodeAndSave(updatedEpisode);
                  }}
                  disabled={isPublicMode}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-100"
                >
                  <option value="">No theme selected</option>
                  {plotThemes.map((theme) => (
                    <option key={theme.id} value={theme.id}>
                      {theme.name}
                    </option>
                  ))}
                </select>
                {selectedEpisodePlotTheme && (
                  <div className="mt-2 text-xs text-gray-500">
                    <span className="font-medium text-gray-700">Selected:</span>{' '}
                    {selectedEpisodePlotTheme.description || 'No description'}
                  </div>
                )}
              </div>

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
                <div className="space-y-2">
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
                </div>
              )}
            </div>

            {/* Narrative Story (prose) */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-medium text-gray-900">Narrative story</h2>
                <div className="flex items-center gap-2">
                  {(narrativeText || narrativeTextEN) && (
                    <button
                      onClick={() => {
                        const chosen = selectedNarrativePL || selectedNarrativeEN;
                        const lang = selectedNarrativePL ? 'PL' : 'EN';
                        const wc = chosen?.wordCount;
                        const createdAt = chosen?.createdAt ? new Date(chosen.createdAt) : undefined;
                        setNarrativeReaderPayload({
                          title: chosen?.title || localEpisode.title,
                          text: chosen?.text || (lang === 'PL' ? narrativeText : narrativeTextEN),
                          meta: { wordCount: wc, createdAt, language: lang },
                        });
                        setShowNarrativeReader(true);
                      }}
                      className="flex items-center space-x-1 px-3 py-1 text-xs bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                      title="Read narrative story"
                    >
                      <BookOpen className="w-3 h-3" />
                      <span>Read</span>
                    </button>
                  )}
                  <button
                    onClick={() => setShowNarrativeDialog(true)}
                    className="flex items-center space-x-1 px-3 py-1 text-xs bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors"
                    title="Generate/manage narrative stories with AI"
                  >
                    <BookOpen className="w-3 h-3" />
                    <span>{narrativeText || narrativeTextEN ? 'Manage' : 'Generate'}</span>
                  </button>
                </div>
              </div>

              {narrativeText || narrativeTextEN ? (
                <div className="space-y-2">
                  <p
                    className="text-gray-600 whitespace-pre-wrap line-clamp-6 cursor-pointer hover:bg-gray-50 rounded p-2 transition-colors"
                    title="Click to read"
                    onClick={() => {
                      const chosen = selectedNarrativePL || selectedNarrativeEN;
                      const lang = selectedNarrativePL ? 'PL' : 'EN';
                      const wc = chosen?.wordCount;
                      const createdAt = chosen?.createdAt ? new Date(chosen.createdAt) : undefined;
                      setNarrativeReaderPayload({
                        title: chosen?.title || localEpisode.title,
                        text: chosen?.text || (lang === 'PL' ? narrativeText : narrativeTextEN),
                        meta: { wordCount: wc, createdAt, language: lang },
                      });
                      setShowNarrativeReader(true);
                    }}
                  >
                    {narrativeText || narrativeTextEN}
                  </p>
                  <button
                    onClick={() => {
                      const chosen = selectedNarrativePL || selectedNarrativeEN;
                      const lang = selectedNarrativePL ? 'PL' : 'EN';
                      const wc = chosen?.wordCount;
                      const createdAt = chosen?.createdAt ? new Date(chosen.createdAt) : undefined;
                      setNarrativeReaderPayload({
                        title: chosen?.title || localEpisode.title,
                        text: chosen?.text || (lang === 'PL' ? narrativeText : narrativeTextEN),
                        meta: { wordCount: wc, createdAt, language: lang },
                      });
                      setShowNarrativeReader(true);
                    }}
                    className="text-sm text-purple-700 hover:text-purple-800 font-medium"
                  >
                    Read story →
                  </button>
                </div>
              ) : (
                <p className="text-gray-500">
                  No narrative story yet. Generate a bedtime-story style prose adaptation from the screenplay.
                </p>
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

        {activeTab === 'av-preview' && (
          <div className="bg-white rounded-lg shadow-sm">
            <AVPreview
              episodeId={episode.id}
              avScript={localEpisode.avScript}
              avPreviewData={localEpisode.avPreviewData}
              globalAssets={globalAssets}
              onSave={(avPreviewData, updatedAvScript) => {
                let updatedEpisode = { ...localEpisode, avPreviewData };
                
                if (updatedAvScript) {
                  updatedEpisode = { ...updatedEpisode, avScript: updatedAvScript };
                }
                
                // Use updateEpisodeAndSave to immediately update localEpisode state
                updateEpisodeAndSave(updatedEpisode, true); // Immediate save for manual save button
              }}
            />
          </div>
        )}

        {activeTab === 'av-editing' && (
          <div className="bg-white rounded-lg shadow-sm">
            <AVEditing
              episodeId={episode.id}
              avScript={localEpisode.avScript}
              onSave={(avScript) => {
                const updatedEpisode = { ...localEpisode, avScript };
                updateEpisodeAndSave(updatedEpisode, false); // Use debounced save
              }}
            />
          </div>
        )}

        {activeTab === 'av-script' && (
          <div className="bg-white rounded-lg shadow-sm">
            {/* Real-time sync indicator */}
            {isRealtimeEnabled && (
              <div className="px-6 py-2 bg-green-50 border-b border-green-200 flex items-center gap-2 text-sm text-green-700">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span>Real-time sync active</span>
                <span className="text-green-600">•</span>
                <span className="text-green-600">Changes sync automatically</span>
              </div>
            )}
            <AVScriptEditor
              episodeId={episode.id}
              avScript={localEpisode.avScript}
              onSave={async (avScript) => {
                const updatedEpisode = { ...localEpisode, avScript };
                // Use real-time save if enabled, otherwise fall back to regular save
                if (isRealtimeEnabled) {
                  await saveEpisodeRealtime({ avScript });
                } else {
                  // Use immediate save for critical operations (like image generation)
                  await updateEpisodeAndSave(updatedEpisode, true);
                }
              }}
              onSaveImmediately={async (avScript) => {
                const updatedEpisode = { ...localEpisode, avScript };
                // Use real-time immediate save if enabled
                if (isRealtimeEnabled) {
                  await saveImmediatelyRealtime({ avScript });
                } else {
                  await updateEpisodeAndSave(updatedEpisode, true);
                }
              }}
              globalAssets={globalAssets}
              screenplayData={localEpisode.screenplayData}
              showId={show.id}
            />
          </div>
        )}

        {activeTab === 'screenwriting' && (
          <div className="bg-white md:rounded-lg md:shadow-sm h-full flex flex-col">
            {/* Mobile Auto-Create Button */}
            <div className="md:hidden p-4 border-b border-gray-200">
              <button
                onClick={() => setShowScreenplayDialog(true)}
                className="w-full px-4 py-2 rounded-md text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 flex items-center justify-center gap-2"
                title="Auto-Create Screenplay with AI"
              >
                <Wand2 className="w-4 h-4" />
                <span>Auto-Create Screenplay</span>
              </button>
            </div>
            <div className="flex-1 overflow-auto">
              <ScreenplayEditor
                key={`screenplay-${localEpisode.screenplayData?.elements?.length || 0}-${localEpisode.screenplayData?.elements?.[0]?.id || 'empty'}-${localEpisode.screenplayData?.elements?.[0]?.content?.substring(0, 20) || ''}`}
                ref={screenplayEditorRef}
                episodeId={episode.id}
                screenplayData={localEpisode.screenplayData || {
                  title: localEpisode.title || 'Untitled Screenplay',
                  elements: []
                }}
                onSave={(screenplayData) => {
                  const updatedEpisode: Episode = { ...localEpisode, screenplayData };
                  setLocalEpisode(updatedEpisode);
                  setScreenplayLastSavedAt(Date.now());
                  // Save immediately to avoid losing changes when navigating/switching views.
                  updateEpisodeAndSave(updatedEpisode, true);
                }}
              />
            </div>
          </div>
        )}

        {/* Screenplay Generation Dialog */}
        <ScreenplayGenerationDialog
          isOpen={showScreenplayDialog}
          onClose={() => setShowScreenplayDialog(false)}
          versions={screenplayVersions}
          onVersionsChange={setScreenplayVersions}
          plotThemes={plotThemes}
          globalAssets={globalAssets}
          initialPlotThemeId={localEpisode.plotThemeId}
          initialCharacterIds={localEpisode.characters?.map((c) => c.characterId) || []}
          onScreenplayGenerated={(elements, language) => {
            console.log('📝 onScreenplayGenerated called with elements:', elements);
            console.log('📝 Elements length:', elements.length);
            console.log('📝 First element sample:', elements[0]);
            console.log('📝 First element content:', elements[0]?.content);
            console.log('📝 First element type:', elements[0]?.type);
            console.log('📝 Selected language:', language);
            
            if (!elements || elements.length === 0) {
              console.error('❌ No elements provided!');
              return;
            }
            
            // Create new screenplay data with generated elements
            const timestamp = Date.now();
            const plElements = elements.map((el, index) => {
                // Ensure content is a string and not empty
                const content = (el.content && typeof el.content === 'string' && el.content.trim()) 
                  ? el.content.trim() 
                  : '';
                
                const newElement = {
                  id: `pl-element-${timestamp}-${index}`,
                  type: el.type || 'general',
                  content: language === 'PL' ? content : '',
                  position: index,
                };
                
                if (index < 3) {
                  console.log(`📝 Element ${index}:`, {
                    id: newElement.id,
                    type: newElement.type,
                    contentLength: newElement.content.length,
                    contentPreview: newElement.content.substring(0, 50),
                  });
                }
                
                return newElement;
              });

            const enElements = elements.map((el, index) => ({
                id: `en-element-${timestamp}-${index}`,
                type: el.type || 'general',
                content:
                  language === 'EN' && el.content && typeof el.content === 'string'
                    ? el.content.trim()
                    : '',
                position: index,
              }));

            const newScreenplayData = {
              title: localEpisode.title || 'Untitled Screenplay',
              titleEN: language === 'EN' ? (localEpisode.title || 'Untitled Screenplay') : undefined,
              elements: plElements,
              elementsEN: enElements,
            };
            
            console.log('📝 New screenplay data created:', {
              title: newScreenplayData.title,
              elementsCount: newScreenplayData.elements.length,
              firstElement: newScreenplayData.elements[0],
              firstElementContentLength: newScreenplayData.elements[0]?.content?.length || 0,
            });
            
            // Create a new object reference to ensure React detects the change
            const updatedEpisode = { 
              ...localEpisode, 
              screenplayData: {
                ...newScreenplayData,
                elements: [...newScreenplayData.elements], // New array reference
                elementsEN: [...newScreenplayData.elementsEN], // New array reference
              }
            };
            
            console.log('📝 Updated episode:', {
              screenplayDataExists: !!updatedEpisode.screenplayData,
              elementsCount: updatedEpisode.screenplayData.elements.length,
              firstElementId: updatedEpisode.screenplayData.elements[0]?.id,
              firstElementContent: updatedEpisode.screenplayData.elements[0]?.content?.substring(0, 100),
            });
            
            // Update local episode state
            setLocalEpisode(updatedEpisode);
            
            // Save immediately
            updateEpisodeAndSave(updatedEpisode, true);
            
            // Close dialog
            setShowScreenplayDialog(false);
            
            // Force a re-render by updating the key after a short delay
            setTimeout(() => {
              // This will force ScreenplayEditor to remount with new data
              const forceUpdateKey = `screenplay-${Date.now()}-${updatedEpisode.screenplayData.elements.length}`;
              console.log('📝 Force update key:', forceUpdateKey);
              
              // Trigger a state update to force re-render
              setLocalEpisode(prev => ({
                ...prev,
                screenplayData: {
                  ...prev.screenplayData!,
                  // Create new array references
                  elements: prev.screenplayData!.elements.map(el => ({ ...el })),
                  elementsEN: prev.screenplayData!.elementsEN?.map(el => ({ ...el })) || [],
                }
              }));
            }, 100);
          }}
          showName={show.name}
          showDescription={show.description || ''}
          episodeTitle={localEpisode.title}
          episodeDescription={localEpisode.description}
        />

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
                    <div
                      key={char.characterId}
                      onClick={() => handleCharacterClick(char.characterId)}
                      className="border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                    >
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
                              onClickCapture={(e) => e.stopPropagation()}
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
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              // Update local state immediately for UI responsiveness
                              const updatedEpisode: Episode = {
                                ...localEpisode,
                                characters: (localEpisode.characters || []).map(c => 
                                  c.characterId === char.characterId 
                                    ? { ...c, role: e.target.value }
                                    : c
                                ),
                              };
                              setLocalEpisode(updatedEpisode);
                              // Debounced save will handle the actual save
                              updateEpisodeAndSave(updatedEpisode);
                            }}
                            onBlur={() => {
                              // Force save on blur if there's a pending save
                              if (pendingSaveRef.current) {
                                const episodeToSave = pendingSaveRef.current;
                                const hash = calculateEpisodeHash(episodeToSave);
                                lastSavedEpisodeRef.current = hash;
                                if (saveTimeoutRef.current) {
                                  clearTimeout(saveTimeoutRef.current);
                                }
                                pendingSaveRef.current = null;
                                onSave?.(episodeToSave);
                              }
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
                            // Update local state immediately for UI responsiveness
                            const updatedEpisode: Episode = {
                              ...localEpisode,
                              locations: (localEpisode.locations || []).map(l => 
                                l.locationId === loc.locationId 
                                  ? { ...l, description: e.target.value }
                                  : l
                              ),
                            };
                            setLocalEpisode(updatedEpisode);
                            // Debounced save will handle the actual save
                            updateEpisodeAndSave(updatedEpisode);
                          }}
                          onBlur={() => {
                            // Force save on blur if there's a pending save
                            if (pendingSaveRef.current) {
                              const episodeToSave = pendingSaveRef.current;
                              const hash = calculateEpisodeHash(episodeToSave);
                              lastSavedEpisodeRef.current = hash;
                              if (saveTimeoutRef.current) {
                                clearTimeout(saveTimeoutRef.current);
                              }
                              pendingSaveRef.current = null;
                              onSave?.(episodeToSave);
                            }
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

      {/* Episode Description Generation Dialog */}
      <EpisodeDescriptionGenerationDialog
        isOpen={showDescriptionDialog}
        onClose={() => setShowDescriptionDialog(false)}
        onDescriptionSelected={(description) => {
          const updatedEpisode = { ...localEpisode, description: description.trim() };
          setTempDescription(description.trim());
          updateEpisodeAndSave(updatedEpisode);
          setShowDescriptionDialog(false);
        }}
        showName={show.name}
        showDescription={show.description || ''}
        episodeTitle={localEpisode.title}
        currentDescription={localEpisode.description}
        plotTheme={selectedEpisodePlotTheme}
      />

      {/* Narrative Generation Dialog */}
      <NarrativeGenerationDialog
        isOpen={showNarrativeDialog}
        onClose={() => setShowNarrativeDialog(false)}
        showName={show.name}
        showDescription={show.description || ''}
        episodeTitle={localEpisode.title}
        targetAge="6-8"
        screenplayData={localEpisode.screenplayData}
        screenplayVersions={screenplayVersions}
        preferredLanguage={localEpisode.screenplayData?.elementsEN?.some((e) => e.content?.trim()) ? 'EN' : 'PL'}
        savedNarrativesPL={localEpisode.narrativeStories || []}
        savedNarrativesEN={localEpisode.narrativeStoriesEN || []}
        selectedNarrativeIdPL={localEpisode.selectedNarrativeStoryId}
        selectedNarrativeIdEN={localEpisode.selectedNarrativeStoryIdEN}
        onNarrativeSelected={({ language, story }) => {
          const now = new Date();

          const upsert = (arr: import('@/types').NarrativeStoryVersion[]) => {
            const idx = arr.findIndex((s) => s.id === story.id);
            if (idx >= 0) {
              const copy = [...arr];
              copy[idx] = story;
              return copy;
            }
            return [story, ...arr];
          };

          const plArr = upsert(localEpisode.narrativeStories || []);
          const enArr = upsert(localEpisode.narrativeStoriesEN || []);

          const updatedEpisode: Episode = {
            ...localEpisode,
            narrativeStories: language === 'PL' ? plArr : localEpisode.narrativeStories || [],
            narrativeStoriesEN: language === 'EN' ? enArr : localEpisode.narrativeStoriesEN || [],
            selectedNarrativeStoryId: language === 'PL' ? story.id : localEpisode.selectedNarrativeStoryId,
            selectedNarrativeStoryIdEN: language === 'EN' ? story.id : localEpisode.selectedNarrativeStoryIdEN,
            narrativeUpdatedAt: now,
            // Keep legacy fields in sync for older UI paths / back-compat.
            narrativeStory: language === 'PL' ? story.text : localEpisode.narrativeStory,
            narrativeStoryEN: language === 'EN' ? story.text : localEpisode.narrativeStoryEN,
          };
          updateEpisodeAndSave(updatedEpisode, true);
          setShowNarrativeDialog(false);
        }}
      />

      {/* Narrative Reader Dialog */}
      <NarrativeReaderDialog
        isOpen={showNarrativeReader && !!narrativeReaderPayload}
        onClose={() => setShowNarrativeReader(false)}
        title={narrativeReaderPayload?.title || localEpisode.title}
        text={narrativeReaderPayload?.text || ''}
        meta={narrativeReaderPayload?.meta}
      />
    </div>
  );
}