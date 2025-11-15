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
  { params }: { params: { episodeId: string } }
) {
  try {
    // Validate API key
    await requireApiKey(request);
    
    const { episodeId } = params;
    
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
    const convertTimestamps = (obj: any): any => {
      if (obj === null || obj === undefined) return obj;
      if (Array.isArray(obj)) {
        return obj.map(convertTimestamps);
      }
      if (typeof obj === 'object') {
        if ('toDate' in obj && typeof obj.toDate === 'function') {
          return obj.toDate().toISOString();
        }
        const converted: any = {};
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
  } catch (error: any) {
    console.error('Error fetching episode:', error);
    
    if (error.message === 'API key required' || error.message === 'Invalid API key') {
      return NextResponse.json(
        { error: error.message, code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }
    
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

