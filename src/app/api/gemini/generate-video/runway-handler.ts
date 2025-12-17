import { NextResponse } from 'next/server';
import { uploadToS3 } from '@/lib/s3-service';

const RUNWAY_API_BASE = 'https://api.dev.runwayml.com/v1';

interface RunwayRequestBody {
  prompt?: string;
  type?: 'image-to-video' | 'frames-to-video' | 'character-performance' | 'video-upscale';
  imageUrl?: string;
  startFrameUrl?: string;
  endFrameUrl?: string;
  referenceVideoUrl?: string;
  characterVideoUrl?: string;
  videoUrl?: string; // for video-upscale
  model: string;
  episodeId: string;
  resolution?: '720p' | '1080p';
  duration?: 4 | 6 | 8;
  runwayDuration?: number;
}

type RunwayTaskStatus = 'PENDING' | 'THROTTLED' | 'RUNNING' | 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

interface RunwayUploadCreateResponse {
  uploadUrl: string;
  fields: Record<string, string>;
  runwayUri: string;
}

function guessFilenameFromUrl(url: string, fallback: string) {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').pop() || fallback;
    return last.includes('.') ? last : fallback;
  } catch {
    return fallback;
  }
}

async function downloadUrlToFile(url: string, fallbackFilename: string): Promise<File> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch media: ${res.status} ${res.statusText}`);
  }
  const contentType = res.headers.get('content-type') || 'application/octet-stream';
  const buffer = Buffer.from(await res.arrayBuffer());
  const filename = guessFilenameFromUrl(url, fallbackFilename);
  return new File([buffer], filename, { type: contentType });
}

async function createRunwayEphemeralUpload(runwayApiKey: string, filename: string): Promise<RunwayUploadCreateResponse> {
  const response = await fetch(`${RUNWAY_API_BASE}/uploads`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${runwayApiKey}`,
      'X-Runway-Version': '2024-11-06',
    },
    body: JSON.stringify({
      filename,
      type: 'ephemeral',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`Runway uploads error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = (await response.json()) as RunwayUploadCreateResponse;
  if (!data?.uploadUrl || !data?.fields || !data?.runwayUri) {
    throw new Error(`Runway uploads returned unexpected response: ${JSON.stringify(data)}`);
  }
  return data;
}

async function uploadFileToRunwayEphemeral(runwayApiKey: string, file: File): Promise<string> {
  const upload = await createRunwayEphemeralUpload(runwayApiKey, file.name);
  const formData = new FormData();
  for (const [k, v] of Object.entries(upload.fields)) {
    formData.append(k, v);
  }
  // NOTE: for S3-compatible presigned POSTs, the field name MUST be "file"
  formData.append('file', file);

  const upRes = await fetch(upload.uploadUrl, {
    method: 'POST',
    body: formData,
  });

  // Presigned POST often returns 204 or 201
  if (!upRes.ok && upRes.status !== 204) {
    const errorText = await upRes.text().catch(() => upRes.statusText);
    throw new Error(`Runway upload POST failed: ${upRes.status} ${upRes.statusText} - ${errorText}`);
  }

  return upload.runwayUri;
}

async function ensureRunwayUri(runwayApiKey: string, uriOrUrl: string, fallbackFilename: string): Promise<string> {
  if (!uriOrUrl) return uriOrUrl;
  if (uriOrUrl.startsWith('runway://')) return uriOrUrl;
  if (uriOrUrl.startsWith('data:')) return uriOrUrl;
  // For Act Two / video upscale we always upload so Runway can access private/S3 URLs.
  // For public HTTPS URLs, uploading is still safe and consistent.
  if (uriOrUrl.startsWith('http://') || uriOrUrl.startsWith('https://')) {
    const file = await downloadUrlToFile(uriOrUrl, fallbackFilename);
    return await uploadFileToRunwayEphemeral(runwayApiKey, file);
  }
  return uriOrUrl;
}

async function runwayCreateTask(runwayApiKey: string, endpoint: string, requestBody: unknown): Promise<string> {
  const response = await fetch(`${RUNWAY_API_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${runwayApiKey}`,
      'X-Runway-Version': '2024-11-06',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`Runway API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const taskData = await response.json();
  const taskId = taskData.id as string | undefined;
  if (!taskId) {
    throw new Error('No task ID returned from Runway API');
  }
  return taskId;
}

async function runwayGetTask(runwayApiKey: string, taskId: string) {
  const statusResponse = await fetch(`${RUNWAY_API_BASE}/tasks/${taskId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${runwayApiKey}`,
      'X-Runway-Version': '2024-11-06',
    },
  });

  if (!statusResponse.ok) {
    throw new Error(`Failed to check task status: ${statusResponse.status} ${statusResponse.statusText}`);
  }
  return await statusResponse.json() as { status?: RunwayTaskStatus; output?: unknown };
}

