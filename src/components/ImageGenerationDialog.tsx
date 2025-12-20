'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  X, 
  Send, 
  Plus, 
  MapPin, 
  User, 
  Pencil,
  Sparkles,
  Loader2,
  Image as ImageIcon,
  Edit3,
  Check,
  Upload,
  Box,
  Video,
  Clapperboard,
  Download,
  ChevronRight,
  ChevronLeft,
  Star,
  Copy,
  CheckCircle,
  Info,
  Car
} from 'lucide-react';
import { GlobalAsset, Character, AVShotImageGenerationThread } from '@/types';
import { Button } from '@/components/ui/button';
import { ReactSketchCanvas, ReactSketchCanvasRef } from 'react-sketch-canvas';
import { useS3Upload } from '@/hooks/useS3Upload';

interface ImageGenerationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImageGenerated: (imageUrl: string, thread: AVShotImageGenerationThread) => void;
  visualDescription: string;
  locationDescription?: string;
  locationId?: string;
  globalAssets: GlobalAsset[];
  episodeId: string;
  showId: string;
  existingThread?: AVShotImageGenerationThread;
  initialImageUrl?: string; // For uploaded images - opens chat with this image in prompt
  audioText?: string; // Audio text from AV script to pre-populate video prompt
  currentShotImageUrl?: string; // Current shot's imageUrl (from Blender or other sources)
  currentShotVideoUrl?: string; // Current shot's videoUrl (from Blender or other sources)
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string;
  createdAt: Date;
}

interface SelectedAsset {
  id: string;
  type: 'gadget' | 'location' | 'character';
  name: string;
  thumbnailUrl: string;
  images: string[];
}

