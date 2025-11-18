import { NextResponse } from 'next/server';
import { uploadToS3 } from '@/lib/s3-service';

const RUNWAY_API_BASE = 'https://api.dev.runwayml.com/v1';

interface RunwayRequestBody {
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

  if (!isActTwo && !isGen4Turbo) {
    throw new Error(`Unsupported Runway model: ${model}. Supported models: runway-gen4-turbo, runway-act-two`);
  }

  try {
    if (isActTwo && type === 'character-performance') {
      // Act Two: Character Performance
      if (!imageUrl || !referenceVideoUrl) {
        throw new Error('Both imageUrl (character) and referenceVideoUrl are required for Act Two');
      }

      const requestBody = {
        seed: Math.floor(Math.random() * 4294967295), // Random seed
        character: {
          type: 'image',
          uri: imageUrl,
        },
        reference: {
          type: 'video',
          uri: referenceVideoUrl,
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

      const response = await fetch(`${RUNWAY_API_BASE}/character_performance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${runwayApiKey}`,
          'X-Runway-Version': '2024-11-06',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Runway API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const taskData = await response.json();
      const taskId = taskData.id;

      if (!taskId) {
        throw new Error('No task ID returned from Runway API');
      }

      console.log('✅ Runway task created:', taskId);

      // Poll for task completion
      let taskStatus = 'PENDING';
      let attempts = 0;
      const maxAttempts = 120; // 20 minutes max (120 * 10 seconds)

      while (taskStatus !== 'SUCCEEDED' && taskStatus !== 'FAILED' && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds

        const statusResponse = await fetch(`${RUNWAY_API_BASE}/tasks/${taskId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${runwayApiKey}`,
            'X-Runway-Version': '2024-11-06',
          },
        });

        if (!statusResponse.ok) {
          throw new Error(`Failed to check task status: ${statusResponse.statusText}`);
        }

        const statusData = await statusResponse.json();
        taskStatus = statusData.status;

        attempts++;

        if (taskStatus === 'PENDING' || taskStatus === 'IN_PROGRESS') {
          console.log(`Runway task in progress... (attempt ${attempts}/${maxAttempts}, status: ${taskStatus})`);
        }
      }

      if (taskStatus !== 'SUCCEEDED') {
        if (taskStatus === 'FAILED') {
          const errorDetails = await fetch(`${RUNWAY_API_BASE}/tasks/${taskId}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${runwayApiKey}`,
              'X-Runway-Version': '2024-11-06',
            },
          }).then(r => r.json());
          throw new Error(`Runway task failed: ${JSON.stringify(errorDetails)}`);
        }
        throw new Error(`Runway task timed out or failed after ${attempts} attempts. Status: ${taskStatus}`);
      }

      // Get the final task result
      const finalResponse = await fetch(`${RUNWAY_API_BASE}/tasks/${taskId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${runwayApiKey}`,
          'X-Runway-Version': '2024-11-06',
        },
      });

      if (!finalResponse.ok) {
        throw new Error(`Failed to get final task result: ${finalResponse.statusText}`);
      }

      const finalData = await finalResponse.json();
      const videoUrl = finalData.output?.[0] || finalData.output;

      if (!videoUrl) {
        throw new Error('No video URL in Runway response');
      }

      console.log('✅ Runway video generated:', videoUrl);

      // Download video and upload to S3
      const videoResponse = await fetch(videoUrl);
      if (!videoResponse.ok) {
        throw new Error(`Failed to download video: ${videoResponse.statusText}`);
      }

      const videoBuffer = await videoResponse.arrayBuffer();
      const videoBlob = new Blob([videoBuffer], { type: 'video/mp4' });
      const videoFile = new File([videoBlob], `runway-video-${Date.now()}.mp4`, { type: 'video/mp4' });

      // Upload to S3
      const timestamp = Date.now();
      const key = `episodes/${episodeId}/av-script/videos/${timestamp}-${Math.random().toString(36).substring(7)}.mp4`;
      const uploadResult = await uploadToS3(videoFile, key);

      // Backup upload
      try {
        const backupKey = `concepto-app/AIbackups/videos/${timestamp}-${Math.random().toString(36).substring(7)}.mp4`;
        await uploadToS3(videoFile, backupKey);
        console.log('✅ Video backup saved to:', backupKey);
      } catch (backupError) {
        console.warn('⚠️ Failed to save video backup (non-critical):', backupError);
      }

      return NextResponse.json({
        videoUrl: uploadResult.url,
        taskId: taskId,
      });

    } else if (isGen4Turbo && type === 'image-to-video') {
      // Gen-4 Turbo: Image to Video
      if (!imageUrl) {
        throw new Error('imageUrl is required for Gen-4 Turbo image-to-video generation');
      }

      interface Gen4TurboRequestBody {
        model: string;
        promptImage: string;
        promptText?: string;
        ratio: string;
        duration: number;
      }
      const requestBody: Gen4TurboRequestBody = {
        model: 'gen4_turbo',
        promptImage: imageUrl,
        ratio: '1280:720',
        duration: runwayDuration,
      };

      // Add prompt if provided (optional for Gen-4 Turbo)
      if (body.prompt) {
        requestBody.promptText = body.prompt;
      }

      console.log('🚀 Starting Runway Gen-4 Turbo image-to-video generation...');
      console.log('Request body:', JSON.stringify(requestBody, null, 2));

      const response = await fetch(`${RUNWAY_API_BASE}/image_to_video`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${runwayApiKey}`,
          'X-Runway-Version': '2024-11-06',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Runway API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const taskData = await response.json();
      const taskId = taskData.id;

      if (!taskId) {
        throw new Error('No task ID returned from Runway API');
      }

      console.log('✅ Runway task created:', taskId);

      // Poll for task completion
      let taskStatus = 'PENDING';
      let attempts = 0;
      const maxAttempts = 120; // 20 minutes max (120 * 10 seconds)

      while (taskStatus !== 'SUCCEEDED' && taskStatus !== 'FAILED' && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds

        const statusResponse = await fetch(`${RUNWAY_API_BASE}/tasks/${taskId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${runwayApiKey}`,
            'X-Runway-Version': '2024-11-06',
          },
        });

        if (!statusResponse.ok) {
          throw new Error(`Failed to check task status: ${statusResponse.statusText}`);
        }

        const statusData = await statusResponse.json();
        taskStatus = statusData.status;

        attempts++;

        if (taskStatus === 'PENDING' || taskStatus === 'IN_PROGRESS') {
          console.log(`Runway task in progress... (attempt ${attempts}/${maxAttempts}, status: ${taskStatus})`);
        }
      }

      if (taskStatus !== 'SUCCEEDED') {
        if (taskStatus === 'FAILED') {
          const errorDetails = await fetch(`${RUNWAY_API_BASE}/tasks/${taskId}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${runwayApiKey}`,
              'X-Runway-Version': '2024-11-06',
            },
          }).then(r => r.json());
          throw new Error(`Runway task failed: ${JSON.stringify(errorDetails)}`);
        }
        throw new Error(`Runway task timed out or failed after ${attempts} attempts. Status: ${taskStatus}`);
      }

      // Get the final task result
      const finalResponse = await fetch(`${RUNWAY_API_BASE}/tasks/${taskId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${runwayApiKey}`,
          'X-Runway-Version': '2024-11-06',
        },
      });

      if (!finalResponse.ok) {
        throw new Error(`Failed to get final task result: ${finalResponse.statusText}`);
      }

      const finalData = await finalResponse.json();
      const videoUrl = finalData.output?.[0] || finalData.output;

      if (!videoUrl) {
        throw new Error('No video URL in Runway response');
      }

      console.log('✅ Runway video generated:', videoUrl);

      // Download video and upload to S3
      const videoResponse = await fetch(videoUrl);
      if (!videoResponse.ok) {
        throw new Error(`Failed to download video: ${videoResponse.statusText}`);
      }

      const videoBuffer = await videoResponse.arrayBuffer();
      const videoBlob = new Blob([videoBuffer], { type: 'video/mp4' });
      const videoFile = new File([videoBlob], `runway-video-${Date.now()}.mp4`, { type: 'video/mp4' });

      // Upload to S3
      const timestamp = Date.now();
      const key = `episodes/${episodeId}/av-script/videos/${timestamp}-${Math.random().toString(36).substring(7)}.mp4`;
      const uploadResult = await uploadToS3(videoFile, key);

      // Backup upload
      try {
        const backupKey = `concepto-app/AIbackups/videos/${timestamp}-${Math.random().toString(36).substring(7)}.mp4`;
        await uploadToS3(videoFile, backupKey);
        console.log('✅ Video backup saved to:', backupKey);
      } catch (backupError) {
        console.warn('⚠️ Failed to save video backup (non-critical):', backupError);
      }

      return NextResponse.json({
        videoUrl: uploadResult.url,
        taskId: taskId,
      });
    } else {
      throw new Error(`Invalid combination: model=${model}, type=${type}. For Act Two, use type='character-performance'. For Gen-4 Turbo, use type='image-to-video'.`);
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Runway API error:', errorMessage);
    throw error;
  }
}

