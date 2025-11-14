import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  getDocs, 
  getDoc,
  query,
  where,
  Timestamp 
} from 'firebase/firestore';
import { db } from './firebase';
import { Show, GlobalAsset, Episode, AssetConcept, EpisodeIdea, GeneralIdea } from '@/types';

// Shows
export const showService = {
  async create(show: Omit<Show, 'id' | 'createdAt' | 'updatedAt'>): Promise<Show> {
    const docRef = await addDoc(collection(db, 'shows'), {
      ...show,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    
    const docSnap = await getDoc(docRef);
    return { id: docRef.id, ...docSnap.data() } as Show;
  },

  async getAll(): Promise<Show[]> {
    try {
      const querySnapshot = await getDocs(collection(db, 'shows'));
      const assets = querySnapshot.docs.map(doc => {
        const data = doc.data();
        
        // Helper function to safely convert timestamps
        const safeToDate = (timestamp: unknown): Date => {
          if (!timestamp) return new Date();
          if (timestamp instanceof Date) return timestamp;
          if (timestamp && typeof timestamp === 'object' && 'toDate' in timestamp && typeof (timestamp as {toDate: () => Date}).toDate === 'function') {
            return (timestamp as {toDate: () => Date}).toDate();
          }
          if (typeof timestamp === 'string' || typeof timestamp === 'number') {
            const date = new Date(timestamp);
            return isNaN(date.getTime()) ? new Date() : date;
          }
          return new Date();
        };

        return {
          id: doc.id,
          ...data,
          createdAt: safeToDate(data.createdAt),
          updatedAt: safeToDate(data.updatedAt),
        } as Show;
      });
      return assets;
    } catch (error) {
      console.error('Error fetching shows:', error);
      return []; // Return empty array on error
    }
  },

  async update(id: string, updates: Partial<Show>): Promise<void> {
    // Filter out undefined values to prevent Firebase errors
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, value]) => value !== undefined)
    );
    
    await updateDoc(doc(db, 'shows', id), {
      ...cleanUpdates,
      updatedAt: Timestamp.now(),
    });
  },

  async delete(id: string): Promise<void> {
    await deleteDoc(doc(db, 'shows', id));
  }
};

// Simple cache to prevent repeated queries
const queryCache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 5000; // 5 seconds cache

