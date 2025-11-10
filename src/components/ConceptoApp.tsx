'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { Show, GlobalAsset, Episode, Character, AssetConcept, EpisodeIdea, GeneralIdea } from '@/types';
import { useFirebaseData } from '@/hooks/useFirebaseData';

type AppView = 'shows' | 'dashboard' | 'global-assets' | 'asset-detail' | 'character-detail' | 'location-detail' | 'gadget-detail' | 'texture-detail' | 'background-detail' | 'vehicle-detail' | 'episodes' | 'episode-detail' | 'episode-ideas' | 'general-ideas' | 'general-idea-detail';

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
    createAssetConcept,
    deleteAssetConcept,
    loadShowData,
  } = useFirebaseData();

  // Initialize from URL parameters
  useEffect(() => {
    if (initialShowId && shows.length > 0) {
      const show = shows.find(s => s.id === initialShowId);
      if (show) {
        setSelectedShow(show);
        loadShowData(show.id);
      }
    }
  }, [initialShowId, shows, loadShowData]);

  useEffect(() => {
    if (initialEpisodeId && episodes.length > 0) {
      const episode = episodes.find(e => e.id === initialEpisodeId);
      if (episode) {
        setSelectedEpisode(episode);
      }
    }
  }, [initialEpisodeId, episodes]);

  useEffect(() => {
    if (initialAssetId && globalAssets.length > 0) {
      const asset = globalAssets.find(a => a.id === initialAssetId);
      if (asset) {
        setSelectedAsset(asset);
      }
    }
  }, [initialAssetId, globalAssets]);

  // Load show data when a show is selected
  useEffect(() => {
    if (selectedShow) {
      loadShowData(selectedShow.id);
    }
  }, [selectedShow, loadShowData]);

  const handleSelectShow = (show: Show) => {
    setSelectedShow(show);
    setCurrentView('dashboard');
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
      await updateShow(show.id, show);
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

  const handleAddGlobalAsset = async (assetData: Omit<GlobalAsset, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      await createGlobalAsset(assetData);
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
      await updateGlobalAsset(asset.id, asset);
      
      // Update the selectedAsset state to reflect the changes
      if (selectedAsset && selectedAsset.id === asset.id) {
        setSelectedAsset(asset);
      }
    } catch (error) {
      console.error('Error saving global asset:', error);
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
    setSelectedCategory(category || 'all');
    setCurrentView('global-assets');
    const basePath = isPublicMode ? '/public' : '/app';
    const categoryParam = category && category !== 'all' ? `?category=${category}` : '';
    router.push(`${basePath}/shows/${selectedShow?.id}/assets${categoryParam}`);
  };

  const handleSelectEpisodes = () => {
    setCurrentView('episodes');
    const basePath = isPublicMode ? '/public' : '/app';
    router.push(`${basePath}/shows/${selectedShow?.id}/episodes`);
  };

  const handleSelectEpisodeIdeas = () => {
    setCurrentView('episode-ideas');
  };

  const handleSelectGeneralIdeas = () => {
    setCurrentView('general-ideas');
  };

  const handleSelectAsset = (asset: GlobalAsset) => {
    setSelectedAsset(asset);
    const basePath = isPublicMode ? '/public' : '/app';
    router.push(`${basePath}/shows/${selectedShow?.id}/assets/${asset.id}`);
  };

  const handleBackToShows = () => {
    setCurrentView('shows');
    setSelectedShow(null);
    setSelectedAsset(null);
    setSelectedEpisode(null);
    setSelectedGeneralIdea(null);
    const basePath = isPublicMode ? '/public' : '/app';
    router.push(`${basePath}/shows`);
  };

  const handleBackToDashboard = () => {
    setCurrentView('dashboard');
    setSelectedAsset(null);
    setSelectedEpisode(null);
    setSelectedGeneralIdea(null);
    const basePath = isPublicMode ? '/public' : '/app';
    router.push(`${basePath}/shows/${selectedShow?.id}`);
  };

  const handleBackToGlobalAssets = () => {
    setCurrentView('global-assets');
    setSelectedAsset(null);
    const basePath = isPublicMode ? '/public' : '/app';
    const categoryParam = selectedCategory && selectedCategory !== 'all' ? `?category=${selectedCategory}` : '';
    router.push(`${basePath}/shows/${selectedShow?.id}/assets${categoryParam}`);
  };

  const handleBackToEpisodes = () => {
    setCurrentView('episodes');
    setSelectedEpisode(null);
    const basePath = isPublicMode ? '/public' : '/app';
    router.push(`${basePath}/shows/${selectedShow?.id}/episodes`);
  };

  const handleBackToGeneralIdeas = () => {
    setCurrentView('general-ideas');
    setSelectedGeneralIdea(null);
  };

  const handleSelectGeneralIdea = (idea: GeneralIdea) => {
    setSelectedGeneralIdea(idea);
    setCurrentView('general-idea-detail');
  };

  const handleAddGeneralIdea = async (ideaData: Omit<GeneralIdea, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      await createGeneralIdea(ideaData);
    } catch (error) {
      console.error('Failed to create general idea:', error);
    }
  };

  const handleEditGeneralIdea = async (idea: GeneralIdea) => {
    try {
      await updateGeneralIdea(idea.id, idea);
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
      await updateGeneralIdea(idea.id, idea);
      setSelectedGeneralIdea(idea);
    } catch (error) {
      console.error('Failed to save general idea:', error);
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
    setSelectedEpisode(episode);
    setCurrentView('episode-detail');
    const basePath = isPublicMode ? '/public' : '/app';
    router.push(`${basePath}/shows/${selectedShow?.id}/episodes/${episode.id}`);
  };

  const handleEditEpisode = async (episode: Episode) => {
    try {
      await updateEpisode(episode.id, episode);
    } catch (error) {
      console.error('Failed to update episode:', error);
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
      await createEpisodeIdea(ideaData);
    } catch (error) {
      console.error('Failed to save episode idea:', error);
    }
  };

  const handleUpdateEpisodeIdea = async (id: string, updates: Partial<EpisodeIdea>) => {
    try {
      await updateEpisodeIdea(id, updates);
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
      await updateEpisode(episode.id, episode);
    } catch (error) {
      console.error('Failed to save episode:', error);
    }
  };


  // Show loading state
  if (loading && shows.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your shows...</p>
        </div>
      </div>
    );
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
  switch (currentView) {
    case 'shows':
      return (
        <ShowSelection
          shows={shows}
          onSelectShow={handleSelectShow}
          onAddShow={isPublicMode ? () => {} : handleAddShow}
          onEditShow={isPublicMode ? () => {} : handleEditShow}
          onDeleteShow={isPublicMode ? () => {} : handleDeleteShow}
        />
      );

    case 'dashboard':
      return selectedShow ? (
        <ShowDashboard
          show={selectedShow}
          globalAssets={globalAssets}
          episodes={episodes}
          episodeIdeas={episodeIdeas}
          generalIdeas={generalIdeas}
          onBack={handleBackToShows}
          onSelectGlobalAssets={handleSelectGlobalAssets}
          onSelectEpisodes={handleSelectEpisodes}
          onSelectEpisode={handleSelectEpisode}
          onSelectEpisodeIdeas={handleSelectEpisodeIdeas}
          onSelectGeneralIdeas={handleSelectGeneralIdeas}
          onAddGlobalAsset={isPublicMode ? () => {} : handleAddGlobalAsset}
          onAddEpisode={isPublicMode ? () => {} : handleAddEpisode}
          isPublicMode={isPublicMode}
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
          onAddAsset={isPublicMode ? () => {} : handleAddGlobalAsset}
          onEditAsset={isPublicMode ? () => {} : (asset) => console.log('Edit asset:', asset)}
          onDeleteAsset={isPublicMode ? () => {} : handleDeleteGlobalAsset}
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
                  character={selectedAsset as Character}
                  onBack={handleBackToGlobalAssets}
                  onSave={isPublicMode ? () => {} : handleSaveCharacter}
                  onAddConcept={isPublicMode ? () => {} : handleAddConcept}
                  onDeleteConcept={isPublicMode ? () => {} : handleDeleteConcept}
                />
              );
            case 'location':
              return (
                <LocationDetail
                  location={selectedAsset}
                  onBack={handleBackToGlobalAssets}
                  onSave={isPublicMode ? () => {} : handleSaveGlobalAsset}
                  onDeleteConcept={isPublicMode ? () => {} : handleDeleteConcept}
                />
              );
            case 'gadget':
              return (
                <GadgetDetail
                  gadget={selectedAsset}
                  onBack={handleBackToGlobalAssets}
                  onSave={isPublicMode ? () => {} : handleSaveGlobalAsset}
                  onDeleteConcept={isPublicMode ? () => {} : handleDeleteConcept}
                />
              );
            case 'texture':
              return (
                <TextureDetail
                  texture={selectedAsset}
                  onBack={handleBackToGlobalAssets}
                  onSave={isPublicMode ? () => {} : handleSaveGlobalAsset}
                  onDeleteConcept={isPublicMode ? () => {} : handleDeleteConcept}
                />
              );
            case 'background':
              return (
                <BackgroundDetail
                  background={selectedAsset}
                  onBack={handleBackToGlobalAssets}
                  onSave={isPublicMode ? () => {} : handleSaveGlobalAsset}
                  onDeleteConcept={isPublicMode ? () => {} : handleDeleteConcept}
                />
              );
            case 'vehicle':
              return (
                <VehicleDetail
                  vehicle={selectedAsset}
                  onBack={handleBackToGlobalAssets}
                  onSave={isPublicMode ? () => {} : handleSaveGlobalAsset}
                  onDeleteConcept={isPublicMode ? () => {} : handleDeleteConcept}
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
          episodes={episodes}
          onBack={handleBackToDashboard}
          onSelectEpisode={handleSelectEpisode}
          onAddEpisode={isPublicMode ? () => {} : handleAddEpisode}
          onEditEpisode={isPublicMode ? () => {} : handleEditEpisode}
          onDeleteEpisode={isPublicMode ? () => {} : handleDeleteEpisode}
        />
      ) : null;

    case 'episode-detail':
      return selectedShow && selectedEpisode ? (
        <EpisodeDetail
          show={selectedShow}
          episode={selectedEpisode}
          globalAssets={globalAssets}
          onBack={handleBackToEpisodes}
          onSave={isPublicMode ? () => {} : handleSaveEpisode}
        />
      ) : null;

    case 'episode-ideas':
      return selectedShow ? (
        <EpisodeIdeas
          showId={selectedShow.id}
          ideas={episodeIdeas}
          onBack={handleBackToDashboard}
          onSaveIdea={isPublicMode ? async () => {} : handleSaveEpisodeIdea}
          onUpdateIdea={isPublicMode ? async () => {} : handleUpdateEpisodeIdea}
          onDeleteIdea={isPublicMode ? async () => {} : handleDeleteEpisodeIdea}
        />
      ) : null;

    case 'general-ideas':
      return selectedShow ? (
        <GeneralIdeas
          show={selectedShow}
          ideas={generalIdeas}
          onBack={handleBackToDashboard}
          onSelectIdea={handleSelectGeneralIdea}
          onAddIdea={isPublicMode ? () => {} : handleAddGeneralIdea}
          onEditIdea={isPublicMode ? () => {} : handleEditGeneralIdea}
          onDeleteIdea={isPublicMode ? () => {} : handleDeleteGeneralIdea}
        />
      ) : null;

    case 'general-idea-detail':
      return selectedShow && selectedGeneralIdea ? (
        <GeneralIdeaDetail
          idea={selectedGeneralIdea}
          onBack={handleBackToGeneralIdeas}
          onSave={isPublicMode ? () => {} : handleSaveGeneralIdea}
        />
      ) : null;

    default:
      return null;
  }
}
