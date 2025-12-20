import { NextRequest, NextResponse } from 'next/server';
import { uploadToS3 } from '@/lib/s3-service';
import sharp from 'sharp';
import { handleRunwayGeneration } from './runway-handler';
import jwt from 'jsonwebtoken';

// FormData is available in Node.js 18+ (Next.js uses Next.js 18+)
// No need to import, it's a global in modern Node.js

// Veo API endpoint - separate from Gemini API
const VEO_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// Kling AI API endpoint (configurable via environment variable)
// Official documentation: https://app.klingai.com/global/dev/document-api/apiReference/commonInfo
// Default API domain: https://api-singapore.klingai.com
// Can be overridden with KLING_API_BASE_URL environment variable
const KLING_API_BASE = process.env.KLING_API_BASE_URL || 'https://api-singapore.klingai.com';

// Runway ML API endpoint (defined in runway-handler.ts)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      prompt?: string;
      type?: 'image-to-video' | 'frames-to-video' | 'character-performance';
      imageUrl?: string;
      startFrameUrl?: string;
      endFrameUrl?: string;
      referenceVideoUrl?: string;
      model: string;
      episodeId: string;
      resolution?: '720p' | '1080p';
      duration?: 4 | 6 | 8;
      runwayDuration?: number;
      klingDuration?: 5 | 10;
      klingMode?: 'std' | 'pro';
      kling26Audio?: boolean;
      kling26Size?: '16:9' | '9:16' | '1:1';
      omniVideoInput?: string;
      omniAspectRatio?: '16:9' | '9:16' | '1:1';
      omniType?: 'base' | 'feature';
      veoImages?: Array<{ url: string; filename: string; id?: string }>;
    };

    // Check which model is being used
    const isSora = body.model.startsWith('sora');
    const isRunway = body.model.startsWith('runway');
    const isKling = body.model.startsWith('kling');
    
    if (isRunway) {
      // Handle Runway ML video generation
      return await handleRunwayGeneration(body);
    } else if (isSora) {
      // Handle SORA video generation
      return await handleSoraGeneration(body);
    } else if (isKling) {
      // Handle Kling AI video generation
      return await handleKlingGeneration(body);
    } else {
      // Handle Veo video generation
      return await handleVeoGeneration(body);
    }
  } catch (error: unknown) {
    console.error('Error generating video:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    const errorName = error instanceof Error ? error.name : 'Error';
    
    console.error('Error details:', {
      message: errorMessage,
      stack: errorStack,
      name: errorName,
    });
    
    // Ensure we always return a proper error response
    return NextResponse.json(
      { 
        error: errorMessage || 'Internal server error',
        message: errorMessage || 'Internal server error', // Include both for compatibility
        code: 'VIDEO_GENERATION_ERROR',
        details: process.env.NODE_ENV === 'development' ? errorStack : undefined
      },
      { status: 500 }
    );
  }
}

async function handleSoraGeneration(body: {
  prompt?: string;
  type?: 'image-to-video' | 'frames-to-video' | 'character-performance';
  imageUrl?: string;
  startFrameUrl?: string;
  endFrameUrl?: string;
  model: string;
  episodeId: string;
  resolution?: '720p' | '1080p';
  duration?: 4 | 6 | 8;
}) {
  const { prompt = '', type = 'image-to-video', imageUrl, episodeId, resolution = '720p', duration = 8 } = body;
  
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
    interface VideoStatusData {
      status?: string;
      error?: { message?: string };
    }
    let statusData: VideoStatusData = videoData;
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
      modelName: body.model,
      generatedAt: new Date().toISOString(),
      success: true,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('SORA API error:', errorMessage);
    throw error;
  }
}

