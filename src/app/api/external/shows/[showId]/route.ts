import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { requireApiKey } from '@/lib/api-auth';
import { Show } from '@/types';

/**
 * GET /api/external/shows/:showId
 *
 * Get show data (name/description/etc)
 *
 * Headers:
 * - X-API-Key: Your API key
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ showId: string }> }
) {
  try {
    await requireApiKey(request);

    const { showId } = await params;
    if (!showId) {
      return NextResponse.json(
        { error: 'Show ID is required', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    const showRef = doc(db, 'shows', showId);
    const showSnap = await getDoc(showRef);

    if (!showSnap.exists()) {
      return NextResponse.json(
        { error: 'Show not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    const showData = showSnap.data();

    // Convert nested Timestamps to ISO strings (matches episodes endpoint behavior)
    const convertTimestamps = (obj: unknown): unknown => {
      if (obj === null || obj === undefined) return obj;
      if (Array.isArray(obj)) return obj.map(convertTimestamps);
      if (typeof obj === 'object') {
        const objWithToDate = obj as { toDate?: () => Date };
        if ('toDate' in obj && typeof objWithToDate.toDate === 'function') {
          return objWithToDate.toDate().toISOString();
        }
        const converted: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj)) {
          converted[key] = convertTimestamps(value);
        }
        return converted;
      }
      return obj;
    };

    const show = convertTimestamps({
      id: showSnap.id,
      ...showData,
    }) as Show;

    return NextResponse.json({
      success: true,
      data: show,
    });
  } catch (error: unknown) {
    console.error('Error fetching show:', error);
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



