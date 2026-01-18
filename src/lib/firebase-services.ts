import { 
  collection, 
  doc, 
  addDoc, 
  setDoc,
  updateDoc, 
  deleteDoc, 
  getDocs, 
  getDoc,
  query,
  where,
  Timestamp 
} from 'firebase/firestore';
import { db } from './firebase';
import { Show, GlobalAsset, Episode, AssetConcept, EpisodeIdea, GeneralIdea, PlotTheme, UserProfile, ShowAccess, EpisodeAccess, PermissionRole } from '@/types';

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

  async update(
    id: string,
    updates: Partial<GlobalAsset> & { uploadedModels?: Array<Record<string, unknown>> },
  ): Promise<void> {
    // Recursively remove undefined values to prevent Firebase errors
    const removeUndefined = (obj: unknown): unknown => {
      if (obj === null || obj === undefined) {
        return null;
      }
      if (Array.isArray(obj)) {
        return obj.map(item => removeUndefined(item));
      }
      if (typeof obj === 'object') {
        const cleaned: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj)) {
          if (value !== undefined) {
            cleaned[key] = removeUndefined(value);
          }
        }
        return cleaned;
      }
      return obj;
    };
    
    const cleanUpdates = removeUndefined(updates) as (Partial<GlobalAsset> & {
      uploadedModels?: Array<Record<string, unknown>>;
    });
    
    // Convert Date objects to Timestamps for uploadedModels
    if (cleanUpdates.uploadedModels && Array.isArray(cleanUpdates.uploadedModels)) {
      cleanUpdates.uploadedModels = cleanUpdates.uploadedModels.map((model) => {
        const uploadDate = model.uploadDate;
        return {
          ...model,
          uploadDate: uploadDate instanceof Date ? Timestamp.fromDate(uploadDate) : uploadDate,
        };
      });
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

  async getAll(): Promise<Episode[]> {
    try {
      const querySnapshot = await getDocs(collection(db, 'episodes'));
      const episodes = querySnapshot.docs.map(doc => {
        const data = doc.data();

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
          scenes: convertTimestamps(data.scenes) || [],
          createdAt: safeToDate(data.createdAt),
          updatedAt: safeToDate(data.updatedAt),
        } as Episode;
      });

      return episodes;
    } catch (error) {
      console.error('Error fetching episodes:', error);
      return [];
    }
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
      
      // Sort episodes by episode number on the client side (intro first, then numeric)
      const sortedEpisodes = episodes.sort((a, b) => {
        // Intro episodes always come first
        if (a.episodeNumber === 'intro' && b.episodeNumber !== 'intro') return -1;
        if (a.episodeNumber !== 'intro' && b.episodeNumber === 'intro') return 1;
        if (a.episodeNumber === 'intro' && b.episodeNumber === 'intro') return 0;
        // Both are numbers, sort numerically
        const numA = typeof a.episodeNumber === 'number' ? a.episodeNumber : 0;
        const numB = typeof b.episodeNumber === 'number' ? b.episodeNumber : 0;
        return numA - numB;
      });
      
      // Cache the result
      queryCache.set(cacheKey, { data: sortedEpisodes, timestamp: Date.now() });
      return sortedEpisodes;
    } catch (error) {
      console.error('Error fetching episodes:', error);
      return []; // Return empty array on error
    }
  },

  async update(id: string, updates: Partial<Episode>): Promise<void> {
    // NUCLEAR OPTION: Serialize to JSON, then reconstruct with Timestamp conversion
    // This ensures we get plain objects that Firestore can handle
    
    try {
      console.log('Converting episode updates for Firebase...');
      
      // Step 1: Convert to JSON string (this strips out Date objects, functions, etc.)
      // Use a custom replacer to track Date objects
      const dateMap = new Map<string, Date>();
      let pathCounter = 0;
      
      const jsonString = JSON.stringify(updates, function(key, value) {
        // Track the path for Date objects
        if (value instanceof Date) {
          const path = `__DATE_${pathCounter++}__`;
          dateMap.set(path, value);
          return { __isDate: true, __path: path };
        }
        // Skip undefined, functions, symbols
        if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
          return undefined;
        }
        return value;
      });
      
      // Step 2: Parse back to object
      const parsed = JSON.parse(jsonString);
      
      // Step 3: Convert Date markers to Timestamps
      const convertDates = (obj: unknown): unknown => {
        if (obj === null || obj === undefined) return obj;
        
        if (Array.isArray(obj)) {
          return obj.map(item => convertDates(item));
        }
        
        if (typeof obj === 'object') {
          // Check if this is a Date marker
          const objAny = obj as {__isDate?: boolean; __path?: string};
          if (objAny.__isDate && objAny.__path) {
            const originalDate = dateMap.get(objAny.__path);
            if (originalDate) {
              return Timestamp.fromDate(originalDate);
            }
          }
          
          // Process all properties
          const result: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(obj)) {
            if (value !== undefined) {
              result[key] = convertDates(value);
            }
          }
          return result;
        }
        
        return obj;
      };
      
      const cleanedUpdates = convertDates(parsed) as Record<string, unknown>;
      
      // Step 4: Remove any remaining undefined values
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
        hasAvScript: !!finalUpdates.avScript,
        updateKeys: Object.keys(finalUpdates),
        datesConverted: dateMap.size,
      });
      
      // Debug: Check what types are in avScript
      if (finalUpdates.avScript) {
        const checkTypes = (obj: unknown, path = '', depth = 0): void => {
          if (depth > 25) {
            console.warn(`Max depth exceeded at ${path}`);
            return;
          }
          
          if (obj === null || obj === undefined) return;
          
          const objType = typeof obj;
          const constructor = obj?.constructor?.name || 'unknown';
          
          // Log non-primitive types
          if (objType === 'object') {
            if (obj instanceof Date) {
              console.error(`❌ Found Date at ${path}`);
            } else if (obj instanceof Timestamp) {
              // OK
            } else if (Array.isArray(obj)) {
              if (obj.length > 100) {
                console.warn(`Large array (${obj.length} items) at ${path}`);
              }
              obj.forEach((item, idx) => {
                if (idx < 5) { // Only check first 5 items
                  checkTypes(item, `${path}[${idx}]`, depth + 1);
                }
              });
            } else {
              // Check if it's a plain object
              if (constructor !== 'Object') {
                console.warn(`Non-plain object (${constructor}) at ${path}`);
              }
              
              const entries = Object.entries(obj);
              if (entries.length > 50) {
                console.warn(`Large object (${entries.length} keys) at ${path}`);
              }
              
              for (const [key, value] of entries) {
                checkTypes(value, path ? `${path}.${key}` : key, depth + 1);
              }
            }
          }
        };
        
        console.log('🔍 Checking avScript structure for problematic types...');
        checkTypes(finalUpdates.avScript, 'avScript');
      }
      
      // Try saving with just the non-avScript fields first to isolate the issue
      if (finalUpdates.avScript && Object.keys(finalUpdates).length > 2) {
        console.log('⚠️ Attempting to save without avScript first...');
        const withoutAvScript = { ...finalUpdates };
        delete withoutAvScript.avScript;
        
        try {
          await updateDoc(doc(db, 'episodes', id), withoutAvScript);
          console.log('✅ Save without avScript succeeded');
        } catch (err) {
          console.error('❌ Save without avScript also failed:', err);
        }
        
        // Now try just avScript
        console.log('⚠️ Now attempting to save ONLY avScript...');
        try {
          await updateDoc(doc(db, 'episodes', id), {
            avScript: finalUpdates.avScript,
            updatedAt: Timestamp.now(),
          });
          console.log('✅ Save with ONLY avScript succeeded!');
          return; // Success!
        } catch (err) {
          console.error('❌ Save with ONLY avScript failed:', err);
          throw err;
        }
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

// Plot Themes
export const plotThemeService = {
  async create(theme: Omit<PlotTheme, 'id' | 'createdAt' | 'updatedAt'>): Promise<PlotTheme> {
    const cleanTheme = Object.fromEntries(
      Object.entries(theme).filter(([, value]) => value !== undefined)
    );
    
    const docRef = await addDoc(collection(db, 'plotThemes'), {
      ...cleanTheme,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    
    const docSnap = await getDoc(docRef);
    return { id: docRef.id, ...docSnap.data() } as PlotTheme;
  },

  async getByShow(showId: string): Promise<PlotTheme[]> {
    try {
      // Check cache first
      const cacheKey = `plotThemes-${showId}`;
      const cached = queryCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        return cached.data as PlotTheme[];
      }

      const q = query(
        collection(db, 'plotThemes'),
        where('showId', '==', showId)
      );
      const querySnapshot = await getDocs(q);
      const themes = querySnapshot.docs.map(doc => {
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
          keyElements: data.keyElements || [], // Ensure keyElements array exists
          tags: data.tags || [], // Ensure tags array exists
          createdAt: safeToDate(data.createdAt),
          updatedAt: safeToDate(data.updatedAt),
        } as PlotTheme;
      });
      
      // Sort themes by creation date on the client side
      const sortedThemes = themes.sort((a, b) => {
        const aTime = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
        const bTime = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
        return bTime - aTime;
      });
      
      // Cache the result
      queryCache.set(cacheKey, { data: sortedThemes, timestamp: Date.now() });
      return sortedThemes;
    } catch (error) {
      console.error('Error fetching plot themes:', error);
      return [];
    }
  },

  async update(id: string, updates: Partial<PlotTheme>): Promise<void> {
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, value]) => value !== undefined)
    );
    
    await updateDoc(doc(db, 'plotThemes', id), {
      ...cleanUpdates,
      updatedAt: Timestamp.now(),
    });
  },

  async delete(id: string): Promise<void> {
    await deleteDoc(doc(db, 'plotThemes', id));
  }
};

