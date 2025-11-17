import { NextRequest, NextResponse } from 'next/server';
import { uploadToS3 } from '@/lib/s3-service';
import sharp from 'sharp';

// FormData is available in Node.js 18+ (Next.js uses Next.js 18+)
// No need to import, it's a global in modern Node.js

// Veo API endpoint - separate from Gemini API
const VEO_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      prompt: string;
      type: 'image-to-video' | 'frames-to-video';
      imageUrl?: string;
      startFrameUrl?: string;
      endFrameUrl?: string;
      model: string;
      episodeId: string;
      resolution?: '720p' | '1080p';
      duration?: 4 | 6 | 8;
    };
    
    const { prompt, type, imageUrl, startFrameUrl, endFrameUrl, model, episodeId, resolution = '720p', duration = 8 } = body;

    // Check if model is SORA (OpenAI) or Veo (Google)
    const isSora = model.startsWith('sora');
    
    if (isSora) {
      // Handle SORA video generation
      return await handleSoraGeneration(body);
    } else {
      // Handle Veo video generation
      return await handleVeoGeneration(body);
    }
  } catch (error: unknown) {
    console.error('Error generating video:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('Error details:', {
      message: errorMessage,
      stack: errorStack,
      name: error instanceof Error ? error.name : 'Error',
    });
    return NextResponse.json(
      { 
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? errorStack : undefined
      },
      { status: 500 }
    );
  }
}