async function handleVeoGeneration(body: {
  prompt?: string;
  type?: 'image-to-video' | 'frames-to-video' | 'character-performance';
  imageUrl?: string;
  startFrameUrl?: string;
  endFrameUrl?: string;
  model: string;
  episodeId: string;
  resolution?: '720p' | '1080p';
  duration?: 4 | 6 | 8;
  veoImages?: Array<{ url: string; filename: string }>;
}) {
  const { prompt = '', type = 'image-to-video', imageUrl, startFrameUrl, endFrameUrl, model, episodeId, resolution = '720p', duration = 8, veoImages } = body;
  
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

    // Validate that we have the required inputs
    // Priority: veoImages > legacy type/imageUrl/startFrameUrl/endFrameUrl
    if (veoImages && veoImages.length > 0) {
      // veoImages takes priority - validation will happen in the processing logic
    } else if (type === 'image-to-video' && !imageUrl) {
      return NextResponse.json(
        { error: 'Image URL is required for image-to-video generation' },
        { status: 400 }
      );
    } else if (type === 'frames-to-video' && (!startFrameUrl || !endFrameUrl)) {
      return NextResponse.json(
        { error: 'Both start and end frame URLs are required for frames-to-video generation' },
        { status: 400 }
      );
    } else if (!veoImages && !imageUrl && !startFrameUrl) {
      return NextResponse.json(
        { error: 'At least one image or frame is required for video generation' },
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
    
    // Use the selected model
    // Both Veo 3.1 and Veo 3.1 Fast support the same features including frames-to-video (lastFrame)
    const actualModel = selectedModel;
    console.log('Using Veo model:', actualModel);

    // Generate video using Veo API
    // Veo uses predictLongRunning endpoint and returns an operation that needs to be polled
    // Documentation: https://ai.google.dev/gemini-api/docs/video
    const veoApiUrl = `${VEO_API_BASE}/models/${actualModel}:predictLongRunning`;
    
    // Build request body according to Veo API structure
    // image: Start frame
    // lastFrame: End frame (camelCase per documentation, Python SDK uses last_frame but REST uses camelCase)
    // Based on user feedback and docs: 'first_frame' is not supported, should be 'image'.
    interface VeoInstance {
      prompt: string;
      image?: { bytesBase64Encoded: string; mimeType: string }; // Single image or Start frame
      lastFrame?: { bytesBase64Encoded: string; mimeType: string }; // End frame
    }
    
    interface VeoParameters {
      sampleCount?: number;
      storageUri?: string; // Optional: for storing directly to GCS
      aspectRatio?: string; // Optional: "16:9", "9:16", "1:1"
      durationSeconds?: number; // 4, 6, or 8 - Must be 8 when using lastFrame (interpolation)
      resolution?: string; // "720p", "1080p"
    }
    // Build enhanced prompt with image filenames if provided
    let enhancedPrompt = prompt;
    if (veoImages && veoImages.length > 0) {
      const filenameList = veoImages.map((img, idx) => {
        const position = idx === 0 ? 'starting frame' : idx === veoImages.length - 1 ? 'ending frame' : 'reference frame';
        return `${img.filename} (${position})`;
      }).join(', ');
      enhancedPrompt = `${prompt}\n\nAvailable images: ${filenameList}. You can reference these images by their filenames in your prompt.`;
    }
    
    const instance: VeoInstance = {
      prompt: enhancedPrompt,
    };
    
    // Parameters object
    const parameters: VeoParameters = {
      sampleCount: 1, // Generate 1 video
    };
    
    // Handle VEO frames-to-video generation
    if (type === 'frames-to-video' && startFrameUrl && endFrameUrl) {
      // When using lastFrame (interpolation), duration MUST be 8 according to Veo 3.1 docs
      parameters.durationSeconds = 8;
      // Fetch start frame
      const startFrameResponse = await fetch(startFrameUrl);
      if (!startFrameResponse.ok) {
        throw new Error(`Failed to fetch start frame: ${startFrameResponse.statusText}`);
      }
      const startFrameBuffer = await startFrameResponse.arrayBuffer();
      const startFrameBase64 = Buffer.from(startFrameBuffer).toString('base64');
      const startFrameMimeType = startFrameResponse.headers.get('content-type') || 'image/png';

      // For Veo 3.1, the start frame is passed as 'image'
      instance.image = {
        bytesBase64Encoded: startFrameBase64,
        mimeType: startFrameMimeType,
      };

      // Fetch end frame
      const endFrameResponse = await fetch(endFrameUrl);
      if (!endFrameResponse.ok) {
        throw new Error(`Failed to fetch end frame: ${endFrameResponse.statusText}`);
      }
      const endFrameBuffer = await endFrameResponse.arrayBuffer();
      const endFrameBase64 = Buffer.from(endFrameBuffer).toString('base64');
      const endFrameMimeType = endFrameResponse.headers.get('content-type') || 'image/png';

      instance.lastFrame = {
        bytesBase64Encoded: endFrameBase64,
        mimeType: endFrameMimeType,
      };
    } else if (type === 'image-to-video' && imageUrl) {
      // Single image - use image-to-video
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
      
      // For image-to-video, use the specified duration (or default to 8)
      if (duration) {
        parameters.durationSeconds = duration;
      } else {
        parameters.durationSeconds = 8; // Default to 8 seconds
      }
    }
    
    // Add resolution if specified
    if (resolution) {
      parameters.resolution = resolution;
    }

    // Build request body
    // According to Python SDK: image=first_image, config=GenerateVideosConfig(last_frame=last_image)
    // For REST API, parameters usually holds the config
    interface VeoRequestBody {
      instances: VeoInstance[];
      parameters?: VeoParameters;
    }
    const requestBody: VeoRequestBody = {
      instances: [instance],
    };
    
    // Add parameters if needed
    if (Object.keys(parameters).length > 0) {
      requestBody.parameters = parameters;
    }
    
    // Validate that instance has at least an image or frames
    if (!instance.image) {
      throw new Error('Instance must have at least an image (for image-to-video or frames-to-video)');
    }

    // Log the full request body for debugging (masking base64)
    console.log('Sending VEO API Request to:', veoApiUrl);
    console.log('Request Body Structure:', JSON.stringify({
      instances: [{
        prompt: instance.prompt?.substring(0, 50) + '...',
        hasImage: !!instance.image,
        hasLastFrame: !!instance.lastFrame,
      }],
      parameters: parameters
    }, null, 2));

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
        const errorText = await apiResponse.text();
        console.error('VEO API Error Status:', apiResponse.status);
        console.error('VEO API Error Headers:', Object.fromEntries(apiResponse.headers.entries()));
        console.error('VEO API Error Body:', errorText);
        
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: { message: errorText || apiResponse.statusText } };
        }
        throw new Error(errorData.error?.message || errorData.message || `Veo API error: ${apiResponse.status} ${apiResponse.statusText}`);
      }

      const operationData = await apiResponse.json();
      const operationName = operationData.name;

      if (!operationName) {
        throw new Error('No operation name returned from Veo API');
      }

      // Step 2: Poll the operation until it's complete
      let operationComplete = false;
      interface VeoOperationResponse {
        done?: boolean;
        response?: {
          generateVideoResponse?: {
            generatedSamples?: Array<{
              video?: { uri?: string };
            }>;
          };
          videoUri?: string;
        };
        error?: { message?: string };
      }
      let finalResponse: VeoOperationResponse | null = null;
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
        operationComplete = finalResponse?.done === true;
        attempts++;

        if (!operationComplete) {
          console.log(`Video generation in progress... (attempt ${attempts}/${maxAttempts})`);
        }
      }

      if (!operationComplete || !finalResponse) {
        throw new Error('Video generation timed out after maximum attempts');
      }

      // Step 3: Extract video URI from the response
      // Try multiple possible response structures
      const videoUri = finalResponse.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri 
        || finalResponse.response?.videoUri;
      
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

