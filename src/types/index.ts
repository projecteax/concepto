// User Management
export interface User {
  id: string;
  username: string;
  name: string;
  role: 'admin' | 'user';
}

// Comment System
export interface Comment {
  id: string;
  content: string;
  authorId: string;
  authorName: string;
  createdAt: Date;
  updatedAt: Date;
  replies: Comment[];
  resolved: boolean;
  resolvedBy?: string;
  resolvedAt?: Date;
}

export interface CommentThread {
  id: string;
  targetType: 'script' | 'storyboard' | 'scene' | 'shot' | 'character' | 'location' | 'general-idea';
  targetId: string;
  comments: Comment[];
  createdAt: Date;
  updatedAt: Date;
}

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
  galleryImages?: string[];
  mainRender?: string;
  // Location-specific properties
  environmentType?: string;
  timeOfDay?: string;
  weather?: string;
  season?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type AssetCategory = 
  | 'character'
  | 'location'
  | 'gadget'
  | 'texture'
  | 'background'
  | 'vehicle';

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
  modelFiles?: CharacterModelFiles;
  characterGallery?: string[]; // Array of character render image URLs
  uploadedModels?: Array<{url: string, filename: string, size: number, uploadDate: Date}>; // Array of uploaded 3D models
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

export interface CharacterModelFiles {
  fullBodyBlender?: string; // Blender file name
  fullBodyFBX?: string; // FBX file name
  skinnedCharacter?: string; // CC file name
  mainExpressions?: string; // Main expressions FBX file name
  additionalExpressions?: string[]; // Array of additional expression file names
  productionModel?: string; // Fully rigged and skinned production model file name
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
  scenes?: EpisodeScene[];
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

export interface EpisodeScene {
  id: string;
  sceneNumber: number;
  title: string;
  description?: string;
  actionDescription?: string; // Action description before dialog
  script?: string;
  locationId?: string;
  locationName?: string;
  characters: SceneCharacter[];
  sceneCharacters: SceneCharacter[]; // Characters in the scene (selectable from dataset)
  gadgets: SceneGadget[];
  shots: SceneShot[];
  createdAt: Date;
  updatedAt: Date;
}

export interface SceneShot {
  id: string;
  shotNumber: number;
  title: string;
  description?: string;
  storyboards: Storyboard[];
  inspirationImages: string[];
  cameraShot: CameraShot;
  createdAt: Date;
  updatedAt: Date;
}

export interface SceneCharacter {
  characterId: string;
  characterName: string;
  role?: string;
  isPresent: boolean;
}

export interface SceneActor {
  actorId: string;
  actorName: string;
  characterId?: string; // Reference to the character they're playing
  characterName?: string;
  role?: string;
  isPresent: boolean;
}

export interface SceneGadget {
  gadgetId: string;
  gadgetName: string;
  description?: string;
}

export interface Storyboard {
  id: string;
  imageUrl: string;
  description?: string;
}

export interface CameraShot {
  id: string;
  shotType: 'WIDE' | 'MEDIUM' | 'CLOSE_UP' | 'EXTREME_CLOSE_UP' | 'OVER_THE_SHOULDER' | 'POV' | 'ESTABLISHING' | 'CUSTOM';
  customShotType?: string;
  description?: string;
  cameraMovement?: 'STATIC' | 'PAN' | 'TILT' | 'DOLLY' | 'TRACK' | 'ZOOM' | 'CUSTOM';
  customMovement?: string;
  duration?: number; // in seconds
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

// Episode Ideas
export interface EpisodeIdea {
  id: string;
  showId: string;
  title: string;
  description: string;
  status: 'draft' | 'in-development' | 'ready' | 'archived';
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

// General Ideas
export interface GeneralIdea {
  id: string;
  showId: string;
  name: string;
  description: string;
  images: string[]; // Array of image URLs
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}