// Global Assets
export const globalAssetService = {
  async create(asset: Omit<GlobalAsset, 'id' | 'createdAt' | 'updatedAt'>): Promise<GlobalAsset> {
    // Filter out undefined values to prevent Firebase errors
    const cleanAsset = Object.fromEntries(
      Object.entries(asset).filter(([, value]) => value !== undefined)
    );
    
    const docRef = await addDoc(collection(db, 'globalAssets'), {
      ...cleanAsset,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    
    const docSnap = await getDoc(docRef);
    // Invalidate cache for this show
    const cacheKey = `globalAssets-${asset.showId}`;
    queryCache.delete(cacheKey);
    return { id: docRef.id, ...docSnap.data() } as GlobalAsset;
  },

  async getByShow(showId: string): Promise<GlobalAsset[]> {
    // Check cache first
    const cacheKey = `globalAssets-${showId}`;
    const cached = queryCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      return cached.data as GlobalAsset[];
    }

    const q = query(
      collection(db, 'globalAssets'),
      where('showId', '==', showId)
    );
    const querySnapshot = await getDocs(q);
    const assets = querySnapshot.docs.map(doc => {
      const data = doc.data();
      
      // Convert uploadedModels Timestamps back to Date objects
      let uploadedModels = data.uploadedModels;
      if (uploadedModels && Array.isArray(uploadedModels)) {
        uploadedModels = uploadedModels.map((model: {uploadDate: unknown}) => ({
          ...model,
          uploadDate: model.uploadDate && typeof model.uploadDate === 'object' && 'toDate' in model.uploadDate && typeof (model.uploadDate as {toDate: () => Date}).toDate === 'function' 
            ? (model.uploadDate as {toDate: () => Date}).toDate() 
            : new Date(model.uploadDate as string | number)
        }));
      }
      
      // Helper function to safely convert timestamps
      const safeToDate = (timestamp: unknown): Date => {
        if (!timestamp) return new Date();
        if (timestamp instanceof Date) return timestamp;
        if (timestamp && typeof timestamp === 'object' && 'toDate' in timestamp && typeof (timestamp as {toDate: () => Date}).toDate === 'function') {
          return (timestamp as {toDate: () => Date}).toDate();
        }
        if (typeof timestamp === 'string' || typeof timestamp === 'number') {
          return new Date(timestamp);
        }
        return new Date();
      };

      const asset = {
        id: doc.id,
        ...data,
        uploadedModels: uploadedModels || [],
        createdAt: safeToDate(data.createdAt),
        updatedAt: safeToDate(data.updatedAt),
      } as unknown as GlobalAsset;
      
      return asset;
    });
    
    // Sort assets by creation date on the client side
    const sortedAssets = assets.sort((a, b) => {
      const aTime = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
      const bTime = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
      return bTime - aTime;
    });
    
    // Cache the result
    queryCache.set(cacheKey, { data: sortedAssets, timestamp: Date.now() });
    return sortedAssets;
  },

  async update(id: string, updates: Partial<GlobalAsset>): Promise<void> {
    // Filter out undefined values to prevent Firebase errors
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, value]) => value !== undefined)
    );
    
    // Convert Date objects to Timestamps for uploadedModels
    if (cleanUpdates.uploadedModels && Array.isArray(cleanUpdates.uploadedModels)) {
      (cleanUpdates as Record<string, unknown>).uploadedModels = (cleanUpdates.uploadedModels as unknown as Array<{uploadDate: Date}>).map((model) => ({
        ...model,
        uploadDate: model.uploadDate instanceof Date ? Timestamp.fromDate(model.uploadDate) : model.uploadDate
      }));
    }
    
    // Convert Date objects to Timestamps for concepts
    if (cleanUpdates.concepts && Array.isArray(cleanUpdates.concepts)) {
      (cleanUpdates as Record<string, unknown>).concepts = (cleanUpdates.concepts as AssetConcept[]).map((concept) => ({
        ...concept,
        createdAt: concept.createdAt instanceof Date ? Timestamp.fromDate(concept.createdAt) : concept.createdAt,
        updatedAt: concept.updatedAt instanceof Date ? Timestamp.fromDate(concept.updatedAt) : concept.updatedAt
      }));
    }
    
    await updateDoc(doc(db, 'globalAssets', id), {
      ...cleanUpdates,
      updatedAt: Timestamp.now(),
    });
    
    // Invalidate cache for this asset's show
    // Note: We'd need showId from the asset, but we don't have it here
    // Clear all caches for now (better than stale data)
    queryCache.clear();
  },

  async delete(id: string): Promise<void> {
    await deleteDoc(doc(db, 'globalAssets', id));
  }
};