async function runwayWaitForSuccess(runwayApiKey: string, taskId: string) {
  let attempts = 0;
  const maxAttempts = 120; // 20 minutes max (120 * 10 seconds)
  // Poll no more frequently than every ~5s; we use 10s.
  while (attempts < maxAttempts) {
    const statusData = await runwayGetTask(runwayApiKey, taskId);
    const status = (statusData.status || 'PENDING') as RunwayTaskStatus;
    if (status === 'SUCCEEDED') return statusData;
    if (status === 'FAILED' || status === 'CANCELLED') {
      throw new Error(`Runway task failed: ${JSON.stringify(statusData)}`);
    }
    await new Promise(resolve => setTimeout(resolve, 10000));
    attempts++;
  }
  throw new Error(`Runway task timed out after ${maxAttempts} attempts`);
}

function extractFirstOutputUrl(task: { output?: unknown }): string | undefined {
  const out = task.output as unknown;
  if (typeof out === 'string') return out;
  if (Array.isArray(out)) {
    const first = out[0];
    if (typeof first === 'string') return first;
  }
  return undefined;
}

async function downloadAndUploadVideoToS3(videoUrl: string, episodeId: string) {
  const videoResponse = await fetch(videoUrl);
  if (!videoResponse.ok) {
    throw new Error(`Failed to download video: ${videoResponse.status} ${videoResponse.statusText}`);
  }

  const videoBuffer = await videoResponse.arrayBuffer();
  const videoBlob = new Blob([videoBuffer], { type: 'video/mp4' });
  const timestamp = Date.now();
  const videoFile = new File([videoBlob], `runway-video-${timestamp}.mp4`, { type: 'video/mp4' });

  const key = `episodes/${episodeId}/av-script/videos/${timestamp}-${Math.random().toString(36).substring(7)}.mp4`;
  const uploadResult = await uploadToS3(videoFile, key);

  // Backup upload (non-critical)
  try {
    const backupKey = `concepto-app/AIbackups/videos/${timestamp}-${Math.random().toString(36).substring(7)}.mp4`;
    await uploadToS3(videoFile, backupKey);
    console.log('✅ Video backup saved to:', backupKey);
  } catch (backupError) {
    console.warn('⚠️ Failed to save video backup (non-critical):', backupError);
  }

  return uploadResult;
}

