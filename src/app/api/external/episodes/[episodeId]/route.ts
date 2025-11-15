import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { requireApiKey } from '@/lib/api-auth';
import { Episode } from '@/types';

/**
 * GET /api/external/episodes/:episodeId
 * 
 * Get episode data including all segments and shots
 * 
 * Headers:
 * - X-API-Key: Your API key
 * 
 * Returns:
 * - Episode object with segments and shots
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ episodeId: string }> }
) {
  try {
    // Validate API key
    await requireApiKey(request);
    
    const { episodeId } = await params;
    
    if (!episodeId) {
      return NextResponse.json(
        { error: 'Episode ID is required', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }
    
    // Get episode from Firestore
    const episodeRef = doc(db, 'episodes', episodeId);
    const episodeSnap = await getDoc(episodeRef);
    
    if (!episodeSnap.exists()) {
      return NextResponse.json(
        { error: 'Episode not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }
    
    const episodeData = episodeSnap.data();
    
    // Convert Firestore timestamps to Date objects
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const convertTimestamps = (obj: unknown): unknown => {
      if (obj === null || obj === undefined) return obj;
      if (Array.isArray(obj)) {
        return obj.map(convertTimestamps);
      }
      if (typeof obj === 'object') {
        const objWithToDate = obj as { toDate?: () => Date };
        if ('toDate' in obj && typeof objWithToDate.toDate === 'function') {
          return objWithToDate.toDate().toISOString();
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const converted: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj)) {
          converted[key] = convertTimestamps(value);
        }
        return converted;
      }
      return obj;
    };
    
    const episode = convertTimestamps({
      id: episodeSnap.id,
      ...episodeData,
    }) as Episode;
    
    return NextResponse.json({
      success: true,
      data: episode,
    });
  } catch (error: unknown) {
    console.error('Error fetching episode:', error);
    
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

