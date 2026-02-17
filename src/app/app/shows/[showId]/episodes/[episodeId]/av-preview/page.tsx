'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AVPreview } from '@/components/AVPreview';
import { Episode, Show, AVScript, AVPreviewData, GlobalAsset, ShowAccess, EpisodeAccess } from '@/types';
import { episodeService, globalAssetService, showAccessService, episodeAccessService } from '@/lib/firebase-services';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useRealtimeEpisode } from '@/hooks/useRealtimeEpisode';
import { useAuth } from '@/contexts/AuthContext';
import { getEpisodeRole, canEdit } from '@/lib/access-control';

export default function AVPreviewPage() {
  const params = useParams();
  const showId = params.showId as string;
  const episodeId = params.episodeId as string;
  
  const { user } = useAuth();
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [show, setShow] = useState<Show | null>(null);
  const [globalAssets, setGlobalAssets] = useState<GlobalAsset[]>([]);
  const [showAccess, setShowAccess] = useState<ShowAccess[]>([]);
  const [episodeAccess, setEpisodeAccess] = useState<EpisodeAccess[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load initial data (show and global assets)
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setIsLoading(true);
        
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
          createdAt: showSnap.data().createdAt?.toDate?.() || new Date(),
          updatedAt: showSnap.data().updatedAt?.toDate?.() || new Date(),
        } as Show;
        
        // Get global assets and access data
        const [assets, showAccessData, episodeAccessData] = await Promise.all([
          globalAssetService.getByShow(showId),
          user ? showAccessService.getByUser(user.id) : Promise.resolve([]),
          user ? episodeAccessService.getByUser(user.id) : Promise.resolve([]),
        ]);
        
        setShow(showData);
        setGlobalAssets(assets);
        setShowAccess(showAccessData);
        setEpisodeAccess(episodeAccessData);
      } catch (err) {
        console.error('Error loading initial data:', err);
        setError('Failed to load data');
      } finally {
        setIsLoading(false);
      }
    };

    if (episodeId && showId) {
      loadInitialData();
    }
  }, [episodeId, showId]);

  // Use real-time sync for episode data to automatically update when new shots are added
  useRealtimeEpisode({
    episodeId,
    onUpdate: (updatedEpisode) => {
      console.log('🔄 AV Preview: Episode updated via real-time sync', updatedEpisode);
      setEpisode(updatedEpisode);
      setIsLoading(false);
      setError(null);
    },
    enabled: !!episodeId
  });

  // Also do an initial load for faster first render
  useEffect(() => {
    const loadInitialEpisode = async () => {
      if (!episodeId || episode) return; // Skip if already loaded or loading
      
      try {
        const episodeRef = doc(db, 'episodes', episodeId);
        const episodeSnap = await getDoc(episodeRef);
        if (!episodeSnap.exists()) {
          setError('Episode not found');
          setIsLoading(false);
          return;
        }
        
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
        
        const episodeData = episodeSnap.data();
        const convertedEpisode = {
          id: episodeSnap.id,
          ...episodeData,
          scenes: convertTimestamps(episodeData.scenes) || [],
          createdAt: safeToDate(episodeData.createdAt),
          updatedAt: safeToDate(episodeData.updatedAt),
        } as Episode;
        
        setEpisode(convertedEpisode);
        setIsLoading(false);
        setError(null);
      } catch (err) {
        console.error('Error loading initial episode:', err);
        setError('Failed to load episode data');
        setIsLoading(false);
      }
    };

    if (episodeId && !episode) {
      loadInitialEpisode();
    }
  }, [episodeId, episode]);

  const episodeRole = getEpisodeRole(user, episode, show, showAccess, episodeAccess);
  const isReadOnly = !canEdit(episodeRole);

  const handleSave = async (avPreviewData: AVPreviewData, avScript?: AVScript) => {
    if (isReadOnly) return;
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
      isReadOnly={isReadOnly}
    />
  );
}
