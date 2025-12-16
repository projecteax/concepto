import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs, updateDoc, Timestamp } from 'firebase/firestore';
import { requireApiKey } from '@/lib/api-auth';
import { uploadToS3Server } from '@/lib/s3-service-server';
import { AVShot, AVSegment, AVShotImageGenerationThread } from '@/types';

// Increase timeout for file uploads (60 seconds for Pro plan, 10s for free tier)
export const maxDuration = 60;

/**
 * POST /api/external/shots/:shotId/images
 * 
 * Upload/replace images for a shot (main image, start frame, end frame)
 * 
 * Headers:
 * - X-API-Key: Your API key
 * - Content-Type: multipart/form-data
 * 
 * Form Data:
 * - mainImage: File (optional) - Main image to display in AV script
 * - startFrame: File (optional) - Starting frame image
 * - endFrame: File (optional) - Ending frame image
 * 
 * Returns:
 * - URLs of uploaded images
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
    
    // Parse form data
    const formData = await request.formData();
    const mainImageFile = formData.get('mainImage') as File | null;
    const startFrameFile = formData.get('startFrame') as File | null;
    const endFrameFile = formData.get('endFrame') as File | null;
    const mode = (formData.get('mode') as string | null) || 'replace'; // 'replace' (default) | 'append'
    const sourceModel = (formData.get('sourceModel') as string | null) || undefined; // e.g. 'blender'
    const kind = (formData.get('kind') as string | null) || undefined; // e.g. MAIN/START/END (informational)
    const episodeIdHint = (formData.get('episodeId') as string | null) || null;
    const segmentIdHint = (formData.get('segmentId') as string | null) || null;
    
    if (!mainImageFile && !startFrameFile && !endFrameFile) {
      return NextResponse.json(
        { error: 'At least one image file is required', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }
    
    // Find the episode+segment containing this shot.
    // IMPORTANT: shot.id may not be globally unique across segments; prefer episodeId/segmentId hints.
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

      // Multiple matches: require segmentIdHint to disambiguate.
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
        // Fallback: scan all episodes (legacy). If duplicates exist, return a conflict.
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
    
    const uploadedUrls: {
      mainImage?: string;
      startFrame?: string;
      endFrame?: string;
    } = {};
    const uploadTimestamp = Date.now();
    const isAppend = mode === 'append';
    
    // Upload main image
    if (mainImageFile) {
      try {
        const fileExtension = mainImageFile.name.split('.').pop() || 'png';
        const fileKey = isAppend
          ? `episodes/${episodeId}/shots/${shotId}/blender/main-${uploadTimestamp}.${fileExtension}`
          : `episodes/${episodeId}/shots/${shotId}/main-${uploadTimestamp}.${fileExtension}`;
        const result = await uploadToS3Server(mainImageFile, fileKey);
        uploadedUrls.mainImage = result.url;
      } catch (error) {
        console.error('Error uploading main image:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown upload error';
        return NextResponse.json(
          { 
            error: 'Failed to upload main image', 
            code: 'UPLOAD_ERROR',
            details: errorMessage
          },
          { status: 500 }
        );
      }
    }
    
    // Upload start frame
    if (startFrameFile) {
      try {
        const fileExtension = startFrameFile.name.split('.').pop() || 'png';
        const fileKey = isAppend
          ? `episodes/${episodeId}/shots/${shotId}/blender/start-frame-${uploadTimestamp}.${fileExtension}`
          : `episodes/${episodeId}/shots/${shotId}/start-frame-${uploadTimestamp}.${fileExtension}`;
        const result = await uploadToS3Server(startFrameFile, fileKey);
        uploadedUrls.startFrame = result.url;
      } catch (error) {
        console.error('Error uploading start frame:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown upload error';
        return NextResponse.json(
          { 
            error: 'Failed to upload start frame', 
            code: 'UPLOAD_ERROR',
            details: errorMessage
          },
          { status: 500 }
        );
      }
    }
    
    // Upload end frame
    if (endFrameFile) {
      try {
        const fileExtension = endFrameFile.name.split('.').pop() || 'png';
        const fileKey = isAppend
          ? `episodes/${episodeId}/shots/${shotId}/blender/end-frame-${uploadTimestamp}.${fileExtension}`
          : `episodes/${episodeId}/shots/${shotId}/end-frame-${uploadTimestamp}.${fileExtension}`;
        const result = await uploadToS3Server(endFrameFile, fileKey);
        uploadedUrls.endFrame = result.url;
      } catch (error) {
        console.error('Error uploading end frame:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown upload error';
        return NextResponse.json(
          { 
            error: 'Failed to upload end frame', 
            code: 'UPLOAD_ERROR',
            details: errorMessage
          },
          { status: 500 }
        );
      }
    }
    
    // Update the shot with new image URLs
    const updatedShots = foundSegment.shots.map((shot: AVShot) => {
      if (shot.id === shotId) {
        const updatedShot = {
          ...shot,
          updatedAt: new Date(),
        };

        // APPEND MODE (used by Blender): do NOT overwrite imageUrl/startFrame/endFrame.
        // Instead, append an entry to imageGenerationThread.generatedImages with metadata.
        if (isAppend) {
          const baseThread: AVShotImageGenerationThread = shot.imageGenerationThread
            ? {
                ...shot.imageGenerationThread,
                generatedImages: Array.isArray(shot.imageGenerationThread.generatedImages)
                  ? shot.imageGenerationThread.generatedImages
                  : [],
                updatedAt: new Date(),
              }
            : {
                id: `thread-${Date.now()}`,
                selectedAssets: [],
                messages: [],
                generatedImages: [],
                createdAt: new Date(),
                updatedAt: new Date(),
              };

          const appended = [...baseThread.generatedImages];
          const now = new Date();
          const modelName = sourceModel || 'blender';
          const style: 'storyboard' | '3d-render' = '3d-render';
          const appendedIdsByLabel: Record<string, string> = {};

          const appendOne = (imageUrl: string, label: string) => {
            const id = `blender-${uploadTimestamp}-${label.toLowerCase().replace(/\s+/g, '-')}`;
            appendedIdsByLabel[label] = id;
            appended.push({
              id,
              imageUrl,
              prompt: `Uploaded from Blender (${label}${kind ? ` / ${kind}` : ''})`,
              style,
              createdAt: now,
              modelName,
              generatedAt: now,
            });
          };

          if (uploadedUrls.mainImage) appendOne(uploadedUrls.mainImage, 'Main');
          if (uploadedUrls.startFrame) appendOne(uploadedUrls.startFrame, 'Start Frame');
          if (uploadedUrls.endFrame) appendOne(uploadedUrls.endFrame, 'End Frame');

          const nextThread: AVShotImageGenerationThread = {
            ...baseThread,
            generatedImages: appended,
            updatedAt: now,
          };

          // If this shot has never had a main image, set the first Blender upload as main
          // so AV Script thumbnails (shot.imageUrl) show something immediately.
          const hasMainAlready = Boolean(shot.imageUrl) || Boolean(baseThread.mainImageId);
          if (!hasMainAlready) {
            const chosenUrl =
              uploadedUrls.mainImage || uploadedUrls.startFrame || uploadedUrls.endFrame;
            const chosenLabel = uploadedUrls.mainImage
              ? 'Main'
              : uploadedUrls.startFrame
                ? 'Start Frame'
                : uploadedUrls.endFrame
                  ? 'End Frame'
                  : null;

            if (chosenUrl && chosenLabel) {
              const chosenId = appendedIdsByLabel[chosenLabel];
              if (chosenId) {
                nextThread.mainImageId = chosenId;
                nextThread.selectedImageId = chosenId;
                updatedShot.imageUrl = chosenUrl;
              }
            }
          }

          updatedShot.imageGenerationThread = nextThread;

          return updatedShot;
        }

        // DEFAULT (replace) MODE: existing behavior

        // Update main image URL
        if (uploadedUrls.mainImage) {
          updatedShot.imageUrl = uploadedUrls.mainImage;
        }

        // Update image generation thread with start/end frames
        if (uploadedUrls.startFrame || uploadedUrls.endFrame) {
          if (shot.imageGenerationThread) {
            // Update existing thread - ensure all required fields are present
            const threadUpdate: AVShotImageGenerationThread = {
              ...shot.imageGenerationThread,
              updatedAt: new Date(),
            };

            // Only update startFrame if we uploaded one, otherwise keep existing
            if (uploadedUrls.startFrame) {
              threadUpdate.startFrame = uploadedUrls.startFrame;
            }

            // Only update endFrame if we uploaded one, otherwise keep existing
            if (uploadedUrls.endFrame) {
              threadUpdate.endFrame = uploadedUrls.endFrame;
            }

            updatedShot.imageGenerationThread = threadUpdate;
          } else {
            // Create a new thread if it doesn't exist but we have frames
            const newThread: AVShotImageGenerationThread = {
              id: `thread-${Date.now()}`,
              selectedAssets: [],
              messages: [],
              generatedImages: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            // Add optional fields only if they exist
            if (uploadedUrls.startFrame) {
              newThread.startFrame = uploadedUrls.startFrame;
            }
            if (uploadedUrls.endFrame) {
              newThread.endFrame = uploadedUrls.endFrame;
            }

            updatedShot.imageGenerationThread = newThread;
          }
        }

        // Also update mainImageId if main image was uploaded
        if (uploadedUrls.mainImage && updatedShot.imageGenerationThread) {
          // If main image is uploaded and thread exists, we might want to set it as main
          // For now, just ensure the thread exists
          if (!updatedShot.imageGenerationThread.mainImageId) {
            updatedShot.imageGenerationThread.mainImageId = 'referenceImage';
          }
        }
        
        return updatedShot;
      }
      return shot;
    });
    
    // Update the episode in Firestore
    const episodeRef = doc(db, 'episodes', episodeId);
    const episodeSnap = await getDoc(episodeRef);
    const episodeData = episodeSnap.data();
    
    if (!episodeData) {
      return NextResponse.json(
        { error: 'Episode data not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }
    
    // Type assertion for segments - they come from Firestore so we need to assert the type
    const segments = ((episodeData.avScript?.segments || []) as unknown) as AVSegment[];
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
    
    // Ensure avScript structure exists
    const updateData: Record<string, unknown> = {
      'avScript.segments': updatedSegments,
      updatedAt: Timestamp.now(),
    };
    
    // Only update avScript if it exists
    if (episodeData.avScript) {
      updateData['avScript.updatedAt'] = Timestamp.now();
    }
    
    await updateDoc(episodeRef, updateData);
    
    return NextResponse.json({
      success: true,
      message: isAppend ? 'Images appended successfully' : 'Images uploaded successfully',
      data: {
        ...uploadedUrls,
        mode,
        sourceModel,
      },
    });
  } catch (error: unknown) {
    console.error('Error uploading images:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    // Handle specific error cases
    if (errorMessage === 'API key required' || errorMessage === 'Invalid API key') {
      return NextResponse.json(
        { error: errorMessage, code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }
    
    // Check for timeout errors (503 on Vercel)
    if (errorMessage.includes('timeout') || errorMessage.includes('TIMEOUT') || 
        errorMessage.includes('Function execution') || errorMessage.includes('504')) {
      return NextResponse.json(
        { 
          error: 'Request timeout - the operation took too long. Try uploading smaller files or fewer images at once.', 
          code: 'TIMEOUT_ERROR',
          details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
        },
        { status: 504 }
      );
    }
    
    // Return more detailed error message as JSON (not HTML/503)
    return NextResponse.json(
      { 
        error: errorMessage || 'Internal server error', 
        code: 'INTERNAL_ERROR',
        details: process.env.NODE_ENV === 'development' ? (errorStack || errorMessage) : 'An unexpected error occurred'
      },
      { status: 500 }
    );
  }
}

