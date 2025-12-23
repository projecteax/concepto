'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { X, Sparkles, Loader2, CheckCircle, AlertCircle, BookOpen, Clock } from 'lucide-react';
import type { NarrativeStoryVersion, ScreenplayData, ScreenplayElement } from '@/types';
import type { ScreenplayVersion } from './ScreenplayGenerationDialog';
import { NarrativeReaderDialog } from './NarrativeReaderDialog';

type Language = 'PL' | 'EN';

type GeneratedNarrative = {
  id: string;
  title: string;
  text: string;
  wordCount: number;
  createdAt: Date;
  sourceLabel: string;
  language: Language;
};

interface NarrativeGenerationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  showName: string;
  showDescription: string;
  episodeTitle: string;
  targetAge?: string;
  screenplayData?: ScreenplayData;
  screenplayVersions?: ScreenplayVersion[];
  preferredLanguage?: Language;
  savedNarrativesPL?: NarrativeStoryVersion[];
  savedNarrativesEN?: NarrativeStoryVersion[];
  selectedNarrativeIdPL?: string;
  selectedNarrativeIdEN?: string;
  onNarrativeSelected: (payload: { language: Language; story: NarrativeStoryVersion }) => void;
}

function screenplayElementsToText(elements: ScreenplayElement[]): string {
  const mapType = (t: ScreenplayElement['type']) => {
    switch (t) {
      case 'scene-setting':
        return 'SCENE-SETTING';
      case 'action':
        return 'ACTION';
      case 'character':
        return 'CHARACTER';
      case 'parenthetical':
        return 'PARENTHETICAL';
      case 'dialogue':
        return 'DIALOGUE';
      default:
        return 'GENERAL';
    }
  };

  return elements
    .sort((a, b) => a.position - b.position)
    .map((el) => `[${mapType(el.type)}]\n${el.content}\n[/${mapType(el.type)}]`)
    .join('\n\n');
}

