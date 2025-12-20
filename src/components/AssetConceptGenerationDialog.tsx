'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Sparkles,
  Loader2,
  Image as ImageIcon,
  Star,
  CheckCircle,
  Upload,
  ZoomIn,
  Download
} from 'lucide-react';
import { GlobalAsset, Character, AssetConcept } from '@/types';
import { useS3Upload } from '@/hooks/useS3Upload';

interface AssetConceptGenerationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImageGenerated: (imageUrl: string, isMainConcept: boolean) => void;
  onConceptCreated?: (concept: Omit<AssetConcept, 'id' | 'createdAt' | 'updatedAt'>) => void; // Callback to save concept
  asset: GlobalAsset | Character;
  assetDescription: string; // The description/prompt for this asset
  globalAssets?: GlobalAsset[];
  showId: string;
  selectedReferenceImages?: string[]; // Selected concept images to use as AI references
}

interface GeneratedImage {
  id: string;
  imageUrl: string;
  prompt: string;
  style: string;
  conceptType: string;
  createdAt: Date;
  modelName?: string;
  isMainConcept?: boolean;
}

type ArtStyle = '2d-disney' | '3d-pixar' | 'studio-ghibli' | '2d-cartoon' | '3d-realistic' | 'watercolor' | 'digital-painting';
type ConceptType = 'close-up' | 'full-body' | 'multiple-angles' | 'expression' | 'action-pose' | 'environment' | 'detail-shot' | 'interior' | 'exterior';

const ART_STYLES: { value: ArtStyle; label: string; description: string }[] = [
  { value: '2d-disney', label: '2D Disney Style', description: 'Classic 2D animation with bold lines and vibrant colors' },
  { value: '3d-pixar', label: '3D Pixar Style', description: '3D rendered with smooth surfaces and cinematic lighting' },
  { value: 'studio-ghibli', label: 'Studio Ghibli Style', description: 'Soft, painterly 2D style with natural colors' },
  { value: '2d-cartoon', label: '2D Cartoon Style', description: 'Modern 2D cartoon with clean lines and flat colors' },
  { value: '3d-realistic', label: '3D Realistic Style', description: 'Photorealistic 3D rendering with detailed textures' },
  { value: 'watercolor', label: 'Watercolor Style', description: 'Soft watercolor painting with flowing colors' },
  { value: 'digital-painting', label: 'Digital Painting', description: 'Hand-painted digital art style' },
];

const CONCEPT_TYPES: { value: ConceptType; label: string; description: string }[] = [
  { value: 'close-up', label: 'Close-up', description: 'Head and shoulders focus' },
  { value: 'full-body', label: 'Full Body', description: 'Complete character/asset view' },
  { value: 'multiple-angles', label: 'Multiple Angles', description: 'Front, side, and back views' },
  { value: 'expression', label: 'Expression', description: 'Facial expressions and emotions' },
  { value: 'action-pose', label: 'Action Pose', description: 'Dynamic action or movement' },
  { value: 'environment', label: 'Environment', description: 'Asset in its environment' },
  { value: 'detail-shot', label: 'Detail Shot', description: 'Close-up of specific details' },
];

// Vehicle-specific concept types
const VEHICLE_CONCEPT_TYPES: { value: ConceptType; label: string; description: string }[] = [
  { value: 'exterior', label: 'Exterior View', description: 'Complete exterior view showing body style, colors, and overall design' },
  { value: 'interior', label: 'Interior View', description: 'Interior layout showing seating, controls, and cabin design' },
  { value: 'multiple-angles', label: 'Multiple Angles', description: 'Front, side, back, and top views for comprehensive design reference' },
  { value: 'detail-shot', label: 'Detail Shot', description: 'Close-up of specific features, wheels, lights, or unique design elements' },
  { value: 'environment', label: 'In Environment', description: 'Vehicle shown in its typical environment or setting' },
];

