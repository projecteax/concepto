'use client';

import { useState, useRef } from 'react';
import { GlobalAsset, AssetConcept, AssetCategory } from '@/types';
import { 
  X, 
  Upload, 
  Link, 
  Wand2, 
  Image as ImageIcon,
  Loader2,
  Plus,
  X as XIcon
} from 'lucide-react';
import { generateConceptImage } from '@/lib/gemini';
import { useS3Upload } from '@/hooks/useS3Upload';

interface ConceptPopupProps {
  asset: GlobalAsset;
  onClose: () => void;
  onSave: (concept: Omit<AssetConcept, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
}

type ConceptMethod = 'upload' | 'url' | 'generate';

export function ConceptPopup({ asset, onClose, onSave }: ConceptPopupProps) {
  const [method, setMethod] = useState<ConceptMethod>('generate');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // S3 upload hook
  const { uploadFile } = useS3Upload();

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      // Don't set imageUrl here - we'll upload to R2 in handleSave
    }
  };

  const handleAddTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleGenerateImage = async () => {
    if (!prompt.trim()) return;
    
    setIsGenerating(true);
    try {
      const image = await generateConceptImage({
        prompt: prompt.trim(),
        category: asset.category as AssetCategory,
        tags: tags,
        showId: asset.showId,
        style: 'kids TV show concept art'
      });
      setGeneratedImage(image);
    } catch (error) {
      console.error('Failed to generate image:', error);
      alert('Failed to generate image. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      alert('Please enter a name for the concept');
      return;
    }

    if (method === 'generate' && !generatedImage) {
      alert('Please generate an image first');
      return;
    }

    if (method === 'url' && !imageUrl.trim()) {
      alert('Please enter an image URL');
      return;
    }

    if (method === 'upload' && !uploadedFile) {
      alert('Please upload a file');
      return;
    }

    setIsSaving(true);
    try {
      let finalImageUrl = '';
      
      if (method === 'generate') {
        finalImageUrl = generatedImage!;
      } else if (method === 'url') {
        finalImageUrl = imageUrl;
      } else if (method === 'upload' && uploadedFile) {
        // Upload file to R2
        const fileKey = `assets/${asset.id}/concepts/${Date.now()}-${uploadedFile.name}`;
        const result = await uploadFile(uploadedFile, fileKey);
        if (result) {
          finalImageUrl = result.url;
        } else {
          throw new Error('Failed to upload file');
        }
      }

      const conceptData: Omit<AssetConcept, 'id' | 'createdAt' | 'updatedAt'> = {
        assetId: asset.id,
        name: name.trim(),
        description: description.trim() || undefined,
        category: asset.category as AssetCategory,
        tags: tags,
        imageUrl: finalImageUrl,
        prompt: method === 'generate' ? prompt.trim() : undefined,
        isGenerated: method === 'generate'
      };

      await onSave(conceptData);
    } catch (error) {
      console.error('Failed to save concept:', error);
      alert('Failed to save concept. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'character': return '👤';
      case 'location': return '🏠';
      case 'gadget': return '🔧';
      case 'texture': return '🎨';
      case 'background': return '🌅';
      default: return '📁';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <span className="text-2xl">{getCategoryIcon(asset.category)}</span>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Add Concept</h2>
                <p className="text-gray-600">{asset.name}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Method Selection */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-900 mb-3">How would you like to add the concept?</h3>
            <div className="grid grid-cols-3 gap-4">
              <button
                onClick={() => setMethod('generate')}
                className={`p-4 rounded-lg border-2 transition-colors ${
                  method === 'generate'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <Wand2 className="w-6 h-6 mx-auto mb-2" />
                <div className="text-sm font-medium">Generate with AI</div>
                <div className="text-xs text-gray-500">Create with Gemini</div>
              </button>
              <button
                onClick={() => setMethod('upload')}
                className={`p-4 rounded-lg border-2 transition-colors ${
                  method === 'upload'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <Upload className="w-6 h-6 mx-auto mb-2" />
                <div className="text-sm font-medium">Upload File</div>
                <div className="text-xs text-gray-500">From your computer</div>
              </button>
              <button
                onClick={() => setMethod('url')}
                className={`p-4 rounded-lg border-2 transition-colors ${
                  method === 'url'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <Link className="w-6 h-6 mx-auto mb-2" />
                <div className="text-sm font-medium">Image URL</div>
                <div className="text-xs text-gray-500">Online link</div>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column - Form */}
            <div className="space-y-6">
              {/* Basic Info */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-3">Basic Information</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Name *
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter concept name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Describe this concept"
                    />
                  </div>
                </div>
              </div>

              {/* Tags */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-3">Tags</h3>
                <div className="space-y-3">
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleAddTag()}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Add a tag"
                    />
                    <button
                      onClick={handleAddTag}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {tags.map((tag, index) => (
                        <span
                          key={index}
                          className="bg-blue-100 text-blue-700 text-sm px-3 py-1 rounded-full flex items-center space-x-1"
                        >
                          <span>{tag}</span>
                          <button
                            onClick={() => handleRemoveTag(tag)}
                            className="hover:text-blue-900"
                          >
                            <XIcon className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Method-specific inputs */}
              {method === 'generate' && (
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-3">AI Generation</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Prompt *
                      </label>
                      <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        rows={4}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Describe what you want to generate..."
                      />
                    </div>
                    <button
                      onClick={handleGenerateImage}
                      disabled={!prompt.trim() || isGenerating}
                      className="w-full flex items-center justify-center space-x-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isGenerating ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Wand2 className="w-4 h-4" />
                      )}
                      <span>{isGenerating ? 'Generating...' : 'Generate Image'}</span>
                    </button>
                  </div>
                </div>
              )}

              {method === 'upload' && (
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-3">File Upload</h3>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors cursor-pointer"
                  >
                    <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">
                      {uploadedFile ? uploadedFile.name : 'Click to upload an image'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      PNG, JPG, GIF up to 10MB
                    </p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </div>
              )}

              {method === 'url' && (
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-3">Image URL</h3>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Image URL *
                    </label>
                    <input
                      type="url"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="https://example.com/image.jpg"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Right Column - Preview */}
            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-3">Preview</h3>
              <div className="bg-gray-50 rounded-lg p-4">
                {(method === 'generate' && generatedImage) || 
                 (method === 'upload' && uploadedFile) || 
                 (method === 'url' && imageUrl) ? (
                  <div className="space-y-4">
                    <div className="aspect-square bg-white rounded-lg overflow-hidden border border-gray-200">
                      <img
                        src={
                          method === 'generate' ? generatedImage! :
                          method === 'upload' ? imageUrl :
                          imageUrl
                        }
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="text-sm text-gray-600">
                      <p><strong>Name:</strong> {name || 'Untitled'}</p>
                      {description && <p><strong>Description:</strong> {description}</p>}
                      {tags.length > 0 && (
                        <p><strong>Tags:</strong> {tags.join(', ')}</p>
                      )}
                      {method === 'generate' && prompt && (
                        <p><strong>Prompt:</strong> {prompt}</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="aspect-square bg-white rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center">
                    <div className="text-center">
                      <ImageIcon className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">
                        {method === 'generate' && 'Generate an image to see preview'}
                        {method === 'upload' && 'Upload a file to see preview'}
                        {method === 'url' && 'Enter an image URL to see preview'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-3 mt-8 pt-6 border-t border-gray-200">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !name.trim()}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSaving ? (
                <div className="flex items-center space-x-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving...</span>
                </div>
              ) : (
                'Save Concept'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