export function NarrativeGenerationDialog({
  isOpen,
  onClose,
  showName,
  showDescription,
  episodeTitle,
  targetAge = '6-8',
  screenplayData,
  screenplayVersions = [],
  preferredLanguage = 'PL',
  savedNarrativesPL = [],
  savedNarrativesEN = [],
  selectedNarrativeIdPL,
  selectedNarrativeIdEN,
  onNarrativeSelected,
}: NarrativeGenerationDialogProps) {
  const [language, setLanguage] = useState<Language>(preferredLanguage);
  const [selectedSourceId, setSelectedSourceId] = useState<string>('current');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<GeneratedNarrative[]>([]);
  const [readerOpen, setReaderOpen] = useState(false);
  const [readerStory, setReaderStory] = useState<{ title: string; text: string; meta?: { wordCount?: number; createdAt?: Date; language?: Language; sourceLabel?: string } } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setIsGenerating(false);
      setGenerated([]);
      // Default source: current screenplay if exists, otherwise latest version
      if (screenplayData?.elements?.length || screenplayData?.elementsEN?.length) {
        setSelectedSourceId('current');
      } else if (screenplayVersions.length > 0) {
        setSelectedSourceId(screenplayVersions[screenplayVersions.length - 1].id);
      } else {
        setSelectedSourceId('current');
      }
      setLanguage(preferredLanguage);
    }
  }, [isOpen, preferredLanguage, screenplayData?.elements?.length, screenplayData?.elementsEN?.length, screenplayVersions.length]);

  const sources = useMemo(() => {
    const list: Array<{ id: string; label: string; createdAt?: Date; language?: Language; elementsCount?: number }> = [];

    const currentCount =
      language === 'EN'
        ? (screenplayData?.elementsEN || []).filter((e) => e.content?.trim()).length
        : (screenplayData?.elements || []).filter((e) => e.content?.trim()).length;

    list.push({
      id: 'current',
      label: `Current (used in editor) • ${currentCount} elements`,
      createdAt: undefined,
    });

    for (const v of screenplayVersions) {
      list.push({
        id: v.id,
        label: `Version ${v.version}${v.language ? ` • ${v.language}` : ''} • ${v.elements.length} elements`,
        createdAt: v.createdAt,
        language: v.language,
        elementsCount: v.elements.length,
      });
    }

    return list;
  }, [language, screenplayData, screenplayVersions]);

  const savedNarratives = language === 'EN' ? savedNarrativesEN : savedNarrativesPL;
  const selectedNarrativeId = language === 'EN' ? selectedNarrativeIdEN : selectedNarrativeIdPL;

  const getScreenplayTextForSelectedSource = (): { text: string; sourceVersionId?: string; sourceLabel: string } => {
    if (selectedSourceId === 'current') {
      const elements =
        language === 'EN'
          ? (screenplayData?.elementsEN || []).filter((e) => e.content?.trim())
          : (screenplayData?.elements || []).filter((e) => e.content?.trim());
      return {
        text: screenplayElementsToText(elements),
        sourceVersionId: undefined,
        sourceLabel: 'Current screenplay',
      };
    }

    const v = screenplayVersions.find((x) => x.id === selectedSourceId);
    return {
      text: screenplayElementsToText(v?.elements || []),
      sourceVersionId: v?.id,
      sourceLabel: v ? `Version ${v.version}` : 'Selected version',
    };
  };

  const handleGenerate = async () => {
    setError(null);
    const { text: screenplayText, sourceVersionId, sourceLabel } = getScreenplayTextForSelectedSource();

    if (!screenplayText.trim()) {
      setError(language === 'EN' ? 'No screenplay content found for this selection.' : 'Brak treści scenariusza dla tego wyboru.');
      return;
    }

    setIsGenerating(true);
    try {
      const res = await fetch('/api/gemini/generate-narrative-story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language,
          showName,
          showDescription,
          episodeTitle,
          targetAge,
          screenplayText,
          minWords: 1200,
        }),
      });

      if (!res.ok) {
        const e = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(e.error || `Server error: ${res.status}`);
      }

      const data = (await res.json()) as { story: string; wordCount: number; minWords: number; title?: string };
      if (!data.story?.trim()) throw new Error('No narrative story returned');

      const newItem: GeneratedNarrative = {
        id: `nar-${Date.now()}`,
        title: data.title || episodeTitle,
        text: data.story.trim(),
        wordCount: data.wordCount || 0,
        createdAt: new Date(),
        sourceLabel,
        language,
      };

      setGenerated((prev) => [newItem, ...prev]);
      // auto-select latest by keeping it first; user picks explicitly by clicking
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate narrative');
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <NarrativeReaderDialog
        isOpen={readerOpen && !!readerStory}
        onClose={() => setReaderOpen(false)}
        title={readerStory?.title || episodeTitle}
        text={readerStory?.text || ''}
        meta={readerStory?.meta}
      />
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <BookOpen className="w-6 h-6 text-purple-600" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Narrative description</h2>
              <p className="text-sm text-gray-500">Generate a bedtime-story style narrative from the screenplay</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" disabled={isGenerating}>
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">Language:</span>
              <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setLanguage('PL')}
                  className={`px-3 py-1.5 text-sm ${language === 'PL' ? 'bg-purple-600 text-white' : 'bg-white text-gray-700'}`}
                  disabled={isGenerating}
                >
                  PL
                </button>
                <button
                  type="button"
                  onClick={() => setLanguage('EN')}
                  className={`px-3 py-1.5 text-sm ${language === 'EN' ? 'bg-purple-600 text-white' : 'bg-white text-gray-700'}`}
                  disabled={isGenerating}
                >
                  EN
                </button>
              </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
              title="Generate a new narrative option (>=1200 words)"
            >
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span>{isGenerating ? 'Generating…' : 'Generate narrative (>=1200 words)'}</span>
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Source screenplay</label>
            <select
              value={selectedSourceId}
              onChange={(e) => setSelectedSourceId(e.target.value)}
              disabled={isGenerating}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-gray-500">
              Tip: choose the version you want to adapt. The current screenplay is what you see in the editor.
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                <div>
                  <div className="text-sm font-medium text-red-800">Error</div>
                  <div className="text-sm text-red-700">{error}</div>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="text-sm font-semibold text-gray-900">Generated narratives</div>

            {/* Saved narratives (persisted) */}
            {savedNarratives.length > 0 && (
              <div className="space-y-3">
                <div className="text-xs font-medium text-gray-600 uppercase tracking-wide">Saved narratives</div>
                <div className="space-y-2">
                  {savedNarratives
                    .slice()
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .map((s) => {
                      const isSelected = selectedNarrativeId === s.id;
                      return (
                        <div
                          key={s.id}
                          onClick={() => {
                            setReaderStory({
                              title: s.title || episodeTitle,
                              text: s.text,
                              meta: { wordCount: s.wordCount, createdAt: new Date(s.createdAt), language, sourceLabel: s.sourceVersionId ? `From ${s.sourceVersionId}` : 'Saved' },
                            });
                            setReaderOpen(true);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setReaderStory({
                                title: s.title || episodeTitle,
                                text: s.text,
                                meta: { wordCount: s.wordCount, createdAt: new Date(s.createdAt), language, sourceLabel: s.sourceVersionId ? `From ${s.sourceVersionId}` : 'Saved' },
                              });
                              setReaderOpen(true);
                            }
                          }}
                          role="button"
                          tabIndex={0}
                          className={`w-full text-left border rounded-lg p-4 bg-white hover:bg-gray-50 transition-colors ${
                            isSelected ? 'border-purple-500 ring-2 ring-purple-200' : 'border-gray-200'
                          }`}
                          title="Click to read"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-gray-900 truncate">
                                {s.title || episodeTitle} {isSelected ? '• (selected)' : ''}
                              </div>
                              <div className="text-xs text-gray-500 flex items-center gap-2 mt-1">
                                <span className="inline-flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {new Date(s.createdAt).toLocaleTimeString()}
                                </span>
                                <span>•</span>
                                <span>{s.wordCount} words</span>
                              </div>
                              <div className="mt-2 text-sm text-gray-700 line-clamp-2 whitespace-pre-wrap">{s.text}</div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  onNarrativeSelected({ language, story: s });
                                }}
                                className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                                title="Set as selected narrative in Overview"
                              >
                                <CheckCircle className="w-4 h-4" />
                                <span>Use</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Newly generated in this session */}
            {generated.length === 0 ? (
              <div className="text-sm text-gray-500">
                No new narratives generated in this session yet. Click “Generate narrative” to create one (bedtime story / fairy-tale prose).
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-xs font-medium text-gray-600 uppercase tracking-wide">Newly generated (this session)</div>
                <div className="space-y-3">
                  {generated.map((g) => (
                    <div
                      key={g.id}
                      onClick={() => {
                        setReaderStory({
                          title: g.title,
                          text: g.text,
                          meta: { wordCount: g.wordCount, createdAt: g.createdAt, language: g.language, sourceLabel: g.sourceLabel },
                        });
                        setReaderOpen(true);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setReaderStory({
                            title: g.title,
                            text: g.text,
                            meta: { wordCount: g.wordCount, createdAt: g.createdAt, language: g.language, sourceLabel: g.sourceLabel },
                          });
                          setReaderOpen(true);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      className="w-full text-left border border-gray-200 rounded-lg p-4 bg-white hover:bg-gray-50 transition-colors"
                      title="Click to read"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-900">{g.title}</div>
                          <div className="text-xs text-gray-500 flex items-center gap-2 mt-1">
                            <span className="inline-flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {g.createdAt.toLocaleTimeString()}
                            </span>
                            <span>•</span>
                            <span>{g.wordCount} words</span>
                            <span>•</span>
                            <span>{g.sourceLabel}</span>
                          </div>
                          <div className="mt-2 text-sm text-gray-700 line-clamp-2 whitespace-pre-wrap">{g.text}</div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const storyToSave: NarrativeStoryVersion = {
                                id: g.id,
                                title: g.title,
                                text: g.text,
                                wordCount: g.wordCount,
                                createdAt: g.createdAt,
                                sourceVersionId: selectedSourceId === 'current' ? undefined : selectedSourceId,
                              };
                              onNarrativeSelected({ language: g.language, story: storyToSave });
                            }}
                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                            title="Save and select this narrative in Overview"
                          >
                            <CheckCircle className="w-4 h-4" />
                            <span>Use</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}