export function AssetConceptGenerationDialog({
  isOpen,
  onClose,
  onImageGenerated,
  onConceptCreated,
  asset,
  assetDescription,
  globalAssets = [],
  showId,
  selectedReferenceImages = [],
}: AssetConceptGenerationDialogProps) {
  const [selectedStyle, setSelectedStyle] = useState<ArtStyle>('3d-pixar');
  const [selectedConceptType, setSelectedConceptType] = useState<ConceptType>('full-body');
  const [customPrompt, setCustomPrompt] = useState('');
  const [editablePrompt, setEditablePrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [mainConceptId, setMainConceptId] = useState<string | null>(null);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [showImagePreview, setShowImagePreview] = useState<string | null>(null);
  const { uploadFile } = useS3Upload();

  // Get main concept image URL (for characters it's mainImage, for others it's mainRender)
  const mainConceptImageUrl = (asset as Character).mainImage || asset.mainRender || null;

  // Build prompt for concept generation
  const buildPrompt = (): string => {
    const styleInfo = ART_STYLES.find(s => s.value === selectedStyle);
    const conceptTypesList = asset.category === 'vehicle' ? VEHICLE_CONCEPT_TYPES : CONCEPT_TYPES;
    const conceptInfo = conceptTypesList.find(c => c.value === selectedConceptType);
    
    let prompt = `Generate a ${conceptInfo?.label.toLowerCase() || 'concept art'} image of ${asset.name}.\n\n`;
    
    // Asset description
    if (assetDescription) {
      prompt += `ASSET DESCRIPTION:\n${assetDescription}\n\n`;
    }
    
    // Concept type specific instructions
    prompt += `CONCEPT TYPE: ${conceptInfo?.label}\n`;
    prompt += `${conceptInfo?.description}\n\n`;
    
    // Style instructions
    prompt += `ART STYLE: ${styleInfo?.label}\n`;
    prompt += `${styleInfo?.description}\n\n`;
    
    // Add main concept reference if it exists
    if (mainConceptImageUrl && mainConceptId) {
      prompt += `REFERENCE IMAGE:\n`;
      prompt += `Use the attached main concept image as a reference to maintain consistency in design, colors, proportions, and overall appearance. `;
      prompt += `The new image should match the style and design elements from the main concept while showing the requested ${conceptInfo?.label.toLowerCase()} view.\n\n`;
    }
    
    // Custom prompt additions
    if (customPrompt.trim()) {
      prompt += `ADDITIONAL REQUIREMENTS:\n${customPrompt}\n\n`;
    }
    
    // Quality requirements
    prompt += `QUALITY REQUIREMENTS:\n`;
    prompt += `- High resolution, professional quality\n`;
    prompt += `- Clean composition with good lighting\n`;
    prompt += `- Consistent with the established art style\n`;
    prompt += `- Suitable for use as concept art in animation production\n`;
    
    return prompt;
  };

  // Load existing main concept on mount and reset state when dialog opens
  const hasInitializedRef = useRef(false);
  useEffect(() => {
    if (isOpen && !hasInitializedRef.current) {
      // Reset state only when dialog first opens
      setGeneratedImages([]);
      setSelectedImageId(null);
      setMainConceptId(null);
      setCustomPrompt('');
      
      // Pre-populate editable prompt with asset description
      const initialPrompt = buildPrompt();
      setEditablePrompt(initialPrompt);
      
      // If there's an existing main concept, add it to the generated images list
      if (mainConceptImageUrl) {
        const mainConceptImage: GeneratedImage = {
          id: 'main-concept-existing',
          imageUrl: mainConceptImageUrl,
          prompt: 'Main concept image',
          style: selectedStyle,
          conceptType: selectedConceptType,
          createdAt: new Date(),
          isMainConcept: true,
        };
        setGeneratedImages([mainConceptImage]);
        setMainConceptId(mainConceptImage.id);
        setSelectedImageId(mainConceptImage.id);
      }
      
      hasInitializedRef.current = true;
    } else if (!isOpen) {
      // Reset the flag when dialog closes
      hasInitializedRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Update editable prompt when style, concept type, or asset description changes
  useEffect(() => {
    if (isOpen) {
      const updatedPrompt = buildPrompt();
      setEditablePrompt(updatedPrompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, selectedStyle, selectedConceptType, assetDescription, mainConceptImageUrl, mainConceptId]);

  const handleGenerate = async () => {
    if (!editablePrompt.trim()) {
      alert('Please provide a prompt');
      return;
    }

    setIsGenerating(true);
    try {
      // Use the editable prompt (which includes all character info)
      const prompt = editablePrompt.trim();
      
      // Prepare reference images: combine main concept + selected concepts
      const referenceImages: string[] = [];
      if (mainConceptImageUrl && mainConceptId) {
        referenceImages.push(mainConceptImageUrl);
      }
      // Add selected concept images (excluding main concept if already added)
      selectedReferenceImages.forEach(imgUrl => {
        if (imgUrl && imgUrl !== mainConceptImageUrl && !referenceImages.includes(imgUrl)) {
          referenceImages.push(imgUrl);
        }
      });

      // Use the first reference image as previousImage (for API compatibility)
      // The API can handle multiple reference images through the characters/locations/gadgets arrays
      const primaryReferenceImage = referenceImages[0] || mainConceptImageUrl || undefined;

      const response = await fetch('/api/gemini/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          style: selectedStyle,
          visualDescription: assetDescription || customPrompt,
          // Include main concept as previousImage/reference for consistency
          previousImage: primaryReferenceImage,
          initialImageUrl: primaryReferenceImage, // Also send as initialImageUrl for API compatibility
          // Pass selected reference images based on asset category
          ...(asset.category === 'character' && {
            characters: [{
              images: referenceImages
            }]
          }),
          ...(asset.category === 'location' && {
            locations: [{
              images: referenceImages
            }]
          }),
          ...(asset.category === 'gadget' && {
            gadgets: [{
              images: referenceImages
            }]
          }),
          ...(asset.category === 'vehicle' && {
            gadgets: [{
              images: referenceImages
            }]
          }),
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

      const newImage: GeneratedImage = {
        id: `img-${Date.now()}`,
        imageUrl: data.imageUrl,
        prompt,
        style: selectedStyle,
        conceptType: selectedConceptType,
        createdAt: new Date(),
        modelName: data.modelName,
        isMainConcept: false,
      };

      setGeneratedImages(prev => [...prev, newImage]);
      setSelectedImageId(newImage.id);

      // Automatically save the generated image as a concept
      if (onConceptCreated) {
        const conceptTypeMap: Record<ConceptType, 'pose' | 'clothing' | 'general' | 'expression' | 'action'> = {
          'close-up': 'general',
          'full-body': 'general',
          'multiple-angles': 'general',
          'expression': 'expression',
          'action-pose': 'action',
          'environment': 'general',
          'detail-shot': 'general',
        };
        
        // Map concept types based on asset category
        let mappedConceptType: 'pose' | 'clothing' | 'general' | 'expression' | 'action' | 'interior' | 'exterior' = 'general';
        if (asset.category === 'vehicle') {
          if (selectedConceptType === 'interior') {
            mappedConceptType = 'interior';
          } else if (selectedConceptType === 'exterior') {
            mappedConceptType = 'exterior';
          } else {
            mappedConceptType = 'general';
          }
        } else {
          mappedConceptType = conceptTypeMap[selectedConceptType as ConceptType] || 'general';
        }
        
        const conceptTypesList = asset.category === 'vehicle' ? VEHICLE_CONCEPT_TYPES : CONCEPT_TYPES;
        
        onConceptCreated({
          category: asset.category,
          assetId: asset.id,
          name: `${asset.name} - ${conceptTypesList.find(t => t.value === selectedConceptType)?.label || 'Concept'}`,
          description: `Generated concept art in ${ART_STYLES.find(s => s.value === selectedStyle)?.label || selectedStyle} style`,
          imageUrl: data.imageUrl,
          prompt: prompt,
          conceptType: mappedConceptType,
          tags: [selectedStyle, selectedConceptType],
          isGenerated: true,
          relevanceScale: 5,
        });
      }
    } catch (error) {
      console.error('Error generating image:', error);
      alert(error instanceof Error ? error.message : 'Failed to generate image');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSetMainConcept = (imageId: string) => {
    const image = generatedImages.find(img => img.id === imageId);
    if (image) {
      // Mark as main concept (don't remove other images)
      setMainConceptId(imageId);
      setGeneratedImages(prev => prev.map(img => ({
        ...img,
        isMainConcept: img.id === imageId,
      })));
      
      // Call callback to save as main concept (this will update mainConceptImageUrl prop)
      onImageGenerated(image.imageUrl, true);
      
      // Note: We don't need to update the list here because the image is already in generatedImages
      // The mainConceptImageUrl prop will update, but we don't want to reset the dialog
    }
  };

  const handleSelectImage = (imageId: string) => {
    setSelectedImageId(imageId);
  };

  const handleUseImage = (imageId: string) => {
    const image = generatedImages.find(img => img.id === imageId);
    if (image) {
      // Save as concept if callback provided
      if (onConceptCreated) {
        const conceptTypeMap: Record<ConceptType, 'pose' | 'clothing' | 'general' | 'expression' | 'action' | 'interior' | 'exterior'> = {
          'close-up': 'general',
          'full-body': 'general',
          'multiple-angles': 'general',
          'expression': 'expression',
          'action-pose': 'action',
          'environment': 'general',
          'detail-shot': 'general',
          'interior': 'interior',
          'exterior': 'exterior',
        };
        
        // Map concept types based on asset category
        let mappedConceptType: 'pose' | 'clothing' | 'general' | 'expression' | 'action' | 'interior' | 'exterior' = 'general';
        if (asset.category === 'vehicle') {
          if (image.conceptType === 'interior') {
            mappedConceptType = 'interior';
          } else if (image.conceptType === 'exterior') {
            mappedConceptType = 'exterior';
          } else {
            mappedConceptType = conceptTypeMap[image.conceptType as ConceptType] || 'general';
          }
        } else {
          mappedConceptType = conceptTypeMap[image.conceptType as ConceptType] || 'general';
        }
        
        const conceptTypesList = asset.category === 'vehicle' ? VEHICLE_CONCEPT_TYPES : CONCEPT_TYPES;
        
        onConceptCreated({
          category: asset.category,
          assetId: asset.id,
          name: `${asset.name} - ${conceptTypesList.find(t => t.value === image.conceptType)?.label || 'Concept'}`,
          description: `Generated concept art in ${ART_STYLES.find(s => s.value === image.style)?.label || image.style} style`,
          imageUrl: image.imageUrl,
          prompt: image.prompt,
          conceptType: mappedConceptType,
          tags: [image.style, image.conceptType],
          isGenerated: true,
          relevanceScale: 5,
        });
      }
      
      // Also call the image generated callback (for main concept if set)
      if (image.isMainConcept) {
        onImageGenerated(image.imageUrl, true);
      }
      
      // Close dialog after saving
      onClose();
    }
  };

  const handleUploadImage = async (file: File) => {
    try {
      const category = asset.category === 'character' ? 'characters' : 
                      asset.category === 'location' ? 'locations' : 'gadgets';
      const result = await uploadFile(file, `${category}/${asset.id}/concepts`);
      
      if (result?.url) {
        const newImage: GeneratedImage = {
          id: `uploaded-${Date.now()}`,
          imageUrl: result.url,
          prompt: 'Uploaded image',
          style: selectedStyle,
          conceptType: selectedConceptType,
          createdAt: new Date(),
        };
        setGeneratedImages(prev => [...prev, newImage]);
        setSelectedImageId(newImage.id);
      }
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('Failed to upload image');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <Sparkles className="w-6 h-6 text-indigo-600" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Generate Concept Art</h2>
              <p className="text-sm text-gray-500">{asset.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Panel - Controls */}
            <div className="lg:col-span-1 space-y-6">
              {/* Art Style Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Art Style
                </label>
                <div className="space-y-2">
                  {ART_STYLES.map((style) => (
                    <button
                      key={style.value}
                      onClick={() => setSelectedStyle(style.value)}
                      className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                        selectedStyle === style.value
                          ? 'border-indigo-500 bg-indigo-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="font-medium text-sm text-gray-900">{style.label}</div>
                      <div className="text-xs text-gray-500 mt-1">{style.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Concept Type Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Concept Type
                </label>
                <div className="space-y-2">
                  {CONCEPT_TYPES.map((type) => (
                    <button
                      key={type.value}
                      onClick={() => setSelectedConceptType(type.value)}
                      className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                        selectedConceptType === type.value
                          ? 'border-indigo-500 bg-indigo-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="font-medium text-sm text-gray-900">{type.label}</div>
                      <div className="text-xs text-gray-500 mt-1">{type.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Editable Prompt */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Generation Prompt
                </label>
                <textarea
                  value={editablePrompt}
                  onChange={(e) => setEditablePrompt(e.target.value)}
                  placeholder="The prompt will be auto-populated with character information..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none font-mono text-sm"
                  rows={12}
                />
                <p className="mt-1 text-xs text-gray-500">
                  This prompt is pre-populated with all character information. You can edit it to customize the generation.
                </p>
              </div>

              {/* Main Concept Indicator */}
              {mainConceptImageUrl && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-green-900">Main Concept Set</div>
                      <div className="text-xs text-green-700">Future generations will reference this image</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Generate Button */}
              <button
                onClick={handleGenerate}
                disabled={isGenerating || !editablePrompt.trim()}
                className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Generating...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    <span>Generate Concept</span>
                  </>
                )}
              </button>

              {/* Upload Button */}
              <label className="block w-full">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUploadImage(file);
                  }}
                  className="hidden"
                />
                <div className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer">
                  <Upload className="w-5 h-5" />
                  <span>Upload Image</span>
                </div>
              </label>
            </div>

            {/* Right Panel - Generated Images */}
            <div className="lg:col-span-2">
              {generatedImages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-12 text-center">
                  <ImageIcon className="w-16 h-16 text-gray-300 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No concepts generated yet</h3>
                  <p className="text-sm text-gray-500">
                    Select a style and concept type, then click &quot;Generate Concept&quot; to create your first concept art.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    {generatedImages.map((image) => (
                      <div
                        key={image.id}
                        className={`relative group border-2 rounded-lg overflow-hidden cursor-pointer transition-all ${
                          selectedImageId === image.id
                            ? 'border-indigo-500 ring-2 ring-indigo-200'
                            : image.isMainConcept
                            ? 'border-green-500'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => handleSelectImage(image.id)}
                      >
                        <img
                          src={image.imageUrl}
                          alt={`Concept ${image.id}`}
                          className="w-full h-64 object-cover"
                        />
                        
                        {/* Main Concept Badge */}
                        {image.isMainConcept && (
                          <div className="absolute top-2 left-2 bg-green-600 text-white px-2 py-1 rounded text-xs font-medium flex items-center space-x-1">
                            <Star className="w-3 h-3 fill-current" />
                            <span>Main Concept</span>
                          </div>
                        )}

                        {/* Overlay Actions */}
                        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                          <div className="flex space-x-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowImagePreview(image.imageUrl);
                              }}
                              className="p-2 bg-white rounded-lg hover:bg-gray-100"
                              title="Preview"
                            >
                              <ZoomIn className="w-5 h-5 text-gray-700" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSetMainConcept(image.id);
                              }}
                              className="p-2 bg-white rounded-lg hover:bg-gray-100"
                              title="Set as Main Concept"
                            >
                              <Star className={`w-5 h-5 ${image.isMainConcept ? 'text-yellow-500 fill-current' : 'text-gray-700'}`} />
                            </button>
                            <a
                              href={image.imageUrl}
                              download
                              onClick={(e) => e.stopPropagation()}
                              className="p-2 bg-white rounded-lg hover:bg-gray-100"
                              title="Download"
                            >
                              <Download className="w-5 h-5 text-gray-700" />
                            </a>
                          </div>
                        </div>

                        {/* Image Info */}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                          <div className="text-white text-xs">
                            <div className="font-medium">{CONCEPT_TYPES.find(t => t.value === image.conceptType)?.label}</div>
                            <div className="text-white/70">{ART_STYLES.find(s => s.value === image.style)?.label}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Selected Image Actions */}
                  {selectedImageId && (
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex items-center space-x-3">
                        <span className="text-sm text-gray-700">Selected concept</span>
                        {generatedImages.find(img => img.id === selectedImageId)?.isMainConcept && (
                          <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium flex items-center space-x-1">
                            <Star className="w-3 h-3 fill-current" />
                            <span>Main Concept</span>
                          </span>
                        )}
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleSetMainConcept(selectedImageId)}
                          className="flex items-center space-x-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm"
                        >
                          <Star className="w-4 h-4" />
                          <span>Set as Main</span>
                        </button>
                        <button
                          onClick={() => handleUseImage(selectedImageId)}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                        >
                          Save as Concept
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Image Preview Modal */}
      {showImagePreview && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[60] p-4">
          <div className="relative max-w-4xl max-h-full">
            <button
              onClick={() => setShowImagePreview(null)}
              className="absolute top-4 right-4 text-white hover:text-gray-300 z-10"
            >
              <X className="w-8 h-8" />
            </button>
            <img
              src={showImagePreview}
              alt="Preview"
              className="max-w-full max-h-[90vh] object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}

