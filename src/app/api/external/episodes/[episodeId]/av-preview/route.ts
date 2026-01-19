import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { requireApiKey } from '@/lib/api-auth';
import { AVPreviewData, AVPreviewTrack } from '@/types';

/**
 * GET /api/external/episodes/:episodeId/av-preview
 *
 * Returns episode.avPreviewData (used for videoClipStartTimes sync).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ episodeId: string }> }
) {
  try {
    await requireApiKey(request);

    const { episodeId } = await params;
    if (!episodeId) {
      return NextResponse.json(
        { error: 'Episode ID is required', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    const episodeRef = doc(db, 'episodes', episodeId);
    const episodeSnap = await getDoc(episodeRef);
    if (!episodeSnap.exists()) {
      return NextResponse.json(
        { error: 'Episode not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    const data = episodeSnap.data();
    const avPreviewData = (data?.avPreviewData || null) as AVPreviewData | null;

    return NextResponse.json({
      success: true,
      data: avPreviewData,
    });
  } catch (error: unknown) {
    console.error('Error fetching avPreviewData:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (errorMessage === 'API key required' || errorMessage === 'Invalid API key') {
      return NextResponse.json(
        { error: errorMessage, code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR', details: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/external/episodes/:episodeId/av-preview
 *
 * Updates episode.avPreviewData (merge).
 *
 * Body:
 * {
 *   "videoClipStartTimes"?: { [clipId: string]: number },
 *   "audioTracks"?: AVPreviewTrack[]
 * }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ episodeId: string }> }
) {
  try {
    await requireApiKey(request);

    const { episodeId } = await params;
    if (!episodeId) {
      return NextResponse.json(
        { error: 'Episode ID is required', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    const body = (await request.json()) as { 
      videoClipStartTimes?: Record<string, number>;
      audioTracks?: Array<{
        id: string;
        name: string;
        type: 'audio' | 'sfx' | 'music';
        clips: Array<{
          id: string;
          name: string;
          url: string;
          startTime: number;
          duration: number;
          offset: number;
          volume: number;
        }>;
        isMuted?: boolean;
        volume?: number;
      }>;
    };

    if (!body.videoClipStartTimes && !body.audioTracks) {
      return NextResponse.json(
        { error: 'Either videoClipStartTimes or audioTracks is required', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    const episodeRef = doc(db, 'episodes', episodeId);
    const episodeSnap = await getDoc(episodeRef);
    if (!episodeSnap.exists()) {
      return NextResponse.json(
        { error: 'Episode not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    const data = episodeSnap.data();
    const existing: AVPreviewData | undefined = data?.avPreviewData as AVPreviewData | undefined;

    const updates: Record<string, Timestamp | Record<string, number> | AVPreviewTrack[]> = {
      updatedAt: Timestamp.now(),
    };

    // Merge videoClipStartTimes if provided
    if (body.videoClipStartTimes) {
      const existingStartTimes = (existing?.videoClipStartTimes || {}) as Record<string, number>;
      const merged = { ...existingStartTimes, ...body.videoClipStartTimes };
      updates['avPreviewData.videoClipStartTimes'] = merged;
    }

    // Merge audioTracks by track name (add/update tracks, don't remove existing ones)
    if (body.audioTracks !== undefined) {
      const existingTracks = (existing?.audioTracks || []) as AVPreviewTrack[];
      const trackMap = new Map<string, AVPreviewTrack>();
      
      // Add existing tracks to map
      existingTracks.forEach(track => {
        trackMap.set(track.name, track);
      });
      
      // Update/add new tracks
      body.audioTracks.forEach(newTrack => {
        trackMap.set(newTrack.name, newTrack);
      });
      
      updates['avPreviewData.audioTracks'] = Array.from(trackMap.values());
    }

    await updateDoc(episodeRef, updates);

    return NextResponse.json({
      success: true,
      message: 'AV preview data updated',
      data: {
        ...(body.videoClipStartTimes ? { videoClipStartTimes: updates['avPreviewData.videoClipStartTimes'] } : {}),
        ...(body.audioTracks !== undefined ? { audioTracks: body.audioTracks } : {}),
      },
    });
  } catch (error: unknown) {
    console.error('Error updating avPreviewData:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (errorMessage === 'API key required' || errorMessage === 'Invalid API key') {
      return NextResponse.json(
        { error: errorMessage, code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR', details: errorMessage },
      { status: 500 }
    );
  }
}



