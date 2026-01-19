import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { requireApiKey } from '@/lib/api-auth';
import { AVScript, AVSegment, AVShot } from '@/types';

interface ImportedShot {
  take: string;
  audio?: string;
  visual?: string;
  duration?: number;
  videoOffset?: number;
  segmentNumber?: number;
  order?: number;
}

const calculateWordCount = (text: string): number => {
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
};

const calculateRuntime = (text: string): number => {
  const wordCount = calculateWordCount(text);
  return Math.ceil(wordCount / 3);
};

const parseSegmentNumberFromTake = (take: string): number | null => {
  const match = take.match(/SC(\d{2})T(\d{2})/i);
  if (!match) return null;
  return parseInt(match[1], 10);
};

/**
 * POST /api/external/episodes/:episodeId/av-script/import
 *
 * Import SRT-derived shots into AV Script (create/update by take).
 *
 * Body:
 * {
 *   "shots": [{ take, visual, audio, duration, videoOffset, segmentNumber, order }],
 *   "targetSegmentId"?: string
 * }
 */
export async function POST(
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

    const body = (await request.json()) as { shots?: ImportedShot[]; targetSegmentId?: string };
    if (!body.shots || !Array.isArray(body.shots) || body.shots.length === 0) {
      return NextResponse.json(
        { error: 'shots array is required', code: 'VALIDATION_ERROR' },
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

    const episodeData = episodeSnap.data();
    const now = new Date();

    const existingScript = (episodeData.avScript || null) as AVScript | null;
    const script: AVScript = existingScript || {
      id: `avscript-${Date.now()}`,
      episodeId,
      title: episodeData.title || 'AV Script',
      version: 'v1',
      segments: [],
      totalRuntime: 0,
      totalWords: 0,
      createdAt: now,
      updatedAt: now,
    };

    const segments: AVSegment[] = [...(script.segments || [])];

    const getOrCreateSegment = (segmentNumber: number, targetSegmentId?: string): AVSegment => {
      let segment: AVSegment | undefined;
      if (targetSegmentId) {
        segment = segments.find(s => s.id === targetSegmentId);
        if (segment) return segment;
      }
      segment = segments.find(s => s.segmentNumber === segmentNumber);
      if (!segment) {
        segment = {
          id: `segment-${Date.now()}-${segmentNumber}`,
          episodeId,
          segmentNumber,
          title: `Scene ${segmentNumber.toString().padStart(2, '0')}`,
          shots: [],
          totalRuntime: 0,
          totalWords: 0,
          createdAt: now,
          updatedAt: now,
        };
        segments.push(segment);
      }
      return segment;
    };

    body.shots.forEach((incomingShot, index) => {
      if (!incomingShot.take) return;
      const take = incomingShot.take.toUpperCase();
      const segmentNumber =
        incomingShot.segmentNumber ??
        parseSegmentNumberFromTake(take) ??
        1;

      const segment = getOrCreateSegment(segmentNumber, body.targetSegmentId);
      const existingShot = segment.shots.find(s => s.take === take);

      const audio = incomingShot.audio ?? '';
      const visual = incomingShot.visual ?? '';
      const duration = Number(incomingShot.duration ?? 0);
      const wordCount = calculateWordCount(audio);
      const runtime = calculateRuntime(audio);

      if (existingShot) {
        existingShot.audio = audio || existingShot.audio;
        existingShot.visual = visual || existingShot.visual;
        // Always update duration if provided (even if 0), otherwise keep existing
        if (incomingShot.duration !== undefined && incomingShot.duration !== null) {
          existingShot.duration = duration;
        }
        if (incomingShot.videoOffset !== undefined) {
          existingShot.videoOffset = incomingShot.videoOffset;
        }
        existingShot.wordCount = wordCount;
        existingShot.runtime = runtime;
        existingShot.updatedAt = now;
      } else {
        const newShot: AVShot = {
          id: `shot-${Date.now()}-${index}`,
          segmentId: segment.id,
          shotNumber: 0,
          take,
          audio,
          visual,
          duration,
          wordCount,
          runtime,
          order: typeof incomingShot.order === 'number' ? incomingShot.order : segment.shots.length,
          createdAt: now,
          updatedAt: now,
        };
        segment.shots.push(newShot);
      }
    });

    // Recalculate totals and shot numbers
    segments.sort((a, b) => a.segmentNumber - b.segmentNumber);
    segments.forEach(segment => {
      segment.shots.forEach((shot, index) => {
        shot.shotNumber = segment.segmentNumber * 100 + (index + 1);
      });
      segment.totalWords = segment.shots.reduce((sum, s) => sum + (s.wordCount || 0), 0);
      segment.totalRuntime = segment.shots.reduce((sum, s) => sum + (s.runtime || 0), 0);
      segment.updatedAt = now;
    });

    const totalWords = segments.reduce((sum, s) => sum + s.totalWords, 0);
    const totalRuntime = segments.reduce((sum, s) => sum + s.totalRuntime, 0);

    const updatedScript: AVScript = {
      ...script,
      segments,
      totalWords,
      totalRuntime,
      updatedAt: now,
    };

    await updateDoc(episodeRef, {
      avScript: updatedScript,
      updatedAt: Timestamp.now(),
    });

    return NextResponse.json({
      success: true,
      message: 'AV Script imported successfully',
      data: {
        segmentCount: segments.length,
        shotCount: segments.reduce((sum, s) => sum + (s.shots?.length || 0), 0),
      },
    });
  } catch (error: unknown) {
    console.error('Error importing AV Script:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    return NextResponse.json(
      { error: 'Failed to import AV Script', details: errorMessage, stack: errorStack },
      { status: 500 }
    );
  }
}
