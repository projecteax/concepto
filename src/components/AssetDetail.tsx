'use client';

import React, { useState, useRef } from 'react';
import { GlobalAsset, AssetConcept } from '@/types';
import { 
  ArrowLeft, 
  Upload, 
  Link, 
  Wand2, 
  Image as ImageIcon,
  Trash2,
  Eye,
  ExternalLink,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useS3Upload } from '@/hooks/useS3Upload';

interface AssetDetailProps {
  asset: GlobalAsset;
  concepts: AssetConcept[];
  onBack: () => void;
  onAddConcept: (concept: Omit<AssetConcept, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onDeleteConcept: (conceptId: string) => void;
  onGenerateImage: (prompt: string, showId: string) => Promise<string>;
}

const categoryIcons = {
  character: '👤',
  location: '📍',
  gadget: '🔧',
  texture: '🖼️',
  background: '��️',
};

const categoryLabels = {
  character: 'Character',
  location: 'Location',
  gadget: 'Gadget',
  texture: 'Texture',
  background: 'Background',
};

export function AssetDetail({
  asset,
  concepts,
  onBack,
  onAddConcept,
  onDeleteConcept,
  onGenerateImage
}: AssetDetailProps) {
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [selectedConcept, setSelectedConcept] = useState<AssetConcept | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Prompt modal state
  const [prompt, setPrompt] = useState('');
  const [conceptName, setConceptName] = useState('');
  const [conceptDescription, setConceptDescription] = useState('');

  // Upload modal state
  const [uploadName, setUploadName] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Link modal state
  const [linkName, setLinkName] = useState('');
  const [linkDescription, setLinkDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  
  // S3 upload hook
  const { uploadFile } = useS3Upload();

  const handleGenerateImage = async () => {
    if (!prompt.trim() || !conceptName.trim()) return;
    
    setIsGenerating(true);
    try {
      const generatedImageUrl = await onGenerateImage(prompt.trim(), asset.showId);
      
      onAddConcept({
        assetId: asset.id,
        name: conceptName.trim(),
        description: conceptDescription.trim() || undefined,
        category: asset.category,
        tags: [],
        imageUrl: generatedImageUrl,
        prompt: prompt.trim(),
        isGenerated: true,
      });

      setPrompt('');
      setConceptName('');
      setConceptDescription('');
      setShowPromptModal(false);
    } catch (error) {
      console.error('Error generating image:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setSelectedFile(file);
    }
  };

  const handleUploadImage = async () => {
    if (!selectedFile || !uploadName.trim()) return;

    try {
      // Upload to R2 instead of using data URL
      const fileKey = `assets/${asset.id}/concepts/${Date.now()}-${selectedFile.name}`;
      const result = await uploadFile(selectedFile, fileKey);
      
      if (result) {
        onAddConcept({
          assetId: asset.id,
          name: uploadName.trim(),
          description: uploadDescription.trim() || undefined,
          category: asset.category,
          tags: [],
          imageUrl: result.url,
          isGenerated: false,
        });

        setUploadName('');
        setUploadDescription('');
        setSelectedFile(null);
        setShowUploadModal(false);
      }
    } catch (error) {
      console.error('Failed to upload image:', error);
    }
  };

  const handleAddLink = () => {
    if (!imageUrl.trim() || !linkName.trim()) return;

    onAddConcept({
      assetId: asset.id,
      name: linkName.trim(),
      description: linkDescription.trim() || undefined,
      category: asset.category,
      tags: [],
      imageUrl: imageUrl.trim(),
      isGenerated: false,
    });

    setLinkName('');
    setLinkDescription('');
    setImageUrl('');
    setShowLinkModal(false);
  };

  const handleDeleteConcept = (conceptId: string) => {
    if (confirm('Are you sure you want to delete this concept?')) {
      onDeleteConcept(conceptId);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={onBack}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="flex items-center space-x-3">
                <span className="text-2xl">{categoryIcons[asset.category]}</span>
                <div>
                  <h1 className="text-xl font-semibold text-gray-900">{asset.name}</h1>
                  <p className="text-sm text-gray-500">{categoryLabels[asset.category]}</p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowPromptModal(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <Wand2 className="h-4 w-4" />
                <span>Generate</span>
              </button>
              <button
                onClick={() => setShowUploadModal(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <Upload className="h-4 w-4" />
                <span>Upload</span>
              </button>
              <button
                onClick={() => setShowLinkModal(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Link className="h-4 w-4" />
                <span>Add Link</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Asset Info */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Asset Information</h2>
          {asset.description && (
            <p className="text-gray-700 mb-4">{asset.description}</p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="font-medium text-gray-500">Category:</span>
              <span className="ml-2 text-gray-900">{categoryLabels[asset.category]}</span>
            </div>
            <div>
              <span className="font-medium text-gray-500">Concepts:</span>
              <span className="ml-2 text-gray-900">{concepts.length}</span>
            </div>
            <div>
              <span className="font-medium text-gray-500">Created:</span>
              <span className="ml-2 text-gray-900">
                {asset.createdAt.toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>

        {/* Concepts Grid */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Concepts ({concepts.length})</h2>
          
          {concepts.length === 0 ? (
            <div className="text-center py-12">
              <ImageIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No concepts yet</h3>
              <p className="text-gray-500 mb-6">Start by generating an image, uploading a file, or adding a link.</p>
              <div className="flex justify-center space-x-4">
                <button
                  onClick={() => setShowPromptModal(true)}
                  className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  <Wand2 className="h-4 w-4" />
                  <span>Generate Image</span>
                </button>
                <button
                  onClick={() => setShowUploadModal(true)}
                  className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  <Upload className="h-4 w-4" />
                  <span>Upload Image</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {concepts.map((concept) => (
                <div
                  key={concept.id}
                  className="group relative bg-gray-100 rounded-lg overflow-hidden hover:shadow-lg transition-shadow"
                >
                  {concept.imageUrl && (
                    <div className="aspect-square relative">
                      <img
                        src={concept.imageUrl}
                        alt={concept.name}
                        className="w-full h-full object-cover"
                        onClick={() => setSelectedConcept(concept)}
                      />
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all duration-200 flex items-center justify-center">
                        <button
                          onClick={() => setSelectedConcept(concept)}
                          className="opacity-0 group-hover:opacity-100 p-2 bg-white rounded-full shadow-lg transition-opacity"
                        >
                          <Eye className="h-4 w-4 text-gray-700" />
                        </button>
                      </div>
                    </div>
                  )}
                  
                  <div className="p-3">
                    <h3 className="font-medium text-gray-900 truncate">{concept.name}</h3>
                    {concept.description && (
                      <p className="text-sm text-gray-500 mt-1 line-clamp-2">{concept.description}</p>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <span className={cn(
                        "text-xs px-2 py-1 rounded-full",
                        concept.isGenerated 
                          ? "bg-purple-100 text-purple-700" 
                          : "bg-gray-100 text-gray-700"
                      )}>
                        {concept.isGenerated ? "Generated" : "Uploaded"}
                      </span>
                      <button
                        onClick={() => handleDeleteConcept(concept.id)}
                        className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Prompt Modal */}
      {showPromptModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Generate Image with AI</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Concept Name *
                  </label>
                  <input
                    type="text"
                    value={conceptName}
                    onChange={(e) => setConceptName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Enter concept name"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={conceptDescription}
                    onChange={(e) => setConceptDescription(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Enter description (optional)"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Prompt *
                  </label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Describe the image you want to generate..."
                  />
                </div>
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setShowPromptModal(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleGenerateImage}
                  disabled={!prompt.trim() || !conceptName.trim() || isGenerating}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isGenerating ? 'Generating...' : 'Generate'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Upload Image</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Concept Name *
                  </label>
                  <input
                    type="text"
                    value={uploadName}
                    onChange={(e) => setUploadName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    placeholder="Enter concept name"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={uploadDescription}
                    onChange={(e) => setUploadDescription(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    placeholder="Enter description (optional)"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Image File *
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  />
                  {selectedFile && (
                    <p className="text-sm text-gray-500 mt-1">
                      Selected: {selectedFile.name}
                    </p>
                  )}
                </div>
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUploadImage}
                  disabled={!selectedFile || !uploadName.trim()}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Upload
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Link Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Image Link</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Concept Name *
                  </label>
                  <input
                    type="text"
                    value={linkName}
                    onChange={(e) => setLinkName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter concept name"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={linkDescription}
                    onChange={(e) => setLinkDescription(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter description (optional)"
                  />
                </div>
                
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
              
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setShowLinkModal(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddLink}
                  disabled={!imageUrl.trim() || !linkName.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Add Link
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Concept Detail Modal */}
      {selectedConcept && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-semibold text-gray-900">{selectedConcept.name}</h3>
                <button
                  onClick={() => setSelectedConcept(null)}
                  className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  {selectedConcept.imageUrl && (
                    <img
                      src={selectedConcept.imageUrl}
                      alt={selectedConcept.name}
                      className="w-full rounded-lg"
                    />
                  )}
                </div>
                
                <div className="space-y-4">
                  {selectedConcept.description && (
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">Description</h4>
                      <p className="text-gray-700">{selectedConcept.description}</p>
                    </div>
                  )}
                  
                  {selectedConcept.prompt && (
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">Prompt</h4>
                      <p className="text-gray-700 bg-gray-50 p-3 rounded-lg">{selectedConcept.prompt}</p>
                    </div>
                  )}
                  
                  <div className="flex items-center space-x-4 text-sm text-gray-500">
                    <span className={cn(
                      "px-2 py-1 rounded-full",
                      selectedConcept.isGenerated 
                        ? "bg-purple-100 text-purple-700" 
                        : "bg-gray-100 text-gray-700"
                    )}>
                      {selectedConcept.isGenerated ? "AI Generated" : "Uploaded"}
                    </span>
                    <span>Created: {selectedConcept.createdAt.toLocaleDateString()}</span>
                  </div>
                  
                  <div className="flex space-x-3">
                    {selectedConcept.imageUrl && (
                      <a
                        href={selectedConcept.imageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center space-x-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                      >
                        <ExternalLink className="h-4 w-4" />
                        <span>View Full Size</span>
                      </a>
                    )}
                    <button
                      onClick={() => handleDeleteConcept(selectedConcept.id)}
                      className="flex items-center space-x-2 px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