export async function handleRunwayGeneration(body: RunwayRequestBody) {
  const runwayApiKey = process.env.RUNWAY_API_KEY;
  
  if (!runwayApiKey) {
    throw new Error('RUNWAY_API_KEY is not configured. Please add it to your environment variables.');
  }

  const { model, type, imageUrl, referenceVideoUrl, episodeId, runwayDuration = 5 } = body;

  // Determine which Runway model and endpoint to use
  const isActTwo = model === 'runway-act-two';
  const isGen4Turbo = model === 'runway-gen4-turbo';
  const isUpscaleV1 = model === 'runway-upscale-v1';

  if (!isActTwo && !isGen4Turbo && !isUpscaleV1) {
    throw new Error(`Unsupported Runway model: ${model}. Supported models: runway-gen4-turbo, runway-act-two, runway-upscale-v1`);
  }

  try {
    if (isUpscaleV1 && type === 'video-upscale') {
      if (!body.videoUrl) {
        throw new Error('videoUrl is required for Runway video upscale');
      }

      const videoUri = await ensureRunwayUri(runwayApiKey, body.videoUrl, 'input.mp4');
      const requestBody = {
        model: 'upscale_v1',
        videoUri,
      };

      console.log('🚀 Starting Runway video upscale...');
      const taskId = await runwayCreateTask(runwayApiKey, '/video_upscale', requestBody);
      const finalTask = await runwayWaitForSuccess(runwayApiKey, taskId);
      const outputUrl = extractFirstOutputUrl(finalTask);
      if (!outputUrl) {
        throw new Error(`No video URL in Runway upscale response: ${JSON.stringify(finalTask)}`);
      }

      const uploadResult = await downloadAndUploadVideoToS3(outputUrl, episodeId);
      return NextResponse.json({ videoUrl: uploadResult.url, taskId });

    } else if (isActTwo && type === 'character-performance') {
      // Act Two: Character Performance
      // Uses imageUrl for character (image) + referenceVideoUrl (video performance reference)
      if (!referenceVideoUrl) {
        throw new Error('referenceVideoUrl is required for Act Two');
      }

      if (!imageUrl) {
        throw new Error('imageUrl is required for Act Two character input (image-based character)');
      }

      const runwayReferenceVideoUri = await ensureRunwayUri(runwayApiKey, referenceVideoUrl, 'reference.mp4');
      const characterImageUri = await ensureRunwayUri(runwayApiKey, imageUrl, 'character.png');

      const character = {
        type: 'image' as const,
        uri: characterImageUri,
      };

      const requestBody = {
        seed: Math.floor(Math.random() * 4294967295), // Random seed
        character,
        reference: {
          type: 'video',
          uri: runwayReferenceVideoUri,
        },
        bodyControl: true,
        expressionIntensity: 3,
        ratio: '1280:720',
        contentModeration: {
          publicFigureThreshold: 'auto',
        },
        model: 'act_two',
      };

      console.log('🚀 Starting Runway Act Two character performance generation...');
      console.log('Request body:', JSON.stringify(requestBody, null, 2));
      const taskId = await runwayCreateTask(runwayApiKey, '/character_performance', requestBody);
      const finalTask = await runwayWaitForSuccess(runwayApiKey, taskId);
      const outputUrl = extractFirstOutputUrl(finalTask);
      if (!outputUrl) {
        throw new Error(`No video URL in Runway response: ${JSON.stringify(finalTask)}`);
      }

      console.log('✅ Runway video generated:', outputUrl);
      const uploadResult = await downloadAndUploadVideoToS3(outputUrl, episodeId);
      return NextResponse.json({ videoUrl: uploadResult.url, taskId });

    } else if (isGen4Turbo && (type === 'image-to-video' || type === 'frames-to-video')) {
      // Gen-4 Turbo: Image to Video (supports optional "frames-to-video" by sending promptImage array)
      const ratio = '1280:720';
      const duration = runwayDuration;

      if (type === 'image-to-video') {
        if (!imageUrl) {
          throw new Error('imageUrl is required for Gen-4 Turbo image-to-video generation');
        }

        const promptImage = await ensureRunwayUri(runwayApiKey, imageUrl, 'prompt.png');

        const requestBody: {
          model: 'gen4_turbo';
          promptImage: string;
          promptText?: string;
          ratio: string;
          duration: number;
        } = {
          model: 'gen4_turbo',
          promptImage,
          ratio,
          duration,
        };

        if (body.prompt) requestBody.promptText = body.prompt;

        console.log('🚀 Starting Runway Gen-4 Turbo image-to-video generation...');
        const taskId = await runwayCreateTask(runwayApiKey, '/image_to_video', requestBody);
        const finalTask = await runwayWaitForSuccess(runwayApiKey, taskId);
        const outputUrl = extractFirstOutputUrl(finalTask);
        if (!outputUrl) {
          throw new Error(`No video URL in Runway response: ${JSON.stringify(finalTask)}`);
        }

        const uploadResult = await downloadAndUploadVideoToS3(outputUrl, episodeId);
        return NextResponse.json({ videoUrl: uploadResult.url, taskId });
      }

      // frames-to-video (start/end)
      if (!body.startFrameUrl || !body.endFrameUrl) {
        throw new Error('Both startFrameUrl and endFrameUrl are required for Runway frames-to-video');
      }

      // Upload both frames so they are always accessible to Runway
      const startUri = await ensureRunwayUri(runwayApiKey, body.startFrameUrl, 'start.png');
      const endUri = await ensureRunwayUri(runwayApiKey, body.endFrameUrl, 'end.png');

      // Docs show "position" for prompt images (at least "first"). We also send "last"
      // to support the expected "first/last frame" behavior; if the API rejects "last",
      // it will surface a clear error to adjust.
      const requestBody: {
        model: 'gen4_turbo';
        promptImage: Array<{ uri: string; position: 'first' | 'last' }>;
        promptText?: string;
        ratio: string;
        duration: number;
      } = {
        model: 'gen4_turbo',
        promptImage: [
          { uri: startUri, position: 'first' },
          { uri: endUri, position: 'last' },
        ],
        ratio,
        duration,
      };

      if (body.prompt) requestBody.promptText = body.prompt;

      console.log('🚀 Starting Runway Gen-4 Turbo frames-to-video generation...');
      const taskId = await runwayCreateTask(runwayApiKey, '/image_to_video', requestBody);
      const finalTask = await runwayWaitForSuccess(runwayApiKey, taskId);
      const outputUrl = extractFirstOutputUrl(finalTask);
      if (!outputUrl) {
        throw new Error(`No video URL in Runway response: ${JSON.stringify(finalTask)}`);
      }

      const uploadResult = await downloadAndUploadVideoToS3(outputUrl, episodeId);
      return NextResponse.json({ videoUrl: uploadResult.url, taskId });
    } else {
      throw new Error(
        `Invalid combination: model=${model}, type=${type}. ` +
        `For Act Two, use type='character-performance'. ` +
        `For Gen-4 Turbo, use type='image-to-video' or 'frames-to-video'. ` +
        `For Upscale, use model='runway-upscale-v1' with type='video-upscale'.`
      );
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Runway API error:', errorMessage);
    throw error;
  }
}

