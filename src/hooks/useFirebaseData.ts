import { useState, useEffect } from 'react';
import { showService, globalAssetService, episodeService, assetConceptService } from '@/lib/firebase-services';
import { Show, GlobalAsset, Episode, AssetConcept } from '@/types';
import { setupDemoData } from '@/lib/demo-data-setup';

export function useFirebaseData() {
  const [shows, setShows] = useState<Show[]>([]);
  const [globalAssets, setGlobalAssets] = useState<GlobalAsset[]>([]);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load initial data
  useEffect(() => {
    // Add a small delay to prevent immediate loading issues
    const timer = setTimeout(() => {
      loadData();
    }, 100);
    
    return () => clearTimeout(timer);
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Add timeout to prevent infinite loading
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Loading timeout')), 10000)
      );
      
      const loadPromise = async () => {
        // Try to load shows first without demo data setup
        const showsData = await showService.getAll();
        setShows(showsData);
        setGlobalAssets([]);
        setEpisodes([]);
        
        // If no shows exist, then set up demo data
        if (showsData.length === 0) {
          console.log('No shows found, setting up demo data...');
          await setupDemoData();
          // Reload shows after demo data setup
          const updatedShowsData = await showService.getAll();
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
      // Don't set error for timeout, just continue with empty data
      if (!(err instanceof Error && err.message === 'Loading timeout')) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      }
    } finally {
      setLoading(false);
    }
  };

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
      setEpisodes(prev => prev.map(episode => 
        episode.id === id ? { ...episode, ...updates, updatedAt: new Date() } : episode
      ));
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

  // Load data for specific show
  const loadShowData = async (showId: string) => {
    try {
      setLoading(true);
      const [assetsData, episodesData] = await Promise.all([
        globalAssetService.getByShow(showId),
        episodeService.getByShow(showId),
      ]);
      
      setGlobalAssets(assetsData);
      setEpisodes(episodesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load show data');
      console.error('Error loading show data:', err);
    } finally {
      setLoading(false);
    }
  };

  return {
    // Data
    shows,
    globalAssets,
    episodes,
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
    
    // Asset Concept operations
    createAssetConcept,
    deleteAssetConcept,
    
    // Utility
    loadShowData,
    loadData,
  };
}