// Episodes
export const episodeService = {
  async create(episode: Omit<Episode, 'id' | 'createdAt' | 'updatedAt'>): Promise<Episode> {
    // Filter out undefined values to prevent Firebase errors
    const cleanEpisode = Object.fromEntries(
      Object.entries(episode).filter(([, value]) => value !== undefined)
    );
    
    const docRef = await addDoc(collection(db, 'episodes'), {
      ...cleanEpisode,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    
    const docSnap = await getDoc(docRef);
    return { id: docRef.id, ...docSnap.data() } as Episode;
  },

  async getByShow(showId: string): Promise<Episode[]> {
    try {
      // Check cache first
      const cacheKey = `episodes-${showId}`;
      const cached = queryCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        return cached.data as Episode[];
      }

      const q = query(
        collection(db, 'episodes'),
        where('showId', '==', showId)
      );
      const querySnapshot = await getDocs(q);
      const episodes = querySnapshot.docs.map(doc => {
        const data = doc.data();
        
      // Convert nested Timestamps to Date objects
      const convertTimestamps = (obj: unknown): unknown => {
          if (obj === null || obj === undefined) return obj;
          if (Array.isArray(obj)) {
            return obj.map(convertTimestamps);
          }
          if (typeof obj === 'object' && obj !== null && 'toDate' in obj && typeof (obj as {toDate: () => Date}).toDate === 'function') {
            return (obj as {toDate: () => Date}).toDate();
          }
          if (typeof obj === 'object' && obj !== null) {
            const converted: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(obj)) {
              if (value && typeof value === 'object' && 'toDate' in value && typeof (value as {toDate: () => Date}).toDate === 'function') {
                converted[key] = (value as {toDate: () => Date}).toDate();
              } else {
                converted[key] = convertTimestamps(value);
              }
            }
            return converted;
          }
          return obj;
        };
        
        // Helper function to safely convert timestamps
        const safeToDate = (timestamp: unknown): Date => {
          if (!timestamp) return new Date();
          if (timestamp instanceof Date) return timestamp;
          if (timestamp && typeof timestamp === 'object' && 'toDate' in timestamp && typeof (timestamp as {toDate: () => Date}).toDate === 'function') {
            return (timestamp as {toDate: () => Date}).toDate();
          }
          if (typeof timestamp === 'string' || typeof timestamp === 'number') {
            const date = new Date(timestamp);
            return isNaN(date.getTime()) ? new Date() : date;
          }
          return new Date();
        };

        return {
          id: doc.id,
          ...data,
          scenes: convertTimestamps(data.scenes) || [], // Ensure scenes array exists and convert timestamps
          createdAt: safeToDate(data.createdAt),
          updatedAt: safeToDate(data.updatedAt),
        } as Episode;
      });
      
      // Sort episodes by episode number on the client side
      const sortedEpisodes = episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
      
      // Cache the result
      queryCache.set(cacheKey, { data: sortedEpisodes, timestamp: Date.now() });
      return sortedEpisodes;
    } catch (error) {
      console.error('Error fetching episodes:', error);
      return []; // Return empty array on error
    }
  },

  async update(id: string, updates: Partial<Episode>): Promise<void> {
    // NEW APPROACH: Use JSON serialization with custom handling for Date objects and Timestamps
    // This is more reliable than recursive traversal
    
    const convertDatesToTimestamps = (obj: unknown): unknown => {
      if (obj === null || obj === undefined) return obj;
      
      // Check for Date objects
      if (obj instanceof Date) {
        return Timestamp.fromDate(obj);
      }
      
      // Check if it's already a Timestamp
      if (obj instanceof Timestamp) {
        return obj;
      }
      
      // Handle arrays
      if (Array.isArray(obj)) {
        return obj.map(item => convertDatesToTimestamps(item));
      }
      
      // Handle objects
      if (typeof obj === 'object') {
        // Check for Timestamp-like objects (with toDate method)
        if ('toDate' in obj && typeof (obj as {toDate: unknown}).toDate === 'function') {
          return obj; // Already a Timestamp
        }
        
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj)) {
          if (value !== undefined) {
            result[key] = convertDatesToTimestamps(value);
          }
        }
        return result;
      }
      
      return obj;
    };
    
    try {
      console.log('Converting episode updates for Firebase...');
      
      // Convert all Date objects to Timestamps
      const cleanedUpdates = convertDatesToTimestamps(updates) as Record<string, unknown>;
      
      // Remove any undefined values
      const finalUpdates: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(cleanedUpdates)) {
        if (value !== undefined) {
          finalUpdates[key] = value;
        }
      }
      
      // Add updatedAt
      finalUpdates.updatedAt = Timestamp.now();
      
      console.log('Saving episode update to Firebase...', { 
        episodeId: id, 
        hasAvScript: !!(updates as {avScript?: unknown}).avScript,
        updateKeys: Object.keys(finalUpdates),
      });
      
      // Final verification: Check for any remaining Date objects
      const findRemainingDates = (obj: unknown, path = ''): string[] => {
        const dates: string[] = [];
        if (obj instanceof Date) {
          dates.push(path || 'root');
        } else if (Array.isArray(obj)) {
          obj.forEach((item, index) => {
            dates.push(...findRemainingDates(item, `${path}[${index}]`));
          });
        } else if (obj && typeof obj === 'object' && !(obj instanceof Timestamp)) {
          for (const [key, value] of Object.entries(obj)) {
            dates.push(...findRemainingDates(value, path ? `${path}.${key}` : key));
          }
        }
        return dates;
      };
      
      const remainingDates = findRemainingDates(finalUpdates, 'updates');
      if (remainingDates.length > 0) {
        console.error('CRITICAL: Still found Date objects after conversion at paths:', remainingDates);
        // Force convert them one more time
        const forceConvert = (obj: unknown): unknown => {
          if (obj instanceof Date) return Timestamp.fromDate(obj);
          if (Array.isArray(obj)) return obj.map(forceConvert);
          if (obj && typeof obj === 'object' && !(obj instanceof Timestamp)) {
            const result: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(obj)) {
              result[key] = forceConvert(value);
            }
            return result;
          }
          return obj;
        };
        
        for (const key of Object.keys(finalUpdates)) {
          finalUpdates[key] = forceConvert(finalUpdates[key]);
        }
        
        console.log('Forced conversion of remaining Date objects');
      }
      
      await updateDoc(doc(db, 'episodes', id), finalUpdates);
      
      console.log('Episode update saved successfully');
    } catch (error) {
      console.error('Error updating episode:', error);
      if (error instanceof Error) {
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      }
      throw error;
    }
    
    // Invalidate cache for episodes (we don't know showId here, so clear all episode caches)
    // This is safe because updates are infrequent
    Array.from(queryCache.keys()).forEach(key => {
      if (key.startsWith('episodes-')) {
        queryCache.delete(key);
      }
    });
  },

  async delete(id: string): Promise<void> {
    await deleteDoc(doc(db, 'episodes', id));
  }
};

