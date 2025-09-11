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
import { Show, GlobalAsset, Episode, AssetConcept, EpisodeIdea } from '@/types';

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
    return { id: docRef.id, ...docSnap.data() } as GlobalAsset;
  },

  async getByShow(showId: string): Promise<GlobalAsset[]> {
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
    return assets.sort((a, b) => {
      const aTime = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
      const bTime = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
      return bTime - aTime;
    });
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
    
    await updateDoc(doc(db, 'globalAssets', id), {
      ...cleanUpdates,
      updatedAt: Timestamp.now(),
    });
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
      return episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
    } catch (error) {
      console.error('Error fetching episodes:', error);
      return []; // Return empty array on error
    }
  },

  async update(id: string, updates: Partial<Episode>): Promise<void> {
    // Recursively filter out undefined values to prevent Firebase errors
    const cleanUpdates = (obj: unknown): unknown => {
      if (obj === null || obj === undefined) return obj;
      if (Array.isArray(obj)) {
        return obj.map(cleanUpdates).filter(item => item !== undefined);
      }
      if (typeof obj === 'object' && obj !== null) {
        const cleaned: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj)) {
          if (value !== undefined) {
            cleaned[key] = cleanUpdates(value);
          }
        }
        return cleaned;
      }
      return obj;
    };
    
    const cleanedUpdates = cleanUpdates(updates);
    
    await updateDoc(doc(db, 'episodes', id), {
      ...(cleanedUpdates as Record<string, unknown>),
      updatedAt: Timestamp.now(),
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