// Users
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

export const userService = {
  async createOrUpdateProfile(profile: UserProfile): Promise<void> {
    await setDoc(doc(db, 'users', profile.id), {
      username: profile.username,
      name: profile.name,
      email: profile.email,
      role: profile.role,
      createdAt: Timestamp.fromDate(profile.createdAt),
      updatedAt: Timestamp.fromDate(profile.updatedAt),
    }, { merge: true });
  },

  async getProfile(userId: string): Promise<UserProfile | null> {
    const docSnap = await getDoc(doc(db, 'users', userId));
    if (!docSnap.exists()) {
      return null;
    }
    const data = docSnap.data();
    return {
      id: docSnap.id,
      username: data.username,
      name: data.name,
      email: data.email,
      role: data.role,
      createdAt: safeToDate(data.createdAt),
      updatedAt: safeToDate(data.updatedAt),
    } as UserProfile;
  },

  async getByUsername(username: string): Promise<UserProfile | null> {
    const q = query(collection(db, 'users'), where('username', '==', username));
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      return null;
    }
    const docSnap = snapshot.docs[0];
    const data = docSnap.data();
    return {
      id: docSnap.id,
      username: data.username,
      name: data.name,
      email: data.email,
      role: data.role,
      createdAt: safeToDate(data.createdAt),
      updatedAt: safeToDate(data.updatedAt),
    } as UserProfile;
  },

  async getAll(): Promise<UserProfile[]> {
    const snapshot = await getDocs(collection(db, 'users'));
    return snapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        username: data.username,
        name: data.name,
        email: data.email,
        role: data.role,
        createdAt: safeToDate(data.createdAt),
        updatedAt: safeToDate(data.updatedAt),
      } as UserProfile;
    });
  },

  async updateRole(userId: string, role: UserProfile['role']): Promise<void> {
    await updateDoc(doc(db, 'users', userId), {
      role,
      updatedAt: Timestamp.now(),
    });
  }
};