// Asset Concepts
export const assetConceptService = {
  async create(concept: Omit<AssetConcept, 'id' | 'createdAt' | 'updatedAt'>): Promise<AssetConcept> {
    // Filter out undefined values to prevent Firebase errors
    const cleanConcept = Object.fromEntries(
      Object.entries(concept).filter(([, value]) => value !== undefined)
    );
    
    const docRef = await addDoc(collection(db, 'assetConcepts'), {
      ...cleanConcept,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    
    const docSnap = await getDoc(docRef);
    return { id: docRef.id, ...docSnap.data() } as AssetConcept;
  },

  async getByAsset(assetId: string): Promise<AssetConcept[]> {
    const q = query(
      collection(db, 'assetConcepts'),
      where('assetId', '==', assetId)
    );
    const querySnapshot = await getDocs(q);
    const concepts = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date(),
    })) as AssetConcept[];
    
    // Sort concepts by creation date on the client side
    return concepts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  },

  async update(id: string, updates: Partial<AssetConcept>): Promise<void> {
    // Filter out undefined values to prevent Firebase errors
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, value]) => value !== undefined)
    );
    
    await updateDoc(doc(db, 'assetConcepts', id), {
      ...cleanUpdates,
      updatedAt: Timestamp.now(),
    });
  },

  async delete(id: string): Promise<void> {
    await deleteDoc(doc(db, 'assetConcepts', id));
  }
};

