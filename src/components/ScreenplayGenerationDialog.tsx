'use client';

import React, { useState, useEffect } from 'react';
import { X, Sparkles, Loader2, AlertCircle, Clock, CheckCircle } from 'lucide-react';
import { ScreenplayElement } from '@/types';

export interface ScreenplayVersion {
  id: string;
  version: number;
  elements: ScreenplayElement[];
  createdAt: Date;
  isSelected?: boolean;
  language?: 'PL' | 'EN';
}

type WizardQuestionKind = 'yes_no_suggestion' | 'single_choice' | 'free_text';
type WizardQuestion = {
  step: number;
  totalSteps: number;
  id: string;
  kind: WizardQuestionKind;
  question: string;
  suggestion?: string;
  choices?: string[];
  placeholder?: string;
};

type WizardAnswer = { id: string; question: string; answer: string };

interface ScreenplayGenerationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onScreenplayGenerated: (elements: ScreenplayElement[], language: 'PL' | 'EN') => void;
  showName: string;
  showDescription: string;
  episodeTitle: string;
  episodeDescription?: string;
  targetAge?: string;
  versions?: ScreenplayVersion[]; // Pass versions from parent
  onVersionsChange?: (versions: ScreenplayVersion[]) => void; // Callback to update parent
}

export function ScreenplayGenerationDialog({
  isOpen,
  onClose,
  onScreenplayGenerated,
  showName,
  showDescription,
  episodeTitle,
  episodeDescription,
  targetAge = '6-8',
  versions: externalVersions = [],
  onVersionsChange,
}: ScreenplayGenerationDialogProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [language, setLanguage] = useState<'PL' | 'EN'>('PL');
  const [generationMode, setGenerationMode] = useState<'guided' | 'quick'>('guided');

  // Guided wizard state
  const [wizardQuestion, setWizardQuestion] = useState<WizardQuestion | null>(null);
  const [wizardAnswers, setWizardAnswers] = useState<WizardAnswer[]>([]);
  const [wizardTextAnswer, setWizardTextAnswer] = useState('');
  
  // Use external versions if provided, otherwise use local state
  const [localVersions, setLocalVersions] = useState<ScreenplayVersion[]>([]);
  const versions = externalVersions.length > 0 ? externalVersions : localVersions;
  
  function setVersions(newVersions: ScreenplayVersion[]): void;
  function setVersions(updater: (prev: ScreenplayVersion[]) => ScreenplayVersion[]): void;
  function setVersions(
    arg: ScreenplayVersion[] | ((prev: ScreenplayVersion[]) => ScreenplayVersion[]),
  ): void {
    const nextVersions = typeof arg === 'function' ? arg(versions) : arg;

    if (onVersionsChange) {
      onVersionsChange(nextVersions);
    } else {
      setLocalVersions(nextVersions);
    }
  }

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setWizardQuestion(null);
      setWizardAnswers([]);
      setWizardTextAnswer('');
      // Select the last version if available
      if (versions.length > 0 && !selectedVersionId) {
        setSelectedVersionId(versions[versions.length - 1].id);
      }
    }
  }, [isOpen, versions.length, selectedVersionId]);

  const getSelectedVersion = () => {
    return versions.find(v => v.id === selectedVersionId) || versions[versions.length - 1];
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch('/api/gemini/generate-screenplay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          showName,
          showDescription,
          episodeTitle,
          episodeDescription,
          targetAge,
          language,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.elements || !Array.isArray(data.elements) || data.elements.length === 0) {
        throw new Error('No screenplay elements generated');
      }

      // Add position to each element, ensuring content is preserved
      const elementsWithPosition: ScreenplayElement[] = data.elements.map((el: Partial<ScreenplayElement> & { type?: string; content?: string }, index: number) => {
        const element: ScreenplayElement = {
          id: `generated-${Date.now()}-${index}`,
          type: el.type || 'general',
          content: el.content || '', // Explicitly preserve content
          position: index,
        };
        console.log(`🔍 Dialog: Element ${index}:`, element);
        return element;
      });

      console.log('🔍 Dialog: All elements with position:', elementsWithPosition);
      console.log('🔍 Dialog: First element content:', elementsWithPosition[0]?.content);
      
      // Create new version
      const newVersion: ScreenplayVersion = {
        id: `version-${Date.now()}`,
        version: versions.length + 1,
        elements: elementsWithPosition,
        createdAt: new Date(),
        isSelected: false,
        language,
      };

      // Add new version to the list (don't remove existing ones)
      setVersions(prev => {
        const updated = prev.map(v => ({ ...v, isSelected: false }));
        return [...updated, { ...newVersion, isSelected: true }];
      });
      
      setSelectedVersionId(newVersion.id);
    } catch (err) {
      console.error('Error generating screenplay:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate screenplay');
    } finally {
      setIsGenerating(false);
    }
  };

  const startGuided = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/gemini/screenplay-wizard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'next',
          language,
          showName,
          showDescription,
          episodeTitle,
          episodeDescription,
          targetAge,
          answers: wizardAnswers,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(e.error || `Server error: ${res.status}`);
      }
      const data = await res.json();
      setWizardQuestion(data.question as WizardQuestion);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start guided flow');
    } finally {
      setIsGenerating(false);
    }
  };

  const submitWizardAnswer = async (answer: string) => {
    if (!wizardQuestion) return;
    const nextAnswers: WizardAnswer[] = [
      ...wizardAnswers,
      { id: wizardQuestion.id, question: wizardQuestion.question, answer },
    ];
    setWizardAnswers(nextAnswers);
    setWizardTextAnswer('');

    // If we have enough answers, finalize
    if (nextAnswers.length >= (wizardQuestion.totalSteps || 8)) {
      setIsGenerating(true);
      setError(null);
      try {
        const res = await fetch('/api/gemini/screenplay-wizard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'final',
            language,
            showName,
            showDescription,
            episodeTitle,
            episodeDescription,
            targetAge,
            answers: nextAnswers,
          }),
        });
        if (!res.ok) {
          const e = await res.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(e.error || `Server error: ${res.status}`);
        }
        const data = await res.json();
        if (!data.elements || !Array.isArray(data.elements) || data.elements.length === 0) {
          throw new Error('No screenplay elements generated');
        }

        const elementsWithPosition: ScreenplayElement[] = data.elements.map(
          (el: Partial<ScreenplayElement> & { type?: string; content?: string }, index: number) => ({
            id: `generated-${Date.now()}-${index}`,
            type: (el.type as ScreenplayElement['type']) || 'general',
            content: el.content || '',
            position: index,
          }),
        );

        const newVersion: ScreenplayVersion = {
          id: `version-${Date.now()}`,
          version: versions.length + 1,
          elements: elementsWithPosition,
          createdAt: new Date(),
          isSelected: true,
          language,
        };

        setVersions((prev) => {
          const updated = prev.map((v) => ({ ...v, isSelected: false }));
          return [...updated, newVersion];
        });
        setSelectedVersionId(newVersion.id);
        setWizardQuestion(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to generate screenplay');
      } finally {
        setIsGenerating(false);
      }
      return;
    }

    // Otherwise fetch next question
    setIsGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/gemini/screenplay-wizard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'next',
          language,
          showName,
          showDescription,
          episodeTitle,
          episodeDescription,
          targetAge,
          answers: nextAnswers,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(e.error || `Server error: ${res.status}`);
      }
      const data = await res.json();
      setWizardQuestion(data.question as WizardQuestion);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch next question');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSelectVersion = (versionId: string) => {
    setSelectedVersionId(versionId);
    setVersions(prev => prev.map(v => ({ ...v, isSelected: v.id === versionId })));
  };

  const handleAccept = () => {
    const selectedVersion = getSelectedVersion();
    if (selectedVersion && selectedVersion.elements.length > 0) {
      onScreenplayGenerated(selectedVersion.elements, selectedVersion.language || 'PL');
      onClose();
    }
  };

  const handleCancel = () => {
    setError(null);
    onClose();
  };

  const selectedVersion = getSelectedVersion();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <Sparkles className="w-6 h-6 text-indigo-600" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Auto-Create Screenplay</h2>
              <p className="text-sm text-gray-500">{episodeTitle}</p>
            </div>
          </div>
          <button
            onClick={handleCancel}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={isGenerating}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {/* Info Section */}
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
              <div className="text-sm text-indigo-900 space-y-1">
                <div><span className="font-medium">Show:</span> {showName}</div>
                {showDescription && (
                  <div><span className="font-medium">Description:</span> {showDescription}</div>
                )}
                <div><span className="font-medium">Episode:</span> {episodeTitle}</div>
                {episodeDescription && (
                  <div><span className="font-medium">Episode Description:</span> {episodeDescription}</div>
                )}
                <div><span className="font-medium">Target Age:</span> {targetAge} years old</div>
              </div>
            </div>

            {/* Language + Mode */}
            <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Language:</span>
                <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setLanguage('PL')}
                    className={`px-3 py-1.5 text-sm ${language === 'PL' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700'}`}
                    disabled={isGenerating}
                  >
                    PL
                  </button>
                  <button
                    type="button"
                    onClick={() => setLanguage('EN')}
                    className={`px-3 py-1.5 text-sm ${language === 'EN' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700'}`}
                    disabled={isGenerating}
                  >
                    EN
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Mode:</span>
                <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setGenerationMode('guided')}
                    className={`px-3 py-1.5 text-sm ${generationMode === 'guided' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700'}`}
                    disabled={isGenerating}
                  >
                    Guided (8 steps)
                  </button>
                  <button
                    type="button"
                    onClick={() => setGenerationMode('quick')}
                    className={`px-3 py-1.5 text-sm ${generationMode === 'quick' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700'}`}
                    disabled={isGenerating}
                  >
                    Quick
                  </button>
                </div>
              </div>
            </div>

            {/* Guided Wizard */}
            {versions.length === 0 && generationMode === 'guided' && !isGenerating && !wizardQuestion && (
              <div className="text-center py-8">
                <button
                  onClick={startGuided}
                  disabled={isGenerating}
                  className="flex items-center space-x-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mx-auto"
                >
                  <Sparkles className="w-5 h-5" />
                  <span className="font-medium">Start Guided Screenwriting</span>
                </button>
                <p className="mt-4 text-sm text-gray-500">
                  You’ll answer 8 quick questions; Gemini will suggest options and build the screenplay from your choices.
                </p>
              </div>
            )}

            {generationMode === 'guided' && wizardQuestion && (
              <div className="border border-gray-200 rounded-lg p-4 bg-white">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-gray-900">
                    Step {wizardQuestion.step + 1} / {wizardQuestion.totalSteps}
                  </div>
                  <div className="text-xs text-gray-500">ID: {wizardQuestion.id}</div>
                </div>
                <div className="text-base font-semibold text-gray-900 mb-3">{wizardQuestion.question}</div>

                {wizardQuestion.kind === 'yes_no_suggestion' && wizardQuestion.suggestion && (
                  <div className="space-y-3">
                    <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-200 text-sm text-indigo-900 whitespace-pre-wrap">
                      <span className="font-medium">Suggestion:</span> {wizardQuestion.suggestion}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                        onClick={() => submitWizardAnswer(wizardQuestion.suggestion || 'Yes')}
                      >
                        Yes, use this
                      </button>
                      <button
                        type="button"
                        className="px-4 py-2 bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 text-sm"
                        onClick={() => submitWizardAnswer('No')}
                      >
                        No
                      </button>
                    </div>
                    <div className="text-xs text-gray-500">
                      If you choose “No”, the next step will adapt — you can also refine later in the editor.
                    </div>
                  </div>
                )}

                {wizardQuestion.kind === 'single_choice' && wizardQuestion.choices && wizardQuestion.choices.length > 0 && (
                  <div className="space-y-2">
                    {wizardQuestion.choices.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className="w-full text-left px-3 py-2 rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50"
                        onClick={() => submitWizardAnswer(c)}
                      >
                        <div className="text-sm text-gray-900">{c}</div>
                      </button>
                    ))}
                    <div className="mt-3">
                      <label className="text-xs text-gray-600">Or type your own:</label>
                      <div className="flex gap-2 mt-1">
                        <input
                          value={wizardTextAnswer}
                          onChange={(e) => setWizardTextAnswer(e.target.value)}
                          placeholder={wizardQuestion.placeholder || (language === 'EN' ? 'Your option…' : 'Twoja opcja…')}
                          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                        />
                        <button
                          type="button"
                          disabled={!wizardTextAnswer.trim()}
                          className="px-4 py-2 bg-indigo-600 text-white rounded-lg disabled:opacity-50"
                          onClick={() => submitWizardAnswer(wizardTextAnswer.trim())}
                        >
                          Submit
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {wizardQuestion.kind === 'free_text' && (
                  <div className="space-y-2">
                    <textarea
                      value={wizardTextAnswer}
                      onChange={(e) => setWizardTextAnswer(e.target.value)}
                      placeholder={wizardQuestion.placeholder || (language === 'EN' ? 'Your answer…' : 'Twoja odpowiedź…')}
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    />
                    <button
                      type="button"
                      disabled={!wizardTextAnswer.trim()}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg disabled:opacity-50"
                      onClick={() => submitWizardAnswer(wizardTextAnswer.trim())}
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Generate Button */}
            {versions.length === 0 && !isGenerating && generationMode === 'quick' && (
              <div className="text-center py-8">
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="flex items-center space-x-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mx-auto"
                >
                  <Sparkles className="w-5 h-5" />
                  <span className="font-medium">Generate Screenplay</span>
                </button>
                <p className="mt-4 text-sm text-gray-500">
                  This will generate a complete 8-10 minute screenplay for your episode
                </p>
              </div>
            )}

            {/* Loading State */}
            {isGenerating && (
              <div className="text-center py-12">
                <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mx-auto mb-4" />
                <p className="text-lg font-medium text-gray-900">Generating screenplay...</p>
                <p className="text-sm text-gray-500 mt-2">This may take a moment</p>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start space-x-2">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-medium text-red-800">Error</h3>
                    <p className="text-sm text-red-600 mt-1">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Versions List and Preview */}
            {versions.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Generated Versions ({versions.length})
                  </h3>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={handleGenerate}
                      disabled={isGenerating}
                      className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>Generate New Version</span>
                    </button>
                    {selectedVersion && (
                      <button
                        onClick={handleAccept}
                        className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-1"
                      >
                        <CheckCircle className="w-4 h-4" />
                        <span>Apply Selected</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Versions List */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {/* Versions Sidebar */}
                  <div className="lg:col-span-1 space-y-2">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">All Versions</h4>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {versions.map((version) => (
                        <button
                          key={version.id}
                          onClick={() => handleSelectVersion(version.id)}
                          className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                            version.id === selectedVersionId
                              ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200'
                              : 'border-gray-200 bg-white hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-semibold text-gray-900">
                              Version {version.version}{version.language ? ` • ${version.language}` : ''}
                            </span>
                            {version.id === selectedVersionId && (
                              <CheckCircle className="w-4 h-4 text-indigo-600" />
                            )}
                          </div>
                          <div className="text-xs text-gray-500 flex items-center space-x-1">
                            <Clock className="w-3 h-3" />
                            <span>{version.createdAt.toLocaleTimeString()}</span>
                          </div>
                          <div className="text-xs text-gray-600 mt-1">
                            {version.elements.length} elements
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Preview of Selected Version */}
                  <div className="lg:col-span-2">
                    {selectedVersion ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                          <div>
                            <h4 className="text-sm font-semibold text-indigo-900">
                              Version {selectedVersion.version} Preview
                            </h4>
                            <p className="text-xs text-indigo-700 mt-1">
                              {selectedVersion.elements.length} elements • Generated at {selectedVersion.createdAt.toLocaleTimeString()}
                            </p>
                          </div>
                        </div>
                        <div className="border border-gray-200 rounded-lg p-4 max-h-96 overflow-y-auto bg-gray-50">
                          <div className="space-y-3 font-mono text-sm">
                            {selectedVersion.elements.map((element, index) => (
                              <div
                                key={`${selectedVersion.id}-${index}`}
                                className={`p-2 rounded ${
                                  element.type === 'scene-setting' ? 'bg-red-100 border-l-4 border-red-500' :
                                  element.type === 'character' ? 'bg-blue-100 border-l-4 border-blue-500' :
                                  element.type === 'dialogue' ? 'bg-purple-100 border-l-4 border-purple-500' :
                                  element.type === 'parenthetical' ? 'bg-orange-100 border-l-4 border-orange-500' :
                                  element.type === 'action' ? 'bg-green-100 border-l-4 border-green-500' :
                                  'bg-gray-100 border-l-4 border-gray-500'
                                }`}
                              >
                                <div className="text-xs font-semibold text-gray-600 mb-1 uppercase">
                                  {element.type.replace('-', ' ')}
                                </div>
                                <div className="text-gray-800 whitespace-pre-wrap">
                                  {element.content}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        Select a version to preview
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-4 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            {versions.length > 0 && (
              <span>{versions.length} version{versions.length !== 1 ? 's' : ''} generated</span>
            )}
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={handleCancel}
              disabled={isGenerating}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            {selectedVersion && selectedVersion.elements.length > 0 && (
              <button
                onClick={handleAccept}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center space-x-2"
              >
                <CheckCircle className="w-4 h-4" />
                <span>Apply Version {selectedVersion.version}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

