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
  targetType: 'script' | 'storyboard' | 'scene' | 'shot' | 'character' | 'location' | 'general-idea' | 'av-shot' | 'av-segment';
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
  // AI Reference galleries
  aiRefImages?: AIRefImages;
  createdAt: Date;
  updatedAt: Date;
}

// AI Reference Images structure
export interface AIRefImages {
  // For characters
  fullBody?: string[]; // Full body reference images
  multipleAngles?: string[]; // Multiple angles reference images
  head?: string[]; // Head reference images
  expressions?: string[]; // Expressions reference images
  // For locations
  ref01?: string[]; // Reference 1#
  ref02?: string[]; // Reference 2#
  ref03?: string[]; // Reference 3#
  ref04?: string[]; // Reference 4#
  // For gadgets
  fullGadget?: string[]; // Full gadget reference images
  multipleAnglesGadget?: string[]; // Multiple angles for gadgets
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
  videoUrl?: string; // Video file URL for concepts
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
  voice?: CharacterVoice;
  modelFiles?: CharacterModelFiles;
  characterGallery?: string[]; // Array of character render image URLs
  characterVideoGallery?: string[]; // Array of character video URLs for Video Examples (deprecated - use conceptVideos and renderVideos)
  conceptVideos?: string[]; // Array of concept video URLs
  renderVideos?: string[]; // Array of render video URLs
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

export interface CharacterVoice {
  description?: string;
  samples?: Array<{url: string, description: string, filename: string, language: string}>;
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
  avScript?: AVScript;
  screenplayData?: ScreenplayData;
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
  featuredImage?: string;
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

// AV Script System
export interface AVShotAudioFile {
  id: string;
  audioUrl: string;
  voiceId?: string; // ElevenLabs voice ID
  voiceName?: string; // Character/voice name
  uploadedAt: Date;
}

export interface AVShotImageGeneration {
  id: string;
  imageUrl: string;
  prompt: string;
  style: 'storyboard' | '3d-render';
  createdAt: Date;
}

export interface AVShotImageGenerationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string;
  createdAt: Date;
}

export interface AVShotImageGenerationThread {
  id: string;
  selectedAssets: Array<{
    id: string;
    type: 'gadget' | 'location' | 'character';
    name: string;
  }>;
  sketchImage?: string;
  messages: AVShotImageGenerationMessage[];
  generatedImages: AVShotImageGeneration[];
  selectedImageId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AVShot {
  id: string;
  segmentId: string;
  shotNumber: number; // 1.1, 1.2, etc. - auto-calculated based on order
  take: string; // Unique take identifier: SC{segmentNumber}T{takeNumber}_image (e.g., SC01T01_image)
  audio: string;
  visual: string;
  imageUrl?: string; // Storyboard image
  audioFiles?: AVShotAudioFile[]; // Array of audio files for this shot
  imageGenerationThread?: AVShotImageGenerationThread; // Conversation thread for image generation
  enhancementThread?: EnhancementThread; // Conversation thread for text enhancement
  duration: number; // Duration in seconds
  wordCount: number; // Auto-calculated from audio text
  runtime: number; // Auto-calculated from audio text (seconds)
  order: number; // For drag and drop ordering
  createdAt: Date;
  updatedAt: Date;
}

export interface AVSegment {
  id: string;
  episodeId: string;
  segmentNumber: number; // 1, 2, 3, etc.
  title: string;
  sceneSetting?: string; // Scene setting name from screenplay
  locationId?: string; // Reference to location asset
  locationName?: string; // Location name
  actionDescription?: string; // Action description from screenplay
  shots: AVShot[];
  totalRuntime: number; // Sum of all shots in segment
  totalWords: number; // Sum of all shots in segment
  createdAt: Date;
  updatedAt: Date;
}

export interface AVScript {
  id: string;
  episodeId: string;
  title: string;
  version: string; // v1, v2, etc.
  segments: AVSegment[];
  totalRuntime: number; // Sum of all segments
  totalWords: number; // Sum of all segments
  createdAt: Date;
  updatedAt: Date;
}

// Screenplay System
export interface EnhancementMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
}

export interface EnhancementThread {
  messages: EnhancementMessage[];
  alternatives: string[]; // Store all generated alternatives
  originalText: string; // Store original text when enhancement started
  createdAt: Date;
  updatedAt: Date;
}

export interface ScreenplayElement {
  id: string;
  type: 'scene-setting' | 'character' | 'action' | 'parenthetical' | 'dialogue' | 'general';
  content: string;
  position: number;
  comments?: ScreenplayComment[];
  editedInPL?: boolean; // Track if edited in Polish
  editedInEN?: boolean; // Track if edited in English
  reviewed?: boolean; // Track if changes have been reviewed
  enhancementThread?: EnhancementThread; // Conversation thread for text enhancement
}

export interface ScreenplayData {
  title: string;
  titleEN?: string;
  elements: ScreenplayElement[];
  elementsEN?: ScreenplayElement[];
}

export interface ScreenplayComment {
  id: string;
  createdAt: number;
  author?: string;
  text: string;
  images?: string[]; // URLs of uploaded images
}

// AV Editing System
export interface AVEditingSlide {
  id: string;
  shotId?: string; // Reference to AVShot if from AV script
  imageUrl?: string; // Optional - may be undefined for placeholder slides
  duration: number; // Duration in seconds
  startTime: number; // Start time in timeline (calculated)
  order: number;
  isFromAVScript: boolean; // Whether this slide comes from AV script
  createdAt: Date;
  updatedAt: Date;
}

export interface AVEditingAudioTrack {
  id: string;
  name: string;
  audioUrl: string;
  startTime: number; // Start time in timeline (seconds)
  duration: number; // Duration in seconds
  volume: number; // 0-100
  order: number;
  shotId?: string; // Reference to AVShot if from AV script
  voiceName?: string; // Character/voice name for grouping
  createdAt: Date;
  updatedAt: Date;
}

export interface AVEditingData {
  id: string;
  episodeId: string;
  slides: AVEditingSlide[];
  audioTracks: AVEditingAudioTrack[];
  totalDuration: number; // Total duration in seconds
  createdAt: Date;
  updatedAt: Date;
}
