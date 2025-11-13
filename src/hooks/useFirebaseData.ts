import { useState, useEffect, useCallback, useRef } from 'react';
import { showService, globalAssetService, episodeService, assetConceptService, episodeIdeaService, generalIdeaService } from '@/lib/firebase-services';
import { Show, GlobalAsset, Episode, AssetConcept, EpisodeIdea, GeneralIdea } from '@/types';
import { setupDemoData } from '@/lib/demo-data-setup';

export function useFirebaseData() {
  const [shows, setShows] = useState<Show[]>([]);
  const [globalAssets, setGlobalAssets] = useState<GlobalAsset[]>([]);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [episodeIdeas, setEpisodeIdeas] = useState<EpisodeIdea[]>([]);
  const [generalIdeas, setGeneralIdeas] = useState<GeneralIdea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isLoadingRef = useRef(false);

  const loadData = useCallback(async () => {
    // Prevent multiple simultaneous calls
    if (isLoadingRef.current) {
      console.log('Data loading already in progress, skipping...');
      return;
    }
    
    try {
      isLoadingRef.current = true;
      setLoading(true);
      setError(null);
      
      // Add timeout to prevent infinite loading
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Loading timeout')), 10000)
      );
      
      const loadPromise = async () => {
        console.log('Starting to load shows...');
        // Try to load shows first without demo data setup
        const showsData = await showService.getAll();
        console.log('Loaded shows:', showsData.length);
        setShows(showsData);
        setGlobalAssets([]);
        setEpisodes([]);
        setEpisodeIdeas([]);
        setGeneralIdeas([]);
        
        // If no shows exist, then set up demo data
        if (showsData.length === 0) {
          console.log('No shows found, setting up demo data...');
          await setupDemoData();
          // Reload shows after demo data setup
          const updatedShowsData = await showService.getAll();
          console.log('Loaded shows after demo setup:', updatedShowsData.length);
          setShows(updatedShowsData);
        }
      };
      
      await Promise.race([loadPromise(), timeoutPromise]);
    } catch (err) {
      console.error('Error loading data:', err);
      // Set empty arrays as fallback and continue
      setShows([]);
      setGlobalAssets([]);
      setEpisodes([]);
      setEpisodeIdeas([]);
      setGeneralIdeas([]);
      // Set error for timeout or other issues
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      isLoadingRef.current = false;
      setLoading(false);
    }
  }, []);

  // Load initial data
  useEffect(() => {
    // Add a small delay to prevent immediate loading issues
    const timer = setTimeout(() => {
      loadData();
    }, 100);
    
    return () => clearTimeout(timer);
  }, [loadData]); // Include loadData dependency

  // Show operations
  const createShow = async (show: Omit<Show, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const newShow = await showService.create(show);
      setShows(prev => [...prev, newShow]);
      return newShow;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create show');
      throw err;
    }
  };

  const updateShow = async (id: string, updates: Partial<Show>) => {
    try {
      await showService.update(id, updates);
      setShows(prev => prev.map(show => 
        show.id === id ? { ...show, ...updates, updatedAt: new Date() } : show
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update show');
      throw err;
    }
  };

  const deleteShow = async (id: string) => {
    try {
      await showService.delete(id);
      setShows(prev => prev.filter(show => show.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete show');
      throw err;
    }
  };

  // Global Asset operations
  const createGlobalAsset = async (asset: Omit<GlobalAsset, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const newAsset = await globalAssetService.create(asset);
      setGlobalAssets(prev => [...prev, newAsset]);
      return newAsset;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create asset');
      throw err;
    }
  };

  const updateGlobalAsset = async (id: string, updates: Partial<GlobalAsset>) => {
    try {
      await globalAssetService.update(id, updates);
      setGlobalAssets(prev => prev.map(asset => 
        asset.id === id ? { ...asset, ...updates, updatedAt: new Date() } : asset
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update asset');
      throw err;
    }
  };

  const deleteGlobalAsset = async (id: string) => {
    try {
      await globalAssetService.delete(id);
      setGlobalAssets(prev => prev.filter(asset => asset.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete asset');
      throw err;
    }
  };

  // Episode operations
  const createEpisode = async (episode: Omit<Episode, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const newEpisode = await episodeService.create(episode);
      setEpisodes(prev => [...prev, newEpisode]);
      return newEpisode;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create episode');
      throw err;
    }
  };

  const updateEpisode = async (id: string, updates: Partial<Episode>) => {
    try {
      await episodeService.update(id, updates);
      // Update episodes array without causing unnecessary re-renders
      // Only update if the episode actually changed
      setEpisodes(prev => {
        const existingEpisode = prev.find(e => e.id === id);
        if (!existingEpisode) return prev;
        
        // Check if anything actually changed
        const hasChanges = Object.keys(updates).some(key => {
          const oldValue = (existingEpisode as any)[key];
          const newValue = (updates as any)[key];
          return JSON.stringify(oldValue) !== JSON.stringify(newValue);
        });
        
        if (!hasChanges) {
          return prev; // No changes, return same array reference
        }
        
        // Update the episode
        return prev.map(episode => 
          episode.id === id ? { ...episode, ...updates, updatedAt: new Date() } : episode
        );
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update episode');
      throw err;
    }
  };

  const deleteEpisode = async (id: string) => {
    try {
      await episodeService.delete(id);
      setEpisodes(prev => prev.filter(episode => episode.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete episode');
      throw err;
    }
  };

  // Episode Idea operations
  const createEpisodeIdea = async (ideaData: Omit<EpisodeIdea, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const newIdea = await episodeIdeaService.create(ideaData);
      setEpisodeIdeas(prev => [...prev, newIdea]);
      return newIdea;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create episode idea');
      throw err;
    }
  };

  const updateEpisodeIdea = async (id: string, updates: Partial<EpisodeIdea>) => {
    try {
      await episodeIdeaService.update(id, updates);
      setEpisodeIdeas(prev => prev.map(idea => 
        idea.id === id ? { ...idea, ...updates } : idea
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update episode idea');
      throw err;
    }
  };

  const deleteEpisodeIdea = async (id: string) => {
    try {
      await episodeIdeaService.delete(id);
      setEpisodeIdeas(prev => prev.filter(idea => idea.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete episode idea');
      throw err;
    }
  };

  // Asset Concept operations
  const createAssetConcept = async (concept: Omit<AssetConcept, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const newConcept = await assetConceptService.create(concept);
      // Update the parent asset's concepts array
      setGlobalAssets(prev => prev.map(asset => 
        asset.id === concept.assetId 
          ? { ...asset, concepts: [...asset.concepts, newConcept] }
          : asset
      ));
      return newConcept;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create concept');
      throw err;
    }
  };

  const deleteAssetConcept = async (id: string, assetId: string) => {
    try {
      await assetConceptService.delete(id);
      setGlobalAssets(prev => prev.map(asset => 
        asset.id === assetId 
          ? { ...asset, concepts: asset.concepts.filter(concept => concept.id !== id) }
          : asset
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete concept');
      throw err;
    }
  };

  // General Idea operations
  const createGeneralIdea = async (idea: Omit<GeneralIdea, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const newIdea = await generalIdeaService.create(idea);
      setGeneralIdeas(prev => [...prev, newIdea]);
      return newIdea;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create general idea');
      throw err;
    }
  };

  const updateGeneralIdea = async (id: string, updates: Partial<GeneralIdea>) => {
    try {
      await generalIdeaService.update(id, updates);
      setGeneralIdeas(prev => prev.map(idea => 
        idea.id === id ? { ...idea, ...updates, updatedAt: new Date() } : idea
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update general idea');
      throw err;
    }
  };

  const deleteGeneralIdea = async (id: string) => {
    try {
      await generalIdeaService.delete(id);
      setGeneralIdeas(prev => prev.filter(idea => idea.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete general idea');
      throw err;
    }
  };

  // Track which show's data has been loaded to prevent redundant loads
  const loadedShowIdRef = useRef<string | null>(null);
  const isLoadingShowDataRef = useRef(false);
  const lastLoadTimeRef = useRef<number>(0);
  const loadPromiseRef = useRef<Promise<void> | null>(null);
  const episodesRef = useRef<Episode[]>([]);

  // Keep episodesRef in sync with episodes state
  useEffect(() => {
    episodesRef.current = episodes;
  }, [episodes]);

  // Load data for specific show - memoized to prevent infinite loops
  const loadShowData = useCallback(async (showId: string, forceReload = false) => {
    // STRICT: Don't load more than once per 30 seconds for the same show (increased from 10s)
    const now = Date.now();
    const timeSinceLastLoad = now - lastLoadTimeRef.current;
    
    if (!forceReload && loadedShowIdRef.current === showId) {
      // If we loaded this show recently, skip
      if (timeSinceLastLoad < 30000) {
        console.log(`⏭️ Skipping loadShowData - loaded ${Math.round(timeSinceLastLoad / 1000)}s ago (throttle: 30s)`);
        return;
      }
      
      // If we have data for this show, don't reload
      if (episodesRef.current.length > 0 && episodesRef.current.some(e => e.showId === showId)) {
        console.log('⏭️ Skipping loadShowData - data already exists for this show');
        // Update the last load time to prevent repeated checks
        lastLoadTimeRef.current = now;
        return;
      }
    }

    // Skip if we're already loading this show's data
    if (isLoadingShowDataRef.current) {
      if (loadedShowIdRef.current === showId) {
        console.log('⏭️ Skipping loadShowData - already loading');
        // Return the existing promise if it exists
        if (loadPromiseRef.current) {
          return loadPromiseRef.current;
        }
        return;
      }
      console.log('⏭️ Skipping loadShowData - loading different show');
      return;
    }

    // Create a promise that we can return if called multiple times
    const loadPromise = (async () => {
      try {
        isLoadingShowDataRef.current = true;
        lastLoadTimeRef.current = Date.now();
        console.log('🔄 Loading show data for:', showId);
        
        // Don't set loading to true if we already have data (prevents UI flicker)
        if (loadedShowIdRef.current === null) {
          setLoading(true);
        }
        
        const [assetsData, episodesData, ideasData, generalIdeasData] = await Promise.all([
          globalAssetService.getByShow(showId),
          episodeService.getByShow(showId),
          episodeIdeaService.getByShow(showId),
          generalIdeaService.getByShow(showId),
        ]);
        
        // Update state - we've already checked that we should load this showId
        setGlobalAssets(assetsData);
        setEpisodes(episodesData);
        setEpisodeIdeas(ideasData);
        setGeneralIdeas(generalIdeasData);
        loadedShowIdRef.current = showId;
        console.log('✅ Loaded show data for:', showId);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load show data');
        console.error('❌ Error loading show data:', err);
        // Reset loadedShowIdRef on error so we can retry
        if (loadedShowIdRef.current === showId) {
          loadedShowIdRef.current = null;
        }
      } finally {
        isLoadingShowDataRef.current = false;
        loadPromiseRef.current = null;
        setLoading(false);
      }
    })();

    loadPromiseRef.current = loadPromise;
    return loadPromise;
  }, []);

  return {
    // Data
    shows,
    globalAssets,
    episodes,
    episodeIdeas,
    generalIdeas,
    loading,
    error,
    
    // Show operations
    createShow,
    updateShow,
    deleteShow,
    
    // Global Asset operations
    createGlobalAsset,
    updateGlobalAsset,
    deleteGlobalAsset,
    
    // Episode operations
    createEpisode,
    updateEpisode,
    deleteEpisode,
    
    // Episode Idea operations
    createEpisodeIdea,
    updateEpisodeIdea,
    deleteEpisodeIdea,
    
    // General Idea operations
    createGeneralIdea,
    updateGeneralIdea,
    deleteGeneralIdea,
    
    // Asset Concept operations
    createAssetConcept,
    deleteAssetConcept,
    
    // Utility
    loadShowData,
    loadData,
  };
}
