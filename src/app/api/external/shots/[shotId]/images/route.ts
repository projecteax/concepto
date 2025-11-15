import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs, updateDoc, Timestamp } from 'firebase/firestore';
import { requireApiKey } from '@/lib/api-auth';
import { uploadToS3Server } from '@/lib/s3-service-server';
import { AVShot, AVSegment, AVShotImageGenerationThread } from '@/types';

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
    
    if (!mainImageFile && !startFrameFile && !endFrameFile) {
      return NextResponse.json(
        { error: 'At least one image file is required', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }
    
    // Find the episode containing this shot
    const episodesRef = collection(db, 'episodes');
    const episodesSnap = await getDocs(episodesRef);
    
    let episodeId: string | null = null;
    let foundSegment: AVSegment | null = null;
    let foundShot: AVShot | null = null;
    
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
              foundShot = shot;
              break;
            }
          }
        }
      }
      
      if (episodeId) break;
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
    
    // Upload main image
    if (mainImageFile) {
      try {
        const fileKey = `episodes/${episodeId}/shots/${shotId}/main-${Date.now()}.${mainImageFile.name.split('.').pop()}`;
        const result = await uploadToS3Server(mainImageFile, fileKey);
        uploadedUrls.mainImage = result.url;
      } catch (error) {
        console.error('Error uploading main image:', error);
        return NextResponse.json(
          { error: 'Failed to upload main image', code: 'UPLOAD_ERROR' },
          { status: 500 }
        );
      }
    }
    
    // Upload start frame
    if (startFrameFile) {
      try {
        const fileKey = `episodes/${episodeId}/shots/${shotId}/start-frame-${Date.now()}.${startFrameFile.name.split('.').pop()}`;
        const result = await uploadToS3Server(startFrameFile, fileKey);
        uploadedUrls.startFrame = result.url;
      } catch (error) {
        console.error('Error uploading start frame:', error);
        return NextResponse.json(
          { error: 'Failed to upload start frame', code: 'UPLOAD_ERROR' },
          { status: 500 }
        );
      }
    }
    
    // Upload end frame
    if (endFrameFile) {
      try {
        const fileKey = `episodes/${episodeId}/shots/${shotId}/end-frame-${Date.now()}.${endFrameFile.name.split('.').pop()}`;
        const result = await uploadToS3Server(endFrameFile, fileKey);
        uploadedUrls.endFrame = result.url;
      } catch (error) {
        console.error('Error uploading end frame:', error);
        return NextResponse.json(
          { error: 'Failed to upload end frame', code: 'UPLOAD_ERROR' },
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
      message: 'Images uploaded successfully',
      data: uploadedUrls,
    });
  } catch (error: unknown) {
    console.error('Error uploading images:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    if (errorMessage === 'API key required' || errorMessage === 'Invalid API key') {
      return NextResponse.json(
        { error: errorMessage, code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }
    
    // Return more detailed error message
    return NextResponse.json(
      { 
        error: errorMessage || 'Internal server error', 
        code: 'INTERNAL_ERROR',
        details: process.env.NODE_ENV === 'development' ? errorStack : undefined
      },
      { status: 500 }
    );
  }
}