async function handleKlingGeneration(body: {
  prompt?: string;
  type?: 'image-to-video' | 'frames-to-video' | 'character-performance';
  imageUrl?: string;
  startFrameUrl?: string;
  endFrameUrl?: string;
  model: string;
  episodeId: string;
  resolution?: '720p' | '1080p';
  duration?: 4 | 6 | 8;
  // Omni-Video supports 3-10s (with scenario-specific constraints); Kling v2.x supports 5/10.
  klingDuration?: 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  klingMode?: 'std' | 'pro';
  kling26Audio?: boolean;
  kling26Size?: '16:9' | '9:16' | '1:1';
  omniVideoInput?: string;
  omniAspectRatio?: '16:9' | '9:16' | '1:1';
  omniType?: 'base' | 'feature';
}) {
    const { 
    prompt = '', 
    type = 'image-to-video', 
    imageUrl, 
    startFrameUrl, 
    endFrameUrl, 
    episodeId, 
    klingDuration = 5,
    klingMode = 'std',
    kling26Audio = false,
    kling26Size = '16:9',
    omniVideoInput
  } = body;
  
  // Use klingDuration if provided, otherwise default to 5
  const duration = klingDuration || 5;
  const isOmniModel = body.model === 'kling-omni-video' || body.model === 'kling-o1';
  
  // Check if Kling AI credentials are configured
  // Kling AI uses JWT authentication: access key as issuer (iss), secret key for signing
  const klingApiKey = process.env.NEXT_PUBLIC_KLING_API_KEY;
  const klingAccessKey = process.env.KLING_ACCESS_KEY;
  const klingSecretKey = process.env.KLING_SECRET_KEY;
  
  console.log('==== Kling AI Credentials Check ====');
  console.log('hasApiKey:', !!klingApiKey);
  console.log('hasAccessKey:', !!klingAccessKey);
  console.log('hasSecretKey:', !!klingSecretKey);
  console.log('API Base URL:', KLING_API_BASE);
  console.log('=====================================');
  
  let authHeader: string;
  
  if (klingApiKey) {
    // Single API key (Bearer token) - use directly
    authHeader = `Bearer ${klingApiKey}`;
  } else if (klingAccessKey && klingSecretKey) {
    // Access key + Secret key: Generate JWT token
    // Kling AI JWT authentication - matches Python implementation exactly
    // Python reference: https://app.klingai.com/global/dev/document-api/apiReference/commonInfo
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: klingAccessKey, // Issuer: access key
      exp: now + 1800, // Expires in 30 minutes (current time + 1800s)
      nbf: now - 5, // Not before: 5 seconds ago (current time - 5s)
    };
    
    try {
      // Generate JWT token matching Java/Python implementation exactly
      // Java: JWT.create().withIssuer(ak).withHeader({"alg":"HS256"}).withExpiresAt(exp).withNotBefore(nbf).sign(HMAC256(sk))
      // Python: jwt.encode(payload, sk, headers={"alg": "HS256", "typ": "JWT"})
      console.log('Generating JWT token with payload:', { 
        iss: '[REDACTED]',
        exp: payload.exp,
        nbf: payload.nbf,
      });
      
      // Generate token with explicit header like Java implementation
      const token = jwt.sign(payload, klingSecretKey, { 
        algorithm: 'HS256',
        header: {
          alg: 'HS256',
          typ: 'JWT',
        },
      });
      
      authHeader = `Bearer ${token}`;
      console.log('✅ JWT token generated successfully');
      console.log('Token preview:', `Bearer ${token.substring(0, 20)}...`);
    } catch (jwtError) {
      console.error('❌ Failed to generate JWT token:', jwtError);
      const jwtErrorMessage = jwtError instanceof Error ? jwtError.message : 'Unknown JWT error';
      return NextResponse.json(
        { 
          error: `Failed to generate authentication token: ${jwtErrorMessage}. Please verify your KLING_ACCESS_KEY and KLING_SECRET_KEY are correct.`,
          code: 'JWT_GENERATION_ERROR',
        },
        { status: 500 }
      );
    }
  } else {
    return NextResponse.json(
      { 
        error: 'Kling AI credentials are not configured. Please set either NEXT_PUBLIC_KLING_API_KEY (for single API key) or both KLING_ACCESS_KEY and KLING_SECRET_KEY in your environment variables.'
      },
      { status: 500 }
    );
  }

  if (!prompt) {
    return NextResponse.json(
      { error: 'Prompt is required for Kling AI video generation' },
      { status: 400 }
    );
  }

  // Validate duration:
  // - Kling v2.x supports only 5/10 seconds.
  // - Omni supports 3-10 seconds with scenario-specific constraints (we enforce the stricter ones later).
  if (!isOmniModel && duration !== 5 && duration !== 10) {
    return NextResponse.json(
      { error: 'Kling AI only supports 5 or 10 second durations' },
      { status: 400 }
    );
  }

  try {
    // Determine which model is being used
    const isKling26 = body.model === 'kling-v2-6';
    const isOmni = isOmniModel;
    
    // Step 1: Submit generation task
    // For O1 (Omni), use the Omni-Video endpoint
    // For Kling 2.6 and v2.5, use the image2video endpoint
    const requestUrl = isOmni 
      ? `${KLING_API_BASE}/v1/videos/omni-video`
      : `${KLING_API_BASE}/v1/videos/image2video`;
    
    // Kling AI expects specific field names and format
    // Using snake_case format for API compatibility
    // image: required - main/start frame
    // image_tail: optional - end frame (for frame interpolation)
    // video: optional - video input for O1 (Omni)
    // NOTE: cfg_scale is NOT supported by Kling v2.x models (only v1.x)
    // Build request body. NOTE:
    // - Non-Omni: uses /v1/videos/image2video payload (image/image_tail)
    // - Omni: uses /v1/videos/omni-video payload (image_list/video_list/etc) with model_name = kling-video-o1
    const buildOmniPrompt = (rawPrompt: string, needsImage: boolean, needsVideo: boolean) => {
      // Kling Omni requires input references in the prompt using placeholders like <<<image_1>>> / <<<video_1>>>.
      // See docs: "Specify an element, image, or video in the format of <<<...>>> such as <<<image_1>>>."
      let p = rawPrompt.trim();
      const hasImagePlaceholder = /<<<\s*image_1\s*>>>/i.test(p);
      const hasVideoPlaceholder = /<<<\s*video_1\s*>>>/i.test(p);

      if (needsImage && !hasImagePlaceholder) p = `<<<image_1>>> ${p}`.trim();
      if (needsVideo && !hasVideoPlaceholder) p = `<<<video_1>>> ${p}`.trim();
      return p;
    };

    if (isOmni) {
      // Kling Omni O1 schema (from the published OmniVideo docs bundle):
      // - image_list items use image_url (+ optional type: first_frame/end_frame)
      // - video_list items use video_url + refer_type (base|feature) + keep_original_sound (yes|no)
      const hasVideoInput = !!body.omniVideoInput;
      const hasImageInput = !!imageUrl;
      const referType: 'base' | 'feature' =
        body.omniType === 'feature' ? 'feature' : 'base';

      // Ensure prompt contains required placeholders when inputs are provided (Omni is strict about this).
      const omniPrompt = buildOmniPrompt(prompt, hasImageInput, hasVideoInput);

      const isEditingBase = hasVideoInput && referType === 'base';
      const isVideoReference = hasVideoInput && referType === 'feature';
      const isTextToVideo = !hasVideoInput && !hasImageInput;

      const omniPayload: Record<string, unknown> = {
        model_name: 'kling-video-o1',
        prompt: omniPrompt,
      };
      // Only send mode when Pro is selected.
      if (klingMode === 'pro') omniPayload.mode = 'pro';

      if (hasImageInput && imageUrl) {
        // Standard image reference / image-to-video uses image_url
        omniPayload.image_list = [{ image_url: imageUrl }];
      }

      if (hasVideoInput && body.omniVideoInput) {
        omniPayload.video_list = [
          {
            video_url: body.omniVideoInput,
            refer_type: referType,
            keep_original_sound: 'yes',
          },
        ];
      }

      // duration:
      // - Editing base: duration MUST NOT be provided (aligns with input video length)
      // - Text-to-video: only 5/10 supported in our UI
      // - Video reference (feature): duration is allowed (3-10), but our UI uses 5/10
      if (!isEditingBase) {
        omniPayload.duration = duration.toString();
      }

      // aspect_ratio:
      // Docs FAQ says aspect ratio is NOT supported for instruction-based transformation (video editing base).
      // It IS supported for text-to-video and video reference scenarios.
      if (isTextToVideo || isVideoReference) {
        omniPayload.aspect_ratio = body.omniAspectRatio || '16:9';
      }

      console.log('📡 Kling Omni create task payload keys:', Object.keys(omniPayload));

      const generateResponse = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(omniPayload),
      });

      if (!generateResponse.ok) {
        const errorText = await generateResponse.text();
        throw new Error(`Kling Omni request failed: ${errorText || generateResponse.statusText}`);
      }

      const generateData = await generateResponse.json();
      if (generateData.code !== 0) {
        throw new Error(generateData.message || 'Failed to submit video generation task');
      }

      const taskId = generateData.data?.task_id;
      if (!taskId) throw new Error('No task ID returned from Kling AI API');

      console.log(`✅ Kling AI task submitted: ${taskId}`);

      // Continue into shared polling + download by jumping to the polling section.
      // We do this by storing taskId onto a local and skipping the generic submission below.
      // eslint-disable-next-line no-inner-declarations
      async function pollOmniTaskAndReturn(taskIdToPoll: string) {
        // Step 2: Poll for task completion
        let taskStatus = 'submitted';
        let attempts = 0;
        const maxAttempts = 120; // 20 minutes max (120 * 10 seconds)
        let taskData: {
          task_id?: string;
          task_status?: string;
          task_status_msg?: string;
          task_result?: {
            videos?: Array<{ url: string; duration?: number }>;
          };
        } | null = null;

        while (taskStatus !== 'succeed' && taskStatus !== 'failed' && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds

          const statusEndpoint = `${KLING_API_BASE}/v1/videos/omni-video/${taskIdToPoll}`;
          const statusResponse = await fetch(statusEndpoint, {
            method: 'GET',
            headers: {
              Authorization: authHeader,
            },
          });

          if (!statusResponse.ok) {
            const statusErrorText = await statusResponse.text();
            console.error('Status check error:', statusErrorText);
            throw new Error(`Failed to check task status: ${statusResponse.statusText}`);
          }

          const statusData = await statusResponse.json();
          if (statusData.code !== 0) {
            throw new Error(statusData.message || 'Failed to check task status');
          }

          taskData = statusData.data;
          if (taskData) {
            taskStatus = taskData.task_status || 'unknown';
            attempts++;

            console.log(`Kling AI task status: ${taskStatus} (attempt ${attempts}/${maxAttempts})`);

            if (taskData.task_status_msg) {
              console.log('Status message:', taskData.task_status_msg);
            }
          } else {
            throw new Error('No task data received from status check');
          }
        }

        if (!taskData) {
          throw new Error('Video generation failed: No task data available');
        }

        if (taskStatus === 'failed') {
          const errorMessage = taskData.task_status_msg || 'Video generation failed';
          throw new Error(`Kling AI video generation failed: ${errorMessage}`);
        }

        if (taskStatus !== 'succeed') {
          throw new Error(`Video generation timed out. Last status: ${taskStatus} after ${attempts} attempts (${attempts * 10} seconds)`);
        }

        const videos = taskData.task_result?.videos || [];
        const videoUrl = videos[0]?.url;
        if (!videoUrl) {
          console.error('No video URL in response:', JSON.stringify(taskData, null, 2));
          return NextResponse.json(
            { error: 'No video generated. The API response did not contain a video URL.' },
            { status: 500 }
          );
        }

        console.log('✅ Kling AI video generation complete:', videoUrl);

        const videoDownloadResponse = await fetch(videoUrl);
        if (!videoDownloadResponse.ok) {
          throw new Error(`Failed to download video: ${videoDownloadResponse.statusText}`);
        }

        const videoBuffer = await videoDownloadResponse.arrayBuffer();
        const blob = new Blob([videoBuffer], { type: 'video/mp4' });
        const timestamp = Date.now();
        const file = new File([blob], `generated-${timestamp}.mp4`, {
          type: 'video/mp4',
        });

        const fileKey = `episodes/${episodeId}/av-script/videos/generated-${timestamp}.mp4`;
        const uploadResult = await uploadToS3(file, fileKey);

        if (!uploadResult) {
          return NextResponse.json(
            { error: 'Failed to upload generated video' },
            { status: 500 }
          );
        }

        // Backup (non-critical)
        try {
          const backupKey = `concepto-app/AIbackups/videos/${timestamp}-${Math.random().toString(36).substring(7)}.mp4`;
          await uploadToS3(file, backupKey);
          console.log('✅ Video backup saved to:', backupKey);
        } catch (backupError) {
          console.warn('⚠️ Failed to save video backup (non-critical):', backupError);
        }

        return NextResponse.json({
          videoUrl: uploadResult.url,
          modelName: body.model,
          generatedAt: new Date().toISOString(),
          success: true,
        });
      }

      return await pollOmniTaskAndReturn(taskId);
    }

    type KlingAspectRatio = '16:9' | '9:16' | '1:1';
    type KlingMode = 'std' | 'pro';
    type KlingProMode = 'pro';

    type KlingImage2VideoRequest = {
      model_name: string;
      image: string;
      image_tail?: string;
      prompt: string;
      negative_prompt: string;
      duration: string;
      mode?: KlingProMode; // Only send "pro"; omit for standard to avoid "std" issues
      aspect_ratio?: KlingAspectRatio;
      sound?: 'on' | 'off'; // Kling v2.6+
    };

    const requestBody: KlingImage2VideoRequest = {
      model_name: isKling26 ? 'kling-v2-6' : 'kling-v2-5-turbo',
      image: '', // Set below based on input type
      prompt,
      negative_prompt: '',
      duration: duration.toString(),
    };

    // Kling 2.6 specific parameters
    if (isKling26) {
      requestBody.sound = kling26Audio ? 'on' : 'off';
      requestBody.aspect_ratio = kling26Size as KlingAspectRatio;

      // IMPORTANT (observed with kling-v2-6 in prod):
      // Even when `mode` is omitted, the service can default to "std" and reject it with:
      //   {"code":1201,"message":"mode value 'std' is invalid", ...}
      // Force "pro" so the request never falls back to "std".
      requestBody.mode = 'pro';
    } else if ((klingMode as KlingMode) === 'pro') {
      // Only send mode when Pro is selected (never send "std").
      requestBody.mode = 'pro';
    }

    // For non-Omni models, set image and optional image_tail based on input type.
      // Set image and image_tail based on input type for non-Omni models
      // IMPORTANT: image_tail is only supported in Pro mode with 10s duration
      if (type === 'frames-to-video' && startFrameUrl && endFrameUrl) {
      // Multiple frames mode: start frame + end frame
      // Validate: image_tail requires Pro mode + 10s duration
      if (klingMode !== 'pro' || duration !== 10) {
        return NextResponse.json(
          { 
            error: 'Start+End frames (image_tail) is only supported in Pro mode with 10 second duration. ' +
                   'Please either: (1) Switch to Pro mode and select 10s duration, or (2) Use single image mode instead.'
          },
          { status: 400 }
        );
      }
      
        // image = start frame, image_tail = end frame
        requestBody.image = startFrameUrl;
        requestBody.image_tail = endFrameUrl;
        console.log('Using frames-to-video mode with start and end frames (Pro mode, 10s)');
      } else if (type === 'image-to-video' && imageUrl) {
        // Single image mode: only main image
        requestBody.image = imageUrl;
        // image_tail is not set (undefined)
        console.log('Using image-to-video mode with single image');
      } else if (type === 'frames-to-video' && startFrameUrl) {
        // Only start frame provided
        requestBody.image = startFrameUrl;
        console.log('Using image-to-video mode with start frame only');
      } else if (!isOmni) {
        // For non-Omni models, require at least one image
        return NextResponse.json(
          { error: 'At least one image is required for Kling AI video generation' },
          { status: 400 }
        );
      }

    console.log('==== Kling AI API Request ====');
    console.log('URL:', requestUrl);
    console.log('Method: POST');
    console.log('Model:', body.model);
    console.log('Is Omni:', isOmni);
    console.log('Is Kling 2.6:', isKling26);
    console.log('Auth Method:', klingApiKey ? 'API_KEY' : 'JWT');
    console.log('Mode:', requestBody.mode);
    console.log('Duration:', duration + 's');
    console.log('Has image:', !!requestBody.image);
    console.log('Has image_tail:', !!requestBody.image_tail);
    console.log('Has video:', false);
    console.log('Has omniVideoInput:', !!omniVideoInput);
    console.log('Has imageUrl:', !!imageUrl);
    console.log('Prompt:', prompt.substring(0, 50) + '...');
    console.log('Request Body:', JSON.stringify(requestBody, null, 2));
    console.log('Authorization Header:', authHeader.substring(0, 20) + '...');
    console.log('=====================================');

    let generateResponse: Response;
    try {
      console.log('📡 Sending request to Kling AI...');
      generateResponse = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(requestBody),
      });
      console.log('✅ Received response:', {
        status: generateResponse.status,
        statusText: generateResponse.statusText,
        ok: generateResponse.ok,
      });
    } catch (fetchError) {
      console.error('❌ Kling AI Fetch Error:', fetchError);
      const errorMessage = fetchError instanceof Error ? fetchError.message : 'Unknown fetch error';
      throw new Error(`Failed to connect to Kling AI API: ${errorMessage}. Please check your API endpoint URL (${KLING_API_BASE}) and network connection.`);
    }

    if (!generateResponse.ok) {
      const errorText = await generateResponse.text();
      let errorData: unknown;
      try {
        errorData = JSON.parse(errorText) as unknown;
      } catch {
        errorData = { error: { message: errorText || generateResponse.statusText }, message: errorText || generateResponse.statusText };
      }
      
      console.error('Kling AI API Error:', {
        status: generateResponse.status,
        statusText: generateResponse.statusText,
        errorText: errorText,
        error: errorData,
        requestUrl: requestUrl,
        requestBody: JSON.stringify(requestBody, null, 2),
      });
      
      const isRecord = (v: unknown): v is Record<string, unknown> =>
        typeof v === 'object' && v !== null;

      // Extract error message from various possible formats
      let extractedMessage: string | undefined;
      if (isRecord(errorData)) {
        const maybeMessage = errorData['message'];
        if (typeof maybeMessage === 'string') extractedMessage = maybeMessage;

        const maybeError = errorData['error'];
        if (!extractedMessage && typeof maybeError === 'string') extractedMessage = maybeError;
        if (!extractedMessage && isRecord(maybeError)) {
          const maybeInner = maybeError['message'];
          if (typeof maybeInner === 'string') extractedMessage = maybeInner;
        }
      }

      const errorMessage =
        extractedMessage ||
        (errorText || '').trim() ||
        `Kling AI API error: ${generateResponse.status} ${generateResponse.statusText}`;
      
      throw new Error(errorMessage);
    }

    const generateData = await generateResponse.json();
    
    // Kling AI response format: { code, message, data: { task_id, task_status, ... } }
    if (generateData.code !== 0) {
      throw new Error(generateData.message || 'Failed to submit video generation task');
    }
    
    const taskId = generateData.data?.task_id;

    if (!taskId) {
      throw new Error('No task ID returned from Kling AI API');
    }

    console.log(`✅ Kling AI task submitted: ${taskId}`);

    // Step 2: Poll for task completion
    // Kling AI endpoint for task status: /v1/videos/image2video/{taskId} or /v1/videos/omniVideo/{taskId}
    let taskStatus = 'submitted';
    let attempts = 0;
    const maxAttempts = 120; // 20 minutes max (120 * 10 seconds)
    let taskData: {
      task_id?: string;
      task_status?: string;
      task_status_msg?: string;
      task_result?: {
        videos?: Array<{ url: string; duration?: number }>;
      };
    } | null = null;

    while (taskStatus !== 'succeed' && taskStatus !== 'failed' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds

      // Use appropriate endpoint based on model
      const statusEndpoint = (body.model === 'kling-omni-video' || body.model === 'kling-o1')
        ? `${KLING_API_BASE}/v1/videos/omni-video/${taskId}`
        : `${KLING_API_BASE}/v1/videos/image2video/${taskId}`;
      const statusResponse = await fetch(statusEndpoint, {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
        },
      });

      if (!statusResponse.ok) {
        const statusErrorText = await statusResponse.text();
        console.error('Status check error:', statusErrorText);
        throw new Error(`Failed to check task status: ${statusResponse.statusText}`);
      }

      const statusData = await statusResponse.json();
      
      // Kling AI response format: { code, message, data: { task_id, task_status, ... } }
      if (statusData.code !== 0) {
        throw new Error(statusData.message || 'Failed to check task status');
      }
      
      taskData = statusData.data;
      if (taskData) {
        taskStatus = taskData.task_status || 'unknown';
        attempts++;

        console.log(`Kling AI task status: ${taskStatus} (attempt ${attempts}/${maxAttempts})`);

        if (taskData.task_status_msg) {
          console.log('Status message:', taskData.task_status_msg);
        }
      } else {
        throw new Error('No task data received from status check');
      }
    }

    // Ensure taskData is not null before proceeding
    if (!taskData) {
      throw new Error('Video generation failed: No task data available');
    }

    if (taskStatus === 'failed') {
      const errorMessage = taskData.task_status_msg || 'Video generation failed';
      throw new Error(`Kling AI video generation failed: ${errorMessage}`);
    }

    if (taskStatus !== 'succeed') {
      throw new Error(`Video generation timed out. Last status: ${taskStatus} after ${attempts} attempts (${attempts * 10} seconds)`);
    }

    // Step 3: Get the video URL from the response
    // Kling AI response format: data.task_result.videos[0].url
    const videos = taskData.task_result?.videos || [];
    const videoUrl = videos[0]?.url;

    if (!videoUrl) {
      console.error('No video URL in response:', JSON.stringify(taskData, null, 2));
      return NextResponse.json(
        { error: 'No video generated. The API response did not contain a video URL.' },
        { status: 500 }
      );
    }

    console.log('✅ Kling AI video generation complete:', videoUrl);

    // Step 4: Download the video
    const videoDownloadResponse = await fetch(videoUrl);

    if (!videoDownloadResponse.ok) {
      throw new Error(`Failed to download video: ${videoDownloadResponse.statusText}`);
    }

    const videoBuffer = await videoDownloadResponse.arrayBuffer();

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
      modelName: body.model,
      generatedAt: new Date().toISOString(),
      success: true,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    console.error('Kling AI API error:', {
      message: errorMessage,
      stack: errorStack,
      apiBase: KLING_API_BASE,
      hasAccessKey: !!klingAccessKey,
      hasSecretKey: !!klingSecretKey,
      hasApiKey: !!klingApiKey,
    });
    
    // Provide a helpful error message
    if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
      throw new Error(
        'Kling AI API authentication failed. Please verify your access key and secret key are correct.'
      );
    }
    if (errorMessage.includes('402') || errorMessage.includes('Payment')) {
      throw new Error(
        'Insufficient credits in your Kling AI account. Please add credits to continue.'
      );
    }
    if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
      throw new Error(
        'Rate limit exceeded for Kling AI API. Please try again later.'
      );
    }
    if (errorMessage.includes('fetch failed') || errorMessage.includes('ENOTFOUND') || errorMessage.includes('ECONNREFUSED')) {
      throw new Error(
        `Failed to connect to Kling AI API at ${KLING_API_BASE}. Please verify: (1) The API endpoint URL is correct, (2) Your network connection is working, (3) The API base URL environment variable KLING_API_BASE_URL is set correctly if using a custom endpoint.`
      );
    }
    // Ensure we always throw an Error with a message
    if (error instanceof Error && error.message) {
      throw error;
    } else {
      throw new Error(errorMessage || 'Unknown error occurred during Kling AI video generation');
    }
  }
}
