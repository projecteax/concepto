import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs, updateDoc, Timestamp } from 'firebase/firestore';
import { requireApiKey } from '@/lib/api-auth';
import { uploadToS3Server } from '@/lib/s3-service-server';
import { AVShot, AVSegment, AVShotImageGenerationThread } from '@/types';

// Increase timeout for file uploads (60 seconds for Pro plan, 10s for free tier)
export const maxDuration = 60;

/**
 * POST /api/external/shots/:shotId/videos
 *
 * Upload/append video for a shot (main video)
 *
 * Headers:
 * - X-API-Key: Your API key
 * - Content-Type: multipart/form-data
 *
 * Form Data:
 * - video: File (required)
 * - mode: 'replace' | 'append' (optional, default: replace)
 * - setMain: 'true' | 'false' (optional, default: true)
 * - episodeId: string (optional hint)
 * - segmentId: string (optional hint)
 *
 * Returns:
 * - videoUrl of uploaded file
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ shotId: string }> }
) {
  try {
    await requireApiKey(request);

    const { shotId } = await params;
    if (!shotId) {
      return NextResponse.json(
        { error: 'Shot ID is required', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const videoFile = formData.get('video') as File | null;
    const mode = (formData.get('mode') as string | null) || 'replace';
    const setMain = (formData.get('setMain') as string | null) || 'true';
    const episodeIdHint = (formData.get('episodeId') as string | null) || null;
    const segmentIdHint = (formData.get('segmentId') as string | null) || null;

    if (!videoFile) {
      return NextResponse.json(
        { error: 'Video file is required', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    // Locate shot in episode
    let episodeId: string | null = null;
    let foundSegment: AVSegment | null = null;
    let foundShot: AVShot | null = null;

    const locateInEpisode = (episodeData: unknown): { seg: AVSegment; shot: AVShot } | null => {
      const avScript = (episodeData as { avScript?: { segments?: AVSegment[] } })?.avScript;
      const segments = avScript?.segments || [];

      const candidates: Array<{ seg: AVSegment; shot: AVShot }> = [];
      for (const seg of segments) {
        if (segmentIdHint && seg.id !== segmentIdHint) continue;
        if (Array.isArray(seg.shots)) {
          for (const s of seg.shots) {
            if (s.id === shotId) candidates.push({ seg, shot: s });
          }
        }
      }

      if (candidates.length === 0) return null;
      if (candidates.length === 1) return candidates[0];
      return null;
    };

    try {
      if (episodeIdHint) {
        const episodeRef = doc(db, 'episodes', episodeIdHint);
        const episodeSnap = await getDoc(episodeRef);
        if (!episodeSnap.exists()) {
          return NextResponse.json(
            { error: 'Episode not found', code: 'NOT_FOUND', details: `episodeId=${episodeIdHint}` },
            { status: 404 }
          );
        }
        const located = locateInEpisode(episodeSnap.data());
        if (!located) {
          return NextResponse.json(
            {
              error: 'Shot not found (or ambiguous) in specified episode',
              code: 'SHOT_LOOKUP_FAILED',
              details: { episodeId: episodeIdHint, segmentId: segmentIdHint, shotId },
            },
            { status: 404 }
          );
        }
        episodeId = episodeIdHint;
        foundSegment = located.seg;
        foundShot = located.shot;
      } else {
        const episodesRef = collection(db, 'episodes');
        const episodesSnap = await getDocs(episodesRef);

        const matches: Array<{ episodeId: string; segmentId: string; take?: string }> = [];

        for (const episodeDoc of episodesSnap.docs) {
          const episodeData = episodeDoc.data();
          const avScript = episodeData.avScript;
          if (!avScript?.segments) continue;

          for (const segment of avScript.segments) {
            if (segmentIdHint && segment.id !== segmentIdHint) continue;
            if (!Array.isArray(segment.shots)) continue;
            const shot = segment.shots.find((s: AVShot) => s.id === shotId);
            if (shot) {
              matches.push({ episodeId: episodeDoc.id, segmentId: segment.id, take: shot.take });
              if (!episodeId) {
                episodeId = episodeDoc.id;
                foundSegment = segment;
                foundShot = shot;
              }
            }
          }
        }

        if (matches.length > 1) {
          return NextResponse.json(
            {
              error: 'Duplicate shotId across segments/episodes; provide episodeId+segmentId to disambiguate',
              code: 'DUPLICATE_SHOT_ID',
              details: { shotId, matches },
            },
            { status: 409 }
          );
        }
      }
    } catch (searchError) {
      console.error('Error searching for shot:', searchError);
      return NextResponse.json(
        {
          error: 'Failed to search for shot',
          code: 'SEARCH_ERROR',
          details: searchError instanceof Error ? searchError.message : 'Unknown error',
        },
        { status: 500 }
      );
    }

    if (!episodeId || !foundSegment || !foundShot) {
      return NextResponse.json(
        { error: 'Shot not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    const uploadTimestamp = Date.now();
    const isAppend = mode === 'append';
    const fileExtension = videoFile.name.split('.').pop() || 'mp4';
    const fileKey = isAppend
      ? `episodes/${episodeId}/shots/${shotId}/blender/video-${uploadTimestamp}.${fileExtension}`
      : `episodes/${episodeId}/shots/${shotId}/video-${uploadTimestamp}.${fileExtension}`;

    const result = await uploadToS3Server(videoFile, fileKey);
    const uploadedUrl = result.url;

    const updatedShots = foundSegment.shots.map((shot: AVShot) => {
      if (shot.id !== shotId) return shot;

      const now = new Date();
      const baseThread: AVShotImageGenerationThread = shot.imageGenerationThread
        ? {
            ...shot.imageGenerationThread,
            generatedVideos: shot.imageGenerationThread.generatedVideos || [],
            generatedImages: shot.imageGenerationThread.generatedImages || [],
          }
        : {
            id: `thread-${uploadTimestamp}`,
            selectedAssets: [],
            messages: [],
            generatedImages: [],
            generatedVideos: [],
            createdAt: now,
            updatedAt: now,
          };

      const newVideoId = `uploaded-video-${uploadTimestamp}`;
      const generatedVideos = [
        ...(baseThread.generatedVideos || []),
        {
          id: newVideoId,
          videoUrl: uploadedUrl,
          prompt: 'Uploaded video',
          createdAt: now,
        },
      ];

      const shouldSetMain = setMain !== 'false' || !shot.videoUrl;

      const updatedThread: AVShotImageGenerationThread = {
        ...baseThread,
        generatedVideos,
        mainVideoId: shouldSetMain ? newVideoId : baseThread.mainVideoId,
        updatedAt: now,
      };

      return {
        ...shot,
        videoUrl: shouldSetMain ? uploadedUrl : shot.videoUrl,
        imageGenerationThread: updatedThread,
        updatedAt: now,
      };
    });

    const episodeRef = doc(db, 'episodes', episodeId);
    const episodeSnap = await getDoc(episodeRef);
    const episodeData = episodeSnap.data();
    const segments = ((episodeData?.avScript?.segments || []) as unknown) as AVSegment[];
    const updatedSegments = segments.map((seg: AVSegment) => {
      if (seg.id === foundSegment.id) {
        return {
          ...seg,
          shots: updatedShots,
          updatedAt: Timestamp.now(),
        };
      }
      return seg;
    });

    const updateData: Record<string, unknown> = {
      'avScript.segments': updatedSegments,
      updatedAt: Timestamp.now(),
    };
    if (episodeData?.avScript) {
      updateData['avScript.updatedAt'] = Timestamp.now();
    }

    await updateDoc(episodeRef, updateData);

    return NextResponse.json({
      success: true,
      message: isAppend ? 'Video appended successfully' : 'Video uploaded successfully',
      data: {
        videoUrl: uploadedUrl,
        mode,
      },
    });
  } catch (error: unknown) {
    console.error('Error uploading video:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    return NextResponse.json(
      { error: 'Failed to upload video', details: errorMessage, stack: errorStack },
      { status: 500 }
    );
  }
}
