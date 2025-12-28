'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AVPreview } from '@/components/AVPreview';
import { Episode, Show, AVScript, AVPreviewData, GlobalAsset } from '@/types';
import { episodeService, globalAssetService } from '@/lib/firebase-services';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export default function AVPreviewPage() {
  const params = useParams();
  const showId = params.showId as string;
  const episodeId = params.episodeId as string;
  
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [show, setShow] = useState<Show | null>(null);
  const [globalAssets, setGlobalAssets] = useState<GlobalAsset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        
        // Get episode by ID
        const episodeRef = doc(db, 'episodes', episodeId);
        const episodeSnap = await getDoc(episodeRef);
        if (!episodeSnap.exists()) {
          setError('Episode not found');
          return;
        }
        const episodeData = episodeSnap.data();
        
        // Convert timestamps
        const convertTimestamps = (obj: unknown): unknown => {
          if (obj === null || obj === undefined) return obj;
          if (Array.isArray(obj)) {
            return obj.map(convertTimestamps);
          }
          if (typeof obj === 'object' && obj !== null && 'toDate' in obj && typeof (obj as {toDate: () => Date}).toDate === 'function') {
            return (obj as {toDate: () => Date}).toDate();
          }
          if (typeof obj === 'object' && obj !== null) {
            const converted: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(obj)) {
              if (value && typeof value === 'object' && 'toDate' in value && typeof (value as {toDate: () => Date}).toDate === 'function') {
                converted[key] = (value as {toDate: () => Date}).toDate();
              } else {
                converted[key] = convertTimestamps(value);
              }
            }
            return converted;
          }
          return obj;
        };
        
        const safeToDate = (timestamp: unknown): Date => {
          if (!timestamp) return new Date();
          if (timestamp instanceof Date) return timestamp;
          if (timestamp && typeof timestamp === 'object' && 'toDate' in timestamp && typeof (timestamp as {toDate: () => Date}).toDate === 'function') {
            return (timestamp as {toDate: () => Date}).toDate();
          }
          if (typeof timestamp === 'string' || typeof timestamp === 'number') {
            const date = new Date(timestamp);
            return isNaN(date.getTime()) ? new Date() : date;
          }
          return new Date();
        };
        
        const convertedEpisode = {
          id: episodeSnap.id,
          ...episodeData,
          scenes: convertTimestamps(episodeData.scenes) || [],
          createdAt: safeToDate(episodeData.createdAt),
          updatedAt: safeToDate(episodeData.updatedAt),
        } as Episode;
        
        // Get show
        const showRef = doc(db, 'shows', showId);
        const showSnap = await getDoc(showRef);
        if (!showSnap.exists()) {
          setError('Show not found');
          return;
        }
        const showData = {
          id: showSnap.id,
          ...showSnap.data(),
          createdAt: safeToDate(showSnap.data().createdAt),
          updatedAt: safeToDate(showSnap.data().updatedAt),
        } as Show;
        
        // Get global assets
        const assets = await globalAssetService.getByShow(showId);
        
        setEpisode(convertedEpisode);
        setShow(showData);
        setGlobalAssets(assets);
      } catch (err) {
        console.error('Error loading data:', err);
        setError('Failed to load episode data');
      } finally {
        setIsLoading(false);
      }
    };

    if (episodeId && showId) {
      loadData();
    }
  }, [episodeId, showId]);

  const handleSave = async (avPreviewData: AVPreviewData, avScript?: AVScript) => {
    if (!episode) return;
    
    try {
      const updatedEpisode: Episode = {
        ...episode,
        avPreviewData,
        ...(avScript && { avScript })
      };
      
      await episodeService.update(episodeId, updatedEpisode);
      
      setEpisode(updatedEpisode);
    } catch (err) {
      console.error('Error saving AV preview data:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full w-full bg-black flex items-center justify-center text-white">
        <div className="text-xl">Loading AV Preview...</div>
      </div>
    );
  }

  if (error || !episode) {
    return (
      <div className="h-full w-full bg-black flex items-center justify-center text-white">
        <div className="text-xl text-red-500">{error || 'Episode not found'}</div>
      </div>
    );
  }

  return (
    <AVPreview
      episodeId={episode.id}
      avScript={episode.avScript}
      avPreviewData={episode.avPreviewData}
      globalAssets={globalAssets}
      onSave={handleSave}
    />
  );
}