// Episode Ideas
export const episodeIdeaService = {
  async create(idea: Omit<EpisodeIdea, 'id' | 'createdAt' | 'updatedAt'>): Promise<EpisodeIdea> {
    const cleanIdea = Object.fromEntries(
      Object.entries(idea).filter(([, value]) => value !== undefined)
    );
    
    const docRef = await addDoc(collection(db, 'episodeIdeas'), {
      ...cleanIdea,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    
    const docSnap = await getDoc(docRef);
    return { id: docRef.id, ...docSnap.data() } as EpisodeIdea;
  },

  async getByShow(showId: string): Promise<EpisodeIdea[]> {
    try {
      // Check cache first
      const cacheKey = `episodeIdeas-${showId}`;
      const cached = queryCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        return cached.data as EpisodeIdea[];
      }

      const q = query(
        collection(db, 'episodeIdeas'),
        where('showId', '==', showId)
      );
      const querySnapshot = await getDocs(q);
      const ideas = querySnapshot.docs.map(doc => {
        const data = doc.data();
        
        // Helper function to safely convert timestamps
        const safeToDate = (timestamp: unknown): Date => {
          if (!timestamp) return new Date();
          if (timestamp instanceof Date) return timestamp;
          if (timestamp && typeof timestamp === 'object' && 'toDate' in timestamp && typeof (timestamp as {toDate: () => Date}).toDate === 'function') {
            return (timestamp as {toDate: () => Date}).toDate();
          }
          if (typeof timestamp === 'string' || typeof timestamp === 'number') {
            const date = new Date(timestamp);
            return isNaN(date.getTime()) ? new Date() : date;
          }
          return new Date();
        };

        return {
          id: doc.id,
          ...data,
          createdAt: safeToDate(data.createdAt),
          updatedAt: safeToDate(data.updatedAt),
        } as EpisodeIdea;
      });
      
      // Sort ideas by creation date on the client side
      return ideas.sort((a, b) => {
        const aTime = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
        const bTime = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
        return bTime - aTime;
      });
      
      // Cache the result
      queryCache.set(cacheKey, { data: ideas, timestamp: Date.now() });
      return ideas;
    } catch (error) {
      console.error('Error fetching episode ideas:', error);
      return [];
    }
  },

  async update(id: string, updates: Partial<EpisodeIdea>): Promise<void> {
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, value]) => value !== undefined)
    );
    
    await updateDoc(doc(db, 'episodeIdeas', id), {
      ...cleanUpdates,
      updatedAt: Timestamp.now(),
    });
  },

  async delete(id: string): Promise<void> {
    await deleteDoc(doc(db, 'episodeIdeas', id));
  }
};

// General Ideas
export const generalIdeaService = {
  async create(idea: Omit<GeneralIdea, 'id' | 'createdAt' | 'updatedAt'>): Promise<GeneralIdea> {
    const cleanIdea = Object.fromEntries(
      Object.entries(idea).filter(([, value]) => value !== undefined)
    );
    
    const docRef = await addDoc(collection(db, 'generalIdeas'), {
      ...cleanIdea,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    
    const docSnap = await getDoc(docRef);
    return { id: docRef.id, ...docSnap.data() } as GeneralIdea;
  },

  async getByShow(showId: string): Promise<GeneralIdea[]> {
    try {
      // Check cache first
      const cacheKey = `generalIdeas-${showId}`;
      const cached = queryCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        return cached.data as GeneralIdea[];
      }

      const q = query(
        collection(db, 'generalIdeas'),
        where('showId', '==', showId)
      );
      const querySnapshot = await getDocs(q);
      const ideas = querySnapshot.docs.map(doc => {
        const data = doc.data();
        
        // Helper function to safely convert timestamps
        const safeToDate = (timestamp: unknown): Date => {
          if (!timestamp) return new Date();
          if (timestamp instanceof Date) return timestamp;
          if (timestamp && typeof timestamp === 'object' && 'toDate' in timestamp && typeof (timestamp as {toDate: () => Date}).toDate === 'function') {
            return (timestamp as {toDate: () => Date}).toDate();
          }
          if (typeof timestamp === 'string' || typeof timestamp === 'number') {
            const date = new Date(timestamp);
            return isNaN(date.getTime()) ? new Date() : date;
          }
          return new Date();
        };

        return {
          id: doc.id,
          ...data,
          images: data.images || [], // Ensure images array exists
          tags: data.tags || [], // Ensure tags array exists
          createdAt: safeToDate(data.createdAt),
          updatedAt: safeToDate(data.updatedAt),
        } as GeneralIdea;
      });
      
      // Sort ideas by creation date on the client side
      const sortedIdeas = ideas.sort((a, b) => {
        const aTime = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
        const bTime = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
        return bTime - aTime;
      });
      
      // Cache the result
      queryCache.set(cacheKey, { data: sortedIdeas, timestamp: Date.now() });
      return sortedIdeas;
    } catch (error) {
      console.error('Error fetching general ideas:', error);
      return [];
    }
  },

  async update(id: string, updates: Partial<GeneralIdea>): Promise<void> {
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, value]) => value !== undefined)
    );
    
    await updateDoc(doc(db, 'generalIdeas', id), {
      ...cleanUpdates,
      updatedAt: Timestamp.now(),
    });
  },

  async delete(id: string): Promise<void> {
    await deleteDoc(doc(db, 'generalIdeas', id));
  }
};