// Show access
export const showAccessService = {
  async getAll(): Promise<ShowAccess[]> {
    const snapshot = await getDocs(collection(db, 'showAccess'));
    return snapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        showId: data.showId,
        userId: data.userId,
        role: data.role as PermissionRole,
        createdAt: safeToDate(data.createdAt),
        updatedAt: safeToDate(data.updatedAt),
      } as ShowAccess;
    });
  },

  async getByUser(userId: string): Promise<ShowAccess[]> {
    const q = query(collection(db, 'showAccess'), where('userId', '==', userId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        showId: data.showId,
        userId: data.userId,
        role: data.role as PermissionRole,
        createdAt: safeToDate(data.createdAt),
        updatedAt: safeToDate(data.updatedAt),
      } as ShowAccess;
    });
  },

  async getByShow(showId: string): Promise<ShowAccess[]> {
    const q = query(collection(db, 'showAccess'), where('showId', '==', showId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        showId: data.showId,
        userId: data.userId,
        role: data.role as PermissionRole,
        createdAt: safeToDate(data.createdAt),
        updatedAt: safeToDate(data.updatedAt),
      } as ShowAccess;
    });
  },

  async setAccess(showId: string, userId: string, role: PermissionRole): Promise<ShowAccess> {
    const q = query(
      collection(db, 'showAccess'),
      where('showId', '==', showId),
      where('userId', '==', userId),
    );
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      const docSnap = snapshot.docs[0];
      await updateDoc(doc(db, 'showAccess', docSnap.id), {
        role,
        updatedAt: Timestamp.now(),
      });
      const data = docSnap.data();
      return {
        id: docSnap.id,
        showId,
        userId,
        role,
        createdAt: safeToDate(data.createdAt),
        updatedAt: new Date(),
      };
    }
    const docRef = await addDoc(collection(db, 'showAccess'), {
      showId,
      userId,
      role,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    const docSnap = await getDoc(docRef);
    const data = docSnap.data() || {};
    return {
      id: docRef.id,
      showId,
      userId,
      role,
      createdAt: safeToDate(data.createdAt),
      updatedAt: safeToDate(data.updatedAt),
    } as ShowAccess;
  },

  async removeAccess(accessId: string): Promise<void> {
    await deleteDoc(doc(db, 'showAccess', accessId));
  }
};

