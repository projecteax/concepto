'use client';

import React, { useState } from 'react';
import { X, Sparkles, Loader2 } from 'lucide-react';

interface BackstoryGenerationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onBackstoryGenerated: (backstory: string) => void;
  characterName: string;
  characterAge?: string;
  showName?: string;
  showDescription?: string;
  targetAge?: string;
  currentBackstory?: string;
}

export function BackstoryGenerationDialog({
  isOpen,
  onClose,
  onBackstoryGenerated,
  characterName,
  characterAge,
  showName,
  showDescription,
  targetAge = '6-8',
  currentBackstory,
}: BackstoryGenerationDialogProps) {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Build default prompt
  const defaultPrompt = `You are generating a backstory for a character named ${characterName}${characterAge ? `, who is ${characterAge} years old` : ''}, for an animated show called "${showName || 'Untitled Show'}"${showDescription ? ` with the following description: ${showDescription}` : ''}. This show is for kids aged ${targetAge}. Generate a backstory that is appropriate for this age group, engaging, and helps establish the character's personality and motivations. Keep it to no more than 6 sentences.`;

  React.useEffect(() => {
    if (isOpen) {
      setPrompt(defaultPrompt);
      setError(null);
    }
  }, [isOpen, defaultPrompt]);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('Please enter a prompt');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch('/api/gemini/generate-backstory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterName,
          characterAge,
          showName,
          showDescription,
          targetAge,
          customPrompt: prompt,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      const data = await response.json();
      if (!data.backstory) {
        throw new Error(data.error || 'No backstory returned from server');
      }

      onBackstoryGenerated(data.backstory);
      onClose();
    } catch (err) {
      console.error('Error generating backstory:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate backstory');
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-5 h-5 text-indigo-600" />
              <h3 className="text-lg font-semibold text-gray-900">Generate Backstory</h3>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              disabled={isGenerating}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Character Info */}
          <div className="mb-4 p-3 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600 space-y-1">
              <div><span className="font-medium">Character:</span> {characterName}</div>
              {characterAge && <div><span className="font-medium">Age:</span> {characterAge}</div>}
              {showName && <div><span className="font-medium">Show:</span> {showName}</div>}
              {showDescription && (
                <div><span className="font-medium">Show Description:</span> {showDescription}</div>
              )}
              <div><span className="font-medium">Target Age:</span> {targetAge}</div>
            </div>
          </div>

          {/* Current Backstory (if exists) */}
          {currentBackstory && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Current Backstory
              </label>
              <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-600 max-h-32 overflow-y-auto">
                {currentBackstory}
              </div>
            </div>
          )}

          {/* Prompt Editor */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Generation Prompt
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
              rows={8}
              placeholder="Enter the prompt for generating the backstory..."
            />
            <p className="mt-1 text-xs text-gray-500">
              You can edit this prompt to customize how the backstory is generated.
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end space-x-3">
            <button
              onClick={onClose}
              disabled={isGenerating}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim()}
              className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Generate Backstory</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
