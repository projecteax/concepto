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
  orderBy,
  Timestamp 
} from 'firebase/firestore';
import { db } from './firebase';
import { Show, GlobalAsset, Episode, Character, AssetConcept } from '@/types';

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
    const querySnapshot = await getDocs(collection(db, 'shows'));
    const assets = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date(),
    })) as Show[];
    return assets;
  },

  async update(id: string, updates: Partial<Show>): Promise<void> {
    await updateDoc(doc(db, 'shows', id), {
      ...updates,
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
    const docRef = await addDoc(collection(db, 'globalAssets'), {
      ...asset,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    
    const docSnap = await getDoc(docRef);
    return { id: docRef.id, ...docSnap.data() } as GlobalAsset;
  },

  async getByShow(showId: string): Promise<GlobalAsset[]> {
    const q = query(
      collection(db, 'globalAssets'),
      where('showId', '==', showId),
      
    );
    const querySnapshot = await getDocs(q);
    const assets = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date(),
    })) as GlobalAsset[];
    
    // Sort assets by creation date on the client side
    return assets.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  },

  async update(id: string, updates: Partial<GlobalAsset>): Promise<void> {
    await updateDoc(doc(db, 'globalAssets', id), {
      ...updates,
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
    const docRef = await addDoc(collection(db, 'episodes'), {
      ...episode,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    
    const docSnap = await getDoc(docRef);
    return { id: docRef.id, ...docSnap.data() } as Episode;
  },

  async getByShow(showId: string): Promise<Episode[]> {
    const q = query(
      collection(db, 'episodes'),
      where('showId', '==', showId)
    );
    const querySnapshot = await getDocs(q);
    const episodes = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date(),
    })) as Episode[];
    
    // Sort episodes by episode number on the client side
    return episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
  },

  async update(id: string, updates: Partial<Episode>): Promise<void> {
    await updateDoc(doc(db, 'episodes', id), {
      ...updates,
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
    const docRef = await addDoc(collection(db, 'assetConcepts'), {
      ...concept,
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
    await updateDoc(doc(db, 'assetConcepts', id), {
      ...updates,
      updatedAt: Timestamp.now(),
    });
  },

  async delete(id: string): Promise<void> {
    await deleteDoc(doc(db, 'assetConcepts', id));
  }
};
