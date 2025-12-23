'use client';

import React, { useState, useEffect } from 'react';
import { X, Sparkles, Loader2, CheckCircle } from 'lucide-react';
import type { PlotTheme } from '@/types';

interface EpisodeDescriptionGenerationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onDescriptionSelected: (description: string) => void;
  showName: string;
  showDescription: string;
  episodeTitle: string;
  currentDescription?: string;
  plotTheme?: PlotTheme | null;
}

interface GeneratedDescription {
  id: string;
  text: string;
  createdAt: Date;
  isSelected?: boolean;
}

export function EpisodeDescriptionGenerationDialog({
  isOpen,
  onClose,
  onDescriptionSelected,
  showName,
  showDescription,
  episodeTitle,
  currentDescription,
  plotTheme = null,
}: EpisodeDescriptionGenerationDialogProps) {
  const [prompt, setPrompt] = useState('');
  const [generatedDescriptions, setGeneratedDescriptions] = useState<GeneratedDescription[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDescriptionId, setSelectedDescriptionId] = useState<string | null>(null);

  // Pre-populate prompt when dialog opens
  useEffect(() => {
    if (isOpen) {
      const themeLine = plotTheme
        ? ` Plot theme: "${plotTheme.name}" (${plotTheme.description || 'no description'}). Key elements: ${(
            plotTheme.keyElements || []
          )
            .slice(0, 8)
            .join(', ')}.`
        : '';

      const defaultPrompt = `You are a professional storyteller and story editor. Create three different episode descriptions for the show "${showName}" (show premise: "${showDescription}"). Episode title: "${episodeTitle}".${themeLine}`;
      setPrompt(defaultPrompt);
      // Don't clear generated descriptions - keep them when dialog reopens
      setSelectedDescriptionId(null);
      setError(null);
    }
  }, [isOpen, showName, showDescription, episodeTitle, plotTheme?.id]);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      alert('Please provide a prompt');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch('/api/gemini/generate-episode-descriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          showName,
          showDescription,
          episodeTitle,
          plotTheme,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      const data = await response.json();
      if (!data.descriptions || !Array.isArray(data.descriptions) || data.descriptions.length === 0) {
        throw new Error(data.error || 'No descriptions generated');
      }

      // Add new descriptions to the list (don't remove existing ones)
      const newDescriptions: GeneratedDescription[] = data.descriptions.map((text: string, index: number) => ({
        id: `desc-${Date.now()}-${index}`,
        text: text.trim(),
        createdAt: new Date(),
        isSelected: false,
      }));

      setGeneratedDescriptions(prev => [...prev, ...newDescriptions]);
    } catch (err) {
      console.error('Error generating descriptions:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate descriptions');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSelectDescription = (descriptionId: string) => {
    setSelectedDescriptionId(descriptionId);
    const description = generatedDescriptions.find(d => d.id === descriptionId);
    if (description) {
      onDescriptionSelected(description.text);
      onClose();
    }
  };

  const handleKeepGenerating = () => {
    handleGenerate();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <Sparkles className="w-6 h-6 text-indigo-600" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Generate Episode Description</h2>
              <p className="text-sm text-gray-500">{episodeTitle}</p>
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
          <div className="space-y-6">
            {/* Prompt Section */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                AI Prompt
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={10}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none text-sm"
                placeholder="Enter the prompt for AI generation..."
                disabled={isGenerating}
              />
              <p className="mt-1 text-xs text-gray-500">
                This prompt is pre-populated with show and episode information. You can edit it to customize the generation.
              </p>
            </div>

            {/* Generate Button */}
            <div className="flex items-center space-x-3">
              <button
                onClick={handleGenerate}
                disabled={isGenerating || !prompt.trim()}
                className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Generating 3 Story Ideas...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    <span>Generate 3 Story Ideas</span>
                  </>
                )}
              </button>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
                <strong className="font-bold">Error:</strong>
                <span className="block sm:inline"> {error}</span>
              </div>
            )}

            {/* Generated Descriptions */}
            {generatedDescriptions.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Generated Story Ideas ({generatedDescriptions.length})
                  </h3>
                  <button
                    onClick={handleKeepGenerating}
                    disabled={isGenerating}
                    className="flex items-center space-x-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Keep Generating</span>
                  </button>
                </div>
                <div className="space-y-4">
                  {generatedDescriptions.map((description, index) => (
                    <div
                      key={description.id}
                      className={`border-2 rounded-lg p-5 transition-all ${
                        selectedDescriptionId === description.id
                          ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-semibold text-gray-700">Story Idea {index + 1}</span>
                          {selectedDescriptionId === description.id && (
                            <div className="flex items-center space-x-1 text-indigo-600">
                              <CheckCircle className="w-5 h-5" />
                              <span className="text-sm font-medium">Selected</span>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => handleSelectDescription(description.id)}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            selectedDescriptionId === description.id
                              ? 'bg-indigo-600 text-white cursor-default'
                              : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                          }`}
                        >
                          {selectedDescriptionId === description.id ? 'Selected' : 'Select This'}
                        </button>
                      </div>
                      <p className="text-gray-700 whitespace-pre-wrap leading-relaxed text-base">
                        {description.text}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty State */}
            {generatedDescriptions.length === 0 && !isGenerating && (
              <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
                <Sparkles className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No descriptions generated yet</h3>
                <p className="text-sm text-gray-500">
                  Click &quot;Generate 3 Story Ideas&quot; to create episode description options.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

