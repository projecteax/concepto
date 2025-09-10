import { 
  collection, 
  doc, 
  setDoc, 
  getDocs,
  Timestamp 
} from 'firebase/firestore';
import { db } from './firebase';

// Initialize Firestore collections with proper structure
export async function initializeFirebaseCollections() {
  try {
    console.log('Initializing Firebase collections...');

    // 1. Initialize Shows collection
    await initializeShowsCollection();
    
    // 2. Initialize Global Assets collection
    await initializeGlobalAssetsCollection();
    
    // 3. Initialize Episodes collection
    await initializeEpisodesCollection();
    
    // 4. Initialize Asset Concepts collection
    await initializeAssetConceptsCollection();

    console.log('Firebase collections initialized successfully!');
  } catch (error) {
    console.error('Error initializing Firebase collections:', error);
    throw error;
  }
}

async function initializeShowsCollection() {
  const showsRef = collection(db, 'shows');
  const existingShows = await getDocs(showsRef);
  
  if (existingShows.empty) {
    console.log('Creating demo shows...');
    
    // Create Bravo & Tango show
    const bravoTangoRef = doc(showsRef);
    await setDoc(bravoTangoRef, {
      name: 'Bravo & Tango - Secret Squad',
      description: 'An action-packed adventure series following two secret agents as they solve mysteries and save the day.',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    // Create Pine Watch show
    const pineWatchRef = doc(showsRef);
    await setDoc(pineWatchRef, {
      name: 'Pine Watch',
      description: 'A magical forest adventure where young guardians protect the enchanted woods from dark forces.',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  }
}

async function initializeGlobalAssetsCollection() {
  const assetsRef = collection(db, 'globalAssets');
  const existingAssets = await getDocs(assetsRef);
  
  if (existingAssets.empty) {
    console.log('Creating demo global assets...');
    
    // Get the first show ID for demo assets
    const showsRef = collection(db, 'shows');
    const showsSnapshot = await getDocs(showsRef);
    const firstShow = showsSnapshot.docs[0];
    
    if (firstShow) {
      // Create demo character
      const characterRef = doc(assetsRef);
      await setDoc(characterRef, {
        showId: firstShow.id,
        name: 'Tango',
        description: 'A brave and resourceful secret agent with a heart of gold.',
        category: 'character',
        concepts: [],
        // Character-specific fields
        general: {
          age: '12 years old',
          personality: 'Brave, curious, and always ready to help others',
          backstory: 'Tango discovered their secret agent abilities when they were 8 years old and has been training ever since.',
          specialAbilities: 'Enhanced agility, problem-solving skills, and the ability to communicate with animals',
          relationships: 'Best friends with Bravo, looks up to Agent Shadow'
        },
        clothing: {
          defaultOutfit: 'Dark blue tactical suit with silver accents',
          seasonalOutfits: ['Winter: Thick coat with fur trim', 'Summer: Lightweight tactical gear'],
          specialCostumes: ['Formal: Black suit for undercover missions', 'Casual: Jeans and hoodie for downtime'],
          accessories: ['Utility belt', 'Communication device', 'Grappling hook']
        },
        pose: {
          defaultPose: 'free-pose',
          poseDescription: 'Confident stance with hands on hips, ready for action',
          referenceImages: []
        },
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      // Create demo location
      const locationRef = doc(assetsRef);
      await setDoc(locationRef, {
        showId: firstShow.id,
        name: 'Secret Base Alpha',
        description: 'The main headquarters for Bravo and Tango, hidden beneath an ordinary school.',
        category: 'location',
        concepts: [],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      // Create demo gadget
      const gadgetRef = doc(assetsRef);
      await setDoc(gadgetRef, {
        showId: firstShow.id,
        name: 'Multi-Tool Communicator',
        description: 'A wrist-worn device that can communicate, scan, and transform into various tools.',
        category: 'gadget',
        concepts: [],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    }
  }
}

async function initializeEpisodesCollection() {
  const episodesRef = collection(db, 'episodes');
  const existingEpisodes = await getDocs(episodesRef);
  
  if (existingEpisodes.empty) {
    console.log('Creating demo episodes...');
    
    // Get the first show ID for demo episodes
    const showsRef = collection(db, 'shows');
    const showsSnapshot = await getDocs(showsRef);
    const firstShow = showsSnapshot.docs[0];
    
    if (firstShow) {
      // Create demo episode
      const episodeRef = doc(episodesRef);
      await setDoc(episodeRef, {
        showId: firstShow.id,
        title: 'The Mystery of the Missing Artifacts',
        episodeNumber: 1,
        description: 'Bravo and Tango must solve their first major case when ancient artifacts start disappearing from the museum.',
        script: `FADE IN:

INT. SECRET BASE ALPHA - DAY

The camera pans across the high-tech command center. BRAVO (12) sits at the main console, studying a holographic display.

BRAVO
Tango, you need to see this. The museum reports are showing some very strange patterns.

TANGO (12) enters, adjusting their utility belt.

TANGO
What kind of patterns?

BRAVO
(squinting at the screen)
The artifacts aren't just missing - they're disappearing in a specific sequence. Like someone is following a map.

TANGO
A treasure map?

BRAVO
Exactly. And if I'm right, they're heading toward the old lighthouse next.

TANGO
Then we better get there first!

FADE OUT.`,
        characters: [
          {
            characterId: 'demo-character-id',
            characterName: 'Tango',
            type: 'recurring',
            role: 'Main character'
          }
        ],
        locations: [
          {
            locationId: 'demo-location-id',
            locationName: 'Secret Base Alpha',
            description: 'The main headquarters where the mission briefing takes place'
          }
        ],
        scenes: [],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    }
  }
}

async function initializeAssetConceptsCollection() {
  const conceptsRef = collection(db, 'assetConcepts');
  const existingConcepts = await getDocs(conceptsRef);
  
  if (existingConcepts.empty) {
    console.log('Creating demo asset concepts...');
    
    // Get the first asset ID for demo concepts
    const assetsRef = collection(db, 'globalAssets');
    const assetsSnapshot = await getDocs(assetsRef);
    const firstAsset = assetsSnapshot.docs[0];
    
    if (firstAsset) {
      // Create demo concept
      const conceptRef = doc(conceptsRef);
      await setDoc(conceptRef, {
        assetId: firstAsset.id,
        name: 'Tango - Action Pose',
        description: 'Tango in their signature action pose, ready for adventure',
        imageUrl: 'https://via.placeholder.com/512x512/3b82f6/ffffff?text=Tango+Action+Pose',
        prompt: 'A brave young secret agent in a dark blue tactical suit, confident stance with hands on hips',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    }
  }
}

// Firestore security rules (for reference)
export const firestoreRules = `
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow read/write access to all documents (for development)
    // In production, you should implement proper authentication and authorization
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
`;

// Collection structure documentation
export const collectionStructure = {
  shows: {
    fields: {
      name: 'string',
      description: 'string (optional)',
      createdAt: 'timestamp',
      updatedAt: 'timestamp'
    }
  },
  globalAssets: {
    fields: {
      showId: 'string (reference to shows)',
      name: 'string',
      description: 'string (optional)',
      category: 'string (character|location|gadget|texture|background)',
      concepts: 'array (references to assetConcepts)',
      // Character-specific fields
      general: 'object (optional)',
      clothing: 'object (optional)',
      pose: 'object (optional)',
      createdAt: 'timestamp',
      updatedAt: 'timestamp'
    }
  },
  episodes: {
    fields: {
      showId: 'string (reference to shows)',
      title: 'string',
      episodeNumber: 'number',
      description: 'string (optional)',
      script: 'string (optional)',
      characters: 'array of objects',
      locations: 'array of objects',
      createdAt: 'timestamp',
      updatedAt: 'timestamp'
    }
  },
  assetConcepts: {
    fields: {
      assetId: 'string (reference to globalAssets)',
      name: 'string',
      description: 'string (optional)',
      imageUrl: 'string (optional)',
      fbxUrl: 'string (optional)',
      prompt: 'string (optional)',
      createdAt: 'timestamp',
      updatedAt: 'timestamp'
    }
  }
};