// Episode access
export const episodeAccessService = {
  async getAll(): Promise<EpisodeAccess[]> {
    const snapshot = await getDocs(collection(db, 'episodeAccess'));
    return snapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        showId: data.showId,
        episodeId: data.episodeId,
        userId: data.userId,
        role: data.role as PermissionRole,
        createdAt: safeToDate(data.createdAt),
        updatedAt: safeToDate(data.updatedAt),
      } as EpisodeAccess;
    });
  },

  async getByUser(userId: string): Promise<EpisodeAccess[]> {
    const q = query(collection(db, 'episodeAccess'), where('userId', '==', userId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        showId: data.showId,
        episodeId: data.episodeId,
        userId: data.userId,
        role: data.role as PermissionRole,
        createdAt: safeToDate(data.createdAt),
        updatedAt: safeToDate(data.updatedAt),
      } as EpisodeAccess;
    });
  },

  async getByShow(showId: string): Promise<EpisodeAccess[]> {
    const q = query(collection(db, 'episodeAccess'), where('showId', '==', showId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        showId: data.showId,
        episodeId: data.episodeId,
        userId: data.userId,
        role: data.role as PermissionRole,
        createdAt: safeToDate(data.createdAt),
        updatedAt: safeToDate(data.updatedAt),
      } as EpisodeAccess;
    });
  },

  async getByEpisode(episodeId: string): Promise<EpisodeAccess[]> {
    const q = query(collection(db, 'episodeAccess'), where('episodeId', '==', episodeId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        showId: data.showId,
        episodeId: data.episodeId,
        userId: data.userId,
        role: data.role as PermissionRole,
        createdAt: safeToDate(data.createdAt),
        updatedAt: safeToDate(data.updatedAt),
      } as EpisodeAccess;
    });
  },

  async setAccess(showId: string, episodeId: string, userId: string, role: PermissionRole): Promise<EpisodeAccess> {
    const q = query(
      collection(db, 'episodeAccess'),
      where('episodeId', '==', episodeId),
      where('userId', '==', userId),
    );
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      const docSnap = snapshot.docs[0];
      await updateDoc(doc(db, 'episodeAccess', docSnap.id), {
        role,
        updatedAt: Timestamp.now(),
      });
      const data = docSnap.data();
      return {
        id: docSnap.id,
        showId,
        episodeId,
        userId,
        role,
        createdAt: safeToDate(data.createdAt),
        updatedAt: new Date(),
      };
    }
    const docRef = await addDoc(collection(db, 'episodeAccess'), {
      showId,
      episodeId,
      userId,
      role,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    const docSnap = await getDoc(docRef);
    const data = docSnap.data() || {};
    return {
      id: docRef.id,
      showId,
      episodeId,
      userId,
      role,
      createdAt: safeToDate(data.createdAt),
      updatedAt: safeToDate(data.updatedAt),
    } as EpisodeAccess;
  },

  async removeAccess(accessId: string): Promise<void> {
    await deleteDoc(doc(db, 'episodeAccess', accessId));
  }
};
