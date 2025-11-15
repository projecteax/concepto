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
  Clapperboard
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
}: ImageGenerationDialogProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [selectedAssets, setSelectedAssets] = useState<SelectedAsset[]>([]);
  const [sketchImage, setSketchImage] = useState<string | null>(null);
  const [showDrawingCanvas, setShowDrawingCanvas] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<'storyboard' | '3d-render'>('storyboard');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<Array<{ id: string; imageUrl: string; prompt: string; createdAt: Date }>>([]);
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
  const [mainImageId, setMainImageId] = useState<string | null>(null); // Can be 'startFrame', 'endFrame', 'referenceImage', 'referenceVideo', or generated image ID
  const [isGeneratingStartFrame, setIsGeneratingStartFrame] = useState(false);
  const [isGeneratingEndFrame, setIsGeneratingEndFrame] = useState(false);
  const [showVideoGenerationModal, setShowVideoGenerationModal] = useState(false);
  const [videoModel, setVideoModel] = useState<string>('sora-2');
  const [videoPrompt, setVideoPrompt] = useState<string>('');
  const startFrameFileInputRef = useRef<HTMLInputElement>(null);
  const endFrameFileInputRef = useRef<HTMLInputElement>(null);
  const referenceImageFileInputRef = useRef<HTMLInputElement>(null);
  const referenceVideoFileInputRef = useRef<HTMLInputElement>(null);
  const additionalReferenceImageFileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile } = useS3Upload();

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

  // Initialize from existing thread or reset
  useEffect(() => {
    if (isOpen) {
      if (existingThread) {
        // Load existing thread
        setMessages(existingThread.messages.map(msg => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          imageUrl: msg.imageUrl,
          createdAt: msg.createdAt,
        })));
        setStartFrame(existingThread.startFrame || null);
        setEndFrame(existingThread.endFrame || null);
        // Load referenceImage from thread or initialImageUrl
        setReferenceImage(existingThread.referenceImage || initialImageUrl || null);
        setReferenceVideo(null); // TODO: Add referenceVideo to thread type if needed
        setMainImageId(existingThread.mainImageId || null);
        setSelectedAssets(existingThread.selectedAssets.map(asset => {
          const fullAsset = globalAssets.find(a => a.id === asset.id);
          if (!fullAsset) return null;
          
          const thumbnailUrl = 
            asset.type === 'gadget'
              ? (fullAsset.aiRefImages?.fullGadget?.[0] || fullAsset.mainRender || fullAsset.galleryImages?.[0] || '')
              : asset.type === 'location'
                ? (fullAsset.aiRefImages?.ref01?.[0] || fullAsset.mainRender || fullAsset.galleryImages?.[0] || '')
                : ((fullAsset as Character).aiRefImages?.head?.[0] || (fullAsset as Character).mainImage || (fullAsset as Character).characterGallery?.[0] || '');
          
          const images = 
            asset.type === 'gadget'
              ? [...(fullAsset.aiRefImages?.fullGadget || []).slice(0, 1), ...(fullAsset.mainRender ? [fullAsset.mainRender] : [])].slice(0, 1)
              : asset.type === 'location'
                ? [...(fullAsset.aiRefImages?.ref01 || []).slice(0, 1), ...(fullAsset.mainRender ? [fullAsset.mainRender] : [])].slice(0, 1)
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
        }).filter(Boolean) as SelectedAsset[]);
        setSketchImage(existingThread.sketchImage || null);
        setGeneratedImages(existingThread.generatedImages.map(img => ({
          id: img.id,
          imageUrl: img.imageUrl,
          prompt: img.prompt,
          createdAt: img.createdAt,
        })));
        setSelectedImageId(existingThread.selectedImageId || null);
        setSelectedStyle(existingThread.generatedImages[0]?.style || 'storyboard');
      } else {
        // Initialize new thread
        setMessages([]);
        setInputText('');
        setSelectedAssets([]);
        setSketchImage(null);
        setStartFrame(null);
        setEndFrame(null);
        setReferenceImage(initialImageUrl || null);
        setReferenceVideo(null);
        setMainImageId(null);
        setSelectedStyle('storyboard');
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
        
        // Parse visual description for character names
        // This needs to happen after initial state is set
        setTimeout(() => {
          if (visualDescription) {
            const characterAssets = globalAssets.filter(a => a.category === 'character') as Character[];
            const newCharacters: SelectedAsset[] = [];
            
            characterAssets.forEach(character => {
              // Check if character name appears in visual description (case insensitive)
              const nameRegex = new RegExp(`\\b${character.name}\\b`, 'i');
              if (nameRegex.test(visualDescription)) {
                const thumbnailUrl = character.aiRefImages?.head?.[0] || 
                                     character.mainImage || 
                                     character.characterGallery?.[0] || '';
                if (thumbnailUrl) {
                  newCharacters.push({
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
            
            if (newCharacters.length > 0) {
              setSelectedAssets(prev => {
                const existingIds = new Set(prev.map(a => a.id));
                const toAdd = newCharacters.filter(c => !existingIds.has(c.id));
                return [...prev, ...toAdd];
              });
            }
          }
          
          // Update prompt after character parsing
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

  const [showAssetSelector, setShowAssetSelector] = useState<'gadget' | 'location' | 'character' | null>(null);

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
    
    // Reference image
    if (referenceImage) {
      images.push({
        type: 'Reference',
        name: 'Reference Image',
        url: referenceImage,
        id: 'referenceImage',
        source: 'referenceImage',
      });
    }
    
    // Initial image (for uploaded images)
    if (initialImageUrl && !referenceImage) {
      images.push({
        type: 'Reference',
        name: 'Reference Image',
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
            initialImageUrl: filteredReferenceImage || filteredInitialImageUrl,
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
            previousImage: filteredPreviousImage,
            initialImageUrl: filteredReferenceImage || filteredInitialImageUrl,
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
      mainImageId: mainImageId || selectedImageId || undefined,
      messages: messages,
      generatedImages: generatedImages.map(img => ({
        id: img.id,
        imageUrl: img.imageUrl,
        prompt: img.prompt,
        style: selectedStyle,
        createdAt: img.createdAt,
      })),
      selectedImageId: selectedImageId || undefined,
      createdAt: existingThread?.createdAt || new Date(),
      updatedAt: new Date(),
    };
  };

  // Handler to toggle MAIN badge and auto-update AV script
  const handleToggleMain = (imageId: string) => {
    const newMainImageId = mainImageId === imageId ? null : imageId;
    setMainImageId(newMainImageId);
    
    // If a main image is selected, immediately update the AV script
    if (newMainImageId) {
      // Get the image URL for the new main image ID
      let mainImageUrl: string | null = null;
      if (newMainImageId === 'referenceImage') {
        mainImageUrl = referenceImage || initialImageUrl || null;
      } else if (newMainImageId === 'startFrame') {
        mainImageUrl = startFrame;
      } else if (newMainImageId === 'endFrame') {
        mainImageUrl = endFrame;
      } else {
        const img = generatedImages.find(img => img.id === newMainImageId);
        mainImageUrl = img?.imageUrl || null;
      }
      
      if (mainImageUrl) {
        const thread = createThreadFromState();
        thread.mainImageId = newMainImageId;
        // Update AV script immediately
        onImageGenerated(mainImageUrl, thread);
      }
    }
  };

  // Handler to close and save state
  const handleClose = () => {
    // Save current state to thread before closing
    const mainImageUrl = getMainImageUrl();
    if (mainImageUrl || startFrame || endFrame || referenceImage || generatedImages.length > 0) {
      const thread = createThreadFromState();
      // Save the thread even if no main image is selected (to preserve uploaded images)
      if (mainImageUrl) {
        onImageGenerated(mainImageUrl, thread);
      } else {
        // If no main image but we have state, still save the thread
        // Use the first available image or keep existing
        const imageToUse = startFrame || endFrame || referenceImage || initialImageUrl || generatedImages[0]?.imageUrl;
        if (imageToUse) {
          onImageGenerated(imageToUse, thread);
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
                      onClick={() => handleToggleMain('startFrame')}
                      className={`absolute top-1 right-1 px-2 py-1 text-xs rounded ${
                        mainImageId === 'startFrame'
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-400 text-white'
                      }`}
                    >
                      MAIN
                    </button>
                    <button
                      onClick={() => setStartFrame(null)}
                      className="absolute top-1 left-1 p-1 bg-red-500 text-white rounded hover:bg-red-600"
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
                      onClick={() => handleToggleMain('endFrame')}
                      className={`absolute top-1 right-1 px-2 py-1 text-xs rounded ${
                        mainImageId === 'endFrame'
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-400 text-white'
                      }`}
                    >
                      MAIN
                    </button>
                    <button
                      onClick={() => setEndFrame(null)}
                      className="absolute top-1 left-1 p-1 bg-red-500 text-white rounded hover:bg-red-600"
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

              {/* Reference Image */}
              <div className="border rounded-lg p-3">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Reference image</h3>
                {referenceImage || initialImageUrl ? (
                  <div className="relative">
                    <img
                      src={referenceImage || initialImageUrl}
                      alt="Reference"
                      className="w-full aspect-video object-cover rounded border"
                    />
                    <button
                      onClick={() => handleToggleMain('referenceImage')}
                      className={`absolute top-1 right-1 px-2 py-1 text-xs rounded ${
                        mainImageId === 'referenceImage'
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-400 text-white'
                      }`}
                    >
                      MAIN
                    </button>
                    <button
                      onClick={() => {
                        setReferenceImage(null);
                        if (mainImageId === 'referenceImage') setMainImageId(null);
                      }}
                      className="absolute top-1 left-1 p-1 bg-red-500 text-white rounded hover:bg-red-600"
                      title="Remove"
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
                    UPLOAD IMAGE
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
                    <button
                      onClick={() => {
                        setReferenceVideo(null);
                        if (mainImageId === 'referenceVideo') setMainImageId(null);
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
            </div>

            {/* Right Column - Generated Images + Prompt Area */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Scrollable Generated Images Area */}
              <div className="flex-1 overflow-y-auto mb-4">
                <div className="space-y-3">
                  {generatedImages.length > 0 ? (
                    generatedImages
                      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
                      .map((img) => (
                        <div
                          key={img.id}
                          onClick={() => {
                            setSelectedImageId(img.id);
                            // If clicking on image and no main is set, set it as main
                            if (!mainImageId || mainImageId !== img.id) {
                              handleToggleMain(img.id);
                            }
                          }}
                          className="relative cursor-pointer border-2 rounded-lg overflow-hidden"
                          style={{ maxWidth: '70%' }}
                        >
                          <img
                            src={img.imageUrl}
                            alt="Generated"
                            className="w-full aspect-video object-cover"
                />
                <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleMain(img.id);
                            }}
                            className={`absolute top-1 right-1 px-2 py-1 text-xs rounded ${
                              mainImageId === img.id
                                ? 'bg-green-600 text-white'
                                : 'bg-gray-400 text-white'
                            }`}
                          >
                            MAIN
                </button>
                        </div>
                      ))
                  ) : (
                    <div className="text-sm text-gray-500 text-center py-8">
                      No generated images yet. Use the prompt below to generate.
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
                      onClick={() => setShowVideoGenerationModal(true)}
                      disabled={isGenerating}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      <Clapperboard className="w-4 h-4 mr-2" />
                      Generate video
              </Button>
                  </div>
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
                onClick={() => setShowVideoGenerationModal(false)}
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
                onChange={(e) => setVideoModel(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <optgroup label="Sora">
                  <option value="sora-2">Sora 2</option>
                  <option value="sora-2-pro">Sora 2 Pro</option>
                </optgroup>
                <optgroup label="Kling">
                  <option value="kling-image-to-video">Image-to-Video</option>
                  <option value="kling-frames-to-video">Frames-to-Video</option>
                </optgroup>
                <optgroup label="Runway">
                  <option value="runway-gen-4">Gen 4</option>
                  <option value="runway-gen-4-turbo">Gen 4 Turbo</option>
                </optgroup>
                <optgroup label="Veo">
                  <option value="veo-3-1-flash">Veo 3.1 Flash</option>
                  <option value="veo-3-1-pro">Veo 3.1 Pro</option>
                </optgroup>
              </select>
            </div>

            {/* Start Frame, End Frame, Reference Image */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Start Frame</label>
                {startFrame ? (
                  <img src={startFrame} alt="Start" className="w-full aspect-video object-cover rounded border" />
                ) : (
                  <div className="w-full aspect-video border-2 border-dashed border-gray-300 rounded flex items-center justify-center text-sm text-gray-500">
                    No start frame
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">End Frame</label>
                {endFrame ? (
                  <img src={endFrame} alt="End" className="w-full aspect-video object-cover rounded border" />
                ) : (
                  <div className="w-full aspect-video border-2 border-dashed border-gray-300 rounded flex items-center justify-center text-sm text-gray-500">
                    No end frame
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Reference Image</label>
                {referenceImage || initialImageUrl ? (
                  <img src={referenceImage || initialImageUrl} alt="Reference" className="w-full aspect-video object-cover rounded border" />
                ) : (
                  <div className="w-full aspect-video border-2 border-dashed border-gray-300 rounded flex items-center justify-center text-sm text-gray-500">
                    No reference image
                  </div>
                )}
              </div>
            </div>

            {/* Prompt */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Prompt (editable)
              </label>
              <textarea
                value={videoPrompt}
                onChange={(e) => setVideoPrompt(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                placeholder="Enter video generation prompt..."
              />
            </div>

            {/* Generate Button */}
            <div className="flex items-center justify-end">
              <Button
                onClick={() => {
                  // Placeholder - video generation will be implemented later
                  alert('Video generation will be implemented soon');
                  setShowVideoGenerationModal(false);
                }}
                className="bg-red-600 hover:bg-red-700"
              >
                <Clapperboard className="w-4 h-4 mr-2" />
                Generate
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
                Select {showAssetSelector === 'gadget' ? 'Gadget' : showAssetSelector === 'location' ? 'Location' : 'Character'}
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
                        : ((asset as Character).aiRefImages?.head?.[0] || (asset as Character).mainImage || (asset as Character).characterGallery?.[0] || '');
                  
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
    </>
  );
}