async function handleSoraGeneration(body: {
  prompt: string;
  type: 'image-to-video' | 'frames-to-video';
  imageUrl?: string;
  startFrameUrl?: string;
  endFrameUrl?: string;
  model: string;
  episodeId: string;
  resolution?: '720p' | '1080p';
  duration?: 4 | 6 | 8;
}) {
  const { prompt, type, imageUrl, episodeId, resolution = '720p', duration = 8 } = body;
  
  // Check if OpenAI API key is configured
  const openaiApiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY;
  if (!openaiApiKey) {
    return NextResponse.json(
      { 
        error: 'OpenAI API key is not configured. Please set NEXT_PUBLIC_OPENAI_API_KEY in your environment variables.'
      },
      { status: 500 }
    );
  }

  // SORA API endpoint
  const OPENAI_API_BASE = 'https://api.openai.com/v1';
  
  // Map resolution to SORA size format
  const sizeMap: Record<string, string> = {
    '720p': '1280x720',
    '1080p': '1920x1080',
  };
  const size = sizeMap[resolution] || '1280x720';

  // SORA supports text-to-video and image-to-video using input_reference
  // For frames-to-video, we'll use the start frame as input_reference
  const inputImageUrl = type === 'frames-to-video' ? body.startFrameUrl : imageUrl;

  try {
    // Step 1: Create video generation request
    // SORA API: POST /v1/videos
    // SORA uses multipart/form-data, not JSON
    // Parameters: model, prompt, size, seconds, input_reference (optional)
    
    // Build form data
    const formData = new FormData();
    formData.append('model', 'sora-2');
    formData.append('prompt', prompt);
    formData.append('size', size);
    formData.append('seconds', duration.toString()); // SORA 2 supports 4, 6, or 8 seconds

    // Add input_reference if image is provided
    if (inputImageUrl) {
      // Fetch the image
      const imageResponse = await fetch(inputImageUrl);
      if (!imageResponse.ok) {
        throw new Error(`Failed to fetch image: ${imageResponse.statusText}`);
      }
      
      const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
      const imageMimeType = imageResponse.headers.get('content-type') || 'image/png';
      
      // Parse target resolution from size (e.g., "1280x720" -> width: 1280, height: 720)
      const [targetWidth, targetHeight] = size.split('x').map(Number);
      
      // Resize image to match target video resolution
      // SORA requires the input_reference image to match the video resolution exactly
      const resizedImageBuffer = await sharp(imageBuffer)
        .resize(targetWidth, targetHeight, {
          fit: 'cover', // Cover the entire area, may crop if aspect ratio differs
          position: 'center', // Center the image when cropping
        })
        .toBuffer();
      
      // Determine output format based on original MIME type
      let outputFormat: 'jpeg' | 'png' | 'webp' = 'png';
      if (imageMimeType.includes('jpeg') || imageMimeType.includes('jpg')) {
        outputFormat = 'jpeg';
      } else if (imageMimeType.includes('webp')) {
        outputFormat = 'webp';
      }
      
      // Convert to the appropriate format
      const finalImageBuffer = await sharp(resizedImageBuffer)
        .toFormat(outputFormat)
        .toBuffer();
      
      // Convert Buffer to Uint8Array for File constructor
      const imageArray = new Uint8Array(finalImageBuffer);
      
      // Create a File object for the form data
      const urlParts = inputImageUrl.split('/');
      const originalFilename = urlParts[urlParts.length - 1].split('?')[0] || 'input_image.png';
      const filename = originalFilename.replace(/\.(png|jpg|jpeg|webp)$/i, `.${outputFormat}`);
      
      const imageFile = new File([imageArray], filename, { 
        type: `image/${outputFormat}` 
      });
      
      // Append as input_reference
      formData.append('input_reference', imageFile);
      
      console.log(`✅ Image resized to ${targetWidth}x${targetHeight} for SORA video generation`);
    }

    const createResponse = await fetch(`${OPENAI_API_BASE}/videos`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        // Don't set Content-Type header - browser will set it with boundary for FormData
      },
      body: formData,
    });

    if (!createResponse.ok) {
      const errorData = await createResponse.json().catch(() => ({ error: { message: createResponse.statusText } }));
      throw new Error(errorData.error?.message || `SORA API error: ${createResponse.status} ${createResponse.statusText}`);
    }

    const videoData = await createResponse.json();
    const videoId = videoData.id;

    if (!videoId) {
      throw new Error('No video ID returned from SORA API');
    }

    // Step 2: Poll for video completion
    // SORA API status values: 'queued', 'in_progress', 'completed', 'failed'
    let videoStatus = 'queued';
    let attempts = 0;
    const maxAttempts = 120; // 20 minutes max (120 * 10 seconds) - SORA can take longer
    
    // Initial status check
    let statusData: any = videoData;
    videoStatus = statusData.status || 'queued';
    console.log(`Initial SORA video status: ${videoStatus}`);

    // Poll until completed or failed
    while (videoStatus !== 'completed' && videoStatus !== 'failed' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds

      const statusResponse = await fetch(`${OPENAI_API_BASE}/videos/${videoId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
        },
      });

      if (!statusResponse.ok) {
        throw new Error(`Failed to check video status: ${statusResponse.statusText}`);
      }

      statusData = await statusResponse.json();
      videoStatus = statusData.status || 'unknown';
      attempts++;

      console.log(`SORA video generation status: ${videoStatus} (attempt ${attempts}/${maxAttempts})`);
      
      // Log any error details if available
      if (statusData.error) {
        console.error('SORA API error details:', statusData.error);
      }
    }

    if (videoStatus === 'failed') {
      const errorMessage = statusData.error?.message || 'Video generation failed';
      throw new Error(`SORA video generation failed: ${errorMessage}`);
    }

    if (videoStatus !== 'completed') {
      throw new Error(`Video generation timed out. Last status: ${videoStatus} after ${attempts} attempts (${attempts * 10} seconds)`);
    }

    // Step 3: Download the video
    const downloadResponse = await fetch(`${OPENAI_API_BASE}/videos/${videoId}/content`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
      },
    });

    if (!downloadResponse.ok) {
      throw new Error(`Failed to download video: ${downloadResponse.statusText}`);
    }

    const videoBuffer = await downloadResponse.arrayBuffer();

    // Convert buffer to blob and upload to S3
    const blob = new Blob([videoBuffer], { type: 'video/mp4' });
    const timestamp = Date.now();
    const file = new File([blob], `generated-${timestamp}.mp4`, { 
      type: 'video/mp4' 
    });
    
    // Upload to main location
    const fileKey = `episodes/${episodeId}/av-script/videos/generated-${timestamp}.mp4`;
    const uploadResult = await uploadToS3(file, fileKey);
    
    if (!uploadResult) {
      return NextResponse.json(
        { error: 'Failed to upload generated video' },
        { status: 500 }
      );
    }

    // Also save to backup folder
    try {
      const backupKey = `concepto-app/AIbackups/videos/${timestamp}-${Math.random().toString(36).substring(7)}.mp4`;
      await uploadToS3(file, backupKey);
      console.log('✅ Video backup saved to:', backupKey);
    } catch (backupError) {
      console.warn('⚠️ Failed to save video backup (non-critical):', backupError);
    }

    return NextResponse.json({
      videoUrl: uploadResult.url,
      success: true,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('SORA API error:', errorMessage);
    throw error;
  }
}

async function handleVeoGeneration(body: {
  prompt: string;
  type: 'image-to-video' | 'frames-to-video';
  imageUrl?: string;
  startFrameUrl?: string;
  endFrameUrl?: string;
  model: string;
  episodeId: string;
  resolution?: '720p' | '1080p';
  duration?: 4 | 6 | 8;
}) {
  const { prompt, type, imageUrl, startFrameUrl, endFrameUrl, model, episodeId, resolution = '720p', duration = 8 } = body;
  
  // Check if Veo API key is configured
  const veoApiKey = process.env.NEXT_PUBLIC_VEO_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  if (!veoApiKey) {
    return NextResponse.json(
      { 
        error: 'Veo API key is not configured. Please set NEXT_PUBLIC_VEO_API_KEY in your environment variables.'
      },
      { status: 500 }
    );
  }

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    if (type === 'image-to-video' && !imageUrl) {
      return NextResponse.json(
        { error: 'Image URL is required for image-to-video generation' },
        { status: 400 }
      );
    }

    if (type === 'frames-to-video' && (!startFrameUrl || !endFrameUrl)) {
      return NextResponse.json(
        { error: 'Both start and end frame URLs are required for frames-to-video generation' },
        { status: 400 }
      );
    }

    // Veo model names according to Gemini API documentation:
    // https://ai.google.dev/gemini-api/docs/video
    // - veo-3.1-generate-preview
    // - veo-3.1-fast-generate-preview
    const modelMap: Record<string, string> = {
      'veo-3-1-flash': 'veo-3.1-fast-generate-preview', // Fast generation
      'veo-3-1-pro': 'veo-3.1-generate-preview', // Standard generation
    };

    const selectedModel = modelMap[model] || 'veo-3.1-fast-generate-preview';
    console.log('Using Veo model:', selectedModel);

    // Generate video using Veo API
    // Veo uses predictLongRunning endpoint and returns an operation that needs to be polled
    // Documentation: https://ai.google.dev/gemini-api/docs/video
    const veoApiUrl = `${VEO_API_BASE}/models/${selectedModel}:predictLongRunning`;
    
    // Build request body according to Veo API structure
    // Resolution parameter should be in parameters object, not directly in instance
    const instance: any = {
      prompt: prompt,
    };
    
    // Add parameters object with resolution and duration for Veo 3.1 models
    const parameters: any = {
      resolution: resolution, // 720p or 1080p
      durationSeconds: duration, // 4, 6, or 8 seconds
    };

    // Add image for image-to-video generation
    if (type === 'image-to-video' && imageUrl) {
      // Fetch and convert image to base64
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        throw new Error(`Failed to fetch image: ${imageResponse.statusText}`);
      }
      const imageBuffer = await imageResponse.arrayBuffer();
      const imageBase64 = Buffer.from(imageBuffer).toString('base64');
      const imageMimeType = imageResponse.headers.get('content-type') || 'image/png';
      
      instance.image = {
        bytesBase64Encoded: imageBase64,
        mimeType: imageMimeType,
      };
    }

    // Add frames for frames-to-video generation
    if (type === 'frames-to-video' && startFrameUrl && endFrameUrl) {
      // Fetch start frame
      const startFrameResponse = await fetch(startFrameUrl);
      if (!startFrameResponse.ok) {
        throw new Error(`Failed to fetch start frame: ${startFrameResponse.statusText}`);
      }
      const startFrameBuffer = await startFrameResponse.arrayBuffer();
      const startFrameBase64 = Buffer.from(startFrameBuffer).toString('base64');
      const startFrameMimeType = startFrameResponse.headers.get('content-type') || 'image/png';

      // Fetch end frame
      const endFrameResponse = await fetch(endFrameUrl);
      if (!endFrameResponse.ok) {
        throw new Error(`Failed to fetch end frame: ${endFrameResponse.statusText}`);
      }
      const endFrameBuffer = await endFrameResponse.arrayBuffer();
      const endFrameBase64 = Buffer.from(endFrameBuffer).toString('base64');
      const endFrameMimeType = endFrameResponse.headers.get('content-type') || 'image/png';

      instance.firstFrame = {
        bytesBase64Encoded: startFrameBase64,
        mimeType: startFrameMimeType,
      };
      instance.lastFrame = {
        bytesBase64Encoded: endFrameBase64,
        mimeType: endFrameMimeType,
      };
    }

    const requestBody: any = {
      instances: [instance],
    };
    
    // Add parameters if resolution is specified (Veo 3.1+ models support this)
    if (parameters && Object.keys(parameters).length > 0) {
      requestBody.parameters = parameters;
    }

    // Step 1: Start the video generation operation
    let apiResponse: Response;
    try {
      apiResponse = await fetch(veoApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': veoApiKey,
        },
        body: JSON.stringify(requestBody),
      });

      if (!apiResponse.ok) {
        const errorData = await apiResponse.json().catch(() => ({ error: { message: apiResponse.statusText } }));
        throw new Error(errorData.error?.message || `Veo API error: ${apiResponse.status} ${apiResponse.statusText}`);
      }

      const operationData = await apiResponse.json();
      const operationName = operationData.name;

      if (!operationName) {
        throw new Error('No operation name returned from Veo API');
      }

      // Step 2: Poll the operation until it's complete
      let operationComplete = false;
      let finalResponse: any = null;
      const maxAttempts = 60; // 10 minutes max (60 * 10 seconds)
      let attempts = 0;

      while (!operationComplete && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds

        const statusResponse = await fetch(`${VEO_API_BASE}/${operationName}`, {
          method: 'GET',
          headers: {
            'x-goog-api-key': veoApiKey,
          },
        });

        if (!statusResponse.ok) {
          throw new Error(`Failed to check operation status: ${statusResponse.statusText}`);
        }

        finalResponse = await statusResponse.json();
        operationComplete = finalResponse.done === true;
        attempts++;

        if (!operationComplete) {
          console.log(`Video generation in progress... (attempt ${attempts}/${maxAttempts})`);
        }
      }

      if (!operationComplete) {
        throw new Error('Video generation timed out after maximum attempts');
      }

      // Step 3: Extract video URI from the response
      const videoUri = finalResponse?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
      
      if (!videoUri) {
        console.error('No video URI in response:', JSON.stringify(finalResponse, null, 2));
        return NextResponse.json(
          { error: 'No video generated. The API response did not contain a video URI.' },
          { status: 500 }
        );
      }

      // Step 4: Download the video from the URI
      const videoDownloadResponse = await fetch(videoUri, {
        headers: {
          'x-goog-api-key': veoApiKey,
        },
      });

      if (!videoDownloadResponse.ok) {
        throw new Error(`Failed to download video: ${videoDownloadResponse.statusText}`);
      }

      const videoBuffer = await videoDownloadResponse.arrayBuffer();

      // Convert buffer to blob
      const blob = new Blob([videoBuffer], { type: 'video/mp4' });
      const timestamp = Date.now();
      const file = new File([blob], `generated-${timestamp}.mp4`, { 
        type: 'video/mp4' 
      });
      
      // Upload to main location
      const fileKey = `episodes/${episodeId}/av-script/videos/generated-${timestamp}.mp4`;
      const uploadResult = await uploadToS3(file, fileKey);
      
      if (!uploadResult) {
        return NextResponse.json(
          { error: 'Failed to upload generated video' },
          { status: 500 }
        );
      }

      // Also save to backup folder (separate backup, no Firebase connection)
      try {
        const backupKey = `concepto-app/AIbackups/videos/${timestamp}-${Math.random().toString(36).substring(7)}.mp4`;
        await uploadToS3(file, backupKey);
        console.log('✅ Video backup saved to:', backupKey);
      } catch (backupError) {
        // Log but don't fail the request if backup fails
        console.warn('⚠️ Failed to save video backup (non-critical):', backupError);
      }

      return NextResponse.json({
        videoUrl: uploadResult.url,
        success: true,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Veo API error:', errorMessage);
      
      // Provide a helpful error message
      if (errorMessage.includes('not found') || errorMessage.includes('404')) {
        throw new Error(
          `Veo model '${selectedModel}' not found. Please verify: ` +
          `(1) Your Veo API key has access to this model, ` +
          `(2) The model name is correct, ` +
          `(3) Your account has the necessary permissions for Veo video generation.`
        );
      }
      throw error;
    }
}
