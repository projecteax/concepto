import { NextRequest, NextResponse } from 'next/server';
import { requireApiKey } from '@/lib/api-auth';
import { uploadToS3Server } from '@/lib/s3-service-server';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

/**
 * POST /api/external/episodes/:episodeId/audio-clips
 * 
 * Upload audio clip file to S3 and return URL.
 * Body: multipart/form-data with "audio" file
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

    // Verify episode exists
    const episodeRef = doc(db, 'episodes', episodeId);
    const episodeSnap = await getDoc(episodeRef);
    if (!episodeSnap.exists()) {
      return NextResponse.json(
        { error: 'Episode not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    // Get audio file from form data
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File | null;
    
    if (!audioFile) {
      return NextResponse.json(
        { error: 'Audio file is required', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    // Validate file type
    const validTypes = ['audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/wave', 'audio/x-wav', 'audio/aac', 'audio/ogg'];
    if (!validTypes.includes(audioFile.type) && !audioFile.name.match(/\.(mp3|wav|aac|ogg|m4a)$/i)) {
      return NextResponse.json(
        { error: 'Invalid audio file type. Supported: mp3, wav, aac, ogg, m4a', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    // Generate file key
    const timestamp = Date.now();
    const fileExtension = audioFile.name.split('.').pop() || 'mp3';
    const sanitizedName = audioFile.name.replace(/[^a-zA-Z0-9.-]/g, '_').substring(0, 100);
    const fileKey = `episodes/${episodeId}/audio-clips/${timestamp}_${sanitizedName}`;

    // Upload to S3
    try {
      const result = await uploadToS3Server(audioFile, fileKey);
      
      return NextResponse.json({
        success: true,
        data: {
          url: result.url,
          key: fileKey,
          size: result.size
        }
      });
    } catch (uploadError) {
      console.error('Error uploading audio file:', uploadError);
      const errorMessage = uploadError instanceof Error ? uploadError.message : 'Unknown upload error';
      return NextResponse.json(
        { 
          error: 'Failed to upload audio file', 
          code: 'UPLOAD_ERROR',
          details: errorMessage
        },
        { status: 500 }
      );
    }
  } catch (error: unknown) {
    console.error('Error in audio clip upload:', error);
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

