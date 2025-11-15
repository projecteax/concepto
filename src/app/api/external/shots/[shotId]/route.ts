import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { requireApiKey } from '@/lib/api-auth';
import { AVShot } from '@/types';

/**
 * GET /api/external/shots/:shotId
 * 
 * Get shot data
 * 
 * Headers:
 * - X-API-Key: Your API key
 * 
 * Returns:
 * - Shot object with all current data
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { shotId: string } }
) {
  try {
    await requireApiKey(request);
    
    const { shotId } = params;
    
    if (!shotId) {
      return NextResponse.json(
        { error: 'Shot ID is required', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }
    
    // Find the shot by searching through episodes
    // Note: In a production system, you might want to create a shots collection
    // For now, we'll search through episodes
    const episodesRef = collection(db, 'episodes');
    const episodesSnap = await getDocs(episodesRef);
    
    let foundShot: AVShot | null = null;
    let episodeId: string | null = null;
    let segmentId: string | null = null;
    
    for (const episodeDoc of episodesSnap.docs) {
      const episodeData = episodeDoc.data();
      const avScript = episodeData.avScript;
      
      if (avScript?.segments) {
        for (const segment of avScript.segments) {
          if (segment.shots) {
            const shot = segment.shots.find((s: AVShot) => s.id === shotId);
            if (shot) {
              foundShot = shot;
              episodeId = episodeDoc.id;
              segmentId = segment.id;
              break;
            }
          }
        }
      }
      
      if (foundShot) break;
    }
    
    if (!foundShot) {
      return NextResponse.json(
        { error: 'Shot not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }
    
    // Convert timestamps
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
    
    const shot = convertTimestamps(foundShot) as AVShot;
    
    return NextResponse.json({
      success: true,
      data: {
        shot,
        episodeId,
        segmentId,
      },
    });
  } catch (error: any) {
    console.error('Error fetching shot:', error);
    
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

/**
 * PUT /api/external/shots/:shotId
 * 
 * Update shot data (audio, visual, metadata)
 * 
 * Headers:
 * - X-API-Key: Your API key
 * - Content-Type: application/json
 * 
 * Body:
 * {
 *   "audio": "string",
 *   "visual": "string",
 *   "wordCount": number (optional),
 *   "runtime": number (optional)
 * }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { shotId: string } }
) {
  try {
    await requireApiKey(request);
    
    const { shotId } = params;
    const body = await request.json();
    
    if (!shotId) {
      return NextResponse.json(
        { error: 'Shot ID is required', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }
    
    // Find the episode containing this shot
    const episodesRef = collection(db, 'episodes');
    const episodesSnap = await getDocs(episodesRef);
    
    let episodeId: string | null = null;
    let foundSegment: any = null;
    
    for (const episodeDoc of episodesSnap.docs) {
      const episodeData = episodeDoc.data();
      const avScript = episodeData.avScript;
      
      if (avScript?.segments) {
        for (const segment of avScript.segments) {
          if (segment.shots) {
            const shot = segment.shots.find((s: AVShot) => s.id === shotId);
            if (shot) {
              episodeId = episodeDoc.id;
              foundSegment = segment;
              break;
            }
          }
        }
      }
      
      if (episodeId) break;
    }
    
    if (!episodeId || !foundSegment) {
      return NextResponse.json(
        { error: 'Shot not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }
    
    // Update the shot in the segment
    const updatedShots = foundSegment.shots.map((shot: AVShot) => {
      if (shot.id === shotId) {
        return {
          ...shot,
          audio: body.audio !== undefined ? body.audio : shot.audio,
          visual: body.visual !== undefined ? body.visual : shot.visual,
          wordCount: body.wordCount !== undefined ? body.wordCount : shot.wordCount,
          runtime: body.runtime !== undefined ? body.runtime : shot.runtime,
          updatedAt: new Date(),
        };
      }
      return shot;
    });
    
    // Update the episode in Firestore
    const episodeRef = doc(db, 'episodes', episodeId);
    const episodeSnap = await getDoc(episodeRef);
    const episodeData = episodeSnap.data();
    
    const updatedSegments = episodeData.avScript.segments.map((seg: any) => {
      if (seg.id === foundSegment.id) {
        return {
          ...seg,
          shots: updatedShots,
          updatedAt: Timestamp.now(),
        };
      }
      return seg;
    });
    
    await updateDoc(episodeRef, {
      'avScript.segments': updatedSegments,
      updatedAt: Timestamp.now(),
    });
    
    return NextResponse.json({
      success: true,
      message: 'Shot updated successfully',
    });
  } catch (error: any) {
    console.error('Error updating shot:', error);
    
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

