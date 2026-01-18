'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ShowSelection } from './ShowSelection';
import { ShowDashboard } from './ShowDashboard';
import { GlobalAssetsManager } from './GlobalAssetsManager';
import { CharacterDetail } from './CharacterDetail';
import { LocationDetail } from './LocationDetail';
import { GadgetDetail } from './GadgetDetail';
import { TextureDetail } from './TextureDetail';
import { BackgroundDetail } from './BackgroundDetail';
import { VehicleDetail } from './VehicleDetail';
import { EpisodeList } from './EpisodeList';
import EpisodeDetail from './EpisodeDetail';
import { EpisodeIdeas } from './EpisodeIdeas';
import { GeneralIdeas } from './GeneralIdeas';
import { GeneralIdeaDetail } from './GeneralIdeaDetail';
import { PlotThemes } from './PlotThemes';
import { LoadingPreloader } from './LoadingPreloader';
import { ChatWidget } from '@/components/chat/ChatWidget';
import { Show, GlobalAsset, Episode, Character, AssetConcept, EpisodeIdea, GeneralIdea, PlotTheme, NotificationType } from '@/types';
import { useFirebaseData } from '@/hooks/useFirebaseData';
import { useAccessControl } from '@/hooks/useAccessControl';
import { useAuth } from '@/contexts/AuthContext';
import { episodeAccessService, notificationService, showAccessService, userService } from '@/lib/firebase-services';

type AppView = 'shows' | 'dashboard' | 'global-assets' | 'asset-detail' | 'character-detail' | 'location-detail' | 'gadget-detail' | 'texture-detail' | 'background-detail' | 'vehicle-detail' | 'episodes' | 'episode-detail' | 'episode-ideas' | 'general-ideas' | 'general-idea-detail' | 'plot-themes';

interface ConceptoAppProps {
  isPublicMode?: boolean;
  initialView?: AppView;
  showId?: string;
  episodeId?: string;
  assetId?: string;
  category?: 'character' | 'location' | 'gadget' | 'texture' | 'background' | 'vehicle' | 'all';
}

