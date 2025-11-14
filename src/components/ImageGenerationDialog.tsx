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
  Upload
} from 'lucide-react';
import { GlobalAsset, Character, AVShotImageGenerationThread } from '@/types';
import { Button } from '@/components/ui/button';
import { ReactSketchCanvas, ReactSketchCanvasRef } from 'react-sketch-canvas';

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
    images: Array<{ type: string; name: string; url: string }>;
  } | null>(null);
  const canvasRef = useRef<ReactSketchCanvasRef>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [strokeColor, setStrokeColor] = useState('#000000');
  const [strokeWidth, setStrokeWidth] = useState(2);

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
      window.addEventListener('paste', handlePasteImage as EventListener);
      return () => {
        window.removeEventListener('paste', handlePasteImage as EventListener);
      };
    }
  }, [isOpen, showDrawingCanvas]);

  // Collect all images that will be sent
  const collectPreviewImages = () => {
    const images: Array<{ type: string; name: string; url: string }> = [];
    
    // Location images (only 1 per location)
    selectedAssets.filter(a => a.type === 'location').forEach(location => {
      location.images.slice(0, 1).forEach((url) => {
        images.push({
          type: 'Location',
          name: `${location.name} (main ref)`,
          url,
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
        });
      });
    });
    
    // Sketch
    if (sketchImage) {
      images.push({
        type: 'Sketch',
        name: 'Composition Sketch',
        url: sketchImage,
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
            sketchImage,
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
            sketchImage,
            previousImage: selectedImageId ? generatedImages.find(img => img.id === selectedImageId)?.imageUrl : undefined,
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

  const handleUseImage = () => {
    if (!selectedImageId) {
      alert('Please select an image to use');
      return;
    }
    
    const selectedImage = generatedImages.find(img => img.id === selectedImageId);
    if (!selectedImage) return;
    
    // Create thread with all conversation data
    const thread: AVShotImageGenerationThread = {
      id: existingThread?.id || `thread-${Date.now()}`,
      selectedAssets: selectedAssets.map(a => ({
        id: a.id,
        type: a.type,
        name: a.name,
      })),
      sketchImage: sketchImage || undefined,
      messages: messages,
      generatedImages: generatedImages.map(img => ({
        id: img.id,
        imageUrl: img.imageUrl,
        prompt: img.prompt,
        style: selectedStyle,
        createdAt: img.createdAt,
      })),
      selectedImageId: selectedImageId,
      createdAt: existingThread?.createdAt || new Date(),
      updatedAt: new Date(),
    };
    
    onImageGenerated(selectedImage.imageUrl, thread);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="text-xl font-semibold">Generate Image</h2>
            <div className="flex items-center gap-2">
              {selectedImageId && (
                <Button
                  onClick={handleUseImage}
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Check className="w-4 h-4 mr-1" />
                  Use Selected Image
                </Button>
              )}
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {/* Generated Images Gallery */}
            {generatedImages.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Generated Images</h3>
                <div className="grid grid-cols-3 gap-2">
                  {generatedImages.map((img) => (
                    <div
                      key={img.id}
                      onClick={() => setSelectedImageId(img.id)}
                      className={`relative cursor-pointer border-2 rounded-lg overflow-hidden ${
                        selectedImageId === img.id ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-gray-300'
                      }`}
                    >
                      <img
                        src={img.imageUrl}
                        alt="Generated"
                        className="w-full aspect-video object-cover"
                      />
                      {selectedImageId === img.id && (
                        <div className="absolute top-1 right-1 bg-indigo-600 text-white rounded-full w-6 h-6 flex items-center justify-center">
                          <Check className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Selected Image Preview */}
            {selectedImageId && (
              <div className="mb-4">
                <img
                  src={generatedImages.find(img => img.id === selectedImageId)?.imageUrl}
                  alt="Selected"
                  className="w-full rounded-lg border"
                />
              </div>
            )}

            {/* Chat Messages */}
            {messages.length > 0 && (
              <div className="space-y-4 mb-4">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg p-3 ${
                        msg.role === 'user'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-100 text-gray-900'
                      }`}
                    >
                      {msg.imageUrl && (
                        <img
                          src={msg.imageUrl}
                          alt="Generated"
                          className="w-full rounded mb-2"
                        />
                      )}
                      <p>{msg.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Selected Assets Thumbnails */}
            {selectedAssets.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {selectedAssets.map((asset) => (
                  <div
                    key={asset.id}
                    className={`relative ${
                      asset.type === 'gadget' ? 'w-16 h-16' : 'w-24 h-16'
                    } rounded border overflow-hidden`}
                  >
                    <img
                      src={asset.thumbnailUrl}
                      alt={asset.name}
                      className="w-full h-full object-cover"
                    />
                    <button
                      onClick={() => handleRemoveAsset(asset.id)}
                      className="absolute top-0 right-0 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Sketch Image */}
            {sketchImage && (
              <div className="mb-4 relative">
                <img
                  src={sketchImage}
                  alt="Sketch"
                  className="w-full rounded-lg border"
                />
                <button
                  onClick={() => setSketchImage(null)}
                  className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center"
                >
                  ×
                </button>
              </div>
            )}

          </div>

          {/* Input Area */}
          <div className="p-4 border-t bg-gray-50">
            {/* Asset Selection Icons */}
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={handleAddGadget}
                className="p-2 bg-white border rounded hover:bg-gray-100"
                title="Add Gadget"
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
                onClick={() => setShowDrawingCanvas(true)}
                className="p-2 bg-white border rounded hover:bg-gray-100"
                title="Draw Sketch"
              >
                <Pencil className="w-5 h-5" />
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-2 bg-white border rounded hover:bg-gray-100"
                title="Upload Sketch Image"
              >
                <Upload className="w-5 h-5" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleUploadImage}
                className="hidden"
              />
            </div>

            {/* Style Selection */}
            <div className="flex items-center gap-2 mb-3">
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

            {/* Editable Prompt - Always visible */}
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
                  // Reset manual editing flag after a delay to allow auto-updates again
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

            {/* Refinement Input - Only show after first generation */}
            {generatedImages.length > 0 && (
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Describe what you want to change
                </label>
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Describe what you want to change..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  disabled={isGenerating}
                />
              </div>
            )}

            {/* Send Button */}
            <div className="flex items-center justify-end">
              <Button
                onClick={handleSend}
                disabled={isGenerating || !editablePrompt.trim()}
                className="w-full sm:w-auto"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    {generatedImages.length === 0 ? 'Generate Image' : 'Refine Image'}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

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
                  <div key={idx} className="border rounded-lg p-2">
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
