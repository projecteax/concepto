// Show Management
export interface Show {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Global Assets
export interface GlobalAsset {
  id: string;
  showId: string;
  name: string;
  description?: string;
  category: AssetCategory;
  concepts: AssetConcept[];
  createdAt: Date;
  updatedAt: Date;
}

export type AssetCategory = 
  | 'character'
  | 'location'
  | 'gadget'
  | 'texture'
  | 'background';

export interface AssetConcept {
  category: AssetCategory;
  conceptType?: 'pose' | 'clothing' | 'general' | 'expression' | 'action'; // Type of concept image
  tags: string[];
  isGenerated?: boolean;
  id: string;
  assetId: string;
  name: string;
  description?: string;
  relevanceScale?: number; // 1-5 scale for relevance
  imageUrl?: string;
  fbxUrl?: string;
  prompt?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Character Specific
export interface Character extends GlobalAsset {
  category: 'character';
  mainImage?: string; // Main character image URL
  general: CharacterGeneral;
  clothing: CharacterClothing;
  pose: CharacterPose;
}

export interface CharacterGeneral {
  age?: string;
  personality?: string;
  backstory?: string;
  specialAbilities?: string;
  relationships?: string;
}

export interface CharacterClothing {
  defaultOutfit?: string;
  seasonalOutfits?: string[];
  specialCostumes?: string[];
  accessories?: string[];
}

export interface CharacterPose {
  defaultPose: 'T-pose' | 'free-pose';
  poseDescription?: string;
  referenceImages?: string[];
}

// Episodes
export interface Episode {
  id: string;
  showId: string;
  title: string;
  episodeNumber: number;
  description?: string;
  script?: string;
  characters: EpisodeCharacter[];
  locations: EpisodeLocation[];
  createdAt: Date;
  updatedAt: Date;
}

export interface EpisodeCharacter {
  characterId: string;
  characterName: string;
  type: 'recurring' | 'episodic';
  role?: string;
}

export interface EpisodeLocation {
  locationId: string;
  locationName: string;
  description?: string;
}

// Generation
export interface GenerationRequest {
  prompt: string;
  category: AssetCategory;
  tags: string[];
  isGenerated?: boolean;
  style?: string;
  showId: string;
  assetId?: string;
}

export interface Tag {
  id: string;
  name: string;
  category: 'facial_expression' | 'custom';
  color?: string;
}
