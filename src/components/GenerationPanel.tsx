'use client';

import { useState } from 'react';
import { Tag, GenerationRequest, AssetCategory, AssetConcept } from '@/types';
import { 
  Wand2, 
  Save, 
  X, 
  RefreshCw,
  Upload,
  Eye,
  EyeOff
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface GenerationPanelProps {
  showId: string;
  isGenerating: boolean;
  onGenerate: (request: GenerationRequest) => Promise<void>;
  currentImage: string | null;
  onSaveImage: (concept: Omit<AssetConcept, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onDiscardImage: () => void;
  tags: Tag[];
}

export function GenerationPanel({
  showId,
  isGenerating,
  onGenerate,
  currentImage,
  onSaveImage,
  onDiscardImage,
  tags
}: GenerationPanelProps) {
  const [prompt, setPrompt] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<AssetCategory>('character');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [style, setStyle] = useState('');
  const [conceptName, setConceptName] = useState('');
  const [conceptDescription, setConceptDescription] = useState('');
  const [show3DViewer, setShow3DViewer] = useState(false);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    
    await onGenerate({
      showId,
      prompt: prompt.trim(),
      category: selectedCategory,
      tags: selectedTags,
      style: style.trim() || undefined,
    });
  };

  const handleSave = () => {
    if (!currentImage || !conceptName.trim()) return;
    
    onSaveImage({
      assetId: 'temp-asset-id',
      name: conceptName.trim(),
      description: conceptDescription.trim() || undefined,
      category: selectedCategory,
      tags: selectedTags,
      imageUrl: currentImage,
      isGenerated: true,
      prompt: prompt.trim(),
    });
    
    // Reset form
    setPrompt('');
    setConceptName('');
    setConceptDescription('');
    setSelectedTags([]);
    setStyle('');
  };

  const toggleTag = (tagName: string) => {
    setSelectedTags(prev => 
      prev.includes(tagName) 
        ? prev.filter(t => t !== tagName)
        : [...prev, tagName]
    );
  };

  const categoryOptions: { value: AssetCategory; label: string }[] = [
    { value: 'character', label: 'Character' },
    { value: 'location', label: 'Location' },
    { value: 'gadget', label: 'Gadget' },
    { value: 'texture', label: 'Texture' },
    { value: 'background', label: 'Background' },
  ];

  return (
    <div className="w-80 bg-white border-l border-gray-200 flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Generate Concept</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Prompt Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Prompt
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe your concept art idea..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            rows={3}
          />
        </div>

        {/* Category Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Category
          </label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value as AssetCategory)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            {categoryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Tags Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tags
          </label>
          <div className="space-y-2">
            {tags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => toggleTag(tag.name)}
                className={cn(
                  "flex items-center space-x-2 px-3 py-2 rounded-lg border transition-colors",
                  selectedTags.includes(tag.name)
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                    : "border-gray-300 hover:border-gray-400"
                )}
              >
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
                <span className="text-sm">{tag.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Style Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Style (Optional)
          </label>
          <input
            type="text"
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            placeholder="e.g., cartoon, realistic, watercolor..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={isGenerating || !prompt.trim()}
          className={cn(
            "w-full flex items-center justify-center space-x-2 px-4 py-3 rounded-lg font-medium transition-colors",
            isGenerating || !prompt.trim()
              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
              : "bg-indigo-600 text-white hover:bg-indigo-700"
          )}
        >
          {isGenerating ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Generating...</span>
            </>
          ) : (
            <>
              <Wand2 className="w-4 h-4" />
              <span>Generate Image</span>
            </>
          )}
        </button>

        {/* Generated Image Preview */}
        {currentImage && (
          <div className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
              <img
                src={currentImage}
                alt="Generated concept"
                className="w-full rounded-lg"
              />
            </div>

            {/* Save Form */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Concept Name
                </label>
                <input
                  type="text"
                  value={conceptName}
                  onChange={(e) => setConceptName(e.target.value)}
                  placeholder="Enter concept name..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description (Optional)
                </label>
                <textarea
                  value={conceptDescription}
                  onChange={(e) => setConceptDescription(e.target.value)}
                  placeholder="Add a description..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                  rows={2}
                />
              </div>

              {/* FBX Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  3D Model (FBX)
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                  <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-600">Upload FBX file</p>
                  <input
                    type="file"
                    accept=".fbx"
                    className="hidden"
                    id="fbx-upload"
                  />
                  <label
                    htmlFor="fbx-upload"
                    className="mt-2 inline-block px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 cursor-pointer"
                  >
                    Choose File
                  </label>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex space-x-3">
                <button
                  onClick={handleSave}
                  disabled={!conceptName.trim()}
                  className={cn(
                    "flex-1 flex items-center justify-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors",
                    !conceptName.trim()
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                      : "bg-green-600 text-white hover:bg-green-700"
                  )}
                >
                  <Save className="w-4 h-4" />
                  <span>Save to Library</span>
                </button>
                <button
                  onClick={onDiscardImage}
                  className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 rounded-lg font-medium bg-gray-600 text-white hover:bg-gray-700 transition-colors"
                >
                  <X className="w-4 h-4" />
                  <span>Discard</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