export function ImageGenerationDialog({
  isOpen,
  onClose,
  onImageGenerated,
  visualDescription,
  locationDescription,
  locationId,
  globalAssets,
  episodeId,
  showId,
  existingThread,
  initialImageUrl,
  audioText,
  currentShotImageUrl,
  currentShotVideoUrl,
}: ImageGenerationDialogProps) {
  // Helper function to format model names for display
  const formatModelName = (modelName?: string): string => {
    if (!modelName) return 'N/A';
    
    // Video models
    if (modelName === 'veo-3-1-flash') return 'Veo 3.1 Flash';
    if (modelName === 'veo-3-1-pro') return 'Veo 3.1 Pro';
    if (modelName === 'sora-2') return 'SORA 2';
    if (modelName === 'runway-gen4-turbo') return 'Runway Gen-4 Turbo';
    if (modelName === 'runway-act-two') return 'Runway Act Two';
    if (modelName === 'kling-v2-5-turbo') return 'Kling v2.5 Turbo';
    
    // Image models
    if (modelName === 'gemini-2.5-flash-image-preview') return 'Gemini 2.5 Flash Image Preview';
    if (modelName === 'gemini-2.5-flash') return 'Gemini 2.5 Flash';
    
    // If it's already formatted or unknown, return as is
    return modelName;
  };

  // Load video duration from actual video file
  const loadVideoDuration = (videoUrl: string): Promise<number> => {
    return new Promise<number>((resolve) => {
      // Check if we already have this duration
      if (videoDurations[videoUrl]) {
        resolve(videoDurations[videoUrl]);
        return;
      }

      const video = document.createElement('video');
      video.preload = 'metadata';
      
      const timeout = setTimeout(() => {
        console.warn(`⚠️ Timeout loading video metadata for ${videoUrl}`);
        resolve(0);
      }, 5000); // 5 second timeout
      
      video.onloadedmetadata = () => {
        clearTimeout(timeout);
        if (video.duration && isFinite(video.duration)) {
          const duration = Math.round(video.duration);
          setVideoDurations(prev => ({ ...prev, [videoUrl]: duration }));
          resolve(duration);
        } else {
          resolve(0);
        }
      };
      
      video.onerror = () => {
        clearTimeout(timeout);
        console.warn(`⚠️ Error loading video metadata for ${videoUrl}`);
        resolve(0);
      };
      
      video.src = videoUrl;
    });
  };

  // Get default duration for a model if not provided (only used as fallback)
  const getDefaultDuration = (modelName: string | undefined): number => {
    if (!modelName) return 0;
    
    // Kling only supports 5 or 10 seconds
    if (modelName.startsWith('kling')) {
      return 5; // Default to 5 seconds
    }
    
    // Veo typically uses 4, 6, or 8 seconds
    if (modelName.startsWith('veo')) {
      return 8; // Default to 8 seconds
    }
    
    // Runway supports 2-10 seconds
    if (modelName.startsWith('runway')) {
      return 5; // Default to 5 seconds
    }
    
    // Sora supports variable durations
    if (modelName.startsWith('sora')) {
      return 8; // Default to 8 seconds
    }
    
    return 0;
  };

  // Calculate cost for a video generation
  const calculateVideoCost = (
    modelName: string | undefined,
    duration: number | undefined,
    resolution?: '720p' | '1080p',
    klingMode?: 'std' | 'pro'
  ): number => {
    if (!modelName) return 0;
    
    // Use default duration if not provided (for existing videos)
    const actualDuration = duration || getDefaultDuration(modelName);
    if (!actualDuration) return 0;

    // Runway API pricing (credits per second, 1 credit = $0.01)
    if (modelName === 'runway-gen4-turbo') {
      return (5 * actualDuration) * 0.01; // 5 credits/sec
    }
    if (modelName === 'runway-gen4-aleph') {
      return (15 * actualDuration) * 0.01; // 15 credits/sec
    }
    if (modelName === 'runway-gen3a-turbo') {
      return (5 * actualDuration) * 0.01; // 5 credits/sec
    }
    if (modelName === 'runway-upscale-v1') {
      return (2 * actualDuration) * 0.01; // 2 credits/sec
    }
    if (modelName === 'runway-act-two') {
      return (5 * actualDuration) * 0.01; // 5 credits/sec
    }

    // Veo 3.1 pricing
    if (modelName === 'veo-3-1-flash' || modelName === 'veo-3-1-fast-generate-preview') {
      return 0.15 * actualDuration; // $0.15/sec
    }
    if (modelName === 'veo-3-1-pro' || modelName === 'veo-3-1-generate-preview') {
      return 0.40 * actualDuration; // $0.40/sec
    }

    // Veo 3.0 pricing
    if (modelName === 'veo-3-0-fast-generate-001') {
      return 0.15 * actualDuration; // $0.15/sec
    }
    if (modelName === 'veo-3-0-generate-001') {
      return 0.40 * actualDuration; // $0.40/sec
    }

    // Kling 2.5 Turbo pricing (fixed prices based on duration and mode)
    if (modelName === 'kling-v2-5-turbo') {
      // Default to 'std' mode if not specified
      const mode = klingMode || 'std';
      if (mode === 'std') {
        if (actualDuration === 5) return 0.21;
        if (actualDuration === 10) return 0.42;
        // If duration doesn't match exactly, use closest (5s default)
        return 0.21;
      } else if (mode === 'pro') {
        if (actualDuration === 5) return 0.35;
        if (actualDuration === 10) return 0.70;
        // If duration doesn't match exactly, use closest (5s default)
        return 0.35;
      }
      return 0; // Unknown mode
    }

    // Sora pricing
    if (modelName === 'sora-2') {
      return 0.10 * actualDuration; // $0.10/sec
    }
    if (modelName === 'sora-2-pro') {
      if (resolution === '1080p' || resolution === '720p') {
        // Check if it's the higher resolution version (1024p)
        // For now, assume 720p/1080p is $0.30/sec, but we'd need to track actual resolution
        return 0.30 * actualDuration; // $0.30/sec for 720p/1080p
      }
      return 0.30 * actualDuration; // Default to $0.30/sec
    }

    return 0; // Unknown model
  };

  // Calculate total cost for all generations in this shot
  const calculateTotalCost = (): number => {
    let total = 0;

    // Add costs for all generated videos
    generatedVideos.forEach(video => {
      // If manual cost is set, use it (especially for videos without modelName)
      if (video.manualCost !== undefined && video.manualCost > 0) {
        total += video.manualCost;
      } else if (video.modelName) {
        // Calculate cost based on model if available
        total += calculateVideoCost(
          video.modelName,
          video.duration || videoDurations[video.videoUrl],
          video.resolution,
          video.klingMode
        );
      }
      // If no modelName and no manualCost, cost is 0
    });

    // Add manual costs for uploaded videos
    uploadedVideos.forEach(video => {
      total += video.manualCost || 0;
    });

    return total;
  };

  // Group videos by model for cost breakdown
  const getCostBreakdownByModel = (): Array<{modelName: string; count: number; totalCost: number}> => {
    const modelMap = new Map<string, {count: number; totalCost: number}>();
    
    generatedVideos.forEach(video => {
      let cost = 0;
      let modelDisplayName = '';
      
      // If manual cost is set, use it
      if (video.manualCost !== undefined && video.manualCost > 0) {
        cost = video.manualCost;
        modelDisplayName = video.modelName ? formatModelName(video.modelName) : 'Unknown Model';
      } else if (video.modelName) {
        // Calculate cost based on model if available
        cost = calculateVideoCost(
          video.modelName,
          video.duration || videoDurations[video.videoUrl],
          video.resolution,
          video.klingMode
        );
        modelDisplayName = formatModelName(video.modelName);
      } else {
        // Skip videos with no model and no manual cost
        return;
      }
      
      if (!modelMap.has(modelDisplayName)) {
        modelMap.set(modelDisplayName, { count: 0, totalCost: 0 });
      }
      
      const existing = modelMap.get(modelDisplayName)!;
      existing.count += 1;
      existing.totalCost += cost;
    });
    
    // Add uploaded videos with manual costs
    const uploadedWithCost = uploadedVideos.filter(v => (v.manualCost || 0) > 0);
    if (uploadedWithCost.length > 0) {
      const totalUploadedCost = uploadedWithCost.reduce((sum, v) => sum + (v.manualCost || 0), 0);
      modelMap.set('Uploaded Videos', { 
        count: uploadedWithCost.length, 
        totalCost: totalUploadedCost 
      });
    }
    
    return Array.from(modelMap.entries()).map(([modelName, data]) => ({
      modelName,
      count: data.count,
      totalCost: data.totalCost,
    }));
  };

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [selectedAssets, setSelectedAssets] = useState<SelectedAsset[]>([]);
  const [sketchImage, setSketchImage] = useState<string | null>(null);
  const [showDrawingCanvas, setShowDrawingCanvas] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<'storyboard' | '3d-render'>('storyboard');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<Array<{ id: string; imageUrl: string; prompt: string; createdAt: Date; modelName?: string; generatedAt?: Date }>>([]);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [editablePrompt, setEditablePrompt] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState<{
    prompt: string;
    images: Array<{ type: string; name: string; url: string; id?: string; source?: string }>;
  } | null>(null);
  const canvasRef = useRef<ReactSketchCanvasRef>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [strokeColor, setStrokeColor] = useState('#000000');
  const [strokeWidth, setStrokeWidth] = useState(2);
  
  // Start frame and end frame states
  const [startFrame, setStartFrame] = useState<string | null>(null);
  const [endFrame, setEndFrame] = useState<string | null>(null);
  const [referenceImage, setReferenceImage] = useState<string | null>(initialImageUrl || null);
  const [referenceVideo, setReferenceVideo] = useState<string | null>(null);
  const [characterVideo, setCharacterVideo] = useState<string | null>(null);
  const [mainImageId, setMainImageId] = useState<string | null>(null); // Can be 'startFrame', 'endFrame', 'referenceImage', or generated image ID
  const [mainVideoId, setMainVideoId] = useState<string | null>(null); // Can be 'referenceVideo' or generated video ID
  const [generatedVideos, setGeneratedVideos] = useState<Array<{ id: string; videoUrl: string; prompt: string; createdAt: Date; modelName?: string; generatedAt?: Date; duration?: number; resolution?: '720p' | '1080p'; klingMode?: 'std' | 'pro'; manualCost?: number }>>([]);
  const [videoDurations, setVideoDurations] = useState<{[url: string]: number}>({});
  const [editingGeneratedVideoCost, setEditingGeneratedVideoCost] = useState<{id: string; cost: number} | null>(null);
  
  // VEO multi-image selection (up to 3 images)
  const [selectedVeoImages, setSelectedVeoImages] = useState<Array<{ url: string; filename: string; id: string }>>([]);
  const [copiedFilename, setCopiedFilename] = useState<string | null>(null);
  const [isGeneratingStartFrame, setIsGeneratingStartFrame] = useState(false);
  const [isGeneratingEndFrame, setIsGeneratingEndFrame] = useState(false);
  const [showVideoGenerationModal, setShowVideoGenerationModal] = useState(false);
  const [promptModal, setPromptModal] = useState<{
    type: 'image' | 'video';
    prompt: string;
    modelName?: string;
  } | null>(null);
  const [videoModel, setVideoModel] = useState<string>('veo-3-1-flash');
  const [videoPrompt, setVideoPrompt] = useState<string>('');
  const [selectedVideoInputType, setSelectedVideoInputType] = useState<'main' | 'start-end' | 'reference-video' | null>(null);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [videoResolution, setVideoResolution] = useState<'720p' | '1080p'>('720p');
  const [videoDuration, setVideoDuration] = useState<4 | 6 | 8>(8);
  const [runwayDuration, setRunwayDuration] = useState<number>(5); // For Runway ML (2-10 seconds)
  const [klingDuration, setKlingDuration] = useState<5 | 10>(5); // For Kling AI (5 or 10 seconds only)
  const [klingMode, setKlingMode] = useState<'std' | 'pro'>('std'); // For Kling AI (Standard or Pro mode)
  const [enlargedContent, setEnlargedContent] = useState<{ type: 'image' | 'video'; url: string } | null>(null);
  const [uploadedImages, setUploadedImages] = useState<Array<{ id: string; imageUrl: string; createdAt: Date }>>([]);
  const [uploadedVideos, setUploadedVideos] = useState<Array<{ id: string; videoUrl: string; createdAt: Date; manualCost?: number }>>([]);
  const [editingVideoCost, setEditingVideoCost] = useState<{id: string; cost: number} | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'image' | 'video'; id: string; url: string } | null>(null);
  const isPerformingOperation = useRef(false); // Flag to prevent reloading during operations
  const lastLoadedThreadId = useRef<string | undefined>(undefined); // Track last loaded thread ID
  const lastLoadedThreadUpdatedAt = useRef<Date | string | number | undefined>(undefined); // Track last loaded thread updatedAt
  const lastLoadedStartFrame = useRef<string | null>(null); // Track last loaded startFrame URL
  const lastLoadedEndFrame = useRef<string | null>(null); // Track last loaded endFrame URL
  const lastLoadedReferenceImage = useRef<string | null>(null); // Track last loaded referenceImage URL
  const syncedThreadRef = useRef<AVShotImageGenerationThread | null>(null); // Store synced thread to save on close
  const hasSyncedThread = useRef(false); // Flag to track if we've synced the thread (prevents reload)
  const manualUploadRef = useRef<HTMLInputElement>(null);
  const startFrameFileInputRef = useRef<HTMLInputElement>(null);
  const endFrameFileInputRef = useRef<HTMLInputElement>(null);
  const referenceImageFileInputRef = useRef<HTMLInputElement>(null);
  const referenceVideoFileInputRef = useRef<HTMLInputElement>(null);
  const characterVideoFileInputRef = useRef<HTMLInputElement>(null);
  const additionalReferenceImageFileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile } = useS3Upload();

  // Helper function to extract filename from URL
  const extractFilename = (url: string): string => {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const filename = pathname.split('/').pop() || 'image.jpg';
      // Remove query parameters if any
      return filename.split('?')[0];
    } catch {
      // If URL parsing fails, try to extract from string
      const parts = url.split('/');
      const filename = parts[parts.length - 1] || 'image.jpg';
      return filename.split('?')[0];
    }
  };

  // Helper function to copy filename to clipboard
  const copyFilename = async (filename: string) => {
    try {
      await navigator.clipboard.writeText(filename);
      setCopiedFilename(filename);
      setTimeout(() => setCopiedFilename(null), 2000);
    } catch (error) {
      console.error('Failed to copy filename:', error);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = filename;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopiedFilename(filename);
      setTimeout(() => setCopiedFilename(null), 2000);
    }
  };

  // Get all available images for VEO selection
  const getAllAvailableImages = (): Array<{ url: string; filename: string; id: string; type: 'startFrame' | 'endFrame' | 'referenceImage' | 'uploaded' | 'generated' }> => {
    const images: Array<{ url: string; filename: string; id: string; type: 'startFrame' | 'endFrame' | 'referenceImage' | 'uploaded' | 'generated' }> = [];
    
    if (startFrame) {
      images.push({ url: startFrame, filename: extractFilename(startFrame), id: 'startFrame', type: 'startFrame' });
    }
    if (endFrame) {
      images.push({ url: endFrame, filename: extractFilename(endFrame), id: 'endFrame', type: 'endFrame' });
    }
    if (referenceImage) {
      images.push({ url: referenceImage, filename: extractFilename(referenceImage), id: 'referenceImage', type: 'referenceImage' });
    }
    uploadedImages.forEach(img => {
      images.push({ url: img.imageUrl, filename: extractFilename(img.imageUrl), id: `uploaded-${img.id}`, type: 'uploaded' });
    });
    generatedImages.forEach(img => {
      images.push({ url: img.imageUrl, filename: extractFilename(img.imageUrl), id: `generated-${img.id}`, type: 'generated' });
    });
    
    return images;
  };

  // Toggle image selection for VEO
  const toggleVeoImageSelection = (image: { url: string; filename: string; id: string }) => {
    setSelectedVeoImages(prev => {
      const isSelected = prev.some(img => img.id === image.id);
      if (isSelected) {
        // Remove from selection
        return prev.filter(img => img.id !== image.id);
      } else {
        // Add to selection (max 3)
        if (prev.length >= 3) {
          alert('You can select up to 3 images for VEO video generation');
          return prev;
        }
        return [...prev, image];
      }
    });
  };

  const buildPrompt = (userMessage?: string): string => {
    let prompt = `You are generating a storyboard/3D render image for an animated production.\n\n`;
    
    // Context section - what's happening in the scene
    prompt += `SCENE CONTEXT:\n`;
    
    // Add location description and context
    if (locationDescription) {
      prompt += `Location: ${locationDescription}\n`;
    }
    
    // Add visual description - this is the key context from the visual box
    if (visualDescription) {
      prompt += `Visual Description: ${visualDescription}\n`;
      prompt += `This visual description describes the specific action, composition, and framing of this shot. Pay close attention to camera angles, character positions, and what's happening in the scene.\n`;
    }
    
    // Characters section - with explicit instructions about their images
    const characters = selectedAssets.filter(a => a.type === 'character');
    if (characters.length > 0) {
      prompt += `\nCHARACTERS IN SCENE:\n`;
      characters.forEach((char, index) => {
        prompt += `${index + 1}. ${char.name} - `;
        prompt += `The attached character reference images show ${char.name}'s appearance, design, and key features. `;
        prompt += `Use these reference images to accurately represent ${char.name} in the generated image. `;
        prompt += `Pay attention to their facial features, body proportions, clothing, and distinctive characteristics.\n`;
      });
    }
    
    // Gadgets section
    const gadgets = selectedAssets.filter(a => a.type === 'gadget');
    if (gadgets.length > 0) {
      prompt += `\nGADGETS/PROPS IN SCENE:\n`;
      gadgets.forEach((gadget, index) => {
        prompt += `${index + 1}. ${gadget.name} - `;
        prompt += `The attached gadget reference images show ${gadget.name}'s design, shape, and details. `;
        prompt += `Use these reference images to accurately represent ${gadget.name} in the scene.\n`;
      });
    }
    
    // Location images section
    const locations = selectedAssets.filter(a => a.type === 'location');
    if (locations.length > 0) {
      prompt += `\nLOCATION REFERENCE:\n`;
      locations.forEach((location, index) => {
        prompt += `${index + 1}. ${location.name} - `;
        prompt += `The attached location reference images show the environment, architecture, lighting, and atmosphere of ${location.name}. `;
        prompt += `Use these reference images to accurately represent the location's appearance, mood, and key environmental elements.\n`;
      });
    }
    
    // Vehicles section
    const vehicles = selectedAssets.filter(a => a.type === 'vehicle');
    if (vehicles.length > 0) {
      prompt += `\nVEHICLES IN SCENE:\n`;
      vehicles.forEach((vehicle, index) => {
        prompt += `${index + 1}. ${vehicle.name} - `;
        prompt += `The attached vehicle reference images show ${vehicle.name}'s design, exterior, interior, and key features. `;
        prompt += `Use these reference images to accurately represent ${vehicle.name} in the generated image. `;
        prompt += `Pay attention to the vehicle's shape, proportions, details, and distinctive characteristics.\n`;
      });
    }
    
    // Sketch reference - explicit instructions
    if (sketchImage) {
      prompt += `\nCOMPOSITION REFERENCE:\n`;
      prompt += `An attached sketch image shows the intended composition and layout of this shot. `;
      prompt += `The sketch indicates where characters should be positioned, camera angle, and overall scene composition. `;
      prompt += `If there are any text labels in the sketch, they are only to indicate which character is which - DO NOT include any text or labels in the generated image. `;
      prompt += `Use this sketch ONLY as a guide for spatial arrangement and framing - do not replicate the sketch style. `;
      prompt += `Enhance it with full detail and proper rendering according to the style requirements.\n`;
    }
    
    // Style instructions
    prompt += `\nSTYLE REQUIREMENTS:\n`;
    // Always require 16:9 aspect ratio for AV script shots
    prompt += `- CRITICAL: The image MUST be in 16:9 aspect ratio (widescreen format). This is required for video production compatibility.\n`;
    if (selectedStyle === 'storyboard') {
      prompt += `- Hand drawn pencil style storyboard\n`;
      prompt += `- Thin lines are used on environment and unnecessary objects\n`;
      prompt += `- Main objects should be slightly more bold\n`;
      prompt += `- No colors - black and white only\n`;
      prompt += `- Focus on clarity of action and composition over detailed rendering\n`;
      prompt += `- Maintain readability and clear visual storytelling\n`;
    } else {
      prompt += `- 3D Pixar-style rendering with smooth, polished surfaces\n`;
      prompt += `- Vibrant, appealing colors with cinematic lighting\n`;
      prompt += `- Professional animation-quality rendering\n`;
      prompt += `- Attention to detail in textures, materials, and lighting\n`;
    }
    
    // Integration instructions
    prompt += `\nINTEGRATION INSTRUCTIONS:\n`;
    prompt += `- Combine all reference images to create a cohesive scene\n`;
    prompt += `- Ensure characters match their reference images exactly\n`;
    if (locations.length > 0) {
      prompt += `- Ensure location matches the location reference images\n`;
    }
    if (gadgets.length > 0) {
      prompt += `- Ensure gadgets match their reference images\n`;
    }
    if (vehicles.length > 0) {
      prompt += `- Ensure vehicles match their reference images\n`;
    }
    prompt += `- Follow the visual description for action, composition, and camera work\n`;
    if (sketchImage) {
      prompt += `- Follow the sketch for spatial arrangement and composition\n`;
    }
    prompt += `- Maintain consistency with the overall visual style\n`;
    
    // User message for refinements
    if (userMessage) {
      prompt += `\nADDITIONAL INSTRUCTIONS:\n${userMessage}\n`;
    }
    
    return prompt;
  };

  // Load video durations when videos are loaded
  useEffect(() => {
    if (generatedVideos.length > 0) {
      generatedVideos.forEach(video => {
        if (video.videoUrl && !video.duration && !videoDurations[video.videoUrl]) {
          loadVideoDuration(video.videoUrl);
        }
      });
    }
  }, [generatedVideos.length]); // Only run when number of videos changes

  // Initialize from existing thread or reset
  useEffect(() => {
    // Don't reload if we're in the middle of an operation (like deletion)
    if (isPerformingOperation.current) {
      return;
    }
    
    if (isOpen) {
      if (existingThread) {
        // SYNC: If shot's current imageUrl/videoUrl doesn't match thread, update thread to match shot
        // This handles the case where Blender uploaded a new image directly to shot.imageUrl
        // but the thread still has the old image URLs
        const syncedThread = { ...existingThread };
        let threadNeedsSync = false;
        
        // Check if shot's imageUrl matches any of the thread's image fields
        if (currentShotImageUrl) {
          const threadHasThisImage = 
            existingThread.startFrame === currentShotImageUrl ||
            existingThread.endFrame === currentShotImageUrl ||
            existingThread.referenceImage === currentShotImageUrl ||
            existingThread.generatedImages?.some(img => img.imageUrl === currentShotImageUrl) ||
            existingThread.generatedVideos?.some(vid => vid.videoUrl === currentShotImageUrl);
          
          if (!threadHasThisImage) {
            // Shot has a new image that's not in the thread (Blender uploaded it)
            // Determine which field to update based on what was previously set
            // If startFrame was set, update startFrame; if endFrame was set, update endFrame; otherwise update referenceImage
            
            // Store old image URLs before replacing them - these should remain in content box
            const oldStartFrame = existingThread.startFrame;
            const oldEndFrame = existingThread.endFrame;
            const oldReferenceImage = existingThread.referenceImage;
            
            if (existingThread.startFrame && !existingThread.endFrame) {
              // Only startFrame was set, so this is likely updating startFrame
              syncedThread.startFrame = currentShotImageUrl;
              // Only keep mainImageId as 'startFrame' if it was already set to 'startFrame'
              // Don't automatically set it as main
              if (syncedThread.mainImageId === 'startFrame') {
                // Keep it as main if it was already main
                syncedThread.mainImageId = 'startFrame';
              } else if (syncedThread.mainImageId && syncedThread.mainImageId !== 'startFrame') {
                // Keep existing main if it's not startFrame
                // mainImageId stays as is
              } else {
                // If no main was set, don't set it now
                syncedThread.mainImageId = undefined;
              }
              // Ensure old startFrame image is still in uploadedImages (if it exists and is different)
              if (oldStartFrame && oldStartFrame !== currentShotImageUrl) {
                setUploadedImages(prev => {
                  const alreadyExists = prev.some(img => img.imageUrl === oldStartFrame);
                  if (alreadyExists) return prev;
                  return [...prev, {
                    id: `uploaded-img-${Date.now()}-old`,
                    imageUrl: oldStartFrame,
                    createdAt: new Date(),
                  }];
                });
              }
            } else if (existingThread.endFrame && !existingThread.startFrame) {
              // Only endFrame was set, so this is likely updating endFrame
              syncedThread.endFrame = currentShotImageUrl;
              // Only keep mainImageId as 'endFrame' if it was already set to 'endFrame'
              // Don't automatically set it as main
              if (syncedThread.mainImageId === 'endFrame') {
                // Keep it as main if it was already main
                syncedThread.mainImageId = 'endFrame';
              } else if (syncedThread.mainImageId && syncedThread.mainImageId !== 'endFrame') {
                // Keep existing main if it's not endFrame
                // mainImageId stays as is
              } else {
                // If no main was set, don't set it now
                syncedThread.mainImageId = undefined;
              }
              // Ensure old endFrame image is still in uploadedImages (if it exists and is different)
              if (oldEndFrame && oldEndFrame !== currentShotImageUrl) {
                setUploadedImages(prev => {
                  const alreadyExists = prev.some(img => img.imageUrl === oldEndFrame);
                  if (alreadyExists) return prev;
                  return [...prev, {
                    id: `uploaded-img-${Date.now()}-old`,
                    imageUrl: oldEndFrame,
                    createdAt: new Date(),
                  }];
                });
              }
            } else {
              // Both or neither were set, or referenceImage was the main - update referenceImage
              syncedThread.referenceImage = currentShotImageUrl;
              // Only keep mainImageId as 'referenceImage' if it was already set to 'referenceImage'
              // Don't automatically set it as main
              if (syncedThread.mainImageId === 'referenceImage') {
                // Keep it as main if it was already main
                syncedThread.mainImageId = 'referenceImage';
              } else if (syncedThread.mainImageId && syncedThread.mainImageId !== 'referenceImage') {
                // Keep existing main if it's not referenceImage
                // mainImageId stays as is
              } else {
                // If no main was set, don't set it now
                syncedThread.mainImageId = undefined;
              }
              // Ensure old referenceImage is still in uploadedImages (if it exists and is different)
              if (oldReferenceImage && oldReferenceImage !== currentShotImageUrl) {
                setUploadedImages(prev => {
                  const alreadyExists = prev.some(img => img.imageUrl === oldReferenceImage);
                  if (alreadyExists) return prev;
                  return [...prev, {
                    id: `uploaded-img-${Date.now()}-old`,
                    imageUrl: oldReferenceImage,
                    createdAt: new Date(),
                  }];
                });
              }
            }
            threadNeedsSync = true;
            // Also add the new image to uploaded images if it's not already there
            // This ensures it shows up in the content box
            setUploadedImages(prev => {
              const alreadyExists = prev.some(img => img.imageUrl === currentShotImageUrl);
              if (alreadyExists) return prev;
              return [...prev, {
                id: `uploaded-img-${Date.now()}`,
                imageUrl: currentShotImageUrl,
                createdAt: new Date(),
              }];
            });
            // Also ensure the image appears in the appropriate field state
            // This makes it visible in the content box immediately
            if (syncedThread.startFrame === currentShotImageUrl) {
              setStartFrame(currentShotImageUrl);
            }
            if (syncedThread.endFrame === currentShotImageUrl) {
              setEndFrame(currentShotImageUrl);
            }
            if (syncedThread.referenceImage === currentShotImageUrl) {
              setReferenceImage(currentShotImageUrl);
            }
          }
        }
        
        // Check if shot's videoUrl matches thread's video
        if (currentShotVideoUrl) {
          const threadHasThisVideo = 
            existingThread.referenceVideo === currentShotVideoUrl ||
            existingThread.generatedVideos?.some(vid => vid.videoUrl === currentShotVideoUrl);
          
          if (!threadHasThisVideo) {
            // Shot has a new video that's not in the thread - update referenceVideo to match
            // Also set it as main video if no main video is currently set
            syncedThread.referenceVideo = currentShotVideoUrl;
            if (!syncedThread.mainVideoId) {
              syncedThread.mainVideoId = 'referenceVideo';
            }
            threadNeedsSync = true;
          }
        }
        
        // If thread was synced, save it immediately to persist the change
        if (threadNeedsSync) {
          // Update the thread's updatedAt timestamp
          syncedThread.updatedAt = new Date();
          // Store the synced thread to save when dialog closes
          syncedThreadRef.current = syncedThread;
          // Mark that we've synced to prevent reloading old thread
          hasSyncedThread.current = true;
          // Also save immediately to prevent the old thread from being reloaded
          // This ensures the synced thread is persisted right away
          const mainImageUrl = syncedThread.referenceImage || 
                              syncedThread.startFrame || 
                              syncedThread.endFrame ||
                              syncedThread.generatedImages?.[0]?.imageUrl;
          if (mainImageUrl) {
            // Save asynchronously to avoid calling during render
            setTimeout(() => {
              onImageGenerated(mainImageUrl, syncedThread);
            }, 100);
          }
        } else {
          syncedThreadRef.current = null;
        }
        
        // Use synced thread for loading
        const threadToLoad = threadNeedsSync ? syncedThread : existingThread;
        
        // Check if thread has actually changed (by ID or updatedAt timestamp)
        const threadId = threadToLoad.id;
        const threadUpdatedAt = threadToLoad.updatedAt;
        
        // Convert updatedAt to comparable format
        const getUpdatedAtValue = (date: Date | string | number | undefined): number => {
          if (!date) return 0;
          if (date instanceof Date) return date.getTime();
          if (typeof date === 'string') return new Date(date).getTime();
          if (typeof date === 'number') return date;
          return 0;
        };
        
        const currentUpdatedAt = getUpdatedAtValue(threadUpdatedAt);
        const lastUpdatedAt = getUpdatedAtValue(lastLoadedThreadUpdatedAt.current);
        
        // Check if thread ID changed
        const threadChanged = threadId !== lastLoadedThreadId.current;
        
        // Check if actual content has changed (startFrame, endFrame, referenceImage URLs)
        // Compare with what we last loaded from the thread, not current state
        const currentStartFrame = threadToLoad.startFrame || null;
        const currentEndFrame = threadToLoad.endFrame || null;
        const currentReferenceImage = threadToLoad.referenceImage || null;
        
        const contentChanged = 
          currentStartFrame !== lastLoadedStartFrame.current ||
          currentEndFrame !== lastLoadedEndFrame.current ||
          currentReferenceImage !== lastLoadedReferenceImage.current;
        
        // Only reload if:
        // 1. Thread ID changed (new thread), OR
        // 2. Content actually changed (new images uploaded), OR
        // 3. Thread was synced with shot's current URLs, OR
        // 4. updatedAt is significantly newer (more than 2 seconds) AND content might have changed
        const timeDifference = currentUpdatedAt - lastUpdatedAt;
        const threadWasUpdatedExternally = timeDifference > 2000 && contentChanged;
        
        // If we've already synced this thread, don't reload unless thread was updated externally
        // This prevents overwriting the synced state with the old thread
        if (hasSyncedThread.current && !threadChanged && !threadWasUpdatedExternally) {
          // We've synced and thread hasn't changed externally, don't reload
          return;
        }
        
        if (!threadChanged && !contentChanged && !threadNeedsSync && !threadWasUpdatedExternally) {
          // Thread hasn't changed and content is the same, don't reload state
          // This prevents overwriting state when Blender just uploaded a new image
          return;
        }
        
        // Update tracking refs
        // If we synced, update refs to match synced thread so subsequent runs don't reload
        lastLoadedThreadId.current = threadId;
        lastLoadedThreadUpdatedAt.current = threadUpdatedAt;
        lastLoadedStartFrame.current = currentStartFrame;
        lastLoadedEndFrame.current = currentEndFrame;
        lastLoadedReferenceImage.current = currentReferenceImage;
        
        // If we synced, also update the tracking to prevent immediate reload
        if (threadNeedsSync) {
          // Update tracking to match synced thread
          lastLoadedThreadId.current = syncedThread.id;
          lastLoadedThreadUpdatedAt.current = syncedThread.updatedAt;
          lastLoadedStartFrame.current = syncedThread.startFrame || null;
          lastLoadedEndFrame.current = syncedThread.endFrame || null;
          lastLoadedReferenceImage.current = syncedThread.referenceImage || null;
        }
        
        // Load existing thread (use synced version if needed)
        setMessages(threadToLoad.messages.map(msg => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          imageUrl: msg.imageUrl,
          createdAt: msg.createdAt,
        })));
        // If we synced, update state directly to show the new image immediately
        if (threadNeedsSync) {
          setStartFrame(syncedThread.startFrame || null);
          setEndFrame(syncedThread.endFrame || null);
          setReferenceImage(syncedThread.referenceImage || initialImageUrl || null);
          setReferenceVideo(syncedThread.referenceVideo || null);
          setCharacterVideo((syncedThread as typeof syncedThread & { characterVideo?: string }).characterVideo || null);
          // Update main image/video IDs
          if (syncedThread.mainImageId) {
            setMainImageId(syncedThread.mainImageId);
          }
          if (syncedThread.mainVideoId) {
            setMainVideoId(syncedThread.mainVideoId);
          }
        } else {
          setStartFrame(threadToLoad.startFrame || null);
          setEndFrame(threadToLoad.endFrame || null);
          // Load referenceImage from thread or initialImageUrl
          setReferenceImage(threadToLoad.referenceImage || initialImageUrl || null);
          setReferenceVideo(threadToLoad.referenceVideo || null);
          setCharacterVideo((threadToLoad as typeof threadToLoad & { characterVideo?: string }).characterVideo || null);
        }
        // Set main image/video IDs - convert from thread format to display format if needed
        // Only set if we didn't already set them during sync
        if (!threadNeedsSync) {
          const threadMainImageId = threadToLoad.mainImageId;
          if (threadMainImageId && threadMainImageId.startsWith('uploaded-img-') && !threadMainImageId.startsWith('uploaded-image-')) {
            // Convert from 'uploaded-img-123' to 'uploaded-image-uploaded-img-123' for display
            setMainImageId(`uploaded-image-${threadMainImageId}`);
          } else {
            setMainImageId(threadMainImageId || null);
          }
          setMainVideoId(threadToLoad.mainVideoId || null);
        }
        // Separate uploaded images/videos from generated ones
        const allImages = threadToLoad.generatedImages || [];
        const allVideos = threadToLoad.generatedVideos || [];
        // Separate uploaded items from generated ones and deduplicate by URL
        // First, collect all unique URLs to avoid duplicates
        const uploadedImgsMap = new Map<string, { id: string; imageUrl: string; createdAt: Date | string | number }>();
        const uploadedVidsMap = new Map<string, { id: string; videoUrl: string; createdAt: Date | string | number; manualCost?: number }>();
        const genImagesMap = new Map<string, typeof allImages[0]>();
        const genVideosMap = new Map<string, typeof allVideos[0]>();
        
        // Process images - separate uploaded from generated
        allImages.forEach(img => {
          if (img.prompt === 'Uploaded image') {
            // This is an uploaded image - add to uploadedImgsMap
            if (!uploadedImgsMap.has(img.imageUrl)) {
              const baseId = img.id.startsWith('uploaded-img-') ? img.id : `uploaded-img-${img.id}`;
              uploadedImgsMap.set(img.imageUrl, {
                id: baseId,
                imageUrl: img.imageUrl,
                createdAt: img.createdAt,
              });
            }
          } else {
            // This is a generated image - add to genImagesMap
            if (!genImagesMap.has(img.imageUrl)) {
              genImagesMap.set(img.imageUrl, img);
            }
          }
        });
        
        // Process videos - separate uploaded from generated
        allVideos.forEach(vid => {
          const videoWithExtras = vid as typeof vid & {
            manualCost?: number;
            duration?: number;
            resolution?: '720p' | '1080p';
            klingMode?: 'std' | 'pro';
          };
          
          if (vid.prompt === 'Uploaded video') {
            // This is an uploaded video - add to uploadedVidsMap
            if (!uploadedVidsMap.has(vid.videoUrl)) {
              uploadedVidsMap.set(vid.videoUrl, {
                id: vid.id.startsWith('uploaded-vid-') ? vid.id : `uploaded-vid-${vid.id}`,
                videoUrl: vid.videoUrl,
                createdAt: vid.createdAt,
                manualCost: videoWithExtras.manualCost,
              });
            }
          } else {
            // This is a generated video - add to genVideosMap
            if (!genVideosMap.has(vid.videoUrl)) {
              genVideosMap.set(vid.videoUrl, vid);
            }
          }
        });
        
        const uploadedImgs = Array.from(uploadedImgsMap.values());
        const uploadedVids = Array.from(uploadedVidsMap.values());
        const genImages = Array.from(genImagesMap.values());
        const genVideos = Array.from(genVideosMap.values());
        // Helper to convert date to Date object
        const toDate = (date: Date | string | number | undefined | { toDate?: () => Date; toMillis?: () => number }): Date => {
          if (date instanceof Date) return date;
          if (typeof date === 'string') return new Date(date);
          if (typeof date === 'number') return new Date(date);
          if (date && typeof date === 'object' && 'toDate' in date && typeof date.toDate === 'function') {
            return date.toDate(); // Firestore Timestamp
          }
          if (date && typeof date === 'object' && 'toMillis' in date && typeof date.toMillis === 'function') {
            return new Date(date.toMillis()); // Firestore Timestamp
          }
          return new Date();
        };

        setGeneratedImages(genImages.map(img => ({
          id: img.id,
          imageUrl: img.imageUrl,
          prompt: img.prompt,
          createdAt: toDate(img.createdAt),
          modelName: img.modelName,
          generatedAt: img.generatedAt ? toDate(img.generatedAt) : undefined,
        })));
        // Load videos first, then load durations asynchronously
        const videosWithoutDurations = genVideos.map((v) => {
          const videoWithExtras = v as typeof v & {
            duration?: number;
            resolution?: '720p' | '1080p';
            klingMode?: 'std' | 'pro';
            manualCost?: number;
          };
          
          const inferredDuration = videoWithExtras.duration;
          const inferredKlingMode = videoWithExtras.klingMode;
          const inferredManualCost = videoWithExtras.manualCost;
          
          return {
            id: v.id,
            videoUrl: v.videoUrl,
            prompt: v.prompt,
            createdAt: toDate(v.createdAt),
            modelName: v.modelName,
            generatedAt: v.generatedAt ? toDate(v.generatedAt) : undefined,
            duration: inferredDuration,
            resolution: videoWithExtras.resolution,
            klingMode: inferredKlingMode,
            manualCost: inferredManualCost,
          };
        });
        
        setGeneratedVideos(videosWithoutDurations);
        
        // Load durations for videos that don't have them (async, updates state when done)
        (async () => {
          for (const video of videosWithoutDurations) {
            if (!video.duration && video.videoUrl) {
              const duration = await loadVideoDuration(video.videoUrl);
              if (duration > 0) {
                setGeneratedVideos(prev => prev.map(v => 
                  v.id === video.id ? { ...v, duration } : v
                ));
              }
            }
          }
        })();
        setUploadedImages(uploadedImgs.map(img => ({
          ...img,
          createdAt: toDate(img.createdAt),
        })));
        setUploadedVideos(uploadedVids.map(vid => {
          const vidWithExtras = vid as typeof vid & { manualCost?: number };
          return {
            ...vid,
            createdAt: toDate(vid.createdAt),
            manualCost: vidWithExtras.manualCost,
          };
        }));
        // Load uploaded images/videos from initialImageUrl if present and not already loaded
        // Use a Set to track existing URLs to avoid duplicates
        const existingImageUrls = new Set(uploadedImgs.map(img => img.imageUrl));
        if (initialImageUrl && !threadToLoad.referenceImage && !existingImageUrls.has(initialImageUrl)) {
          setUploadedImages(prev => {
            const alreadyExists = prev.some(img => img.imageUrl === initialImageUrl);
            if (alreadyExists) return prev;
            return [...prev, {
              id: `uploaded-img-${Date.now()}`,
              imageUrl: initialImageUrl,
              createdAt: new Date(),
            }];
          });
        }
        // Load existing assets from thread
        const loadedAssets = threadToLoad.selectedAssets.map(asset => {
          const fullAsset = globalAssets.find(a => a.id === asset.id);
          if (!fullAsset) return null;
          
          const thumbnailUrl = 
            asset.type === 'gadget'
              ? (fullAsset.aiRefImages?.fullGadget?.[0] || fullAsset.mainRender || fullAsset.galleryImages?.[0] || '')
              : asset.type === 'location'
                ? (fullAsset.aiRefImages?.ref01?.[0] || fullAsset.mainRender || fullAsset.galleryImages?.[0] || '')
                : asset.type === 'vehicle'
                  ? (fullAsset.aiRefImages?.exterior?.[0] || fullAsset.aiRefImages?.interior?.[0] || fullAsset.mainRender || fullAsset.galleryImages?.[0] || '')
                  : ((fullAsset as Character).aiRefImages?.head?.[0] || (fullAsset as Character).mainImage || (fullAsset as Character).characterGallery?.[0] || '');
          
          const images = 
            asset.type === 'gadget'
              ? [...(fullAsset.aiRefImages?.fullGadget || []).slice(0, 1), ...(fullAsset.mainRender ? [fullAsset.mainRender] : [])].slice(0, 1)
              : asset.type === 'location'
                ? [...(fullAsset.aiRefImages?.ref01 || []).slice(0, 1), ...(fullAsset.mainRender ? [fullAsset.mainRender] : [])].slice(0, 1)
                : asset.type === 'vehicle'
                  ? [...(fullAsset.aiRefImages?.exterior || []).slice(0, 1), ...(fullAsset.aiRefImages?.interior || []).slice(0, 1), ...(fullAsset.mainRender ? [fullAsset.mainRender] : [])].filter(Boolean).slice(0, 2)
                  : [
                      // Only use fullBody for characters
                      ...((fullAsset as Character).aiRefImages?.fullBody || []).slice(0, 1),
                    ];
          
          return {
            id: asset.id,
            type: asset.type,
            name: asset.name,
            thumbnailUrl,
            images: images.filter(Boolean),
          };
        }).filter(Boolean) as SelectedAsset[];
        
        setSelectedAssets(loadedAssets);
        
        // Also auto-detect from visual description to catch any new characters/locations
        // This helps when visual description has new characters/locations not in the thread
        setTimeout(() => {
          if (visualDescription) {
            const newAssets: SelectedAsset[] = [];
            
            // Detect characters from visual description
            const characterAssets = globalAssets.filter(a => a.category === 'character') as Character[];
            characterAssets.forEach(character => {
              const nameRegex = new RegExp(`\\b${character.name}\\b`, 'i');
              if (nameRegex.test(visualDescription)) {
                const thumbnailUrl = character.aiRefImages?.head?.[0] || 
                                     character.mainImage || 
                                     character.characterGallery?.[0] || '';
                if (thumbnailUrl) {
                  newAssets.push({
                    id: character.id,
                    type: 'character',
                    name: character.name,
                    thumbnailUrl,
                    images: [
                      ...(character.aiRefImages?.fullBody || []).slice(0, 1),
                    ].filter(Boolean),
                  });
                }
              }
            });
            
            // Detect locations from visual description
            const locationAssets = globalAssets.filter(a => a.category === 'location');
            locationAssets.forEach(location => {
              const nameRegex = new RegExp(`\\b${location.name}\\b`, 'i');
              if (nameRegex.test(visualDescription)) {
                const thumbnailUrl = location.aiRefImages?.ref01?.[0] || 
                                     location.mainRender || 
                                     location.galleryImages?.[0] || '';
                if (thumbnailUrl) {
                  newAssets.push({
                    id: location.id,
                    type: 'location',
                    name: location.name,
                    thumbnailUrl,
                    images: [
                      ...(location.aiRefImages?.ref01 || []).slice(0, 1),
                      ...(location.mainRender ? [location.mainRender] : []),
                    ].filter(Boolean).slice(0, 1),
                  });
                }
              }
            });
            
            // Detect vehicles from visual description
            const vehicleAssets = globalAssets.filter(a => a.category === 'vehicle');
            vehicleAssets.forEach(vehicle => {
              const nameRegex = new RegExp(`\\b${vehicle.name}\\b`, 'i');
              if (nameRegex.test(visualDescription)) {
                const thumbnailUrl = vehicle.aiRefImages?.exterior?.[0] || 
                                     vehicle.aiRefImages?.interior?.[0] ||
                                     vehicle.mainRender || 
                                     vehicle.galleryImages?.[0] || '';
                if (thumbnailUrl) {
                  newAssets.push({
                    id: vehicle.id,
                    type: 'vehicle',
                    name: vehicle.name,
                    thumbnailUrl,
                    images: [
                      ...(vehicle.aiRefImages?.exterior || []).slice(0, 1),
                      ...(vehicle.aiRefImages?.interior || []).slice(0, 1),
                      ...(vehicle.mainRender ? [vehicle.mainRender] : []),
                    ].filter(Boolean).slice(0, 2),
                  });
                }
              }
            });
            
            if (newAssets.length > 0) {
              setSelectedAssets(prev => {
                const existingIds = new Set(prev.map(a => a.id));
                const toAdd = newAssets.filter(a => !existingIds.has(a.id));
                return [...prev, ...toAdd];
              });
            }
          }
        }, 300);
        setSketchImage(threadToLoad.sketchImage || null);
        // Don't override setGeneratedImages again - it was already set above with deduplication (lines 303-322)
        setSelectedImageId(threadToLoad.selectedImageId || null);
        setSelectedStyle(threadToLoad.generatedImages[0]?.style || 'storyboard');
      } else {
        // Initialize new thread - reset tracking refs
        lastLoadedThreadId.current = undefined;
        lastLoadedThreadUpdatedAt.current = undefined;
        lastLoadedStartFrame.current = null;
        lastLoadedEndFrame.current = null;
        lastLoadedReferenceImage.current = null;
        syncedThreadRef.current = null;
        hasSyncedThread.current = false;
        setMessages([]);
        setInputText('');
        setSelectedAssets([]);
        setSketchImage(null);
        setStartFrame(null);
        setEndFrame(null);
        setReferenceImage(initialImageUrl || null);
        setReferenceVideo(null);
        setMainImageId(null);
        setMainVideoId(null);
        setGeneratedVideos([]);
        setSelectedStyle('storyboard');
        // Initialize uploaded images/videos from initialImageUrl if present
        if (initialImageUrl) {
          setUploadedImages([{
            id: `uploaded-img-${Date.now()}`,
            imageUrl: initialImageUrl,
            createdAt: new Date(),
          }]);
        } else {
          setUploadedImages([]);
        }
        setUploadedVideos([]);
        // Also check if there's a videoUrl in the shot that's not in the thread
        // This handles the case where video was uploaded directly in AV script
        setGeneratedImages([]);
        setSelectedImageId(null);
        
        // Pre-populate location if provided
        if (locationId) {
          const location = globalAssets.find(a => a.id === locationId && a.category === 'location');
          if (location) {
            const thumbnailUrl = location.aiRefImages?.ref01?.[0] || 
                                 location.mainRender || 
                                 location.galleryImages?.[0] || '';
            if (thumbnailUrl) {
              setSelectedAssets(prev => [...prev, {
                id: location.id,
                type: 'location',
                name: location.name,
                thumbnailUrl,
                images: [
                  ...(location.aiRefImages?.ref01 || []).slice(0, 1),
                  ...(location.mainRender ? [location.mainRender] : []),
                ].filter(Boolean).slice(0, 1),
              }]);
            }
          }
        }
        
        // Parse visual description for character and location names
        // This needs to happen after initial state is set
        setTimeout(() => {
          if (visualDescription) {
            const newAssets: SelectedAsset[] = [];
            
            // Detect characters from visual description
            const characterAssets = globalAssets.filter(a => a.category === 'character') as Character[];
            characterAssets.forEach(character => {
              // Check if character name appears in visual description (case insensitive)
              const nameRegex = new RegExp(`\\b${character.name}\\b`, 'i');
              if (nameRegex.test(visualDescription)) {
                const thumbnailUrl = character.aiRefImages?.head?.[0] || 
                                     character.mainImage || 
                                     character.characterGallery?.[0] || '';
                if (thumbnailUrl) {
                  newAssets.push({
                    id: character.id,
                    type: 'character',
                    name: character.name,
                    thumbnailUrl,
                    images: [
                      // Only use fullBody for characters
                      ...(character.aiRefImages?.fullBody || []).slice(0, 1),
                    ].filter(Boolean),
                  });
                }
              }
            });
            
            // Detect locations from visual description
            const locationAssets = globalAssets.filter(a => a.category === 'location');
            locationAssets.forEach(location => {
              // Check if location name appears in visual description (case insensitive)
              const nameRegex = new RegExp(`\\b${location.name}\\b`, 'i');
              if (nameRegex.test(visualDescription)) {
                const thumbnailUrl = location.aiRefImages?.ref01?.[0] || 
                                     location.mainRender || 
                                     location.galleryImages?.[0] || '';
                if (thumbnailUrl) {
                  newAssets.push({
                    id: location.id,
                    type: 'location',
                    name: location.name,
                    thumbnailUrl,
                    images: [
                      ...(location.aiRefImages?.ref01 || []).slice(0, 1),
                      ...(location.mainRender ? [location.mainRender] : []),
                    ].filter(Boolean).slice(0, 1),
                  });
                }
              }
            });
            
            // Detect vehicles from visual description
            const vehicleAssets = globalAssets.filter(a => a.category === 'vehicle');
            vehicleAssets.forEach(vehicle => {
              // Check if vehicle name appears in visual description (case insensitive)
              const nameRegex = new RegExp(`\\b${vehicle.name}\\b`, 'i');
              if (nameRegex.test(visualDescription)) {
                const thumbnailUrl = vehicle.aiRefImages?.exterior?.[0] || 
                                     vehicle.aiRefImages?.interior?.[0] ||
                                     vehicle.mainRender || 
                                     vehicle.galleryImages?.[0] || '';
                if (thumbnailUrl) {
                  newAssets.push({
                    id: vehicle.id,
                    type: 'vehicle',
                    name: vehicle.name,
                    thumbnailUrl,
                    images: [
                      ...(vehicle.aiRefImages?.exterior || []).slice(0, 1),
                      ...(vehicle.aiRefImages?.interior || []).slice(0, 1),
                      ...(vehicle.mainRender ? [vehicle.mainRender] : []),
                    ].filter(Boolean).slice(0, 2),
                  });
                }
              }
            });
            
            // Add detected assets if they don't already exist
            if (newAssets.length > 0) {
              setSelectedAssets(prev => {
                const existingIds = new Set(prev.map(a => a.id));
                const toAdd = newAssets.filter(a => !existingIds.has(a.id));
                return [...prev, ...toAdd];
              });
            }
          }
          
          // Update prompt after asset parsing
          setTimeout(() => {
            if (!isManuallyEditing.current) {
              const initialPrompt = buildPrompt();
              setEditablePrompt(initialPrompt);
            }
          }, 100);
        }, 200);
      }
      
      // Build initial prompt (will be updated after character parsing if needed)
      if (!existingThread) {
        setTimeout(() => {
          if (!isManuallyEditing.current) {
            const initialPrompt = buildPrompt();
            setEditablePrompt(initialPrompt);
          }
        }, 300);
      } else {
        // For existing thread, build prompt from current state
        if (!isManuallyEditing.current) {
          const initialPrompt = buildPrompt();
          setEditablePrompt(initialPrompt);
        }
      }
    }
  }, [isOpen, existingThread, locationId, visualDescription, globalAssets.length]);

  // Refs to prevent infinite loops in useEffect
  const prevSelectedAssetsLength = useRef(0);
  const prevHasSketch = useRef(false);
  const prevStyle = useRef(selectedStyle);
  const isManuallyEditing = useRef(false);
  
  // Update editable prompt when assets or style change (only if not manually editing)
  useEffect(() => {
    if (isOpen && !isManuallyEditing.current) {
      const assetsChanged = selectedAssets.length !== prevSelectedAssetsLength.current;
      const sketchChanged = !!sketchImage !== prevHasSketch.current;
      const styleChanged = selectedStyle !== prevStyle.current;
      
      if (assetsChanged || sketchChanged || styleChanged) {
        const prompt = buildPrompt();
        setEditablePrompt(prompt);
        
        prevSelectedAssetsLength.current = selectedAssets.length;
        prevHasSketch.current = !!sketchImage;
        prevStyle.current = selectedStyle;
      }
    }
  }, [isOpen, selectedAssets.length, sketchImage, selectedStyle]);

  const [showAssetSelector, setShowAssetSelector] = useState<'gadget' | 'location' | 'character' | 'vehicle' | null>(null);

  const handleAddGadget = () => {
    const gadgetAssets = globalAssets.filter(asset => asset.category === 'gadget');
    if (gadgetAssets.length === 0) {
      alert('No gadgets available. Please add gadgets in asset details first.');
      return;
    }
    setShowAssetSelector('gadget');
  };

  const handleAddLocation = () => {
    const locationAssets = globalAssets.filter(asset => asset.category === 'location');
    if (locationAssets.length === 0) {
      alert('No locations available. Please add locations in asset details first.');
      return;
    }
    setShowAssetSelector('location');
  };

  const handleAddCharacter = () => {
    const characterAssets = globalAssets.filter(asset => asset.category === 'character') as Character[];
    if (characterAssets.length === 0) {
      alert('No characters available. Please add characters in asset details first.');
      return;
    }
    setShowAssetSelector('character');
  };

  const handleAddVehicle = () => {
    const vehicleAssets = globalAssets.filter(asset => asset.category === 'vehicle');
    if (vehicleAssets.length === 0) {
      alert('No vehicles available. Please add vehicles in asset details first.');
      return;
    }
    setShowAssetSelector('vehicle');
  };

  const handleSelectAsset = (asset: GlobalAsset) => {
    if (showAssetSelector === 'gadget') {
      const thumbnailUrl = asset.aiRefImages?.fullGadget?.[0] || 
                           asset.mainRender || 
                           asset.galleryImages?.[0] || '';
      
      if (thumbnailUrl && !selectedAssets.find(a => a.id === asset.id)) {
        setSelectedAssets(prev => [...prev, {
          id: asset.id,
          type: 'gadget',
          name: asset.name,
          thumbnailUrl,
          images: [
            ...(asset.aiRefImages?.fullGadget || []).slice(0, 1),
            ...(asset.mainRender ? [asset.mainRender] : []),
          ].filter(Boolean).slice(0, 1),
        }]);
      }
    } else if (showAssetSelector === 'location') {
      const thumbnailUrl = asset.aiRefImages?.ref01?.[0] || 
                           asset.mainRender || 
                           asset.galleryImages?.[0] || '';
      
      if (thumbnailUrl && !selectedAssets.find(a => a.id === asset.id)) {
        setSelectedAssets(prev => [...prev, {
          id: asset.id,
          type: 'location',
          name: asset.name,
          thumbnailUrl,
          images: [
            ...(asset.aiRefImages?.ref01 || []).slice(0, 1),
            ...(asset.mainRender ? [asset.mainRender] : []),
          ].filter(Boolean).slice(0, 1),
        }]);
      }
    } else if (showAssetSelector === 'character') {
      const character = asset as Character;
      const thumbnailUrl = character.aiRefImages?.head?.[0] || 
                           character.mainImage || 
                           character.characterGallery?.[0] || '';
      
      if (thumbnailUrl && !selectedAssets.find(a => a.id === asset.id)) {
        setSelectedAssets(prev => [...prev, {
          id: asset.id,
          type: 'character',
          name: character.name,
          thumbnailUrl,
          images: [
            // Only use fullBody for characters
            ...(character.aiRefImages?.fullBody || []).slice(0, 1),
          ].filter(Boolean),
        }]);
      }
    }
    setShowAssetSelector(null);
  };

  const handleRemoveAsset = (assetId: string) => {
    setSelectedAssets(prev => prev.filter(asset => asset.id !== assetId));
  };

  const handleSaveSketch = async () => {
    if (!canvasRef.current) return;
    
    try {
      const imageData = await canvasRef.current.exportImage('png');
      setSketchImage(imageData);
      setShowDrawingCanvas(false);
    } catch (error) {
      console.error('Error saving sketch:', error);
    }
  };

  const handleClearCanvas = () => {
    if (canvasRef.current) {
      canvasRef.current.clearCanvas();
    }
  };

  const handleUploadImage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const imageData = e.target?.result as string;
      if (imageData) {
        setSketchImage(imageData);
        setShowDrawingCanvas(false);
      }
    };
    reader.onerror = () => {
      alert('Failed to read image file');
    };
    reader.readAsDataURL(file);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handlePasteImage = async (event: ClipboardEvent) => {
    // Only handle paste when dialog is open
    if (!isOpen) return;

    const items = event.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf('image') !== -1) {
        event.preventDefault();
        const blob = item.getAsFile();
        if (blob) {
          const reader = new FileReader();
          reader.onload = (e) => {
            const imageData = e.target?.result as string;
            if (imageData) {
              // Set as sketch image
              setSketchImage(imageData);
              // If canvas is open, close it since we're using the uploaded/pasted image
              if (showDrawingCanvas) {
                setShowDrawingCanvas(false);
              }
            }
          };
          reader.onerror = () => {
            alert('Failed to paste image');
          };
          reader.readAsDataURL(blob);
        }
        break;
      }
    }
  };

  // Add paste event listener
  useEffect(() => {
    if (isOpen) {
      const pasteHandler = (event: Event) => {
        if (event instanceof ClipboardEvent) {
          handlePasteImage(event);
        }
      };
      window.addEventListener('paste', pasteHandler);
      return () => {
        window.removeEventListener('paste', pasteHandler);
      };
    }
  }, [isOpen, showDrawingCanvas, handlePasteImage]);

  // Collect all images that will be sent
  const collectPreviewImages = () => {
    const images: Array<{ type: string; name: string; url: string; id?: string; source?: string }> = [];
    
    // Location images (only 1 per location)
    selectedAssets.filter(a => a.type === 'location').forEach(location => {
      location.images.slice(0, 1).forEach((url) => {
        images.push({
          type: 'Location',
          name: `${location.name} (main ref)`,
          url,
          id: `location-${location.id}`,
          source: 'location',
        });
      });
    });
    
    // Character images (only fullBody - 1 per character)
    selectedAssets.filter(a => a.type === 'character').forEach(character => {
      character.images.slice(0, 1).forEach((url) => {
        images.push({
          type: 'Character',
          name: `${character.name} (fullBody)`,
          url,
          id: `character-${character.id}`,
          source: 'character',
        });
      });
    });
    
    // Gadget images (only 1 per gadget)
    selectedAssets.filter(a => a.type === 'gadget').forEach(gadget => {
      gadget.images.slice(0, 1).forEach((url) => {
        images.push({
          type: 'Gadget',
          name: `${gadget.name} (main ref)`,
          url,
          id: `gadget-${gadget.id}`,
          source: 'gadget',
        });
      });
    });
    
    // Sketch
    if (sketchImage) {
      images.push({
        type: 'Sketch',
        name: 'Composition Sketch',
        url: sketchImage,
        id: 'sketch',
        source: 'sketch',
      });
    }
    
    // Start frame
    if (startFrame) {
      images.push({
        type: 'Start Frame',
        name: 'Starting Frame',
        url: startFrame,
        id: 'startFrame',
        source: 'startFrame',
      });
    }
    
    // End frame
    if (endFrame) {
      images.push({
        type: 'End Frame',
        name: 'Ending Frame',
        url: endFrame,
        id: 'endFrame',
        source: 'endFrame',
      });
    }
    
    // Main image (previously reference image)
    if (referenceImage) {
      images.push({
        type: 'Main',
        name: 'Main Image',
        url: referenceImage,
        id: 'referenceImage',
        source: 'referenceImage',
      });
    }
    
    // Initial image (for uploaded images)
    if (initialImageUrl && !referenceImage) {
      images.push({
        type: 'Main',
        name: 'Main Image',
        url: initialImageUrl,
        id: 'initialImage',
        source: 'initialImage',
      });
    }
    
    // Previous image (for refinement)
    if (selectedImageId) {
      const prevImg = generatedImages.find(img => img.id === selectedImageId);
      if (prevImg) {
        images.push({
          type: 'Previous',
          name: 'Previous Generated Image',
          url: prevImg.imageUrl,
          id: `previous-${selectedImageId}`,
          source: 'previous',
        });
      }
    }
    
    return images;
  };

  const handleShowPreview = () => {
    const promptToUse = editablePrompt.trim();
    
    if (!promptToUse) {
      alert('Please edit the prompt before sending');
      return;
    }
    
    const images = collectPreviewImages();
    setPreviewData({
      prompt: promptToUse,
      images,
    });
    setShowPreview(true);
  };

  const handleConfirmSend = async () => {
    setShowPreview(false);
    if (!previewData) return;
    
    const promptToUse = previewData.prompt;
    const messageText = inputText.trim();
    const isFirstGeneration = generatedImages.length === 0;
    
    // Get the IDs of images that are still in the preview (not removed)
    const remainingImageIds = new Set(previewData.images.map(img => img.id));
    
    // Filter assets based on remaining images
    const filteredCharacters = selectedAssets
      .filter(a => a.type === 'character')
      .filter(a => remainingImageIds.has(`character-${a.id}`))
      .map(a => ({
        id: a.id,
        name: a.name,
        images: a.images,
      }));
    
    const filteredLocations = selectedAssets
      .filter(a => a.type === 'location')
      .filter(a => remainingImageIds.has(`location-${a.id}`))
      .map(a => ({
        id: a.id,
        name: a.name,
        images: a.images,
      }));
    
    const filteredGadgets = selectedAssets
      .filter(a => a.type === 'gadget')
      .filter(a => remainingImageIds.has(`gadget-${a.id}`))
      .map(a => ({
        id: a.id,
        name: a.name,
        images: a.images,
      }));
    
    // Filter other images based on remaining images
    const filteredSketchImage = remainingImageIds.has('sketch') ? sketchImage : undefined;
    const filteredStartFrame = remainingImageIds.has('startFrame') ? startFrame : undefined;
    const filteredEndFrame = remainingImageIds.has('endFrame') ? endFrame : undefined;
    const filteredReferenceImage = remainingImageIds.has('referenceImage') ? referenceImage : undefined;
    const filteredInitialImageUrl = remainingImageIds.has('initialImage') ? initialImageUrl : undefined;
    const filteredPreviousImage = selectedImageId && remainingImageIds.has(`previous-${selectedImageId}`)
      ? generatedImages.find(img => img.id === selectedImageId)?.imageUrl
      : undefined;

    // Decide which single "main" image to use for image-conditioned generation.
    // This fixes the case where the user wants to generate based on ONE source image (main image) + text tweaks.
    const mainImageUrl: string | undefined = (() => {
      if (mainImageId === 'referenceImage') return filteredReferenceImage || undefined;
      if (mainImageId === 'startFrame') return filteredStartFrame || undefined;
      if (mainImageId === 'endFrame') return filteredEndFrame || undefined;
      // If mainImageId points to a generated image id
      if (mainImageId) {
        const gen = generatedImages.find(img => img.id === mainImageId);
        if (gen?.imageUrl) return gen.imageUrl;
      }
      // Fallbacks (first generation may only have uploaded/reference image; refinement may have selected previous image)
      return filteredReferenceImage || filteredInitialImageUrl || filteredPreviousImage;
    })();
    
    if (isFirstGeneration) {
      // First message - generate initial image
      setIsGenerating(true);
      
      try {
        // Call Gemini API
        const response = await fetch('/api/gemini/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: promptToUse,
            style: selectedStyle,
            locationDescription,
            visualDescription,
            characters: filteredCharacters,
            locations: filteredLocations,
            gadgets: filteredGadgets,
            sketchImage: filteredSketchImage,
            startFrame: filteredStartFrame,
            endFrame: filteredEndFrame,
            // Use the selected main image as the conditioning image
            previousImage: mainImageUrl,
            episodeId,
            showId,
          }),
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(errorData.error || `Server error: ${response.status}`);
        }
        
        const data = await response.json();
        if (!data.imageUrl) {
          throw new Error(data.error || 'No image URL returned from server');
        }
        const imageUrl = data.imageUrl;
        
        const imageId = `img-${Date.now()}`;
        const newImage = {
          id: imageId,
          imageUrl,
          prompt: promptToUse,
          createdAt: new Date(),
          modelName: data.modelName,
          generatedAt: data.generatedAt ? new Date(data.generatedAt) : new Date(),
        };
        
        setGeneratedImages(prev => [...prev, newImage]);
        setSelectedImageId(imageId);
        // Auto-select as main image if no main image is selected
        if (!mainImageId) {
          setMainImageId(imageId);
        }
        
        setMessages([{
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: 'Image generated successfully!',
          imageUrl,
          createdAt: new Date(),
        }]);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to generate image. Please try again.';
        console.error('Error generating image:', error);
        alert(errorMessage);
      } finally {
        setIsGenerating(false);
      }
    } else {
      // Refinement - add user message if provided
      if (messageText) {
        const userMessage: ChatMessage = {
          id: `msg-${Date.now()}`,
          role: 'user',
          content: messageText,
          createdAt: new Date(),
        };
        
        setMessages(prev => [...prev, userMessage]);
      }
      
      setInputText('');
      setIsGenerating(true);
      
      try {
        // Build refinement prompt - combine editable prompt with user's change request
        let refinementPrompt = promptToUse;
        if (messageText) {
          refinementPrompt += `\n\nADDITIONAL INSTRUCTIONS:\n${messageText}`;
        }
        
        // Call Gemini API for refinement
        const response = await fetch('/api/gemini/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: refinementPrompt,
            style: selectedStyle,
            locationDescription,
            visualDescription,
            characters: filteredCharacters,
            locations: filteredLocations,
            gadgets: filteredGadgets,
            sketchImage: filteredSketchImage,
            startFrame: filteredStartFrame,
            endFrame: filteredEndFrame,
            // Always condition on the selected main image (not just the last-selected thumbnail)
            previousImage: mainImageUrl,
            episodeId,
            showId,
          }),
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(errorData.error || `Server error: ${response.status}`);
        }
        
        const data = await response.json();
        if (!data.imageUrl) {
          throw new Error(data.error || 'No image URL returned from server');
        }
        const imageUrl = data.imageUrl;
        
        const imageId = `img-${Date.now()}`;
        const newImage = {
          id: imageId,
          imageUrl,
          prompt: refinementPrompt,
          createdAt: new Date(),
          modelName: data.modelName,
          generatedAt: data.generatedAt ? new Date(data.generatedAt) : new Date(),
        };
        
        setGeneratedImages(prev => [...prev, newImage]);
        setSelectedImageId(imageId);
        
        setMessages(prev => [...prev, {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: 'Image updated!',
          imageUrl,
          createdAt: new Date(),
        }]);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to generate image. Please try again.';
        console.error('Error generating image:', error);
        alert(errorMessage);
      } finally {
        setIsGenerating(false);
      }
    }
  };

  const handleSend = async () => {
    if (isGenerating) return;
    
    // Show preview first
    handleShowPreview();
  };

  // Handler for uploading start frame
  const handleUploadStartFrame = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }
    
    try {
      const fileKey = `episodes/${episodeId}/frames/start-${Date.now()}-${file.name}`;
      const result = await uploadFile(file, fileKey);
      if (result) {
        setStartFrame(result.url);
      }
    } catch (error) {
      console.error('Error uploading start frame:', error);
      alert('Failed to upload start frame');
    }
    
    if (startFrameFileInputRef.current) {
      startFrameFileInputRef.current.value = '';
    }
  };

  // Handler for uploading end frame
  const handleUploadEndFrame = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    try {
      const fileKey = `episodes/${episodeId}/frames/end-${Date.now()}-${file.name}`;
      const result = await uploadFile(file, fileKey);
      if (result) {
        setEndFrame(result.url);
      }
    } catch (error) {
      console.error('Error uploading end frame:', error);
      alert('Failed to upload end frame');
    }
    
    if (endFrameFileInputRef.current) {
      endFrameFileInputRef.current.value = '';
    }
  };

  // Handler for generating start frame
  const handleGenerateStartFrame = async () => {
    setIsGeneratingStartFrame(true);
    try {
      const prompt = `Generate a starting frame for this shot. ${visualDescription}`;
      const response = await fetch('/api/gemini/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          style: selectedStyle,
          locationDescription,
          visualDescription,
          characters: selectedAssets.filter(a => a.type === 'character').map(a => ({
            id: a.id,
            name: a.name,
            images: a.images,
          })),
          locations: selectedAssets.filter(a => a.type === 'location').map(a => ({
            id: a.id,
            name: a.name,
            images: a.images,
          })),
          gadgets: selectedAssets.filter(a => a.type === 'gadget').map(a => ({
            id: a.id,
            name: a.name,
            images: a.images,
          })),
          episodeId,
          showId,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate start frame');
      }
      
      const data = await response.json();
      if (data.imageUrl) {
        setStartFrame(data.imageUrl);
      }
    } catch (error) {
      console.error('Error generating start frame:', error);
      alert('Failed to generate start frame');
    } finally {
      setIsGeneratingStartFrame(false);
    }
  };

  // Handler for generating end frame
  const handleGenerateEndFrame = async () => {
    setIsGeneratingEndFrame(true);
    try {
      const prompt = `Generate an ending frame for this shot. ${visualDescription}`;
      const response = await fetch('/api/gemini/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          style: selectedStyle,
          locationDescription,
          visualDescription,
          characters: selectedAssets.filter(a => a.type === 'character').map(a => ({
            id: a.id,
            name: a.name,
            images: a.images,
          })),
          locations: selectedAssets.filter(a => a.type === 'location').map(a => ({
            id: a.id,
            name: a.name,
            images: a.images,
          })),
          gadgets: selectedAssets.filter(a => a.type === 'gadget').map(a => ({
            id: a.id,
            name: a.name,
            images: a.images,
          })),
          episodeId,
          showId,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate end frame');
      }
      
      const data = await response.json();
      if (data.imageUrl) {
        setEndFrame(data.imageUrl);
      }
    } catch (error) {
      console.error('Error generating end frame:', error);
      alert('Failed to generate end frame');
    } finally {
      setIsGeneratingEndFrame(false);
    }
  };

  // Handler for uploading reference image
  const handleUploadReferenceImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }
    
    try {
      const fileKey = `episodes/${episodeId}/reference-images/${Date.now()}-${file.name}`;
      const result = await uploadFile(file, fileKey);
      if (result) {
        setReferenceImage(result.url);
        // Also add to uploaded images grid if not already present
        setUploadedImages(prev => {
          const exists = prev.some(img => img.imageUrl === result.url);
          if (exists) return prev;
          return [...prev, {
            id: `uploaded-img-${Date.now()}`,
            imageUrl: result.url,
            createdAt: new Date(),
          }];
        });
      }
    } catch (error) {
      console.error('Error uploading reference image:', error);
      alert('Failed to upload reference image');
    }
    
    if (referenceImageFileInputRef.current) {
      referenceImageFileInputRef.current.value = '';
    }
  };

  // Handler for uploading reference video
  const handleUploadReferenceVideo = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('video/')) {
      alert('Please select a video file');
      return;
    }
    
    try {
      const fileKey = `episodes/${episodeId}/reference-videos/${Date.now()}-${file.name}`;
      const result = await uploadFile(file, fileKey);
      if (result) {
        setReferenceVideo(result.url);
      }
    } catch (error) {
      console.error('Error uploading reference video:', error);
      alert('Failed to upload reference video');
    }
    
    if (referenceVideoFileInputRef.current) {
      referenceVideoFileInputRef.current.value = '';
    }
  };

  // Handler for uploading Act Two character video
  const handleUploadCharacterVideo = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('video/')) {
      alert('Please select a video file');
      return;
    }

    try {
      const fileKey = `episodes/${episodeId}/character-videos/${Date.now()}-${file.name}`;
      const result = await uploadFile(file, fileKey);
      if (result) {
        setCharacterVideo(result.url);
      }
    } catch (error) {
      console.error('Error uploading character video:', error);
      alert('Failed to upload character video');
    }

    if (characterVideoFileInputRef.current) {
      characterVideoFileInputRef.current.value = '';
    }
  };

  // Handler for uploading additional reference image
  const handleUploadAdditionalReferenceImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }
    
    try {
      const fileKey = `episodes/${episodeId}/reference-images/${Date.now()}-${file.name}`;
      const result = await uploadFile(file, fileKey);
      if (result) {
        // Add as a new selected asset (reference image type)
        // For now, we'll treat it as a sketch/reference image
        setSketchImage(result.url);
      }
    } catch (error) {
      console.error('Error uploading additional reference image:', error);
      alert('Failed to upload reference image');
    }
    
    if (additionalReferenceImageFileInputRef.current) {
      additionalReferenceImageFileInputRef.current.value = '';
    }
  };

  // Helper to create thread with current state
  const createThreadFromState = (): AVShotImageGenerationThread => {
    // Combine uploaded images with generated images for the thread
    const allImages = [
      ...uploadedImages.map(img => ({
        id: img.id,
        imageUrl: img.imageUrl,
        prompt: 'Uploaded image',
        style: selectedStyle as 'storyboard' | '3d-render',
        createdAt: img.createdAt,
      })),
      ...generatedImages.map(img => ({
        id: img.id,
        imageUrl: img.imageUrl,
        prompt: img.prompt,
        style: selectedStyle as 'storyboard' | '3d-render',
        createdAt: img.createdAt,
        modelName: img.modelName,
        generatedAt: img.generatedAt,
      })),
    ];

    // Combine uploaded videos with generated videos for the thread
    const allVideos = [
      ...uploadedVideos.map(vid => ({
        id: vid.id,
        videoUrl: vid.videoUrl,
        prompt: 'Uploaded video',
        createdAt: vid.createdAt,
        manualCost: vid.manualCost,
      })),
      ...generatedVideos.map(vid => ({
        id: vid.id,
        videoUrl: vid.videoUrl,
        prompt: vid.prompt,
        createdAt: vid.createdAt,
        modelName: vid.modelName,
        generatedAt: vid.generatedAt,
        manualCost: vid.manualCost,
      })),
    ];

    return {
      id: existingThread?.id || `thread-${Date.now()}`,
      selectedAssets: selectedAssets.map(a => ({
        id: a.id,
        type: a.type,
        name: a.name,
      })),
      sketchImage: sketchImage || undefined,
      startFrame: startFrame || undefined,
      endFrame: endFrame || undefined,
      referenceImage: referenceImage || undefined,
      referenceVideo: referenceVideo || undefined,
      mainImageId: mainImageId || selectedImageId || undefined,
      mainVideoId: mainVideoId || undefined,
      messages: messages,
      generatedImages: allImages,
      generatedVideos: allVideos.length > 0 ? allVideos : undefined,
      selectedImageId: selectedImageId || undefined,
      createdAt: existingThread?.createdAt || new Date(),
      updatedAt: new Date(),
    };
  };

  // Handler to set MAIN badge for images and auto-update AV script
  // Note: Only ONE image can be main at a time. When clicking on a new image,
  // it becomes main and the previous main is automatically replaced.
  // Handler to set an image as first frame (startFrame)
  const handleSetFirstFrame = (imageUrl: string) => {
    setStartFrame(imageUrl);
    // Only set as main if it was already main
    const thread = createThreadFromState();
    thread.startFrame = imageUrl;
    // If the previous main was startFrame, keep it as main
    if (mainImageId === 'startFrame') {
      thread.mainImageId = 'startFrame';
    } else if (mainImageId && mainImageId !== 'startFrame') {
      // Keep existing main if it's not startFrame
      thread.mainImageId = mainImageId;
    }
    // Otherwise, don't set mainImageId (leave it as is or undefined)
    const mainImageUrl = getMainImageUrl();
    if (mainImageUrl) {
      onImageGenerated(mainImageUrl, thread);
    } else {
      // Even if no main image, save the thread to preserve the startFrame
      const imageToUse = startFrame || endFrame || referenceImage || initialImageUrl || 
                        generatedImages[0]?.imageUrl || uploadedImages[0]?.imageUrl;
      if (imageToUse) {
        onImageGenerated(imageToUse, thread);
      }
    }
  };

  // Handler to set an image as last frame (endFrame)
  const handleSetLastFrame = (imageUrl: string) => {
    setEndFrame(imageUrl);
    // Only set as main if it was already main
    const thread = createThreadFromState();
    thread.endFrame = imageUrl;
    // If the previous main was endFrame, keep it as main
    if (mainImageId === 'endFrame') {
      thread.mainImageId = 'endFrame';
    } else if (mainImageId && mainImageId !== 'endFrame') {
      // Keep existing main if it's not endFrame
      thread.mainImageId = mainImageId;
    }
    // Otherwise, don't set mainImageId (leave it as is or undefined)
    const mainImageUrl = getMainImageUrl();
    if (mainImageUrl) {
      onImageGenerated(mainImageUrl, thread);
    } else {
      // Even if no main image, save the thread to preserve the endFrame
      const imageToUse = startFrame || endFrame || referenceImage || initialImageUrl || 
                        generatedImages[0]?.imageUrl || uploadedImages[0]?.imageUrl;
      if (imageToUse) {
        onImageGenerated(imageToUse, thread);
      }
    }
  };

  // Handler to set an image as main (referenceImage)
  const handleSetMainImage = (imageUrl: string) => {
    setReferenceImage(imageUrl);
    setMainImageId('referenceImage');
    const thread = createThreadFromState();
    thread.referenceImage = imageUrl;
    thread.mainImageId = 'referenceImage';
    onImageGenerated(imageUrl, thread);
  };

  const handleToggleMain = (imageId: string) => {
    // Always set the clicked image as main (no toggle-off behavior)
    const newMainImageId = imageId;
    
    // Set flag to prevent useEffect from reloading during this operation
    isPerformingOperation.current = true;
    
    // Update state immediately
    setMainImageId(newMainImageId);
    
    // Get the image URL for the new main image ID
    let mainImageUrl: string | null = null;
    
    // Check uploaded images first
    if (newMainImageId.startsWith('uploaded-image-')) {
      const uploadedImgId = newMainImageId.replace('uploaded-image-', '');
      const uploadedImg = uploadedImages.find(img => img.id === uploadedImgId);
      mainImageUrl = uploadedImg?.imageUrl || null;
    } else if (newMainImageId === 'referenceImage') {
      mainImageUrl = referenceImage || initialImageUrl || null;
    } else if (newMainImageId === 'startFrame') {
      mainImageUrl = startFrame;
    } else if (newMainImageId === 'endFrame') {
      mainImageUrl = endFrame;
    } else {
      // Check generated images
      const img = generatedImages.find(img => img.id === newMainImageId);
      mainImageUrl = img?.imageUrl || null;
    }
    
    if (mainImageUrl) {
      // Create thread with updated mainImageId immediately
      // Use a function to ensure we get the latest state
      const thread = createThreadFromState();
      // Explicitly set the new mainImageId in the thread
      thread.mainImageId = newMainImageId;
      // Update AV script immediately
      onImageGenerated(mainImageUrl, thread);
    } else {
      // Even if no mainImageUrl, still update the thread to preserve the mainImageId change
      const thread = createThreadFromState();
      thread.mainImageId = newMainImageId;
      const imageToUse = startFrame || endFrame || referenceImage || initialImageUrl || 
                        generatedImages[0]?.imageUrl || uploadedImages[0]?.imageUrl;
      if (imageToUse) {
        onImageGenerated(imageToUse, thread);
      }
    }
    
    // Clear the flag after a short delay to allow state to settle
    setTimeout(() => {
      isPerformingOperation.current = false;
    }, 300);
  };

  // Handler to set MAIN badge for videos and auto-update AV script
  // Note: Only ONE video can be main at a time. When clicking on a new video,
  // it becomes main and the previous main is automatically replaced.
  // Handler for downloading videos
  const handleDownloadVideo = async (videoUrl: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const response = await fetch(videoUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Extract filename from URL or use default
      const urlParts = videoUrl.split('/');
      const filename = urlParts[urlParts.length - 1] || `video-${Date.now()}.mp4`;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading video:', error);
      alert('Failed to download video');
    }
  };

  const handleToggleMainVideo = (videoId: string) => {
    // Always set the clicked video as main (no toggle-off behavior)
    const newMainVideoId = videoId;
    setMainVideoId(newMainVideoId);
    
    const thread = createThreadFromState();
    thread.mainVideoId = newMainVideoId;
    // Get current main image URL to preserve it
    const mainImageUrl = getMainImageUrl();
    // Update AV script with both image and video
    if (mainImageUrl) {
      onImageGenerated(mainImageUrl, thread);
    } else {
      // If no main image, still save the thread with video
      const imageToUse = startFrame || endFrame || referenceImage || initialImageUrl || generatedImages[0]?.imageUrl || uploadedImages[0]?.imageUrl;
      if (imageToUse) {
        onImageGenerated(imageToUse, thread);
      }
    }
  };

  // Handler to close and save state
  const handleClose = () => {
    // If we have a synced thread (from Blender upload), use it instead of creating new one
    // This ensures the synced thread (with new image from Blender) is saved
    if (syncedThreadRef.current) {
      const syncedThread = syncedThreadRef.current;
      const mainImageUrl = syncedThread.referenceImage || 
                          syncedThread.startFrame || 
                          syncedThread.endFrame ||
                          syncedThread.generatedImages?.[0]?.imageUrl;
      if (mainImageUrl) {
        onImageGenerated(mainImageUrl, syncedThread);
        syncedThreadRef.current = null; // Clear after saving
        onClose();
        return;
      }
    }
    
    // Save current state to thread before closing
    // Always save if there's any content (uploaded or generated) to preserve it
    const hasContent = uploadedImages.length > 0 || uploadedVideos.length > 0 || 
                       generatedImages.length > 0 || generatedVideos.length > 0 ||
                       startFrame || endFrame || referenceImage || referenceVideo;
    
    if (hasContent) {
      const thread = createThreadFromState();
      const mainImageUrl = getMainImageUrl();
      
      // Always save the thread to preserve uploaded content
      if (mainImageUrl) {
        onImageGenerated(mainImageUrl, thread);
      } else {
        // If no main image but we have content, still save the thread
        // Use the first available image or keep existing
        const imageToUse = startFrame || endFrame || referenceImage || initialImageUrl || 
                          generatedImages[0]?.imageUrl || uploadedImages[0]?.imageUrl;
        if (imageToUse) {
          onImageGenerated(imageToUse, thread);
        } else {
          // Even if no image, save the thread to preserve videos and other content
          onImageGenerated('', thread);
        }
      }
    }
    onClose();
  };

  // Get the main image URL based on mainImageId
  const getMainImageUrl = (): string | null => {
    if (!mainImageId) return null;
    if (mainImageId === 'referenceImage') return referenceImage || initialImageUrl || null;
    if (mainImageId === 'startFrame') return startFrame;
    if (mainImageId === 'endFrame') return endFrame;
    // Check uploaded images first
    if (mainImageId.startsWith('uploaded-image-')) {
      const uploadedImgId = mainImageId.replace('uploaded-image-', '');
      const uploadedImg = uploadedImages.find(img => img.id === uploadedImgId);
      return uploadedImg?.imageUrl || null;
    }
    // Check generated images
    const img = generatedImages.find(img => img.id === mainImageId);
    return img?.imageUrl || null;
  };

  const handleUseImage = () => {
    // Determine which image to use as main
    const mainImageUrl = getMainImageUrl();
    const imageToUse = mainImageId 
      ? (mainImageId === 'referenceImage' ? (referenceImage || initialImageUrl) : mainImageId === 'startFrame' ? startFrame : mainImageId === 'endFrame' ? endFrame : generatedImages.find(img => img.id === mainImageId)?.imageUrl)
      : (selectedImageId ? generatedImages.find(img => img.id === selectedImageId)?.imageUrl : null);
    
    if (!imageToUse) {
      alert('Please select a main image to use');
      return;
    }
    
    // Create thread with all conversation data
    const thread = createThreadFromState();
    
    onImageGenerated(imageToUse, thread);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="text-xl font-semibold">Generate image/video</h2>
              <button
              onClick={handleClose}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
          </div>

          {/* Content - Two Column Layout */}
          <div className="flex-1 flex gap-4 p-4 overflow-hidden">
            {/* Left Column - 4 Image Slots */}
            <div className="w-64 flex-shrink-0 flex flex-col gap-4 overflow-y-auto">
              {/* First Frame */}
              <div className="border rounded-lg p-3">
                <h3 className="text-sm font-medium text-gray-700 mb-2">First Frame</h3>
                {startFrame ? (
                  <div className="relative">
                    <img
                      src={startFrame}
                      alt="Start Frame"
                      className="w-full aspect-video object-cover rounded border"
                    />
                    <button
                      onClick={() => setStartFrame(null)}
                      className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded hover:bg-red-600"
                      title="Remove"
                    >
                      <X className="w-3 h-3" />
                    </button>
                        </div>
                ) : (
                  <button
                    onClick={() => startFrameFileInputRef.current?.click()}
                    className="w-full aspect-video border-2 border-dashed border-gray-300 rounded flex flex-col items-center justify-center gap-2 hover:border-gray-400 text-sm text-gray-600"
                  >
                    <Upload className="w-6 h-6" />
                    UPLOAD IMAGE
                  </button>
                )}
                <input
                  ref={startFrameFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleUploadStartFrame}
                  className="hidden"
                />
                    </div>

              {/* Last Frame */}
              <div className="border rounded-lg p-3">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Last Frame</h3>
                {endFrame ? (
                  <div className="relative">
                    <img
                      src={endFrame}
                      alt="End Frame"
                      className="w-full aspect-video object-cover rounded border"
                    />
                    <button
                      onClick={() => setEndFrame(null)}
                      className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded hover:bg-red-600"
                      title="Remove"
                    >
                      <X className="w-3 h-3" />
                    </button>
              </div>
                ) : (
                  <button
                    onClick={() => endFrameFileInputRef.current?.click()}
                    className="w-full aspect-video border-2 border-dashed border-gray-300 rounded flex flex-col items-center justify-center gap-2 hover:border-gray-400 text-sm text-gray-600"
                  >
                    <Upload className="w-6 h-6" />
                    UPLOAD IMAGE
                  </button>
                )}
                <input
                  ref={endFrameFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleUploadEndFrame}
                  className="hidden"
                />
              </div>

              {/* Main Image */}
              <div className="border rounded-lg p-3">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Main Image</h3>
                {getMainImageUrl() ? (
                  <div className="relative">
                    <img
                      src={getMainImageUrl()!}
                      alt="Main Image"
                      className="w-full aspect-video object-cover rounded border cursor-pointer hover:opacity-90"
                      onClick={() => setEnlargedContent({ type: 'image', url: getMainImageUrl()! })}
                    />
                    <button
                      onClick={() => {
                        // Clear the main image
                        setMainImageId(null);
                      }}
                      className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded hover:bg-red-600"
                      title="Clear main image"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => referenceImageFileInputRef.current?.click()}
                    className="w-full aspect-video border-2 border-dashed border-gray-300 rounded flex flex-col items-center justify-center gap-2 hover:border-gray-400 text-sm text-gray-600"
                  >
                    <Upload className="w-6 h-6" />
                    UPLOAD MAIN IMAGE
                  </button>
                )}
                <input
                  ref={referenceImageFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleUploadReferenceImage}
                  className="hidden"
                />
              </div>

              {/* Reference Video */}
              <div className="border rounded-lg p-3">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Reference video</h3>
                {referenceVideo ? (
                  <div className="relative">
                    <video
                      src={referenceVideo}
                      className="w-full aspect-video object-cover rounded border"
                      controls
                    />
                    {/* Video camera icon to indicate this is a video */}
                    <div className="absolute bottom-1 right-1 bg-black bg-opacity-60 rounded-full p-1.5 pointer-events-none z-10">
                      <Video className="w-3 h-3 text-white" />
                    </div>
                    <button
                      onClick={() => handleToggleMainVideo('referenceVideo')}
                      className={`absolute top-1 right-1 px-2 py-1 text-xs rounded ${
                        mainVideoId === 'referenceVideo'
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-400 text-white'
                      }`}
                    >
                      MAIN
                    </button>
                    <button
                      onClick={() => {
                        setReferenceVideo(null);
                        if (mainVideoId === 'referenceVideo') setMainVideoId(null);
                      }}
                      className="absolute top-1 left-1 p-1 bg-red-500 text-white rounded hover:bg-red-600"
                      title="Remove"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => referenceVideoFileInputRef.current?.click()}
                    className="w-full aspect-video border-2 border-dashed border-gray-300 rounded flex flex-col items-center justify-center gap-2 hover:border-gray-400 text-sm text-gray-600"
                  >
                    <Video className="w-6 h-6" />
                    UPLOAD VIDEO
                  </button>
                )}
                <input
                  ref={referenceVideoFileInputRef}
                  type="file"
                  accept="video/*"
                  onChange={handleUploadReferenceVideo}
                  className="hidden"
                />
              </div>

              {/* Note: Act Two uses images for character (not videos) - see main image or generated images above */}
            </div>

            {/* Right Column - Generated Content Grid + Prompt Area */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Cost Breakdown */}
              {generatedVideos.length > 0 && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-gray-900">Generation Cost Breakdown</h3>
                    <span className="text-lg font-bold text-blue-700">
                      ${calculateTotalCost().toFixed(2)}
                    </span>
                  </div>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {getCostBreakdownByModel().map((item, idx) => (
                      <div key={idx} className="text-xs text-gray-700 flex items-center justify-between">
                        <span className="truncate flex-1">
                          {item.modelName} {item.count > 1 && `×${item.count}`}
                        </span>
                        <span className="ml-2 font-medium">${item.totalCost.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Scrollable Generated Content Grid */}
              <div className="flex-1 overflow-y-auto mb-4">
                {/* Grid with 3 items per row */}
                <div className="grid grid-cols-3 gap-3">
                  {/* First Frame (if set) */}
                  {startFrame && (
                    <div
                      onClick={() => setEnlargedContent({ type: 'image', url: startFrame })}
                      className={`relative cursor-pointer border-2 rounded-lg overflow-hidden aspect-video group ${
                        mainImageId === 'startFrame' ? 'border-green-500' : 'border-blue-500'
                      }`}
                    >
                      <img
                        src={startFrame}
                        alt="First Frame"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute top-1 left-1 bg-blue-500 text-white text-xs px-2 py-1 rounded z-10">
                        FIRST
                      </div>
                      {mainImageId === 'startFrame' && (
                        <div className="absolute top-1 right-1 bg-green-500 text-white text-xs px-2 py-1 rounded z-10">
                          MAIN
                        </div>
                      )}
                      <div className="absolute top-1 right-1 flex gap-1 z-10">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPromptModal({ type: 'image', prompt: 'Start frame (uploaded)' });
                          }}
                          className="bg-gray-600 text-white rounded p-1 opacity-0 group-hover:opacity-100 hover:bg-gray-700"
                          title="Show prompt"
                        >
                          <Info className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleMain('startFrame');
                          }}
                          className={`p-1 rounded ${
                            mainImageId === 'startFrame'
                              ? 'bg-green-600 text-white'
                              : 'bg-gray-400 text-white opacity-0 group-hover:opacity-100'
                          }`}
                          title="Set as Main"
                        >
                          <Star className="w-3 h-3" />
                        </button>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setStartFrame(null);
                          if (mainImageId === 'startFrame') {
                            setMainImageId(null);
                          }
                          const thread = createThreadFromState();
                          thread.startFrame = undefined;
                          if (thread.mainImageId === 'startFrame') {
                            thread.mainImageId = undefined;
                          }
                          const mainImageUrl = getMainImageUrl();
                          if (mainImageUrl) {
                            onImageGenerated(mainImageUrl, thread);
                          }
                        }}
                        className="absolute bottom-1 left-1 p-1 bg-red-500 text-white rounded opacity-0 group-hover:opacity-100 z-10 hover:bg-red-600"
                        title="Remove First Frame"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  {/* Last Frame (if set) */}
                  {endFrame && (
                    <div
                      onClick={() => setEnlargedContent({ type: 'image', url: endFrame })}
                      className={`relative cursor-pointer border-2 rounded-lg overflow-hidden aspect-video group ${
                        mainImageId === 'endFrame' ? 'border-green-500' : 'border-purple-500'
                      }`}
                    >
                      <img
                        src={endFrame}
                        alt="Last Frame"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute top-1 left-1 bg-purple-500 text-white text-xs px-2 py-1 rounded z-10">
                        LAST
                      </div>
                      {mainImageId === 'endFrame' && (
                        <div className="absolute top-1 right-1 bg-green-500 text-white text-xs px-2 py-1 rounded z-10">
                          MAIN
                        </div>
                      )}
                      <div className="absolute top-1 right-1 flex gap-1 z-10">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPromptModal({ type: 'image', prompt: 'End frame (uploaded)' });
                          }}
                          className="bg-gray-600 text-white rounded p-1 opacity-0 group-hover:opacity-100 hover:bg-gray-700"
                          title="Show prompt"
                        >
                          <Info className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleMain('endFrame');
                          }}
                          className={`p-1 rounded ${
                            mainImageId === 'endFrame'
                              ? 'bg-green-600 text-white'
                              : 'bg-gray-400 text-white opacity-0 group-hover:opacity-100'
                          }`}
                          title="Set as Main"
                        >
                          <Star className="w-3 h-3" />
                        </button>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEndFrame(null);
                          if (mainImageId === 'endFrame') {
                            setMainImageId(null);
                          }
                          const thread = createThreadFromState();
                          thread.endFrame = undefined;
                          if (thread.mainImageId === 'endFrame') {
                            thread.mainImageId = undefined;
                          }
                          const mainImageUrl = getMainImageUrl();
                          if (mainImageUrl) {
                            onImageGenerated(mainImageUrl, thread);
                          }
                        }}
                        className="absolute bottom-1 left-1 p-1 bg-red-500 text-white rounded opacity-0 group-hover:opacity-100 z-10 hover:bg-red-600"
                        title="Remove Last Frame"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  {/* Main Image (referenceImage, if set) */}
                  {referenceImage && (
                    <div
                      onClick={() => setEnlargedContent({ type: 'image', url: referenceImage })}
                      className={`relative cursor-pointer border-2 rounded-lg overflow-hidden aspect-video group ${
                        mainImageId === 'referenceImage' ? 'border-green-500' : 'border-gray-300'
                      }`}
                    >
                      <img
                        src={referenceImage}
                        alt="Main Image"
                        className="w-full h-full object-cover"
                      />
                      {mainImageId === 'referenceImage' && (
                        <div className="absolute top-1 left-1 bg-green-500 text-white text-xs px-2 py-1 rounded z-10">
                          MAIN
                        </div>
                      )}
                      <div className="absolute top-1 right-1 flex gap-1 z-10">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPromptModal({ type: 'image', prompt: 'Reference image (uploaded)' });
                          }}
                          className="bg-gray-600 text-white rounded p-1 opacity-0 group-hover:opacity-100 hover:bg-gray-700"
                          title="Show prompt"
                        >
                          <Info className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleMain('referenceImage');
                          }}
                          className={`p-1 rounded ${
                            mainImageId === 'referenceImage'
                              ? 'bg-green-600 text-white'
                              : 'bg-gray-400 text-white opacity-0 group-hover:opacity-100'
                          }`}
                          title="Set as Main"
                        >
                          <Star className="w-3 h-3" />
                        </button>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setReferenceImage(null);
                          if (mainImageId === 'referenceImage') {
                            setMainImageId(null);
                          }
                          const thread = createThreadFromState();
                          thread.referenceImage = undefined;
                          if (thread.mainImageId === 'referenceImage') {
                            thread.mainImageId = undefined;
                          }
                          const mainImageUrl = getMainImageUrl();
                          if (mainImageUrl) {
                            onImageGenerated(mainImageUrl, thread);
                          }
                        }}
                        className="absolute bottom-1 left-1 p-1 bg-red-500 text-white rounded opacity-0 group-hover:opacity-100 z-10 hover:bg-red-600"
                        title="Remove Main Image"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  {/* Uploaded Images */}
                  {uploadedImages.map((img, idx) => (
                    <div
                      key={`uploaded-img-${img.id}-${idx}`}
                      onClick={() => setEnlargedContent({ type: 'image', url: img.imageUrl })}
                      className={`relative cursor-pointer border-2 rounded-lg overflow-hidden aspect-video group ${
                        mainImageId === `uploaded-image-${img.id}` ? 'border-green-500' : 'border-gray-300'
                      }`}
                    >
                      <img
                        src={img.imageUrl}
                        alt="Uploaded"
                        className="w-full h-full object-cover"
                      />
                      {mainImageId === `uploaded-image-${img.id}` && (
                        <div className="absolute top-1 left-1 bg-green-500 text-white text-xs px-2 py-1 rounded z-10">
                          MAIN
                        </div>
                      )}
                      {/* Icon buttons for first/last/main - positioned at corners */}
                      <div className="absolute top-1 right-1 flex gap-1 z-10">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSetFirstFrame(img.imageUrl);
                          }}
                          className={`p-1 rounded ${
                            startFrame === img.imageUrl
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-400 text-white opacity-0 group-hover:opacity-100'
                          }`}
                          title="Set as First Frame"
                        >
                          <ChevronRight className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSetLastFrame(img.imageUrl);
                          }}
                          className={`p-1 rounded ${
                            endFrame === img.imageUrl
                              ? 'bg-purple-600 text-white'
                              : 'bg-gray-400 text-white opacity-0 group-hover:opacity-100'
                          }`}
                          title="Set as Last Frame"
                        >
                          <ChevronLeft className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPromptModal({ type: 'image', prompt: 'Uploaded image' });
                          }}
                          className="bg-gray-600 text-white rounded p-1 opacity-0 group-hover:opacity-100 hover:bg-gray-700"
                          title="Show prompt"
                        >
                          <Info className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleMain(`uploaded-image-${img.id}`);
                          }}
                          className={`p-1 rounded ${
                            mainImageId === `uploaded-image-${img.id}`
                              ? 'bg-green-600 text-white'
                              : 'bg-gray-400 text-white opacity-0 group-hover:opacity-100'
                          }`}
                          title="Set as Main"
                        >
                          <Star className="w-3 h-3" />
                        </button>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirm({ type: 'image', id: img.id, url: img.imageUrl });
                        }}
                        className="absolute top-1 left-1 p-1 bg-red-500 text-white rounded opacity-0 group-hover:opacity-100 z-10 hover:bg-red-600"
                        title="Delete image"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  
                  {/* Uploaded Videos */}
                  {uploadedVideos.map((vid, idx) => (
                    <div key={`uploaded-vid-${vid.id}-${idx}`} className="flex flex-col">
                      <div
                        onClick={() => setEnlargedContent({ type: 'video', url: vid.videoUrl })}
                        className="relative cursor-pointer border-2 rounded-lg overflow-hidden aspect-video group"
                      >
                        <video
                          src={vid.videoUrl}
                          className="w-full h-full object-cover"
                          muted
                        />
                        {/* Video camera icon to indicate this is a video */}
                        <div className="absolute bottom-1 right-1 bg-black bg-opacity-60 rounded-full p-1.5 pointer-events-none z-10">
                          <Video className="w-3 h-3 text-white" />
                        </div>
                        <div className="absolute top-1 right-1 flex gap-1 z-10">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setPromptModal({ type: 'video', prompt: 'Uploaded video' });
                            }}
                            className="bg-gray-600 text-white rounded p-1 opacity-0 group-hover:opacity-100 hover:bg-gray-700"
                            title="Show prompt"
                          >
                            <Info className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleMainVideo(`uploaded-video-${vid.id}`);
                            }}
                            className={`px-2 py-1 text-xs rounded ${
                              mainVideoId === `uploaded-video-${vid.id}`
                                ? 'bg-green-600 text-white'
                                : 'bg-gray-400 text-white opacity-0 group-hover:opacity-100'
                            }`}
                          >
                            MAIN
                          </button>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirm({ type: 'video', id: vid.id, url: vid.videoUrl });
                          }}
                          className="absolute top-1 left-1 p-1 bg-red-500 text-white rounded opacity-0 group-hover:opacity-100 z-10 hover:bg-red-600"
                          title="Delete video"
                        >
                          <X className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => handleDownloadVideo(vid.videoUrl, e)}
                          className="absolute bottom-1 left-1 p-1 bg-blue-500 text-white rounded opacity-0 group-hover:opacity-100 z-10 hover:bg-blue-600"
                          title="Download video"
                        >
                          <Download className="w-3 h-3" />
                        </button>
                      </div>
                      {/* Metadata below thumbnail */}
                      <div className="mt-1 px-1 space-y-0.5">
                        <div className="text-xs text-gray-600">
                          <span className="font-medium">Type:</span>{' '}
                          <span className="text-gray-800">Uploaded</span>
                        </div>
                        {editingVideoCost?.id === vid.id ? (
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-medium text-gray-700">Cost: $</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={editingVideoCost.cost}
                              onChange={(e) => {
                                const value = parseFloat(e.target.value) || 0;
                                setEditingVideoCost({ id: vid.id, cost: value });
                              }}
                              onBlur={() => {
                                if (editingVideoCost) {
                                  setUploadedVideos(prev => prev.map(v => 
                                    v.id === vid.id ? { ...v, manualCost: editingVideoCost.cost } : v
                                  ));
                                  setEditingVideoCost(null);
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  if (editingVideoCost) {
                                    setUploadedVideos(prev => prev.map(v => 
                                      v.id === vid.id ? { ...v, manualCost: editingVideoCost.cost } : v
                                    ));
                                    setEditingVideoCost(null);
                                  }
                                } else if (e.key === 'Escape') {
                                  setEditingVideoCost(null);
                                }
                              }}
                              className="w-16 px-1 py-0.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                              autoFocus
                            />
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (editingVideoCost) {
                                  setUploadedVideos(prev => prev.map(v => 
                                    v.id === vid.id ? { ...v, manualCost: editingVideoCost.cost } : v
                                  ));
                                  setEditingVideoCost(null);
                                }
                              }}
                              className="text-green-600 hover:text-green-800"
                              title="Save cost"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingVideoCost(null);
                              }}
                              className="text-red-600 hover:text-red-800"
                              title="Cancel"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <div className="text-xs font-semibold text-blue-700">
                              <span className="font-medium">Cost:</span>{' '}
                              ${(vid.manualCost || 0).toFixed(2)}
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingVideoCost({ id: vid.id, cost: vid.manualCost || 0 });
                              }}
                              className="text-gray-500 hover:text-gray-700"
                              title="Edit cost"
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  
                  {/* Generated Images */}
                  {generatedImages
                    .sort((a, b) => {
                      const getTime = (date: Date | string | number | undefined | { toMillis?: () => number }): number => {
                        if (date instanceof Date) return date.getTime();
                        if (typeof date === 'string') return new Date(date).getTime();
                        if (typeof date === 'number') return date;
                        if (date && typeof date === 'object' && 'toMillis' in date && typeof date.toMillis === 'function') {
                          return date.toMillis();
                        }
                        return 0;
                      };
                      const aTime = getTime(a.createdAt);
                      const bTime = getTime(b.createdAt);
                      return bTime - aTime;
                    })
                    .map((img, idx) => (
                      <div key={`gen-img-${img.id}-${idx}`} className="flex flex-col">
                        <div
                          onClick={() => setEnlargedContent({ type: 'image', url: img.imageUrl })}
                          className={`relative cursor-pointer border-2 rounded-lg overflow-hidden aspect-video group ${
                            mainImageId === img.id ? 'border-green-500' : 'border-gray-300'
                          }`}
                        >
                          <img
                            src={img.imageUrl}
                            alt="Generated"
                            className="w-full h-full object-cover"
                          />
                          {mainImageId === img.id && (
                            <div className="absolute top-1 left-1 bg-green-500 text-white text-xs px-2 py-1 rounded z-10">
                              MAIN
                            </div>
                          )}
                          {/* Icon buttons for first/last/main - positioned at corners */}
                          <div className="absolute top-1 right-1 flex gap-1 z-10">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setPromptModal({ type: 'image', prompt: img.prompt, modelName: img.modelName });
                              }}
                              className="bg-gray-600 text-white rounded p-1 opacity-0 group-hover:opacity-100 hover:bg-gray-700"
                              title="Show prompt"
                            >
                              <Info className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSetFirstFrame(img.imageUrl);
                              }}
                              className={`p-1 rounded ${
                                startFrame === img.imageUrl
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-gray-400 text-white opacity-0 group-hover:opacity-100'
                              }`}
                              title="Set as First Frame"
                            >
                              <ChevronRight className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSetLastFrame(img.imageUrl);
                              }}
                              className={`p-1 rounded ${
                                endFrame === img.imageUrl
                                  ? 'bg-purple-600 text-white'
                                  : 'bg-gray-400 text-white opacity-0 group-hover:opacity-100'
                              }`}
                              title="Set as Last Frame"
                            >
                              <ChevronLeft className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleMain(img.id);
                              }}
                              className={`p-1 rounded ${
                                mainImageId === img.id
                                  ? 'bg-green-600 text-white'
                                  : 'bg-gray-400 text-white opacity-0 group-hover:opacity-100'
                              }`}
                              title="Set as Main"
                            >
                              <Star className="w-3 h-3" />
                            </button>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirm({ type: 'image', id: img.id, url: img.imageUrl });
                            }}
                            className="absolute top-1 left-1 p-1 bg-red-500 text-white rounded opacity-0 group-hover:opacity-100 z-10 hover:bg-red-600"
                            title="Delete image"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        {/* Metadata below thumbnail */}
                        <div className="mt-1 px-1 space-y-0.5">
                          <div className="text-xs text-gray-600">
                            <span className="font-medium">Model:</span>{' '}
                            <span className="text-gray-800">{formatModelName(img.modelName)}</span>
                          </div>
                          <div className="text-xs text-gray-600">
                            <span className="font-medium">Generated:</span>{' '}
                            <span className="text-gray-800">
                              {img.generatedAt
                                ? new Date(img.generatedAt).toLocaleString('en-US', {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                : 'N/A'}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  
                  {/* Generated Videos */}
                  {generatedVideos
                    .sort((a, b) => {
                      const getTime = (date: Date | string | number | undefined | { toMillis?: () => number }): number => {
                        if (date instanceof Date) return date.getTime();
                        if (typeof date === 'string') return new Date(date).getTime();
                        if (typeof date === 'number') return date;
                        if (date && typeof date === 'object' && 'toMillis' in date && typeof date.toMillis === 'function') {
                          return date.toMillis();
                        }
                        return 0;
                      };
                      const aTime = getTime(a.createdAt);
                      const bTime = getTime(b.createdAt);
                      return bTime - aTime;
                    })
                    .map((vid, idx) => (
                      <div key={`gen-vid-${vid.id}-${idx}`} className="flex flex-col">
                        <div
                          onClick={() => setEnlargedContent({ type: 'video', url: vid.videoUrl })}
                          className="relative cursor-pointer border-2 rounded-lg overflow-hidden aspect-video group"
                        >
                          <video
                            src={vid.videoUrl}
                            className="w-full h-full object-cover"
                            muted
                          />
                          {/* Video camera icon to indicate this is a video */}
                          <div className="absolute bottom-1 right-1 bg-black bg-opacity-60 rounded-full p-1.5 pointer-events-none z-10">
                            <Video className="w-3 h-3 text-white" />
                          </div>
                          <div className="absolute top-1 right-1 flex gap-1 z-10">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setPromptModal({ type: 'video', prompt: vid.prompt, modelName: vid.modelName });
                              }}
                              className="bg-gray-600 text-white rounded p-1 opacity-0 group-hover:opacity-100 hover:bg-gray-700"
                              title="Show prompt"
                            >
                              <Info className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleMainVideo(vid.id);
                              }}
                              className={`px-2 py-1 text-xs rounded ${
                                mainVideoId === vid.id
                                  ? 'bg-green-600 text-white'
                                  : 'bg-gray-400 text-white opacity-0 group-hover:opacity-100'
                              }`}
                            >
                              MAIN
                            </button>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirm({ type: 'video', id: vid.id, url: vid.videoUrl });
                            }}
                            className="absolute top-1 left-1 p-1 bg-red-500 text-white rounded opacity-0 group-hover:opacity-100 z-10 hover:bg-red-600"
                            title="Delete video"
                          >
                            <X className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => handleDownloadVideo(vid.videoUrl, e)}
                            className="absolute bottom-1 left-1 p-1 bg-blue-500 text-white rounded opacity-0 group-hover:opacity-100 z-10 hover:bg-blue-600"
                            title="Download video"
                          >
                            <Download className="w-3 h-3" />
                          </button>
                        </div>
                        {/* Metadata below thumbnail */}
                        <div className="mt-1 px-1 space-y-0.5">
                          <div className="text-xs text-gray-600">
                            <span className="font-medium">Model:</span>{' '}
                            <span className="text-gray-800">{formatModelName(vid.modelName)}</span>
                          </div>
                          {(vid.duration || videoDurations[vid.videoUrl]) && (
                            <div className="text-xs text-gray-600">
                              <span className="font-medium">Duration:</span>{' '}
                              <span className="text-gray-800">
                                {Math.round(vid.duration || videoDurations[vid.videoUrl] || 0)}s
                              </span>
                            </div>
                          )}
                          {(() => {
                            const calculatedCost = vid.modelName 
                              ? calculateVideoCost(vid.modelName, vid.duration || videoDurations[vid.videoUrl], vid.resolution, vid.klingMode)
                              : 0;
                            const displayCost = (vid.manualCost !== undefined && vid.manualCost > 0) 
                              ? vid.manualCost 
                              : calculatedCost;
                            
                            if (displayCost > 0 || !vid.modelName) {
                              return editingGeneratedVideoCost?.id === vid.id ? (
                                <div className="flex items-center gap-1">
                                  <span className="text-xs font-medium text-gray-700">Cost: $</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={editingGeneratedVideoCost.cost}
                                    onChange={(e) => {
                                      const value = parseFloat(e.target.value) || 0;
                                      setEditingGeneratedVideoCost({ id: vid.id, cost: value });
                                    }}
                                    onBlur={() => {
                                      if (editingGeneratedVideoCost) {
                                        setGeneratedVideos(prev => prev.map(v => 
                                          v.id === vid.id ? { ...v, manualCost: editingGeneratedVideoCost.cost } : v
                                        ));
                                        setEditingGeneratedVideoCost(null);
                                      }
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        if (editingGeneratedVideoCost) {
                                          setGeneratedVideos(prev => prev.map(v => 
                                            v.id === vid.id ? { ...v, manualCost: editingGeneratedVideoCost.cost } : v
                                          ));
                                          setEditingGeneratedVideoCost(null);
                                        }
                                      } else if (e.key === 'Escape') {
                                        setEditingGeneratedVideoCost(null);
                                      }
                                    }}
                                    className="w-16 px-1 py-0.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                    autoFocus
                                  />
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (editingGeneratedVideoCost) {
                                        setGeneratedVideos(prev => prev.map(v => 
                                          v.id === vid.id ? { ...v, manualCost: editingGeneratedVideoCost.cost } : v
                                        ));
                                        setEditingGeneratedVideoCost(null);
                                      }
                                    }}
                                    className="text-green-600 hover:text-green-800"
                                    title="Save cost"
                                  >
                                    <Check className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingGeneratedVideoCost(null);
                                    }}
                                    className="text-red-600 hover:text-red-800"
                                    title="Cancel"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <div className="text-xs font-semibold text-blue-700">
                                    <span className="font-medium">Cost:</span>{' '}
                                    ${displayCost.toFixed(2)}
                                    {vid.manualCost !== undefined && vid.manualCost > 0 && ' (manual)'}
                                  </div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingGeneratedVideoCost({ id: vid.id, cost: vid.manualCost || calculatedCost || 0 });
                                    }}
                                    className="text-gray-500 hover:text-gray-700"
                                    title="Edit cost"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                  </button>
                                </div>
                              );
                            }
                            return null;
                          })()}
                          <div className="text-xs text-gray-600">
                            <span className="font-medium">Generated:</span>{' '}
                            <span className="text-gray-800">
                              {vid.generatedAt
                                ? new Date(vid.generatedAt).toLocaleString('en-US', {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                : 'N/A'}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  
                  {/* Empty state */}
                  {!startFrame && !endFrame && !referenceImage && uploadedImages.length === 0 && uploadedVideos.length === 0 && generatedImages.length === 0 && generatedVideos.length === 0 && (
                    <div className="col-span-3 text-sm text-gray-500 text-center py-8">
                      No content yet. Generate or upload images/videos to get started.
                    </div>
                  )}
                </div>
              </div>

              {/* Prompt Area */}
              <div className="border-t pt-4">
                {/* Icons and Thumbnails Row - Icons on left, thumbnails on right */}
                <div className="flex items-center gap-3 mb-3">
                  {/* Icons on the left */}
                  <div className="flex items-center gap-2">
              <button
                      onClick={() => additionalReferenceImageFileInputRef.current?.click()}
                className="p-2 bg-white border rounded hover:bg-gray-100"
                      title="Add Reference Image"
              >
                <Plus className="w-5 h-5" />
              </button>
              <button
                onClick={handleAddLocation}
                className="p-2 bg-white border rounded hover:bg-gray-100"
                title="Add Location"
              >
                <MapPin className="w-5 h-5" />
              </button>
              <button
                onClick={handleAddCharacter}
                className="p-2 bg-white border rounded hover:bg-gray-100"
                title="Add Character"
              >
                <User className="w-5 h-5" />
              </button>
              <button
                      onClick={handleAddGadget}
                className="p-2 bg-white border rounded hover:bg-gray-100"
                      title="Add Gadget"
              >
                      <Box className="w-5 h-5" />
              </button>
              <button
                onClick={handleAddVehicle}
                className="p-2 bg-white border rounded hover:bg-gray-100"
                title="Add Vehicle"
              >
                <Car className="w-5 h-5" />
              </button>
              <button
                      onClick={() => setShowDrawingCanvas(true)}
                className="p-2 bg-white border rounded hover:bg-gray-100"
                      title="Draw Sketch"
              >
                      <Pencil className="w-5 h-5" />
              </button>
              <input
                      ref={additionalReferenceImageFileInputRef}
                type="file"
                accept="image/*"
                      onChange={handleUploadAdditionalReferenceImage}
                className="hidden"
              />
            </div>

                  {/* Thumbnails on the right */}
                  <div className="flex-1 flex flex-wrap gap-2 justify-end">
                    {selectedAssets.map((asset) => (
                      <div
                        key={asset.id}
                        className="relative w-16 h-16 rounded border overflow-hidden"
                      >
                        <img
                          src={asset.thumbnailUrl}
                          alt={asset.name}
                          className="w-full h-full object-cover"
                        />
                        <button
                          onClick={() => handleRemoveAsset(asset.id)}
                          className="absolute top-0 right-0 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {sketchImage && (
                      <div className="relative w-16 h-16 rounded border overflow-hidden">
                        <img
                          src={sketchImage}
                          alt="Sketch"
                          className="w-full h-full object-cover"
                        />
                        <button
                          onClick={() => setSketchImage(null)}
                          className="absolute top-0 right-0 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs"
                        >
                          ×
                        </button>
                      </div>
                    )}
                  </div>
            </div>

                {/* Editable Prompt */}
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Prompt (editable)
              </label>
              <textarea
                value={editablePrompt}
                onChange={(e) => {
                  isManuallyEditing.current = true;
                  setEditablePrompt(e.target.value);
                }}
                onBlur={() => {
                  setTimeout(() => {
                    isManuallyEditing.current = false;
                  }, 2000);
                }}
                rows={6}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none font-mono text-sm"
                placeholder="Edit the prompt..."
                disabled={isGenerating}
              />
            </div>

                {/* Style Selection and Action Buttons Row - Style on left, buttons on right */}
                <div className="flex items-center justify-between gap-3">
                  {/* Style Selection on the left */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant={selectedStyle === 'storyboard' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedStyle('storyboard')}
                    >
                      Storyboard
                    </Button>
                    <Button
                      variant={selectedStyle === '3d-render' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedStyle('3d-render')}
                    >
                      3D Render
                    </Button>
              </div>

                  {/* Action Buttons on the right */}
                  <div className="flex items-center gap-3">
              <Button
                onClick={handleSend}
                disabled={isGenerating || !editablePrompt.trim()}
                      className="bg-blue-600 hover:bg-blue-700"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Generating...
                  </>
                ) : (
                  <>
                          <ImageIcon className="w-4 h-4 mr-2" />
                          Generate image
                  </>
                )}
              </Button>
                    <Button
                      onClick={() => {
                        // Pre-populate prompt with audio text if available, enhanced with 16:9 aspect ratio
                        let prompt = '';
                        if (audioText) {
                          prompt = audioText;
                        } else {
                          prompt = visualDescription || '';
                        }
                        // Always add 16:9 aspect ratio requirement for AV script shots
                        if (prompt && !prompt.toLowerCase().includes('16:9') && !prompt.toLowerCase().includes('aspect ratio')) {
                          prompt += ' The video MUST be in 16:9 aspect ratio (widescreen format). This is required for video production compatibility.';
                        }
                        setVideoPrompt(prompt);
                        // Auto-select input type based on availability
                        if (getMainImageUrl()) {
                          setSelectedVideoInputType('main');
                        } else if (startFrame && endFrame) {
                          setSelectedVideoInputType('start-end');
                        } else {
                          setSelectedVideoInputType(null);
                        }
                        setShowVideoGenerationModal(true);
                      }}
                      disabled={isGenerating}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      <Clapperboard className="w-4 h-4 mr-2" />
                      Generate video
              </Button>
                    <Button
                      onClick={() => manualUploadRef.current?.click()}
                      className="bg-black hover:bg-gray-800 text-white"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Upload manually
                    </Button>
                  </div>
                </div>
                
                {/* Hidden Upload Input */}
                <div className="hidden">

                  <input
                    ref={manualUploadRef}
                    type="file"
                    accept="image/*,video/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      
                      // Set flag to prevent useEffect from reloading during upload
                      isPerformingOperation.current = true;
                      
                      try {
                        if (file.type.startsWith('image/')) {
                          const result = await uploadFile(file, `episodes/${episodeId}/av-script/images/`);
                          if (result) {
                            const uploadedImgId = `uploaded-img-${Date.now()}`;
                            const uploadedImageMainId = `uploaded-image-${uploadedImgId}`;
                            
                            // Add the new image to the state
                            const newImage = {
                              id: uploadedImgId,
                              imageUrl: result.url,
                              createdAt: new Date(),
                            };
                            
                            // Update state and get current values
                            const currentMainImageUrl = getMainImageUrl();
                            const shouldSetAsMain = !currentMainImageUrl;
                            
                            setUploadedImages(prev => [...prev, newImage]);
                            
                            if (shouldSetAsMain) {
                              setMainImageId(uploadedImageMainId);
                            }
                            
                            // Wait for state to update then save
                            await new Promise(resolve => setTimeout(resolve, 150));
                            
                            // Create thread with updated state
                            const allImages = [
                              ...uploadedImages,
                              newImage,
                              ...generatedImages.map(img => ({
                                id: img.id,
                                imageUrl: img.imageUrl,
                                prompt: 'Uploaded image',
                                style: selectedStyle as 'storyboard' | '3d-render',
                                createdAt: img.createdAt,
                              })),
                            ].map(img => ({
                              id: img.id,
                              imageUrl: img.imageUrl,
                              prompt: ('prompt' in img && typeof img.prompt === 'string') ? img.prompt : 'Uploaded image',
                              style: selectedStyle as 'storyboard' | '3d-render',
                              createdAt: img.createdAt,
                            }));
                            
                            const allVideos = [
                              ...uploadedVideos.map(vid => ({
                                id: vid.id,
                                videoUrl: vid.videoUrl,
                                prompt: 'Uploaded video',
                                createdAt: vid.createdAt,
                                manualCost: vid.manualCost,
                              })),
                              ...generatedVideos,
                            ];
                            
                            const thread = {
                              id: existingThread?.id || `thread-${Date.now()}`,
                              selectedAssets: selectedAssets.map(a => ({
                                id: a.id,
                                type: a.type,
                                name: a.name,
                              })),
                              sketchImage: sketchImage || undefined,
                              startFrame: startFrame || undefined,
                              endFrame: endFrame || undefined,
                              referenceImage: referenceImage || undefined,
                              referenceVideo: referenceVideo || undefined,
                              mainImageId: shouldSetAsMain ? uploadedImageMainId : (mainImageId || undefined),
                              mainVideoId: mainVideoId || undefined,
                              messages: messages,
                              generatedImages: allImages,
                              generatedVideos: allVideos.length > 0 ? allVideos : undefined,
                              selectedImageId: selectedImageId || undefined,
                              createdAt: existingThread?.createdAt || new Date(),
                              updatedAt: new Date(),
                            };
                            
                            const imageUrlToSave = shouldSetAsMain ? result.url : (currentMainImageUrl || result.url);
                            onImageGenerated(imageUrlToSave, thread);
                          }
                        } else if (file.type.startsWith('video/')) {
                          const result = await uploadFile(file, `episodes/${episodeId}/av-script/videos/`);
                          if (result) {
                            const uploadedVidId = `uploaded-vid-${Date.now()}`;
                            const uploadedVideoMainId = `uploaded-video-${uploadedVidId}`;
                            
                            // Add the new video to the state
                            const newVideo = {
                              id: uploadedVidId,
                              videoUrl: result.url,
                              createdAt: new Date(),
                              manualCost: 0, // Default to 0, user can edit it
                            };
                            
                            const shouldSetAsMainVideo = !mainVideoId;
                            
                            setUploadedVideos(prev => {
                              const exists = prev.some(vid => vid.videoUrl === result.url);
                              if (exists) return prev;
                              return [...prev, newVideo];
                            });
                            
                            if (shouldSetAsMainVideo) {
                              setMainVideoId(uploadedVideoMainId);
                            }
                            
                            // Wait for state to update then save
                            await new Promise(resolve => setTimeout(resolve, 150));
                            
                            const allImages = [
                              ...uploadedImages.map(img => ({
                                id: img.id,
                                imageUrl: img.imageUrl,
                                prompt: 'Uploaded image',
                                style: selectedStyle as 'storyboard' | '3d-render',
                                createdAt: img.createdAt,
                              })),
                              ...generatedImages.map(img => ({
                                id: img.id,
                                imageUrl: img.imageUrl,
                                prompt: img.prompt,
                                style: selectedStyle as 'storyboard' | '3d-render',
                                createdAt: img.createdAt,
                              })),
                            ];
                            
                            const allVideos = [
                              ...uploadedVideos.map(vid => ({
                                id: vid.id,
                                videoUrl: vid.videoUrl,
                                prompt: 'Uploaded video',
                                createdAt: vid.createdAt,
                                manualCost: vid.manualCost,
                              })),
                              {
                                id: newVideo.id,
                                videoUrl: newVideo.videoUrl,
                                prompt: 'Uploaded video',
                                createdAt: newVideo.createdAt,
                                manualCost: newVideo.manualCost,
                              },
                              ...generatedVideos.map(vid => ({
                                id: vid.id,
                                videoUrl: vid.videoUrl,
                                prompt: vid.prompt,
                                createdAt: vid.createdAt,
                                modelName: vid.modelName,
                                generatedAt: vid.generatedAt,
                                manualCost: vid.manualCost,
                              })),
                            ];
                            
                            const thread = {
                              id: existingThread?.id || `thread-${Date.now()}`,
                              selectedAssets: selectedAssets.map(a => ({
                                id: a.id,
                                type: a.type,
                                name: a.name,
                              })),
                              sketchImage: sketchImage || undefined,
                              startFrame: startFrame || undefined,
                              endFrame: endFrame || undefined,
                              referenceImage: referenceImage || undefined,
                              referenceVideo: referenceVideo || undefined,
                              mainImageId: mainImageId || undefined,
                              mainVideoId: shouldSetAsMainVideo ? uploadedVideoMainId : (mainVideoId || undefined),
                              messages: messages,
                              generatedImages: allImages,
                              generatedVideos: allVideos.length > 0 ? allVideos : undefined,
                              selectedImageId: selectedImageId || undefined,
                              createdAt: existingThread?.createdAt || new Date(),
                              updatedAt: new Date(),
                            };
                            
                            const mainImageUrl = getMainImageUrl();
                            const imageToUse = mainImageUrl || startFrame || endFrame || referenceImage || initialImageUrl || generatedImages[0]?.imageUrl || uploadedImages[0]?.imageUrl;
                            onImageGenerated(imageToUse || '', thread);
                          }
                        }
                      } finally {
                        // Clear flag after operation completes
                        setTimeout(() => {
                          isPerformingOperation.current = false;
                        }, 200);
                        
                        // Reset the file input
                        e.target.value = '';
                      }
                    }}
                    className="hidden"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Video Generation Modal */}
      {showVideoGenerationModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Generate Video</h3>
              <button
                onClick={() => {
                  setShowVideoGenerationModal(false);
                  setSelectedVideoInputType(null);
                  setSelectedVeoImages([]); // Reset VEO image selection
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Video Model Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Video Generation Model
              </label>
              <select
                value={videoModel}
                onChange={(e) => {
                  setVideoModel(e.target.value);
                  // Reset selections when switching models
                  if (!e.target.value.startsWith('veo')) {
                    setSelectedVeoImages([]);
                  }
                  // Reset duration based on model
                  if (e.target.value.startsWith('kling')) {
                    setKlingDuration(5);
                  } else if (e.target.value.startsWith('runway')) {
                    setRunwayDuration(5);
                  } else {
                    setVideoDuration(8);
                  }
                  setSelectedVideoInputType(null);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <optgroup label="Veo (Google Gemini)">
                  <option value="veo-3-1-flash">Veo 3.1 Flash</option>
                  <option value="veo-3-1-pro">Veo 3.1 Pro</option>
                </optgroup>
                <optgroup label="SORA (OpenAI)">
                  <option value="sora-2">SORA 2</option>
                </optgroup>
                <optgroup label="Runway ML">
                  <option value="runway-gen4-turbo">Gen-4 Turbo</option>
                  <option value="runway-act-two">Act Two</option>
                </optgroup>
                <optgroup label="Kling AI">
                  <option value="kling-v2-5-turbo">Kling v2.5 Turbo</option>
                </optgroup>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {videoModel.startsWith('veo') 
                  ? 'Using Veo 3.1 models for video generation. Fast mode generates quicker, Pro mode provides higher quality. Note: Veo models require a paid tier Gemini API account.'
                  : videoModel.startsWith('runway')
                  ? videoModel === 'runway-gen4-turbo'
                    ? 'Using Runway ML Gen-4 Turbo for image-to-video generation. Supports flexible duration (2-10 seconds) and 1280x720 resolution.'
                    : 'Using Runway ML Act Two for character performance. Requires a main image (character) and reference video. Supports flexible duration (2-10 seconds) and 1280:720 ratio.'
                  : videoModel.startsWith('kling')
                  ? 'Using Kling AI v2.5 Turbo for image-to-video generation. Supports single frame or multiple frames input. Duration options: 5 or 10 seconds only.'
                  : 'Using OpenAI SORA 2 for video generation. Supports text-to-video and image-to-video generation.'}
              </p>
            </div>

            {/* Resolution Selection - Available for Veo, SORA, and Kling; fixed for Runway */}
            {!videoModel.startsWith('runway') && !videoModel.startsWith('kling') && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Video Resolution
                </label>
                <select
                  value={videoResolution}
                  onChange={(e) => setVideoResolution(e.target.value as '720p' | '1080p')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="720p">720p (1280x720 - Faster generation)</option>
                  <option value="1080p">1080p (1920x1080 - Higher quality)</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Select the output resolution for the generated video. Both Veo and SORA models support this.
                </p>
              </div>
            )}
            {videoModel.startsWith('runway') && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Video Resolution
                </label>
                <div className="px-3 py-2 border border-gray-300 rounded-lg bg-gray-50">
                  <span className="text-gray-700">1280x720 (Fixed for Runway ML models)</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Runway ML models use a fixed resolution of 1280x720 (16:9 ratio).
                </p>
              </div>
            )}
            {videoModel.startsWith('kling') && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Video Resolution
                </label>
                <div className="px-3 py-2 border border-gray-300 rounded-lg bg-gray-50">
                  <span className="text-gray-700">16:9 Aspect Ratio (Fixed for Kling AI models)</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Kling AI models use a fixed 16:9 aspect ratio (typically 1280x720 or 1920x1080 based on model).
                </p>
              </div>
            )}

            {/* Kling AI Mode Selection */}
            {videoModel.startsWith('kling') && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Generation Mode
                </label>
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setKlingMode('std')}
                    className={`flex-1 px-4 py-2 border-2 rounded-lg font-medium transition-colors ${
                      klingMode === 'std'
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                    }`}
                  >
                    Standard
                  </button>
                  <button
                    type="button"
                    onClick={() => setKlingMode('pro')}
                    className={`flex-1 px-4 py-2 border-2 rounded-lg font-medium transition-colors ${
                      klingMode === 'pro'
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                    }`}
                  >
                    Pro
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Standard: Faster, single image only. Pro: Higher quality, supports start+end frames (10s only).
                </p>
              </div>
            )}

            {/* Duration Selection - NOT shown for ACT Two character performance */}
            {videoModel.startsWith('runway') && !(videoModel === 'runway-act-two' && selectedVideoInputType === 'reference-video') ? (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Video Duration: {runwayDuration}s
                </label>
                <input
                  type="range"
                  min="2"
                  max="10"
                  value={runwayDuration}
                  onChange={(e) => setRunwayDuration(parseInt(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>2s</span>
                  <span>10s</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Select the duration of the generated video (2-10 seconds). Runway ML models support flexible durations.
                </p>
              </div>
            ) : videoModel.startsWith('kling') ? (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Video Duration
                </label>
                <div className="flex items-center gap-4">
                  {([5, 10] as const).map((duration) => (
                    <button
                      key={duration}
                      type="button"
                      onClick={() => setKlingDuration(duration)}
                      className={`flex-1 px-4 py-2 border-2 rounded-lg font-medium transition-colors ${
                        klingDuration === duration
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                          : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                      }`}
                    >
                      {duration}s
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Kling AI supports 5 or 10 second durations only.
                </p>
              </div>
            ) : (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Video Duration: {videoDuration}s
                </label>
                <div className="flex items-center gap-4">
                  {([4, 6, 8] as const).map((duration) => (
                    <button
                      key={duration}
                      type="button"
                      onClick={() => setVideoDuration(duration)}
                      className={`flex-1 px-4 py-2 border-2 rounded-lg font-medium transition-colors ${
                        videoDuration === duration
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                          : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                      }`}
                    >
                      {duration}s
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Select the duration of the generated video. Available options: 4s, 6s, or 8s.
                </p>
              </div>
            )}

            {/* Select Input Type - VEO models support both start-end frames and multi-image selection */}
            {videoModel.startsWith('veo') ? (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Input Type *
                </label>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  {/* Main Image - Image to Video */}
                  <div
                    onClick={() => {
                      if (getMainImageUrl()) {
                        setSelectedVideoInputType('main');
                        // Clear multi-image selection when switching to main
                        setSelectedVeoImages([]);
                      } else {
                        alert('No main image available. Please set a main image first.');
                      }
                    }}
                    className={`relative cursor-pointer border-2 rounded-lg overflow-hidden aspect-video ${
                      selectedVideoInputType === 'main' ? 'border-indigo-500' : 'border-gray-300'
                    } ${!getMainImageUrl() ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {getMainImageUrl() ? (
                      <>
                        <img
                          src={getMainImageUrl()!}
                          alt="Main Image"
                          className="w-full h-full object-cover"
                        />
                        {selectedVideoInputType === 'main' && (
                          <div className="absolute inset-0 bg-indigo-500 bg-opacity-30 flex items-center justify-center pointer-events-none">
                            <Check className="w-8 h-8 text-white" />
                          </div>
                        )}
                        <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-70 text-white text-sm font-medium p-2 text-center pointer-events-none">
                          MAIN IMAGE (Image to Video)
                        </div>
                      </>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400 text-sm">
                        No Main Image
                      </div>
                    )}
                  </div>

                  {/* Start & End Frame - Frames to Video */}
                  <div
                    onClick={() => {
                      if (startFrame && endFrame) {
                        setSelectedVideoInputType('start-end');
                        // Clear multi-image selection when switching to start-end
                        setSelectedVeoImages([]);
                      } else {
                        alert('Both start frame and end frame are required for frames-to-video generation.');
                      }
                    }}
                    className={`relative cursor-pointer border-2 rounded-lg overflow-hidden aspect-video ${
                      selectedVideoInputType === 'start-end' ? 'border-indigo-500' : 'border-gray-300'
                    } ${!startFrame || !endFrame ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {startFrame && endFrame ? (
                      <div className="w-full h-full grid grid-cols-2">
                        <div className="relative">
                          <img
                            src={startFrame}
                            alt="Start Frame"
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute bottom-0 left-0 right-0 bg-blue-600 bg-opacity-80 text-white text-xs p-1 text-center pointer-events-none">
                            START
                          </div>
                        </div>
                        <div className="relative">
                          <img
                            src={endFrame}
                            alt="End Frame"
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute bottom-0 left-0 right-0 bg-purple-600 bg-opacity-80 text-white text-xs p-1 text-center pointer-events-none">
                            END
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400 text-sm">
                        {!startFrame && !endFrame ? 'No Frames' : !startFrame ? 'No Start Frame' : 'No End Frame'}
                      </div>
                    )}
                    {selectedVideoInputType === 'start-end' && (
                      <div className="absolute inset-0 bg-indigo-500 bg-opacity-30 flex items-center justify-center pointer-events-none">
                        <Check className="w-8 h-8 text-white" />
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-70 text-white text-sm font-medium p-2 text-center pointer-events-none">
                      START & END FRAME (Frames to Video)
                    </div>
                  </div>
                </div>
                
                {/* Validation messages */}
                {!selectedVideoInputType && (
                  <p className="text-xs text-red-500 mt-1">Please select an input type</p>
                )}
                {selectedVideoInputType === 'main' && !getMainImageUrl() && (
                  <p className="text-xs text-amber-500 mt-1">Main image is required for image-to-video generation</p>
                )}
                {selectedVideoInputType === 'start-end' && (!startFrame || !endFrame) && (
                  <p className="text-xs text-amber-500 mt-1">Both start and end frames are required for frames-to-video generation</p>
                )}
                {selectedVideoInputType === 'start-end' && startFrame && endFrame && (
                  <p className="text-xs text-blue-500 mt-1">Note: Frames-to-video (interpolation) requires 8 seconds duration</p>
                )}
              </div>
            ) : (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Input Type *
              </label>
              <div className="grid grid-cols-2 gap-4">
                {/* Main Image - Image to Video */}
                <div
                  onClick={() => {
                    if (getMainImageUrl()) {
                      setSelectedVideoInputType('main');
                    } else {
                      alert('No main image available. Please set a main image first.');
                    }
                  }}
                  className={`relative cursor-pointer border-2 rounded-lg overflow-hidden aspect-video ${
                    selectedVideoInputType === 'main' ? 'border-indigo-500' : 'border-gray-300'
                  } ${!getMainImageUrl() ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {getMainImageUrl() ? (
                    <>
                      <img
                        src={getMainImageUrl()!}
                        alt="Main Image"
                        className="w-full h-full object-cover"
                      />
                      {selectedVideoInputType === 'main' && (
                        <div className="absolute inset-0 bg-indigo-500 bg-opacity-30 flex items-center justify-center">
                          <Check className="w-8 h-8 text-white" />
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-70 text-white text-sm font-medium p-2 text-center">
                        MAIN IMAGE (Image to Video)
                      </div>
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400 text-sm">
                      No Main Image
                    </div>
                  )}
                </div>

                {/* Start & End Frame - Frames to Video */}
                <div
                  onClick={() => {
                    if (startFrame && endFrame) {
                      setSelectedVideoInputType('start-end');
                    } else {
                      alert('Both start frame and end frame are required for frames-to-video generation.');
                    }
                  }}
                  className={`relative cursor-pointer border-2 rounded-lg overflow-hidden aspect-video ${
                    selectedVideoInputType === 'start-end' ? 'border-indigo-500' : 'border-gray-300'
                  } ${!startFrame || !endFrame ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {startFrame && endFrame ? (
                    <div className="w-full h-full grid grid-cols-2">
                      <div className="relative">
                        <img
                          src={startFrame}
                          alt="Start Frame"
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-70 text-white text-xs p-1 text-center">
                          START
                        </div>
                      </div>
                      <div className="relative">
                        <img
                          src={endFrame}
                          alt="End Frame"
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-70 text-white text-xs p-1 text-center">
                          END
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400 text-sm">
                      {!startFrame && !endFrame ? 'No Frames' : !startFrame ? 'No Start Frame' : 'No End Frame'}
                    </div>
                  )}
                  {selectedVideoInputType === 'start-end' && (
                    <div className="absolute inset-0 bg-indigo-500 bg-opacity-30 flex items-center justify-center pointer-events-none">
                      <Check className="w-8 h-8 text-white" />
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-70 text-white text-sm font-medium p-2 text-center pointer-events-none">
                    START & END FRAME (Frames to Video)
                  </div>
                </div>

                {/* Reference Video - For Act Two or Placeholder */}
                <div
                  onClick={() => {
                    if (videoModel === 'runway-act-two') {
                      if (referenceVideo && getMainImageUrl()) {
                        setSelectedVideoInputType('reference-video');
                      } else {
                        alert('Act Two requires a reference video and a character image (main image or generated image).');
                      }
                    } else {
                      alert('Reference video generation is not yet implemented for this model.');
                    }
                  }}
                  className={`relative cursor-pointer border-2 rounded-lg overflow-hidden aspect-video ${
                    selectedVideoInputType === 'reference-video' ? 'border-indigo-500' : 'border-gray-300'
                  } ${videoModel === 'runway-act-two' && referenceVideo && getMainImageUrl() ? '' : 'opacity-50 cursor-not-allowed'}`}
                >
                  {referenceVideo ? (
                    <>
                      <video
                        src={referenceVideo}
                        className="w-full h-full object-cover"
                        muted
                      />
                      {selectedVideoInputType === 'reference-video' && (
                        <div className="absolute inset-0 bg-indigo-500 bg-opacity-30 flex items-center justify-center">
                          <Check className="w-8 h-8 text-white" />
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-70 text-white text-sm font-medium p-2 text-center">
                        {videoModel === 'runway-act-two' ? 'REFERENCE VIDEO (Act Two)' : 'REFERENCE VIDEO (Coming Soon)'}
                      </div>
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400 text-sm">
                      No Reference Video
                    </div>
                  )}
                </div>
              </div>
              {!selectedVideoInputType && (
                <p className="text-xs text-red-500 mt-1">Please select an input type</p>
              )}
              {selectedVideoInputType === 'main' && !getMainImageUrl() && (
                <p className="text-xs text-amber-500 mt-1">Main image is required for image-to-video generation</p>
              )}
              {selectedVideoInputType === 'start-end' && (!startFrame || !endFrame) && (
                <p className="text-xs text-amber-500 mt-1">Both start and end frames are required for frames-to-video generation</p>
              )}
              {selectedVideoInputType === 'start-end' && startFrame && endFrame && (
                <p className="text-xs text-blue-500 mt-1">Note: Frames-to-video (interpolation) requires 8 seconds duration</p>
              )}
            </div>
            )}

            {/* Prompt - NOT shown for ACT Two character performance */}
            {!(videoModel === 'runway-act-two' && selectedVideoInputType === 'reference-video') && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Prompt (editable)
                </label>
                <textarea
                  value={videoPrompt}
                  onChange={(e) => setVideoPrompt(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                  placeholder="Enter video generation prompt (pre-populated with audio text)..."
                />
              </div>
            )}
            {videoModel === 'runway-act-two' && selectedVideoInputType === 'reference-video' && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>ACT Two Character Performance:</strong> This model controls your character&apos;s facial expressions and body movements based on the reference video. No prompt or duration needed - the character will follow the reference video&apos;s performance.
                </p>
              </div>
            )}

            {/* Generate Button */}
            <div className="flex items-center justify-end gap-2">
              <Button
                onClick={() => {
                  setShowVideoGenerationModal(false);
                  setSelectedVideoInputType(null);
                  setSelectedVeoImages([]); // Reset VEO image selection
                }}
                className="bg-gray-300 hover:bg-gray-400 text-gray-700"
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                    // VEO models use start-end frames or main image (like other models)
                    if (videoModel.startsWith('veo')) {
                      if (!selectedVideoInputType) {
                        alert('Please select an input type (Main Image or Start & End Frame)');
                        return;
                      }
                      if (selectedVideoInputType === 'main' && !getMainImageUrl()) {
                        alert('Main image is required for image-to-video generation');
                        return;
                      }
                      if (selectedVideoInputType === 'start-end' && (!startFrame || !endFrame)) {
                        alert('Both start and end frames are required for frames-to-video generation');
                        return;
                      }
                      if (!videoPrompt.trim()) {
                        alert('Please enter a prompt');
                        return;
                      }
                    } else {
                    // Other models use the old input type selection
                    if (!selectedVideoInputType) {
                      alert('Please select an input type');
                      return;
                    }
                    
                    if (selectedVideoInputType === 'main' && !getMainImageUrl()) {
                      alert('Main image is required for image-to-video generation');
                      return;
                    }
                    
                    if (selectedVideoInputType === 'start-end' && (!startFrame || !endFrame)) {
                      alert('Both start and end frames are required for frames-to-video generation');
                      return;
                    }
                    
                    if (selectedVideoInputType === 'reference-video' && videoModel !== 'runway-act-two') {
                      alert('Reference video generation is not yet implemented for this model');
                      return;
                    }
                    
                    if (videoModel === 'runway-act-two' && selectedVideoInputType === 'reference-video') {
                      if (!referenceVideo || !getMainImageUrl()) {
                        alert('Act Two requires a reference video and a character image (main image or generated image)');
                        return;
                      }
                    }
                    
                    if (!videoPrompt.trim() && !videoModel.startsWith('runway')) {
                      alert('Please enter a prompt');
                      return;
                    }
                  }
                  
                  setIsGeneratingVideo(true);
                  isPerformingOperation.current = true;
                  
                  try {
                    interface VideoRequestBody {
                      prompt?: string;
                      model: string;
                      episodeId: string;
                      type?: 'image-to-video' | 'frames-to-video' | 'character-performance';
                      imageUrl?: string;
                      characterVideoUrl?: string;
                      startFrameUrl?: string;
                      endFrameUrl?: string;
                      referenceVideoUrl?: string;
                      resolution?: '720p' | '1080p';
                      duration?: 4 | 6 | 8;
                      runwayDuration?: number;
                      klingDuration?: 5 | 10;
                      klingMode?: 'std' | 'pro';
                      // VEO multi-image support
                      veoImages?: Array<{ url: string; filename: string }>;
                    }
                    const requestBody: VideoRequestBody = {
                      model: videoModel,
                      episodeId,
                    };
                    
                    // Add prompt for non-Runway models - enhance with 16:9 aspect ratio requirement
                    if (!videoModel.startsWith('runway')) {
                      // Enhance prompt to always include 16:9 aspect ratio requirement for AV script shots
                      let enhancedPrompt = videoPrompt.trim();
                      if (enhancedPrompt && !enhancedPrompt.toLowerCase().includes('16:9') && !enhancedPrompt.toLowerCase().includes('aspect ratio')) {
                        enhancedPrompt += ' The video MUST be in 16:9 aspect ratio (widescreen format). This is required for video production compatibility.';
                      }
                      requestBody.prompt = enhancedPrompt;
                    }
                    
                    // Kling AI models
                    if (videoModel.startsWith('kling')) {
                      requestBody.klingDuration = klingDuration;
                      requestBody.klingMode = klingMode;
                      
                      if (selectedVideoInputType === 'main') {
                        // Image to video - single image
                        requestBody.type = 'image-to-video';
                        const mainImageUrl = getMainImageUrl();
                        if (mainImageUrl) {
                          requestBody.imageUrl = mainImageUrl;
                        }
                      } else if (selectedVideoInputType === 'start-end') {
                        // Frames to video - start + end frames
                        requestBody.type = 'frames-to-video';
                        if (startFrame) {
                          requestBody.startFrameUrl = startFrame;
                        }
                        if (endFrame) {
                          requestBody.endFrameUrl = endFrame;
                        }
                      }
                    } else if (videoModel.startsWith('veo')) {
                      // VEO models use start-end frames or main image (like other models)
                      if (selectedVideoInputType === 'main') {
                        // Image to video
                        requestBody.type = 'image-to-video';
                        const mainImageUrl = getMainImageUrl();
                        if (mainImageUrl) {
                          requestBody.imageUrl = mainImageUrl;
                        }
                        requestBody.resolution = videoResolution;
                        requestBody.duration = videoDuration;
                      } else if (selectedVideoInputType === 'start-end') {
                        // Frames to video
                        // Note: Veo 3.1 requires duration to be 8 seconds when using lastFrame (interpolation)
                        requestBody.type = 'frames-to-video';
                        if (startFrame) {
                          requestBody.startFrameUrl = startFrame;
                        }
                        if (endFrame) {
                          requestBody.endFrameUrl = endFrame;
                        }
                        requestBody.resolution = videoResolution;
                        requestBody.duration = 8; // Must be 8 for frames-to-video (interpolation)
                      }
                    } else if (videoModel === 'runway-act-two' && selectedVideoInputType === 'reference-video') {
                      // Act Two character performance - uses image for character (not video)
                      // Note: ACT Two character performance does NOT use prompt or duration
                      requestBody.type = 'character-performance';
                      const mainImageUrl = getMainImageUrl();
                      if (mainImageUrl) {
                        requestBody.imageUrl = mainImageUrl;
                      }
                      if (referenceVideo) {
                        requestBody.referenceVideoUrl = referenceVideo;
                      }
                      // Do NOT send prompt or duration for ACT Two character-performance
                    } else if (!videoModel.startsWith('kling') && selectedVideoInputType === 'main') {
                      // Image to video (for SORA and other non-Kling models)
                      requestBody.type = 'image-to-video';
                      const mainImageUrl = getMainImageUrl();
                      if (mainImageUrl) {
                        requestBody.imageUrl = mainImageUrl;
                      }
                      if (videoModel.startsWith('runway')) {
                        requestBody.runwayDuration = runwayDuration;
                      } else {
                        requestBody.resolution = videoResolution;
                        requestBody.duration = videoDuration;
                      }
                    } else if (!videoModel.startsWith('kling') && selectedVideoInputType === 'start-end') {
                      // Frames to video (for SORA and other non-Kling models)
                      // Note: Veo 3.1 requires duration to be 8 seconds when using lastFrame (interpolation)
                      requestBody.type = 'frames-to-video';
                      if (startFrame) {
                        requestBody.startFrameUrl = startFrame;
                      }
                      if (endFrame) {
                        requestBody.endFrameUrl = endFrame;
                      }
                      requestBody.resolution = videoResolution;
                      requestBody.duration = 8; // Must be 8 for frames-to-video (interpolation)
                    }
                    
                    const response = await fetch('/api/gemini/generate-video', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(requestBody),
                    });
                    
                    if (!response.ok) {
                      let errorMessage = 'Video generation failed';
                      try {
                        const errorData = await response.json();
                        errorMessage = errorData.error || errorData.message || errorMessage;
                        if (errorData.details) {
                          errorMessage += `: ${errorData.details}`;
                        }
                      } catch (parseError) {
                        // If JSON parsing fails, try to get text
                        const errorText = await response.text().catch(() => 'Unknown error');
                        errorMessage = errorText || `HTTP ${response.status}: ${response.statusText}`;
                      }
                      throw new Error(errorMessage);
                    }
                    
                    const data = await response.json();
                    
                    if (data.videoUrl) {
                      // Determine actual duration used
                      let actualDuration: number;
                      if (videoModel.startsWith('kling')) {
                        actualDuration = klingDuration;
                      } else if (videoModel.startsWith('runway')) {
                        actualDuration = runwayDuration;
                      } else if (selectedVideoInputType === 'start-end') {
                        actualDuration = 8; // Frames-to-video always uses 8 seconds
                      } else {
                        actualDuration = videoDuration;
                      }

                      // Add generated video to state immediately
                      // Use the selected model from dropdown instead of API response
                      const newVideo = {
                        id: `gen-vid-${Date.now()}`,
                        videoUrl: data.videoUrl,
                        prompt: videoPrompt,
                        createdAt: new Date(),
                        modelName: videoModel, // Use the selected model from dropdown
                        generatedAt: data.generatedAt ? new Date(data.generatedAt) : new Date(),
                        duration: actualDuration,
                        resolution: videoResolution,
                        klingMode: videoModel.startsWith('kling') ? klingMode : undefined,
                      };
                      
                      // Update state immediately
                      setGeneratedVideos(prev => {
                        const updated = [...prev, newVideo];
                        console.log('✅ Video added to state:', newVideo);
                        return updated;
                      });
                      
                      // Set as main video if no main video exists
                      const shouldSetAsMain = !mainVideoId;
                      if (shouldSetAsMain) {
                        setMainVideoId(newVideo.id);
                      }
                      
                      // Save thread with new video - use longer timeout to ensure state is updated
                      setTimeout(async () => {
                        try {
                          // Create thread with updated state including the new video
                          const thread = createThreadFromState();
                          // Ensure mainVideoId is set if we just added the first video
                          if (shouldSetAsMain) {
                            thread.mainVideoId = newVideo.id;
                          }
                          // Ensure the new video is in the thread
                          if (!thread.generatedVideos || !thread.generatedVideos.find(v => v.id === newVideo.id)) {
                            thread.generatedVideos = [
                              ...(thread.generatedVideos || []),
                              {
                                id: newVideo.id,
                                videoUrl: newVideo.videoUrl,
                                prompt: newVideo.prompt,
                                createdAt: newVideo.createdAt,
                              }
                            ];
                          }
                          const mainImageUrl = getMainImageUrl();
                          if (mainImageUrl) {
                            onImageGenerated(mainImageUrl, thread);
                          } else {
                            const imageToUse = startFrame || endFrame || referenceImage || initialImageUrl || generatedImages[0]?.imageUrl || uploadedImages[0]?.imageUrl;
                            onImageGenerated(imageToUse || '', thread);
                          }
                          console.log('✅ Thread saved with video:', newVideo.id);
                        } catch (saveError) {
                          console.error('❌ Error saving thread:', saveError);
                        }
                      }, 500); // Increased timeout to ensure state is fully updated
                      
                      // Close modal
                      setShowVideoGenerationModal(false);
                      setSelectedVideoInputType(null);
                      setSelectedVeoImages([]); // Reset VEO image selection
                      setVideoPrompt(''); // Reset prompt
                    } else {
                      throw new Error('No video URL in response');
                    }
                  } catch (error) {
                    console.error('Video generation error:', error);
                    alert(error instanceof Error ? error.message : 'Failed to generate video. Please try again.');
                  } finally {
                    setIsGeneratingVideo(false);
                    setTimeout(() => {
                      isPerformingOperation.current = false;
                    }, 200);
                  }
                }}
                disabled={isGeneratingVideo || 
                  (!selectedVideoInputType || !videoPrompt.trim() || 
                   (selectedVideoInputType === 'main' && !getMainImageUrl()) ||
                   (selectedVideoInputType === 'start-end' && (!startFrame || !endFrame)) ||
                   (videoModel === 'runway-act-two' && selectedVideoInputType === 'reference-video' && (!referenceVideo || !getMainImageUrl())))}
                className="bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isGeneratingVideo ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Clapperboard className="w-4 h-4 mr-2" />
                    Generate
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Drawing Canvas Modal */}
      {showDrawingCanvas && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg p-6 max-w-5xl w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Draw Shot Sketch (16:9)</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 text-sm"
                  title="Upload Image (or press Ctrl+V to paste)"
                >
                  <Upload className="w-4 h-4 inline mr-1" />
                  Upload
                </button>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={strokeColor}
                    onChange={(e) => setStrokeColor(e.target.value)}
                    className="w-10 h-8 border rounded"
                  />
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={strokeWidth}
                    onChange={(e) => setStrokeWidth(Number(e.target.value))}
                    className="w-20"
                  />
                  <span className="text-sm text-gray-600">{strokeWidth}px</span>
                </div>
                <button
                  onClick={handleClearCanvas}
                  className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300"
                >
                  Clear
                </button>
                <button
                  onClick={handleSaveSketch}
                  className="px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                >
                  Save Sketch
                </button>
                <button
                  onClick={() => setShowDrawingCanvas(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 border border-gray-300 rounded overflow-hidden" style={{ aspectRatio: '16/9' }}>
              <ReactSketchCanvas
                ref={canvasRef}
                width="100%"
                height="100%"
                strokeColor={strokeColor}
                strokeWidth={strokeWidth}
                canvasColor="white"
                withTimestamp={true}
              />
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {showPreview && previewData && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[70]">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Preview: Prompt and Attached Images</h3>
              <button
                onClick={() => setShowPreview(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Prompt Preview */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Full Prompt (will be sent to Gemini):
              </label>
              <div className="px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm whitespace-pre-wrap font-mono max-h-60 overflow-y-auto">
                {previewData.prompt}
              </div>
            </div>
            
            {/* Images Preview */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Attached Images ({previewData.images.length} total):
              </label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {previewData.images.map((img, idx) => (
                  <div key={idx} className="border rounded-lg p-2 relative">
                    <button
                      onClick={() => {
                        setPreviewData(prev => {
                          if (!prev) return null;
                          return {
                            ...prev,
                            images: prev.images.filter((_, i) => i !== idx),
                          };
                        });
                      }}
                      className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded hover:bg-red-600 z-10"
                      title="Remove image"
                    >
                      <X className="w-3 h-3" />
                    </button>
                    <div className="text-xs font-medium text-gray-600 mb-1">{img.type}</div>
                    <div className="text-xs text-gray-500 mb-2">{img.name}</div>
                    <img
                      src={img.url}
                      alt={img.name}
                      className="w-full aspect-video object-cover rounded border"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="%23ccc"/><text x="50" y="50" text-anchor="middle" fill="%23999">Failed to load</text></svg>';
                      }}
                    />
                  </div>
                ))}
              </div>
              {previewData.images.length === 0 && (
                <div className="text-sm text-gray-500 text-center py-4">
                  No images will be attached
                </div>
              )}
            </div>
            
            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setShowPreview(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmSend}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Confirm & Send
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Asset Selector Modal */}
      {showAssetSelector && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">
                Select {showAssetSelector === 'gadget' ? 'Gadget' : showAssetSelector === 'location' ? 'Location' : showAssetSelector === 'character' ? 'Character' : 'Vehicle'}
              </h3>
              <button
                onClick={() => setShowAssetSelector(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {globalAssets
                .filter(asset => asset.category === showAssetSelector)
                .map(asset => {
                  const thumbnailUrl = 
                    showAssetSelector === 'gadget' 
                      ? (asset.aiRefImages?.fullGadget?.[0] || asset.mainRender || asset.galleryImages?.[0] || '')
                      : showAssetSelector === 'location'
                        ? (asset.aiRefImages?.ref01?.[0] || asset.mainRender || asset.galleryImages?.[0] || '')
                        : showAssetSelector === 'character'
                          ? ((asset as Character).aiRefImages?.head?.[0] || (asset as Character).mainImage || (asset as Character).characterGallery?.[0] || '')
                          : (asset.aiRefImages?.exterior?.[0] || asset.aiRefImages?.interior?.[0] || asset.mainRender || asset.galleryImages?.[0] || '');
                  
                  const isSelected = selectedAssets.some(a => a.id === asset.id);
                  
                  return (
                    <div
                      key={asset.id}
                      onClick={() => !isSelected && handleSelectAsset(asset)}
                      className={`border rounded-lg p-3 cursor-pointer hover:border-indigo-500 transition-colors ${
                        isSelected ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300'
                      }`}
                    >
                      {thumbnailUrl ? (
                        <img
                          src={thumbnailUrl}
                          alt={asset.name}
                          className={`w-full h-24 object-cover rounded mb-2 ${
                            showAssetSelector === 'gadget' ? 'aspect-square' : 'aspect-video'
                          }`}
                        />
                      ) : (
                        <div className="w-full h-24 bg-gray-100 rounded mb-2 flex items-center justify-center">
                          <ImageIcon className="w-8 h-8 text-gray-400" />
                        </div>
                      )}
                      <p className="text-sm font-medium text-center">{asset.name}</p>
                      {isSelected && (
                        <p className="text-xs text-indigo-600 text-center mt-1">Selected</p>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* Enlarged Content Modal */}
      {enlargedContent && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[70]" onClick={() => setEnlargedContent(null)}>
          <div className="relative max-w-4xl max-h-[90vh] p-4">
            <button
              onClick={() => setEnlargedContent(null)}
              className="absolute top-2 right-2 bg-black bg-opacity-50 text-white rounded-full p-2 hover:bg-opacity-75 z-10"
            >
              <X className="w-6 h-6" />
            </button>
            {enlargedContent.type === 'image' ? (
              <img
                src={enlargedContent.url}
                alt="Enlarged"
                className="max-w-full max-h-full object-contain rounded-lg"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <video
                src={enlargedContent.url}
                controls
                className="max-w-full max-h-full object-contain rounded-lg"
                onClick={(e) => e.stopPropagation()}
              />
            )}
            {/* Select as Main buttons */}
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-2">
              {enlargedContent.type === 'image' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    // Find which image this is
                    const uploadedImg = uploadedImages.find(img => img.imageUrl === enlargedContent.url);
                    const generatedImg = generatedImages.find(img => img.imageUrl === enlargedContent.url);
                    if (uploadedImg) {
                      handleToggleMain(`uploaded-image-${uploadedImg.id}`);
                    } else if (generatedImg) {
                      handleToggleMain(generatedImg.id);
                    }
                    setEnlargedContent(null);
                  }}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  Select as Main Image
                </button>
              )}
              {enlargedContent.type === 'video' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    // Find which video this is
                    const uploadedVid = uploadedVideos.find(vid => vid.videoUrl === enlargedContent.url);
                    const generatedVid = generatedVideos.find(vid => vid.videoUrl === enlargedContent.url);
                    if (uploadedVid) {
                      handleToggleMainVideo(`uploaded-video-${uploadedVid.id}`);
                    } else if (generatedVid) {
                      handleToggleMainVideo(generatedVid.id);
                    }
                    setEnlargedContent(null);
                  }}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  Select as Main Video
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[80]">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center space-x-3 mb-4">
              <div className="flex-shrink-0">
                <X className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-gray-900">Confirm Deletion</h3>
                <p className="text-sm text-gray-500">
                  Are you sure you want to delete this {deleteConfirm.type}? This action cannot be undone.
                </p>
              </div>
            </div>
            
            <div className="mb-4">
              {deleteConfirm.type === 'image' ? (
                <img
                  src={deleteConfirm.url}
                  alt="Preview"
                  className="w-full aspect-video object-cover rounded border"
                />
              ) : (
                <video
                  src={deleteConfirm.url}
                  className="w-full aspect-video object-cover rounded border"
                  muted
                />
              )}
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  const confirmData = deleteConfirm;
                  setDeleteConfirm(null);
                  
                  // Set flag to prevent useEffect from reloading
                  isPerformingOperation.current = true;
                  
                  if (confirmData.type === 'image') {
                    // Check if it's an uploaded image or generated image
                    const uploadedImg = uploadedImages.find(img => img.id === confirmData.id);
                    if (uploadedImg) {
                      // Remove from uploaded images
                      const newUploadedImages = uploadedImages.filter(img => img.id !== confirmData.id);
                      setUploadedImages(newUploadedImages);
                      // If this was the main image, clear mainImageId
                      if (mainImageId === `uploaded-image-${confirmData.id}`) {
                        setMainImageId(null);
                      }
                      // Save immediately with updated arrays
                      const allImagesForThread = [
                        ...newUploadedImages.map(img => ({
                          id: img.id,
                          imageUrl: img.imageUrl,
                          prompt: 'Uploaded image',
                          style: selectedStyle as 'storyboard' | '3d-render',
                          createdAt: img.createdAt,
                        })),
                        ...generatedImages.map(img => ({
                          id: img.id,
                          imageUrl: img.imageUrl,
                          prompt: img.prompt,
                          style: selectedStyle as 'storyboard' | '3d-render',
                          createdAt: img.createdAt,
                        })),
                      ];
                      const allVideosForThread = [
                        ...uploadedVideos.map(vid => ({
                          id: vid.id,
                          videoUrl: vid.videoUrl,
                          prompt: 'Uploaded video',
                          createdAt: vid.createdAt,
                          manualCost: vid.manualCost,
                        })),
                        ...generatedVideos.map(vid => ({
                          id: vid.id,
                          videoUrl: vid.videoUrl,
                          prompt: vid.prompt,
                          createdAt: vid.createdAt,
                          modelName: vid.modelName,
                          manualCost: vid.manualCost,
                        })),
                      ];
                      const thread: AVShotImageGenerationThread = {
                        id: existingThread?.id || `thread-${Date.now()}`,
                        selectedAssets: selectedAssets.map(a => ({
                          id: a.id,
                          type: a.type,
                          name: a.name,
                        })),
                        sketchImage: sketchImage || undefined,
                        startFrame: startFrame || undefined,
                        endFrame: endFrame || undefined,
                        referenceImage: referenceImage || undefined,
                        referenceVideo: referenceVideo || undefined,
                        mainImageId: mainImageId === `uploaded-image-${confirmData.id}` ? undefined : mainImageId || undefined,
                        mainVideoId: mainVideoId || undefined,
                        messages: messages,
                        generatedImages: allImagesForThread,
                        generatedVideos: allVideosForThread.length > 0 ? allVideosForThread : undefined,
                        selectedImageId: selectedImageId || undefined,
                        createdAt: existingThread?.createdAt || new Date(),
                        updatedAt: new Date(),
                      };
                      const mainImageUrl = mainImageId && mainImageId !== `uploaded-image-${confirmData.id}` 
                        ? getMainImageUrl() 
                        : (newUploadedImages[0]?.imageUrl || generatedImages[0]?.imageUrl || startFrame || endFrame || referenceImage || initialImageUrl);
                      if (mainImageUrl) {
                        onImageGenerated(mainImageUrl, thread);
                      } else {
                        onImageGenerated('', thread);
                      }
                    } else {
                      const genImg = generatedImages.find(img => img.id === confirmData.id);
                      if (genImg) {
                        // Remove from generated images
                        const newGeneratedImages = generatedImages.filter(img => img.id !== confirmData.id);
                        setGeneratedImages(newGeneratedImages);
                        // If this was the main image, clear mainImageId
                        if (mainImageId === confirmData.id) {
                          setMainImageId(null);
                        }
                        // Save immediately with updated arrays
                        const allImagesForThread = [
                          ...uploadedImages.map(img => ({
                            id: img.id,
                            imageUrl: img.imageUrl,
                            prompt: 'Uploaded image',
                            style: selectedStyle as 'storyboard' | '3d-render',
                            createdAt: img.createdAt,
                          })),
                          ...newGeneratedImages.map(img => ({
                            id: img.id,
                            imageUrl: img.imageUrl,
                            prompt: img.prompt,
                            style: selectedStyle as 'storyboard' | '3d-render',
                            createdAt: img.createdAt,
                          })),
                        ];
                        const allVideosForThread = [
                          ...uploadedVideos.map(vid => ({
                            id: vid.id,
                            videoUrl: vid.videoUrl,
                            prompt: 'Uploaded video',
                            createdAt: vid.createdAt,
                          })),
                          ...generatedVideos.map(vid => ({
                            id: vid.id,
                            videoUrl: vid.videoUrl,
                            prompt: vid.prompt,
                            createdAt: vid.createdAt,
                          })),
                        ];
                        const thread: AVShotImageGenerationThread = {
                          id: existingThread?.id || `thread-${Date.now()}`,
                          selectedAssets: selectedAssets.map(a => ({
                            id: a.id,
                            type: a.type,
                            name: a.name,
                          })),
                          sketchImage: sketchImage || undefined,
                          startFrame: startFrame || undefined,
                          endFrame: endFrame || undefined,
                          referenceImage: referenceImage || undefined,
                          referenceVideo: referenceVideo || undefined,
                          mainImageId: mainImageId === confirmData.id ? undefined : mainImageId || undefined,
                          mainVideoId: mainVideoId || undefined,
                          messages: messages,
                          generatedImages: allImagesForThread,
                          generatedVideos: allVideosForThread.length > 0 ? allVideosForThread : undefined,
                          selectedImageId: selectedImageId || undefined,
                          createdAt: existingThread?.createdAt || new Date(),
                          updatedAt: new Date(),
                        };
                        const mainImageUrl = mainImageId && mainImageId !== confirmData.id
                          ? getMainImageUrl()
                          : (newGeneratedImages[0]?.imageUrl || uploadedImages[0]?.imageUrl || startFrame || endFrame || referenceImage || initialImageUrl);
                        if (mainImageUrl) {
                          onImageGenerated(mainImageUrl, thread);
                        } else {
                          onImageGenerated('', thread);
                        }
                      }
                    }
                  } else {
                    // Check if it's an uploaded video or generated video
                    const uploadedVid = uploadedVideos.find(vid => vid.id === confirmData.id);
                    if (uploadedVid) {
                      // Remove from uploaded videos
                      const newUploadedVideos = uploadedVideos.filter(vid => vid.id !== confirmData.id);
                      setUploadedVideos(newUploadedVideos);
                      // If this was the main video, clear mainVideoId
                      if (mainVideoId === `uploaded-video-${confirmData.id}`) {
                        setMainVideoId(null);
                      }
                      // Save immediately with updated arrays
                      const allImagesForThread = [
                        ...uploadedImages.map(img => ({
                          id: img.id,
                          imageUrl: img.imageUrl,
                          prompt: 'Uploaded image',
                          style: selectedStyle as 'storyboard' | '3d-render',
                          createdAt: img.createdAt,
                        })),
                        ...generatedImages.map(img => ({
                          id: img.id,
                          imageUrl: img.imageUrl,
                          prompt: img.prompt,
                          style: selectedStyle as 'storyboard' | '3d-render',
                          createdAt: img.createdAt,
                        })),
                      ];
                      const allVideosForThread = [
                        ...newUploadedVideos.map(vid => ({
                          id: vid.id,
                          videoUrl: vid.videoUrl,
                          prompt: 'Uploaded video',
                          createdAt: vid.createdAt,
                          manualCost: vid.manualCost,
                        })),
                        ...generatedVideos.map(vid => ({
                          id: vid.id,
                          videoUrl: vid.videoUrl,
                          prompt: vid.prompt,
                          createdAt: vid.createdAt,
                          modelName: vid.modelName,
                          manualCost: vid.manualCost,
                        })),
                      ];
                      const thread: AVShotImageGenerationThread = {
                        id: existingThread?.id || `thread-${Date.now()}`,
                        selectedAssets: selectedAssets.map(a => ({
                          id: a.id,
                          type: a.type,
                          name: a.name,
                        })),
                        sketchImage: sketchImage || undefined,
                        startFrame: startFrame || undefined,
                        endFrame: endFrame || undefined,
                        referenceImage: referenceImage || undefined,
                        referenceVideo: referenceVideo || undefined,
                        mainImageId: mainImageId || undefined,
                        mainVideoId: mainVideoId === `uploaded-video-${confirmData.id}` ? undefined : mainVideoId || undefined,
                        messages: messages,
                        generatedImages: allImagesForThread,
                        generatedVideos: allVideosForThread.length > 0 ? allVideosForThread : undefined,
                        selectedImageId: selectedImageId || undefined,
                        createdAt: existingThread?.createdAt || new Date(),
                        updatedAt: new Date(),
                      };
                      const mainImageUrl = getMainImageUrl();
                      if (mainImageUrl) {
                        onImageGenerated(mainImageUrl, thread);
                      } else {
                        const imageToUse = startFrame || endFrame || referenceImage || initialImageUrl || 
                                          generatedImages[0]?.imageUrl || uploadedImages[0]?.imageUrl;
                        if (imageToUse) {
                          onImageGenerated(imageToUse, thread);
                        } else {
                          onImageGenerated('', thread);
                        }
                      }
                    } else {
                      const genVid = generatedVideos.find(vid => vid.id === confirmData.id);
                      if (genVid) {
                        // Remove from generated videos
                        const newGeneratedVideos = generatedVideos.filter(vid => vid.id !== confirmData.id);
                        setGeneratedVideos(newGeneratedVideos);
                        // If this was the main video, clear mainVideoId
                        if (mainVideoId === confirmData.id) {
                          setMainVideoId(null);
                        }
                        // Save immediately with updated arrays
                        const allImagesForThread = [
                          ...uploadedImages.map(img => ({
                            id: img.id,
                            imageUrl: img.imageUrl,
                            prompt: 'Uploaded image',
                            style: selectedStyle as 'storyboard' | '3d-render',
                            createdAt: img.createdAt,
                          })),
                          ...generatedImages.map(img => ({
                            id: img.id,
                            imageUrl: img.imageUrl,
                            prompt: img.prompt,
                            style: selectedStyle as 'storyboard' | '3d-render',
                            createdAt: img.createdAt,
                          })),
                        ];
                        const allVideosForThread = [
                          ...uploadedVideos.map(vid => ({
                            id: vid.id,
                            videoUrl: vid.videoUrl,
                            prompt: 'Uploaded video',
                            createdAt: vid.createdAt,
                            manualCost: vid.manualCost,
                          })),
                          ...newGeneratedVideos.map(vid => ({
                            id: vid.id,
                            videoUrl: vid.videoUrl,
                            prompt: vid.prompt,
                            createdAt: vid.createdAt,
                          })),
                        ];
                        const thread: AVShotImageGenerationThread = {
                          id: existingThread?.id || `thread-${Date.now()}`,
                          selectedAssets: selectedAssets.map(a => ({
                            id: a.id,
                            type: a.type,
                            name: a.name,
                          })),
                          sketchImage: sketchImage || undefined,
                          startFrame: startFrame || undefined,
                          endFrame: endFrame || undefined,
                          referenceImage: referenceImage || undefined,
                          referenceVideo: referenceVideo || undefined,
                          mainImageId: mainImageId || undefined,
                          mainVideoId: mainVideoId === confirmData.id ? undefined : mainVideoId || undefined,
                          messages: messages,
                          generatedImages: allImagesForThread,
                          generatedVideos: allVideosForThread.length > 0 ? allVideosForThread : undefined,
                          selectedImageId: selectedImageId || undefined,
                          createdAt: existingThread?.createdAt || new Date(),
                          updatedAt: new Date(),
                        };
                        const mainImageUrl = getMainImageUrl();
                        if (mainImageUrl) {
                          onImageGenerated(mainImageUrl, thread);
                        } else {
                          const imageToUse = startFrame || endFrame || referenceImage || initialImageUrl || 
                                            generatedImages[0]?.imageUrl || uploadedImages[0]?.imageUrl;
                          if (imageToUse) {
                            onImageGenerated(imageToUse, thread);
                          } else {
                            onImageGenerated('', thread);
                          }
                        }
                      }
                    }
                  }
                  
                  // Clear flag after operation completes
                  setTimeout(() => {
                    isPerformingOperation.current = false;
                  }, 100);
                }}
                className="flex-1 bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
              >
                Delete
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Prompt Info Modal */}
      {promptModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50" onClick={() => setPromptModal(null)}>
          <div className="relative max-w-2xl w-full mx-4 bg-white rounded-lg shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">
                Generation Prompt {promptModal.type === 'image' ? '(Image)' : '(Video)'}
              </h3>
              <button
                onClick={() => setPromptModal(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              {promptModal.modelName && (
                <div className="mb-4">
                  <span className="text-sm font-medium text-gray-700">Model: </span>
                  <span className="text-sm text-gray-600">{formatModelName(promptModal.modelName)}</span>
                </div>
              )}
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">
                  {promptModal.prompt || 'No prompt available'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

