'use client';

import { useState, useEffect } from 'react';
import { Episode, ScreenplayData } from '@/types';
import { X, Copy, Loader2 } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';

interface CopyScriptDialogProps {
  isOpen: boolean;
  onClose: () => void;
  currentEpisodeId: string;
  showId: string;
  onCopyComplete: (screenplayData: ScreenplayData) => void;
}

export function CopyScriptDialog({
  isOpen,
  onClose,
  currentEpisodeId,
  showId,
  onCopyComplete,
}: CopyScriptDialogProps) {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load episodes from the same show
  useEffect(() => {
    if (!isOpen || !showId) return;

    const loadEpisodes = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const q = query(
          collection(db, 'episodes'),
          where('showId', '==', showId)
        );
        const querySnapshot = await getDocs(q);
        const episodesList: Episode[] = [];
        
        querySnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          
          // Convert Firestore timestamps to Date objects
          const convertTimestamps = (obj: unknown): unknown => {
            if (obj === null || obj === undefined) return obj;
            if (Array.isArray(obj)) {
              return obj.map(convertTimestamps);
            }
            if (typeof obj === 'object' && obj !== null) {
              const objWithToDate = obj as { toDate?: () => Date };
              if ('toDate' in obj && typeof objWithToDate.toDate === 'function') {
                return objWithToDate.toDate();
              }
              const converted: Record<string, unknown> = {};
              for (const [key, value] of Object.entries(obj)) {
                converted[key] = convertTimestamps(value);
              }
              return converted;
            }
            return obj;
          };

          const episode = {
            id: docSnap.id,
            ...convertTimestamps(data),
          } as Episode;

          // Only include episodes that have screenplayData and exclude current episode
          if (episode.id !== currentEpisodeId && episode.screenplayData) {
            episodesList.push(episode);
          }
        });

        // Sort by episode number
        episodesList.sort((a, b) => {
          const aNum = typeof a.episodeNumber === 'number' ? a.episodeNumber : 999;
          const bNum = typeof b.episodeNumber === 'number' ? b.episodeNumber : 999;
          return aNum - bNum;
        });

        setEpisodes(episodesList);
      } catch (err) {
        console.error('Error loading episodes:', err);
        setError('Failed to load episodes. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    loadEpisodes();
  }, [isOpen, showId, currentEpisodeId]);

  const handleCopy = async () => {
    if (!selectedEpisodeId) return;

    setIsCopying(true);
    setError(null);
    try {
      // Get the selected episode's screenplayData
      const episodeRef = doc(db, 'episodes', selectedEpisodeId);
      const episodeSnap = await getDoc(episodeRef);
      
      if (!episodeSnap.exists()) {
        throw new Error('Selected episode not found');
      }

      const data = episodeSnap.data();
      const screenplayData = data.screenplayData as ScreenplayData | undefined;

      if (!screenplayData) {
        throw new Error('Selected episode has no screenplay data');
      }

      // Deep clone the screenplay data to avoid reference issues
      const clonedScreenplayData: ScreenplayData = {
        title: screenplayData.title || '',
        titleEN: screenplayData.titleEN,
        elements: screenplayData.elements?.map(el => ({
          ...el,
          id: `${el.id}-copy-${Date.now()}-${Math.random()}`,
        })) || [],
        elementsEN: screenplayData.elementsEN?.map(el => ({
          ...el,
          id: `${el.id}-copy-${Date.now()}-${Math.random()}`,
        })) || [],
      };

      onCopyComplete(clonedScreenplayData);
      onClose();
    } catch (err) {
      console.error('Error copying script:', err);
      setError(err instanceof Error ? err.message : 'Failed to copy script. Please try again.');
    } finally {
      setIsCopying(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="studio-modal-overlay flex items-center justify-center z-50 p-4">
      <div className="studio-panel max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <Copy className="w-6 h-6 text-indigo-600" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Copy Script From</h2>
              <p className="text-sm text-gray-500">Select an episode to copy its screenplay</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={isCopying}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
              <span className="ml-3 text-gray-600">Loading episodes...</span>
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          ) : episodes.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600">No episodes with screenplay data found in this show.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {episodes.map((ep) => (
                <button
                  key={ep.id}
                  type="button"
                  onClick={() => setSelectedEpisodeId(ep.id)}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                    selectedEpisodeId === ep.id
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                  disabled={isCopying}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-gray-900">
                        Episode {ep.episodeNumber === 'intro' ? 'Intro' : ep.episodeNumber}: {ep.title}
                      </div>
                      <div className="text-sm text-gray-500 mt-1">
                        {ep.screenplayData?.elements?.length || 0} elements
                        {ep.screenplayData?.elementsEN?.some(e => e.content?.trim()) 
                          ? ` (${ep.screenplayData.elementsEN.filter(e => e.content?.trim()).length} in English)`
                          : ''
                        }
                      </div>
                    </div>
                    {selectedEpisodeId === ep.id && (
                      <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-white" />
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            disabled={isCopying}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCopy}
            disabled={!selectedEpisodeId || isCopying || isLoading}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isCopying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Copying...
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Copy Script
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

