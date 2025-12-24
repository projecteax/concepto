'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, Sparkles, Loader2, AlertCircle, Clock, CheckCircle, BookOpen, Users, Check, Download, Upload } from 'lucide-react';
import { ScreenplayElement, PlotTheme, GlobalAsset, Character } from '@/types';

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
  plotThemes?: PlotTheme[]; // Available plot themes
  globalAssets?: GlobalAsset[]; // Available global assets (for character selection)
  initialPlotThemeId?: string;
  initialCharacterIds?: string[];
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
  plotThemes = [],
  globalAssets = [],
  initialPlotThemeId,
  initialCharacterIds,
}: ScreenplayGenerationDialogProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [language, setLanguage] = useState<'PL' | 'EN'>('PL');
  const [generationMode, setGenerationMode] = useState<'guided' | 'quick'>('guided');
  const importFileInputRef = useRef<HTMLInputElement | null>(null);

  // Initial selection state (before wizard starts)
  const [selectedPlotTheme, setSelectedPlotTheme] = useState<PlotTheme | null>(null);
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<Set<string>>(new Set());
  const [showInitialSelection, setShowInitialSelection] = useState(true);

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
      // If we already have versions, default to showing versions list.
      // User can start a fresh guided run any time via "New Guided Run".
      setShowInitialSelection(versions.length === 0);
      // Preselect plot theme + characters if provided by the episode
      const preselectedTheme =
        initialPlotThemeId ? plotThemes.find((t) => t.id === initialPlotThemeId) || null : null;
      setSelectedPlotTheme(preselectedTheme);

      const preselectedChars = new Set<string>();
      for (const id of initialCharacterIds || []) {
        preselectedChars.add(id);
      }
      setSelectedCharacterIds(preselectedChars);
      // Select the last version if available
      if (versions.length > 0 && !selectedVersionId) {
        setSelectedVersionId(versions[versions.length - 1].id);
      }
    }
  }, [isOpen, versions.length, selectedVersionId, initialPlotThemeId, initialCharacterIds, plotThemes]);

  const startNewGuidedRun = () => {
    setError(null);
    setWizardQuestion(null);
    setWizardAnswers([]);
    setWizardTextAnswer('');
    setShowInitialSelection(true);
    // Keep currently selected theme/characters as defaults (user can change them in Step 1/2)
  };

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

  const handleStartWizard = () => {
    // Hard gate: these are required inputs for the screenwriting workflow
    if (!selectedPlotTheme) {
      setError(language === 'EN' ? 'Please select a plot theme.' : 'Proszę wybrać motyw fabularny.');
      return;
    }

    if (selectedCharacterIds.size === 0) {
      setError(language === 'EN' ? 'Please select at least one character.' : 'Proszę wybrać przynajmniej jedną postać.');
      return;
    }

    setShowInitialSelection(false);
    void startGuided();
  };

  const startGuided = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const selectedCharacters = globalAssets
        .filter((asset) => asset.category === 'character' && selectedCharacterIds.has(asset.id))
        .map((asset) => asset as Character);

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
          plotTheme: selectedPlotTheme,
          selectedCharacters: selectedCharacters.map((char) => ({
            id: char.id,
            name: char.name,
            description: char.description || '',
            general: char.general || {},
          })),
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
        const selectedCharacters = globalAssets
          .filter(asset => asset.category === 'character' && selectedCharacterIds.has(asset.id))
          .map(asset => asset as Character);

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
            plotTheme: selectedPlotTheme,
            selectedCharacters: selectedCharacters.map(char => ({
              id: char.id,
              name: char.name,
              description: char.description || '',
              general: char.general || {},
            })),
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
      const selectedCharacters = globalAssets
        .filter(asset => asset.category === 'character' && selectedCharacterIds.has(asset.id))
        .map(asset => asset as Character);

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
          plotTheme: selectedPlotTheme,
          selectedCharacters: selectedCharacters.map(char => ({
            id: char.id,
            name: char.name,
            description: char.description || '',
            general: char.general || {},
          })),
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

  type ScreenplayJsonType = ScreenplayElement['type'];
  const normalizeElementType = (raw: unknown): ScreenplayJsonType | null => {
    if (typeof raw !== 'string') return null;
    const t = raw.trim().toLowerCase();
    const map: Record<string, ScreenplayJsonType> = {
      'scene-setting': 'scene-setting',
      'scene_setting': 'scene-setting',
      'scene setting': 'scene-setting',
      'scenesetting': 'scene-setting',
      'scene': 'scene-setting',
      'action': 'action',
      'character': 'character',
      'parenthetical': 'parenthetical',
      'dialogue': 'dialogue',
      'general': 'general',
    };
    return map[t] || null;
  };

  const buildTemplateJson = () => {
    return {
      schemaVersion: 1,
      language,
      elements: [
        {
          type: 'scene-setting',
          content: 'SCENE 01\nEXT. CITY STREET - DAY',
        },
        {
          type: 'action',
          content:
            'Cold open: Establish the world and the problem before any character speaks. Wind howls between buildings; a bus rocks on a bridge.',
        },
        { type: 'character', content: 'TANGO' },
        { type: 'parenthetical', content: '(squinting into the wind)' },
        {
          type: 'dialogue',
          content:
            'This bridge is not a fan of my heroic entrance. Everyone stay calm—',
        },
        { type: 'general', content: 'CUT TO:' },
      ],
      notes: {
        rules: [
          'Upload JSON must contain either an array of elements or an object with { "elements": [...] }.',
          'Each element requires: { "type": "...", "content": "..." }',
          'Valid types: scene-setting, action, character, parenthetical, dialogue, general',
          'Do not embed parentheticals inside dialogue—use a parenthetical element.',
          'The system will assign ids and positions automatically.',
        ],
      },
    };
  };

  const handleDownloadJsonTemplate = () => {
    const payload = buildTemplateJson();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `screenplay-template-${episodeTitle.replace(/\s+/g, '-').toLowerCase()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const importJsonAsNewVersion = async (file: File) => {
    setError(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;

      const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
      const rawElements: unknown =
        Array.isArray(parsed) ? parsed : isRecord(parsed) ? parsed.elements : null;

      if (!Array.isArray(rawElements)) {
        throw new Error('Invalid JSON: expected an array or an object with an "elements" array.');
      }

      const elements: ScreenplayElement[] = [];
      for (let i = 0; i < rawElements.length; i++) {
        const el = rawElements[i];
        if (!isRecord(el)) continue;
        const type = normalizeElementType(el.type);
        const content = typeof el.content === 'string' ? el.content : '';
        if (!type || !content.trim()) continue;
        elements.push({
          id: `imported-${Date.now()}-${i}`,
          type,
          content: content.trim(),
          position: elements.length,
        });
      }

      if (elements.length === 0) {
        throw new Error('No valid elements found in JSON. Ensure each item has { type, content }.');
      }

      const importedLanguage =
        isRecord(parsed) && (parsed.language === 'PL' || parsed.language === 'EN')
          ? (parsed.language as 'PL' | 'EN')
          : language;

      const newVersion: ScreenplayVersion = {
        id: `version-${Date.now()}`,
        version: versions.length + 1,
        elements,
        createdAt: new Date(),
        isSelected: true,
        language: importedLanguage,
      };

      setVersions((prev) => {
        const updated = prev.map((v) => ({ ...v, isSelected: false }));
        return [...updated, newVersion];
      });
      setSelectedVersionId(newVersion.id);
      // After importing, keep UI on versions list.
      setWizardQuestion(null);
      setShowInitialSelection(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to import JSON.');
    } finally {
      // allow re-uploading same file
      if (importFileInputRef.current) importFileInputRef.current.value = '';
    }
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
    <div className="studio-modal-overlay flex items-center justify-center z-50 p-4">
      <div className="studio-panel max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <Sparkles className="w-6 h-6 text-indigo-600" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Auto-Create Screenplay</h2>
              <p className="text-sm text-gray-500">{episodeTitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={importFileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importJsonAsNewVersion(file);
              }}
            />
            <button
              type="button"
              onClick={handleDownloadJsonTemplate}
              disabled={isGenerating}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              title="Download a JSON template you can fill in and re-upload"
            >
              <Download className="w-4 h-4" />
              <span>Download JSON Template</span>
            </button>
            <button
              type="button"
              onClick={() => importFileInputRef.current?.click()}
              disabled={isGenerating}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              title="Upload a screenplay JSON file to import as a new version"
            >
              <Upload className="w-4 h-4" />
              <span>Upload JSON</span>
            </button>
            <button
              onClick={handleCancel}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              disabled={isGenerating}
              title="Close"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
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

            {/* Initial Selection (Plot Theme & Characters) */}
            {generationMode === 'guided' && showInitialSelection && (
              <div className="space-y-6">
                {/* Plot Theme Selection */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <BookOpen className="w-5 h-5 text-purple-600" />
                    <h3 className="text-lg font-semibold text-gray-900">
                      {language === 'EN' ? 'Step 1: Select Plot Theme' : 'Krok 1: Wybierz motyw fabularny'}
                    </h3>
                  </div>
                  <p className="text-sm text-gray-600 mb-4">
                    {language === 'EN' 
                      ? 'Choose a plot theme to guide the story structure. Themes often follow a three-act structure, but can contain multiple scenes within each act.'
                      : 'Wybierz motyw fabularny, który poprowadzi strukturę opowieści. Motywy często mają strukturę trzech aktów, ale mogą zawierać wiele scen w każdym akcie.'}
                  </p>
                  {plotThemes.length === 0 ? (
                    <div className="text-center py-6 text-gray-500">
                      <p className="text-sm">
                        {language === 'EN' 
                          ? 'No plot themes available. Create themes in the Show Dashboard first.'
                          : 'Brak dostępnych motywów fabularnych. Najpierw utwórz motywy w Panelu Serialu.'}
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {plotThemes.map((theme) => (
                        <button
                          key={theme.id}
                          type="button"
                          onClick={() => setSelectedPlotTheme(theme)}
                          className={`text-left p-3 rounded-lg border-2 transition-all ${
                            selectedPlotTheme?.id === theme.id
                              ? 'border-purple-600 bg-purple-50'
                              : 'border-gray-200 hover:border-purple-300 hover:bg-purple-50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <div className="font-semibold text-gray-900 mb-1">{theme.name}</div>
                              {theme.description && (
                                <div className="text-sm text-gray-600 line-clamp-2">{theme.description}</div>
                              )}
                              {theme.keyElements && theme.keyElements.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {theme.keyElements.slice(0, 3).map((element, idx) => (
                                    <span
                                      key={idx}
                                      className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs"
                                    >
                                      {element}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            {selectedPlotTheme?.id === theme.id && (
                              <Check className="w-5 h-5 text-purple-600 flex-shrink-0" />
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Character Selection */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Users className="w-5 h-5 text-indigo-600" />
                    <h3 className="text-lg font-semibold text-gray-900">
                      {language === 'EN' ? 'Step 2: Select Characters' : 'Krok 2: Wybierz postacie'}
                    </h3>
                  </div>
                  <p className="text-sm text-gray-600 mb-4">
                    {language === 'EN' 
                      ? 'Select the characters that must appear in this episode. These characters will be included in the screenplay.'
                      : 'Wybierz postacie, które muszą pojawić się w tym odcinku. Te postacie będą uwzględnione w scenariuszu.'}
                  </p>
                  {globalAssets.filter(asset => asset.category === 'character').length === 0 ? (
                    <div className="text-center py-6 text-gray-500">
                      <p className="text-sm">
                        {language === 'EN' 
                          ? 'No characters available. Create characters in Global Assets first.'
                          : 'Brak dostępnych postaci. Najpierw utwórz postacie w Zasobach Globalnych.'}
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {globalAssets
                        .filter(asset => asset.category === 'character')
                        .map((asset) => {
                          const char = asset as Character;
                          const isSelected = selectedCharacterIds.has(char.id);
                          return (
                            <button
                              key={char.id}
                              type="button"
                              onClick={() => {
                                const newSet = new Set(selectedCharacterIds);
                                if (isSelected) {
                                  newSet.delete(char.id);
                                } else {
                                  newSet.add(char.id);
                                }
                                setSelectedCharacterIds(newSet);
                              }}
                              className={`text-left p-3 rounded-lg border-2 transition-all ${
                                isSelected
                                  ? 'border-indigo-600 bg-indigo-50'
                                  : 'border-gray-200 hover:border-indigo-300 hover:bg-indigo-50'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1">
                                  <div className="font-semibold text-gray-900 mb-1">{char.name}</div>
                                  {char.description && (
                                    <div className="text-sm text-gray-600 line-clamp-2">{char.description}</div>
                                  )}
                                  {char.general?.personality && (
                                    <div className="mt-1 text-xs text-gray-500">
                                      {char.general.personality}
                                    </div>
                                  )}
                                </div>
                                {isSelected && (
                                  <Check className="w-5 h-5 text-indigo-600 flex-shrink-0" />
                                )}
                              </div>
                            </button>
                          );
                        })}
                    </div>
                  )}
                </div>

                {/* Start Button */}
                <div className="text-center pt-4">
                  <button
                    onClick={handleStartWizard}
                    disabled={!selectedPlotTheme || selectedCharacterIds.size === 0 || isGenerating}
                    className="flex items-center space-x-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mx-auto"
                  >
                    <Sparkles className="w-5 h-5" />
                    <span className="font-medium">
                      {language === 'EN' ? 'Start Guided Screenwriting' : 'Rozpocznij prowadzone pisanie scenariusza'}
                    </span>
                  </button>
                  <p className="mt-4 text-sm text-gray-500">
                    {language === 'EN' 
                  ? "You'll answer 8 quick questions; Gemini will suggest options and build the screenplay from your choices."
                      : 'Odpowiesz na 8 szybkich pytań; Gemini zaproponuje opcje i zbuduje scenariusz na podstawie Twoich wyborów.'}
                  </p>
                </div>
              </div>
            )}

            {/* Guided Wizard */}
            {generationMode === 'guided' && !showInitialSelection && !isGenerating && !wizardQuestion && (
              <div className="text-center py-8">
                <button
                  onClick={startGuided}
                  disabled={isGenerating}
                  className="flex items-center space-x-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mx-auto"
                >
                  <Sparkles className="w-5 h-5" />
                  <span className="font-medium">Continue with Questions</span>
                </button>
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
                    {generationMode === 'guided' && (
                      <button
                        onClick={startNewGuidedRun}
                        disabled={isGenerating}
                        className="px-4 py-2 text-sm bg-white border border-indigo-200 text-indigo-700 rounded-lg hover:bg-indigo-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1"
                        title="Start the guided Q&A again to create a new version"
                      >
                        <Sparkles className="w-4 h-4" />
                        <span>New Guided Run</span>
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (generationMode === 'guided') {
                          startNewGuidedRun();
                          return;
                        }
                        handleGenerate();
                      }}
                      disabled={isGenerating}
                      className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>{generationMode === 'guided' ? 'Start New Version' : 'Generate New Version'}</span>
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