export function ConceptoApp({ 
  isPublicMode = false, 
  initialView = 'shows',
  showId: initialShowId,
  episodeId: initialEpisodeId,
  assetId: initialAssetId,
  category: initialCategory = 'all'
}: ConceptoAppProps = {}) {
  const router = useRouter();
  const { user } = useAuth();
  
  const [currentView, setCurrentView] = useState<AppView>(initialView);
  const [selectedShow, setSelectedShow] = useState<Show | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<GlobalAsset | null>(null);
  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);
  const [selectedGeneralIdea, setSelectedGeneralIdea] = useState<GeneralIdea | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<'character' | 'location' | 'gadget' | 'texture' | 'background' | 'vehicle' | 'all'>(initialCategory);
  
  // Firebase data management
  const {
    shows,
    globalAssets,
    episodes,
    episodeIdeas,
    generalIdeas,
    plotThemes,
    loading,
    error,
    createShow,
    updateShow,
    deleteShow,
    createGlobalAsset,
    updateGlobalAsset,
    deleteGlobalAsset,
    createEpisode,
    updateEpisode,
    deleteEpisode,
    createEpisodeIdea,
    updateEpisodeIdea,
    deleteEpisodeIdea,
    createGeneralIdea,
    updateGeneralIdea,
    deleteGeneralIdea,
    createPlotTheme,
    updatePlotTheme,
    deletePlotTheme,
    createAssetConcept,
    deleteAssetConcept,
    loadShowData,
    getLoadedShowId,
  } = useFirebaseData();

  const access = useAccessControl({ shows, episodes });
  const visibleShows = access.visibleShows;
  const selectedShowRole = access.getShowAccessRole(selectedShow);
  const selectedEpisodeRole = access.getEpisodeAccessRole(selectedEpisode, selectedShow);
  const isShowReadOnly = !access.canEdit(selectedShowRole);
  const isEpisodeReadOnly = selectedEpisode ? !access.canEdit(selectedEpisodeRole) : isShowReadOnly;
  const showReadOnly = isPublicMode || isShowReadOnly;
  const episodeReadOnly = isPublicMode || isEpisodeReadOnly;
  const canCommentOnShow = access.canComment(selectedShowRole);
  const canCommentOnEpisode = access.canComment(selectedEpisodeRole);
  const visibleEpisodes = selectedShow ? access.getVisibleEpisodes(selectedShow) : episodes;
  const hasOnlyEpisodeLevelAccess = selectedShow ? access.hasOnlyEpisodeLevelAccess(selectedShow) : false;

  // Consolidated initialization tracking
  const initializationRef = useRef({
    showId: null as string | null,
    episodeId: null as string | null,
    assetId: null as string | null,
    hasInitialized: false,
  });

  // Store loadShowData in ref to prevent effect re-runs
  const loadShowDataRef = useRef(loadShowData);
  useEffect(() => {
    loadShowDataRef.current = loadShowData;
  }, [loadShowData]);

  // Track if we're about to load data (to show loader immediately)
  const [isAboutToLoad, setIsAboutToLoad] = useState(false);
  
  // Track the last show we tried to load to prevent duplicate loads
  const lastLoadAttemptRef = useRef<string | null>(null);
  
  // Consolidated loading function - only called from one place
  // Must be defined before useEffect that uses it
  const loadShowDataIfNeeded = useCallback((showId: string) => {
    const currentlyLoadedShowId = getLoadedShowId();
    
    // Skip if already loaded or already attempting to load
    if (showId === currentlyLoadedShowId || showId === lastLoadAttemptRef.current) {
      console.log('⏭️ Skipping load - already loaded or loading:', showId);
      return;
    }
    
    console.log('🔄 Loading show data for:', showId);
    lastLoadAttemptRef.current = showId;
    setIsAboutToLoad(true);
    
    const loadPromise = loadShowDataRef.current(showId);
    if (loadPromise) {
      loadPromise.finally(() => {
        setIsAboutToLoad(false);
        // Clear the attempt ref after a delay to allow for retries if needed
        setTimeout(() => {
          if (lastLoadAttemptRef.current === showId) {
            lastLoadAttemptRef.current = null;
          }
        }, 1000);
      });
    } else {
      setIsAboutToLoad(false);
      lastLoadAttemptRef.current = null;
    }
  }, [getLoadedShowId]);

  // Single effect to handle all initialization from URL parameters
  useEffect(() => {
    // Wait for shows to be loaded first
    if (visibleShows.length === 0) {
      return;
    }

    const init = initializationRef.current;
    
    // Initialize show from URL - only once per showId
    if (initialShowId && initialShowId !== init.showId) {
      const show = visibleShows.find(s => s.id === initialShowId);
      if (show && selectedShow?.id !== show.id) {
        console.log('🔄 ConceptoApp: Initializing show from URL', show.id);
        init.showId = initialShowId;
        setSelectedShow(show);
        // Load data for URL-based navigation
        loadShowDataIfNeeded(show.id);
      }
    }

    // Initialize episode from URL (after show data is loaded)
    if (initialEpisodeId && initialEpisodeId !== init.episodeId && episodes.length > 0) {
      const episode = episodes.find(e => e.id === initialEpisodeId);
      if (episode && selectedEpisode?.id !== episode.id) {
        console.log('🔄 ConceptoApp: Initializing episode from URL', episode.id);
        init.episodeId = initialEpisodeId;
        setSelectedEpisode(episode);
      }
    }

    // Initialize asset from URL (after show data is loaded)
    if (initialAssetId && initialAssetId !== init.assetId && globalAssets.length > 0) {
      const asset = globalAssets.find(a => a.id === initialAssetId);
      if (asset && selectedAsset?.id !== asset.id) {
        console.log('🔄 ConceptoApp: Initializing asset from URL', asset.id);
        init.assetId = initialAssetId;
        setSelectedAsset(asset);
      }
    }

    init.hasInitialized = true;
  }, [initialShowId, initialEpisodeId, initialAssetId, visibleShows.length, episodes.length, globalAssets.length, selectedShow?.id, selectedEpisode?.id, selectedAsset?.id, loadShowDataIfNeeded]);

  const handleSelectShow = (show: Show) => {
    const role = access.getShowAccessRole(show);
    if (!access.canView(role)) {
      return;
    }
    const basePath = isPublicMode ? '/public' : '/app';
    router.push(`${basePath}/shows/${show.id}`);
  };

  const handleAddShow = async (showData: Omit<Show, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      await createShow(showData);
    } catch (error) {
      console.error('Failed to create show:', error);
    }
  };

  const handleEditShow = async (show: Show) => {
    try {
      // Only persist editable fields; avoid overwriting createdAt/updatedAt with client values.
      await updateShow(show.id, {
        name: show.name,
        description: show.description,
        coverImageUrl: show.coverImageUrl,
        logoUrl: show.logoUrl,
        seasonsCount: show.seasonsCount,
        archived: show.archived,
      });

      // Keep current selection in sync in this session.
      if (selectedShow?.id === show.id) {
        setSelectedShow({ ...selectedShow, ...show });
      }
    } catch (error) {
      console.error('Failed to update show:', error);
    }
  };

  const handleDeleteShow = async (showId: string) => {
    try {
      await deleteShow(showId);
      if (selectedShow?.id === showId) {
        setSelectedShow(null);
        setCurrentView('shows');
      }
    } catch (error) {
      console.error('Failed to delete show:', error);
    }
  };

  const handleArchiveShow = async (showId: string, archived: boolean) => {
    try {
      await updateShow(showId, { archived });
    } catch (error) {
      console.error('Failed to archive show:', error);
    }
  };

  const handleAddGlobalAsset = async (assetData: Omit<GlobalAsset, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const newAsset = await createGlobalAsset(assetData);
      if (!user || !selectedShow) return;
      
      // Notify show members about new asset
      const [showAccess, episodeAccess, allUsers] = await Promise.all([
        showAccessService.getByShow(selectedShow.id),
        episodeAccessService.getByShow(selectedShow.id),
        userService.getAll(),
      ]);
      const userIds = new Set<string>();
      if (selectedShow.ownerId) userIds.add(selectedShow.ownerId);
      showAccess.forEach(entry => userIds.add(entry.userId));
      episodeAccess.forEach(entry => userIds.add(entry.userId));
      allUsers.filter(profile => profile.role === 'admin').forEach(profile => userIds.add(profile.id));
      userIds.delete(user.id);
      
      if (userIds.size > 0) {
        const categoryLabel = assetData.category.charAt(0).toUpperCase() + assetData.category.slice(1);
        await notificationService.createMany(Array.from(userIds), {
          showId: selectedShow.id,
          type: 'asset-created',
          message: `${user.name} created a new ${categoryLabel.toLowerCase()}: "${assetData.name}"`,
          actorId: user.id,
          actorName: user.name,
          actorAvatarUrl: user.avatarUrl,
          isRead: false,
        });
      }
    } catch (error) {
      console.error('Failed to create asset:', error);
    }
  };


  const handleDeleteGlobalAsset = async (assetId: string) => {
    try {
      await deleteGlobalAsset(assetId);
      
    } catch (error) {
      console.error('Error deleting global asset:', error);
    }
  };

  const handleSaveGlobalAsset = async (asset: GlobalAsset) => {
    try {
      const existingAsset = globalAssets.find(a => a.id === asset.id);
      await updateGlobalAsset(asset.id, asset);
      
      // Update the selectedAsset state to reflect the changes
      if (selectedAsset && selectedAsset.id === asset.id) {
        setSelectedAsset(asset);
      }
      
      // Notify if asset was actually changed
      if (!user || !selectedShow || !existingAsset) return;
      
      const hasChanges = JSON.stringify(existingAsset) !== JSON.stringify(asset);
      if (hasChanges) {
        const [showAccess, episodeAccess, allUsers] = await Promise.all([
          showAccessService.getByShow(selectedShow.id),
          episodeAccessService.getByShow(selectedShow.id),
          userService.getAll(),
        ]);
        const userIds = new Set<string>();
        if (selectedShow.ownerId) userIds.add(selectedShow.ownerId);
        showAccess.forEach(entry => userIds.add(entry.userId));
        episodeAccess.forEach(entry => userIds.add(entry.userId));
        allUsers.filter(profile => profile.role === 'admin').forEach(profile => userIds.add(profile.id));
        userIds.delete(user.id);
        
        if (userIds.size > 0) {
          const categoryLabel = asset.category.charAt(0).toUpperCase() + asset.category.slice(1);
          await notificationService.createMany(Array.from(userIds), {
            showId: selectedShow.id,
            type: 'asset-updated',
            message: `${user.name} updated the ${categoryLabel.toLowerCase()}: "${asset.name}"`,
            actorId: user.id,
            actorName: user.name,
            actorAvatarUrl: user.avatarUrl,
            isRead: false,
          });
        }
      }
    } catch (error) {
      console.error('Error saving global asset:', error);
    }
  };

  const handleToggleMainCharacter = async (characterId: string, isMain: boolean) => {
    try {
      await updateGlobalAsset(characterId, { isMainCharacter: isMain });
      if (selectedAsset?.id === characterId) {
        setSelectedAsset({ ...selectedAsset, isMainCharacter: isMain } as GlobalAsset);
      }
    } catch (error) {
      console.error('Failed to toggle main character:', error);
    }
  };
  const handleAddEpisode = async (episodeData: Omit<Episode, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      await createEpisode(episodeData);
    } catch (error) {
      console.error('Failed to create episode:', error);
    }
  };

  const handleSelectGlobalAssets = (category?: 'character' | 'location' | 'gadget' | 'texture' | 'background' | 'vehicle' | 'all') => {
    const basePath = isPublicMode ? '/public' : '/app';
    const categoryParam = category && category !== 'all' ? `?category=${category}` : '';
    router.push(`${basePath}/shows/${selectedShow?.id}/assets${categoryParam}`);
  };

  const handleSelectEpisodes = () => {
    const basePath = isPublicMode ? '/public' : '/app';
    router.push(`${basePath}/shows/${selectedShow?.id}/episodes`);
  };

  const handleSelectEpisodeIdeas = () => {
    const basePath = isPublicMode ? '/public' : '/app';
    router.push(`${basePath}/shows/${selectedShow?.id}/episode-ideas`);
  };

  const handleSelectGeneralIdeas = () => {
    const basePath = isPublicMode ? '/public' : '/app';
    router.push(`${basePath}/shows/${selectedShow?.id}/general-ideas`);
  };

  const handleSelectAsset = (asset: GlobalAsset) => {
    const basePath = isPublicMode ? '/public' : '/app';
    router.push(`${basePath}/shows/${selectedShow?.id}/assets/${asset.id}`);
  };

  const handleBackToShows = () => {
    const basePath = isPublicMode ? '/public' : '/app';
    router.push(`${basePath}/shows`);
  };

  const handleBackToDashboard = () => {
    setCurrentView('dashboard');
    const basePath = isPublicMode ? '/public' : '/app';
    router.push(`${basePath}/shows/${selectedShow?.id}`);
  };

  const handleBackToGlobalAssets = () => {
    const basePath = isPublicMode ? '/public' : '/app';
    const categoryParam = selectedCategory && selectedCategory !== 'all' ? `?category=${selectedCategory}` : '';
    router.push(`${basePath}/shows/${selectedShow?.id}/assets${categoryParam}`);
  };

  const handleBackToEpisodes = () => {
    const basePath = isPublicMode ? '/public' : '/app';
    router.push(`${basePath}/shows/${selectedShow?.id}/episodes`);
  };

  const handleBackToGeneralIdeas = () => {
    const basePath = isPublicMode ? '/public' : '/app';
    setSelectedGeneralIdea(null);
    router.push(`${basePath}/shows/${selectedShow?.id}/general-ideas`);
  };

  const handleSelectGeneralIdea = (idea: GeneralIdea) => {
    setSelectedGeneralIdea(idea);
    setCurrentView('general-idea-detail');
  };

  const handleAddGeneralIdea = async (ideaData: Omit<GeneralIdea, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const newIdea = await createGeneralIdea(ideaData);
      if (!user || !selectedShow) return;
      
      // Notify show members about new general idea
      const [showAccess, episodeAccess, allUsers] = await Promise.all([
        showAccessService.getByShow(selectedShow.id),
        episodeAccessService.getByShow(selectedShow.id),
        userService.getAll(),
      ]);
      const userIds = new Set<string>();
      if (selectedShow.ownerId) userIds.add(selectedShow.ownerId);
      showAccess.forEach(entry => userIds.add(entry.userId));
      episodeAccess.forEach(entry => userIds.add(entry.userId));
      allUsers.filter(profile => profile.role === 'admin').forEach(profile => userIds.add(profile.id));
      userIds.delete(user.id);
      
      if (userIds.size > 0) {
        await notificationService.createMany(Array.from(userIds), {
          showId: selectedShow.id,
          type: 'general-idea-created',
          message: `${user.name} added a new general idea: "${ideaData.name}"`,
          actorId: user.id,
          actorName: user.name,
          actorAvatarUrl: user.avatarUrl,
          isRead: false,
        });
      }
    } catch (error) {
      console.error('Failed to create general idea:', error);
    }
  };

  const handleEditGeneralIdea = async (idea: GeneralIdea) => {
    try {
      const existingIdea = generalIdeas.find(i => i.id === idea.id);
      await updateGeneralIdea(idea.id, idea);
      
      if (!user || !selectedShow || !existingIdea) return;
      
      const [showAccess, episodeAccess, allUsers] = await Promise.all([
        showAccessService.getByShow(selectedShow.id),
        episodeAccessService.getByShow(selectedShow.id),
        userService.getAll(),
      ]);
      const userIds = new Set<string>();
      if (selectedShow.ownerId) userIds.add(selectedShow.ownerId);
      showAccess.forEach(entry => userIds.add(entry.userId));
      episodeAccess.forEach(entry => userIds.add(entry.userId));
      allUsers.filter(profile => profile.role === 'admin').forEach(profile => userIds.add(profile.id));
      userIds.delete(user.id);
      
      if (userIds.size > 0) {
        await notificationService.createMany(Array.from(userIds), {
          showId: selectedShow.id,
          type: 'general-idea-updated',
          message: `${user.name} updated the general idea: "${idea.name}"`,
          actorId: user.id,
          actorName: user.name,
          actorAvatarUrl: user.avatarUrl,
          isRead: false,
        });
      }
    } catch (error) {
      console.error('Failed to update general idea:', error);
    }
  };

  const handleDeleteGeneralIdea = async (ideaId: string) => {
    try {
      await deleteGeneralIdea(ideaId);
      if (selectedGeneralIdea?.id === ideaId) {
        setSelectedGeneralIdea(null);
        setCurrentView('general-ideas');
      }
    } catch (error) {
      console.error('Failed to delete general idea:', error);
    }
  };

  const handleSaveGeneralIdea = async (idea: GeneralIdea) => {
    try {
      const existingIdea = generalIdeas.find(i => i.id === idea.id);
      await updateGeneralIdea(idea.id, idea);
      setSelectedGeneralIdea(idea);
      
      if (!user || !selectedShow || !existingIdea) return;
      
      const hasChanges = JSON.stringify(existingIdea) !== JSON.stringify(idea);
      if (hasChanges) {
        const [showAccess, episodeAccess, allUsers] = await Promise.all([
          showAccessService.getByShow(selectedShow.id),
          episodeAccessService.getByShow(selectedShow.id),
          userService.getAll(),
        ]);
        const userIds = new Set<string>();
        if (selectedShow.ownerId) userIds.add(selectedShow.ownerId);
        showAccess.forEach(entry => userIds.add(entry.userId));
        episodeAccess.forEach(entry => userIds.add(entry.userId));
        allUsers.filter(profile => profile.role === 'admin').forEach(profile => userIds.add(profile.id));
        userIds.delete(user.id);
        
        if (userIds.size > 0) {
          await notificationService.createMany(Array.from(userIds), {
            showId: selectedShow.id,
            type: 'general-idea-updated',
            message: `${user.name} updated the general idea: "${idea.name}"`,
            actorId: user.id,
            actorName: user.name,
            actorAvatarUrl: user.avatarUrl,
            isRead: false,
          });
        }
      }
    } catch (error) {
      console.error('Failed to save general idea:', error);
    }
  };

  const handleSelectPlotThemes = () => {
    if (selectedShow) {
      const basePath = isPublicMode ? '/public' : '/app';
      router.push(`${basePath}/shows/${selectedShow.id}/plot-themes`);
    }
  };

  const handleAddPlotTheme = async (themeData: Omit<PlotTheme, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const newTheme = await createPlotTheme(themeData);
      if (!user || !selectedShow) return;
      
      // Notify show members about new plot theme
      const [showAccess, episodeAccess, allUsers] = await Promise.all([
        showAccessService.getByShow(selectedShow.id),
        episodeAccessService.getByShow(selectedShow.id),
        userService.getAll(),
      ]);
      const userIds = new Set<string>();
      if (selectedShow.ownerId) userIds.add(selectedShow.ownerId);
      showAccess.forEach(entry => userIds.add(entry.userId));
      episodeAccess.forEach(entry => userIds.add(entry.userId));
      allUsers.filter(profile => profile.role === 'admin').forEach(profile => userIds.add(profile.id));
      userIds.delete(user.id);
      
      if (userIds.size > 0) {
        await notificationService.createMany(Array.from(userIds), {
          showId: selectedShow.id,
          type: 'plot-theme-created',
          message: `${user.name} added a new plot theme: "${themeData.name}"`,
          actorId: user.id,
          actorName: user.name,
          actorAvatarUrl: user.avatarUrl,
          isRead: false,
        });
      }
    } catch (error) {
      console.error('Failed to create plot theme:', error);
    }
  };

  const handleEditPlotTheme = async (theme: PlotTheme) => {
    try {
      const existingTheme = plotThemes.find(t => t.id === theme.id);
      await updatePlotTheme(theme.id, theme);
      
      if (!user || !selectedShow || !existingTheme) return;
      
      const [showAccess, episodeAccess, allUsers] = await Promise.all([
        showAccessService.getByShow(selectedShow.id),
        episodeAccessService.getByShow(selectedShow.id),
        userService.getAll(),
      ]);
      const userIds = new Set<string>();
      if (selectedShow.ownerId) userIds.add(selectedShow.ownerId);
      showAccess.forEach(entry => userIds.add(entry.userId));
      episodeAccess.forEach(entry => userIds.add(entry.userId));
      allUsers.filter(profile => profile.role === 'admin').forEach(profile => userIds.add(profile.id));
      userIds.delete(user.id);
      
      if (userIds.size > 0) {
        await notificationService.createMany(Array.from(userIds), {
          showId: selectedShow.id,
          type: 'plot-theme-updated',
          message: `${user.name} updated the plot theme: "${theme.name}"`,
          actorId: user.id,
          actorName: user.name,
          actorAvatarUrl: user.avatarUrl,
          isRead: false,
        });
      }
    } catch (error) {
      console.error('Failed to update plot theme:', error);
    }
  };

  const handleDeletePlotTheme = async (themeId: string) => {
    try {
      await deletePlotTheme(themeId);
    } catch (error) {
      console.error('Failed to delete plot theme:', error);
    }
  };

  const handleSaveCharacter = async (character: Character) => {
    try {
      console.log('🔥 Saving character to Firebase:', {
        characterId: character.id,
        characterName: character.name,
        uploadedModels: character.uploadedModels,
        uploadedModelsLength: character.uploadedModels?.length || 0
      });
      
      // Extract only the fields that need to be updated
      const updates = {
        name: character.name,
        description: character.description,
        isMainCharacter: character.isMainCharacter,
        general: character.general,
        clothing: character.clothing,
        pose: character.pose,
        voice: character.voice,
        mainImage: character.mainImage,
        modelFiles: character.modelFiles,
        characterGallery: character.characterGallery,
        characterVideoGallery: character.characterVideoGallery,
        conceptVideos: character.conceptVideos,
        renderVideos: character.renderVideos,
        uploadedModels: character.uploadedModels,
        concepts: character.concepts,
        aiRefImages: character.aiRefImages,
      };
      
      console.log('🔥 Updates being sent to Firebase:', updates);
      console.log('🔥 Character concepts being saved:', character.concepts);
      await updateGlobalAsset(character.id, updates);
      console.log('✅ Character saved to Firebase successfully');
      
      // Also update the selectedAsset if it's the same character
      if (selectedAsset && selectedAsset.id === character.id) {
        setSelectedAsset({ ...selectedAsset, ...updates });
      }
    } catch (error) {
      console.error('❌ Failed to save character:', error);
    }
  };

  const handleAddConcept = async (conceptData: Omit<AssetConcept, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const newConcept = await createAssetConcept(conceptData);
      
      // Update the asset to include the new concept
      if (selectedAsset) {
        const updatedAsset = {
          ...selectedAsset,
          concepts: [...selectedAsset.concepts, newConcept]
        };
        
        // Update the asset in the global assets
        await updateGlobalAsset(selectedAsset.id, { concepts: updatedAsset.concepts });
        
        // Update the selectedAsset state
        setSelectedAsset(updatedAsset);
      }
    } catch (error) {
      console.error('Failed to add concept:', error);
    }
  };

  const handleDeleteConcept = async (conceptId: string) => {
    try {
      if (selectedAsset) {
        await deleteAssetConcept(conceptId, selectedAsset.id);
        
        // Update the asset to reflect the deleted concept
        const updatedAsset = {
          ...selectedAsset,
          concepts: selectedAsset.concepts.filter(c => c.id !== conceptId)
        };
        
        // Update the global assets to reflect the deleted concept
        await updateGlobalAsset(selectedAsset.id, { concepts: updatedAsset.concepts });
        
        // Update the selectedAsset state
        setSelectedAsset(updatedAsset);
      }
    } catch (error) {
      console.error('Failed to delete concept:', error);
    }
  };

  const handleSelectEpisode = (episode: Episode) => {
    const basePath = isPublicMode ? '/public' : '/app';
    router.push(`${basePath}/shows/${selectedShow?.id}/episodes/${episode.id}`);
  };

  const handleEditEpisode = async (episode: Episode) => {
    try {
      // Only send the changed fields, not the entire episode object
      // This prevents issues with nested entities
      const updates: Partial<Episode> = {
        avScript: episode.avScript,
        screenplayData: episode.screenplayData,
        title: episode.title,
        description: episode.description,
        episodeNumber: episode.episodeNumber,
        characters: episode.characters,
        locations: episode.locations,
        scenes: episode.scenes,
      };
      await updateEpisode(episode.id, updates);
    } catch (error) {
      console.error('Failed to update episode:', error);
      throw error; // Re-throw to show error to user
    }
  };

  const handleDeleteEpisode = async (episodeId: string) => {
    try {
      await deleteEpisode(episodeId);
      if (selectedEpisode?.id === episodeId) {
        setSelectedEpisode(null);
        setCurrentView('episodes');
      }
    } catch (error) {
      console.error('Failed to delete episode:', error);
    }
  };

  // Episode Ideas handlers
  const handleSaveEpisodeIdea = async (ideaData: Omit<EpisodeIdea, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const newIdea = await createEpisodeIdea(ideaData);
      if (!user || !selectedShow) return;
      
      // Notify show members about new episode idea
      const [showAccess, episodeAccess, allUsers] = await Promise.all([
        showAccessService.getByShow(selectedShow.id),
        episodeAccessService.getByShow(selectedShow.id),
        userService.getAll(),
      ]);
      const userIds = new Set<string>();
      if (selectedShow.ownerId) userIds.add(selectedShow.ownerId);
      showAccess.forEach(entry => userIds.add(entry.userId));
      episodeAccess.forEach(entry => userIds.add(entry.userId));
      allUsers.filter(profile => profile.role === 'admin').forEach(profile => userIds.add(profile.id));
      userIds.delete(user.id);
      
      if (userIds.size > 0) {
        await notificationService.createMany(Array.from(userIds), {
          showId: selectedShow.id,
          type: 'episode-idea-created',
          message: `${user.name} added a new episode idea: "${ideaData.title}"`,
          actorId: user.id,
          actorName: user.name,
          actorAvatarUrl: user.avatarUrl,
          isRead: false,
        });
      }
    } catch (error) {
      console.error('Failed to save episode idea:', error);
    }
  };

  const handleUpdateEpisodeIdea = async (id: string, updates: Partial<EpisodeIdea>) => {
    try {
      const existingIdea = episodeIdeas.find(i => i.id === id);
      await updateEpisodeIdea(id, updates);
      
      if (!user || !selectedShow || !existingIdea) return;
      
      const [showAccess, episodeAccess, allUsers] = await Promise.all([
        showAccessService.getByShow(selectedShow.id),
        episodeAccessService.getByShow(selectedShow.id),
        userService.getAll(),
      ]);
      const userIds = new Set<string>();
      if (selectedShow.ownerId) userIds.add(selectedShow.ownerId);
      showAccess.forEach(entry => userIds.add(entry.userId));
      episodeAccess.forEach(entry => userIds.add(entry.userId));
      allUsers.filter(profile => profile.role === 'admin').forEach(profile => userIds.add(profile.id));
      userIds.delete(user.id);
      
      if (userIds.size > 0) {
        await notificationService.createMany(Array.from(userIds), {
          showId: selectedShow.id,
          type: 'episode-idea-updated',
          message: `${user.name} updated an episode idea: "${existingIdea.title}"`,
          actorId: user.id,
          actorName: user.name,
          actorAvatarUrl: user.avatarUrl,
          isRead: false,
        });
      }
    } catch (error) {
      console.error('Failed to update episode idea:', error);
    }
  };

  const handleDeleteEpisodeIdea = async (id: string) => {
    try {
      await deleteEpisodeIdea(id);
    } catch (error) {
      console.error('Failed to delete episode idea:', error);
    }
  };

  const handleSaveEpisode = async (episode: Episode) => {
    try {
      const existingEpisode = episodes.find(e => e.id === episode.id);
      await updateEpisode(episode.id, episode);
      const screenplayChanged = JSON.stringify(existingEpisode?.screenplayData ?? null) !== JSON.stringify(episode.screenplayData ?? null);
      const avScriptChanged = JSON.stringify(existingEpisode?.avScript ?? null) !== JSON.stringify(episode.avScript ?? null);
      const descriptionChanged = existingEpisode?.description !== episode.description;
      const showId = episode.showId;
      const show = shows.find(s => s.id === showId);

      const notifyShowMembers = async (message: string, type: NotificationType) => {
        if (!user) return;
        const [showAccess, episodeAccess, allUsers] = await Promise.all([
          showAccessService.getByShow(showId),
          episodeAccessService.getByShow(showId),
          userService.getAll(),
        ]);
        const userIds = new Set<string>();
        if (show?.ownerId) userIds.add(show.ownerId);
        if (episode.ownerId) userIds.add(episode.ownerId);
        showAccess.forEach(entry => userIds.add(entry.userId));
        episodeAccess.forEach(entry => userIds.add(entry.userId));
        allUsers.filter(profile => profile.role === 'admin').forEach(profile => userIds.add(profile.id));
        userIds.delete(user.id);
        if (userIds.size === 0) return;
        await notificationService.createMany(Array.from(userIds), {
          showId,
          episodeId: episode.id,
          type,
          message,
          actorId: user.id,
          actorName: user.name,
          actorAvatarUrl: user.avatarUrl,
          isRead: false,
        });
      };

      if (screenplayChanged) {
        await notifyShowMembers(`${user?.name || 'Someone'} updated the screenplay in "${episode.title}"`, 'screenplay-updated');
      }
      if (avScriptChanged) {
        await notifyShowMembers(`${user?.name || 'Someone'} updated the AV script in "${episode.title}"`, 'av-script-updated');
      }
      if (descriptionChanged) {
        await notifyShowMembers(`${user?.name || 'Someone'} updated the description for "${episode.title}"`, 'episode-description-updated');
      }
      // Don't update selectedEpisode here - let the episodes array update handle it
      // This prevents creating unnecessary prop changes that trigger re-renders
    } catch (error) {
      console.error('Failed to save episode:', error);
    }
  };


  // Track loading state more accurately
  const isInitialLoad = loading && shows.length === 0;
  
  // Check if we have the correct data for the selected show
  // This must be checked BEFORE rendering content to prevent flicker
  const currentlyLoadedShowId = getLoadedShowId();
  
  // Verify that existing data actually belongs to the selected show
  // This prevents showing data from a previous show
  const hasCorrectData = selectedShow && 
    currentlyLoadedShowId === selectedShow.id &&
    (globalAssets.length === 0 || globalAssets.every(a => a.showId === selectedShow.id)) &&
    (episodes.length === 0 || episodes.every(e => e.showId === selectedShow.id));
  
  // Check if we need to load data for the selected show
  // We need to load if:
  // 1. We have a selected show
  // 2. Shows are loaded (initial load is complete)
  // 3. We don't have the correct data for this show
  const needsShowData = selectedShow && 
    shows.length > 0 && // Shows are loaded
    !hasCorrectData; // We don't have correct data for this show
  
  // Track if we're loading show-specific data
  // Show loader if we need data AND (we're loading OR about to load)
  const isLoadingShowData = needsShowData && (loading || isAboutToLoad);
  
  // Show loading preloader during initial load
  if (isInitialLoad) {
    return <LoadingPreloader message="Loading your shows..." />;
  }
  
  // Show loading when we need to load data for the selected show
  // This prevents showing content with wrong/empty data from previous show
  if (needsShowData && selectedShow) {
    return <LoadingPreloader message={`Loading ${selectedShow.name}...`} />;
  }

  // Show error state
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 mb-4">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Error Loading Data</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Render current view
  const renderContent = () => {
    switch (currentView) {
    case 'shows':
      return (
        <ShowSelection
          shows={visibleShows}
          onSelectShow={handleSelectShow}
          onAddShow={isPublicMode ? () => {} : handleAddShow}
          onEditShow={isPublicMode ? () => {} : handleEditShow}
          onDeleteShow={isPublicMode ? () => {} : handleDeleteShow}
          onArchiveShow={isPublicMode ? () => {} : handleArchiveShow}
          canEditShow={(show) => access.canEdit(access.getShowAccessRole(show))}
          canCreateShow={!isPublicMode}
        />
      );

    case 'dashboard':
      return selectedShow ? (
        <ShowDashboard
          show={selectedShow}
          globalAssets={globalAssets}
          episodes={visibleEpisodes}
          episodeIdeas={episodeIdeas}
          generalIdeas={generalIdeas}
          plotThemes={plotThemes}
          onBack={handleBackToShows}
          onSelectGlobalAssets={handleSelectGlobalAssets}
          onSelectEpisodes={handleSelectEpisodes}
          onSelectEpisode={handleSelectEpisode}
          onSelectEpisodeIdeas={handleSelectEpisodeIdeas}
          onSelectGeneralIdeas={handleSelectGeneralIdeas}
          onSelectPlotThemes={handleSelectPlotThemes}
          onAddGlobalAsset={showReadOnly ? undefined : handleAddGlobalAsset}
          onAddEpisode={showReadOnly ? undefined : handleAddEpisode}
          onSaveShow={showReadOnly ? undefined : handleEditShow}
          isPublicMode={isPublicMode}
          isReadOnly={showReadOnly}
          hasOnlyEpisodeAccess={hasOnlyEpisodeLevelAccess}
        />
      ) : null;

    case 'global-assets':
      return selectedShow ? (
        <GlobalAssetsManager
          show={selectedShow}
          globalAssets={globalAssets}
          selectedCategory={selectedCategory}
          onBack={handleBackToDashboard}
          onSelectCategory={setSelectedCategory}
          onSelectAsset={handleSelectAsset}
          onAddAsset={showReadOnly ? () => {} : handleAddGlobalAsset}
          onEditAsset={showReadOnly ? () => {} : (asset) => console.log('Edit asset:', asset)}
          onDeleteAsset={showReadOnly ? () => {} : handleDeleteGlobalAsset}
          onToggleMainCharacter={showReadOnly ? undefined : handleToggleMainCharacter}
          isReadOnly={showReadOnly}
        />
      ) : null;

    case 'asset-detail':
    case 'character-detail':
    case 'location-detail':
    case 'gadget-detail':
    case 'texture-detail':
    case 'background-detail':
    case 'vehicle-detail':
      return selectedAsset ? (
        (() => {
          switch (selectedAsset.category) {
            case 'character':
              return (
                <CharacterDetail
                  show={selectedShow as Show}
                  character={selectedAsset as Character}
                  onBack={handleBackToGlobalAssets}
                  onSave={showReadOnly ? () => {} : handleSaveCharacter}
                  onAddConcept={showReadOnly ? () => {} : handleAddConcept}
                  onDeleteConcept={showReadOnly ? () => {} : handleDeleteConcept}
                  globalAssets={globalAssets}
                  isReadOnly={showReadOnly}
                />
              );
            case 'location':
              return (
                <LocationDetail
                  show={selectedShow as Show}
                  location={selectedAsset}
                  onBack={handleBackToGlobalAssets}
                  onSave={showReadOnly ? () => {} : handleSaveGlobalAsset}
                  onDeleteConcept={showReadOnly ? () => {} : handleDeleteConcept}
                  globalAssets={globalAssets}
                  isReadOnly={showReadOnly}
                />
              );
            case 'gadget':
              return (
                <GadgetDetail
                  show={selectedShow as Show}
                  gadget={selectedAsset}
                  onBack={handleBackToGlobalAssets}
                  onSave={showReadOnly ? () => {} : handleSaveGlobalAsset}
                  onDeleteConcept={showReadOnly ? () => {} : handleDeleteConcept}
                  globalAssets={globalAssets}
                  isReadOnly={showReadOnly}
                />
              );
            case 'texture':
              return (
                <TextureDetail
                  show={selectedShow as Show}
                  texture={selectedAsset}
                  onBack={handleBackToGlobalAssets}
                  onSave={showReadOnly ? () => {} : handleSaveGlobalAsset}
                  onDeleteConcept={showReadOnly ? () => {} : handleDeleteConcept}
                  isReadOnly={showReadOnly}
                />
              );
            case 'background':
              return (
                <BackgroundDetail
                  show={selectedShow as Show}
                  background={selectedAsset}
                  onBack={handleBackToGlobalAssets}
                  onSave={showReadOnly ? () => {} : handleSaveGlobalAsset}
                  onDeleteConcept={showReadOnly ? () => {} : handleDeleteConcept}
                  isReadOnly={showReadOnly}
                />
              );
            case 'vehicle':
              return (
                <VehicleDetail
                  show={selectedShow as Show}
                  vehicle={selectedAsset}
                  onBack={handleBackToGlobalAssets}
                  onSave={showReadOnly ? () => {} : handleSaveGlobalAsset}
                  onAddConcept={showReadOnly ? () => {} : handleAddConcept}
                  onDeleteConcept={showReadOnly ? () => {} : handleDeleteConcept}
                  globalAssets={globalAssets}
                  isReadOnly={showReadOnly}
                />
              );
            default:
              return null;
          }
        })()
      ) : null;


    case 'episodes':
      return selectedShow ? (
        <EpisodeList
          show={selectedShow}
          episodes={visibleEpisodes}
          onBack={handleBackToDashboard}
          onSelectEpisode={handleSelectEpisode}
          onAddEpisode={showReadOnly ? () => {} : handleAddEpisode}
          onEditEpisode={showReadOnly ? () => {} : handleEditEpisode}
          onDeleteEpisode={showReadOnly ? () => {} : handleDeleteEpisode}
          isReadOnly={showReadOnly}
        />
      ) : null;

    case 'episode-detail':
      return selectedShow && selectedEpisode ? (
        <EpisodeDetail
          show={selectedShow}
          episode={selectedEpisode}
          globalAssets={globalAssets}
          plotThemes={plotThemes}
          onBack={handleBackToEpisodes}
          onSave={episodeReadOnly ? () => {} : handleSaveEpisode}
          isReadOnly={episodeReadOnly}
          canComment={canCommentOnEpisode}
          hasOnlyEpisodeAccess={hasOnlyEpisodeLevelAccess}
        />
      ) : null;

    case 'episode-ideas':
      return selectedShow ? (
        <EpisodeIdeas
          show={selectedShow}
          ideas={episodeIdeas}
          onBack={handleBackToDashboard}
          onSaveIdea={showReadOnly ? async () => {} : handleSaveEpisodeIdea}
          onUpdateIdea={showReadOnly ? async () => {} : handleUpdateEpisodeIdea}
          onDeleteIdea={showReadOnly ? async () => {} : handleDeleteEpisodeIdea}
          isReadOnly={showReadOnly}
        />
      ) : null;

    case 'general-ideas':
      return selectedShow ? (
        <GeneralIdeas
          show={selectedShow}
          ideas={generalIdeas}
          onBack={handleBackToDashboard}
          onSelectIdea={handleSelectGeneralIdea}
          onAddIdea={showReadOnly ? () => {} : handleAddGeneralIdea}
          onEditIdea={showReadOnly ? () => {} : handleEditGeneralIdea}
          onDeleteIdea={showReadOnly ? () => {} : handleDeleteGeneralIdea}
          isReadOnly={showReadOnly}
        />
      ) : null;

    case 'plot-themes':
      return selectedShow ? (
        <PlotThemes
          show={selectedShow}
          themes={plotThemes}
          onBack={handleBackToDashboard}
          onAddTheme={showReadOnly ? () => {} : handleAddPlotTheme}
          onEditTheme={showReadOnly ? () => {} : handleEditPlotTheme}
          onDeleteTheme={showReadOnly ? () => {} : handleDeletePlotTheme}
          isReadOnly={showReadOnly}
        />
      ) : null;

    case 'general-idea-detail':
      return selectedShow && selectedGeneralIdea ? (
        <GeneralIdeaDetail
          show={selectedShow}
          idea={selectedGeneralIdea}
          onBack={handleBackToGeneralIdeas}
          onSave={showReadOnly ? () => {} : handleSaveGeneralIdea}
          isReadOnly={showReadOnly}
          canComment={canCommentOnShow}
        />
      ) : null;

      default:
        return null;
    }
  };

  return (
    <>
      {renderContent()}
      {!isPublicMode && (
        <ChatWidget show={selectedShow} isDisabled={!selectedShow} />
      )}
    </>
  );
}
