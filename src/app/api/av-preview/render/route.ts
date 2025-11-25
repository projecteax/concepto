import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';
import { uploadBufferToS3 } from '@/lib/s3-service';

// We'll load ffmpeg-static dynamically in the function to avoid module loading issues

interface RenderClip {
  type: 'video' | 'image';
  url: string;
  startTime: number;
  duration: number;
  offset: number;
}

interface AudioClip {
  url: string;
  startTime: number;
  duration: number;
  offset: number;
  volume: number;
}

interface RenderRequest {
  episodeId: string;
  segmentNumber: number;
  clips: RenderClip[];
  audioClips: AudioClip[];
  totalDuration: number;
  fps?: number;
  resolution?: '720p' | '1080p';
}

// Get FFmpeg path - try bundled first, then system PATH
async function getFFmpegPath(): Promise<string> {
  // Check if we're in a serverless environment
  const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
  
  if (isServerless) {
    throw new Error('FFmpeg not available in serverless environment');
  }

  // Try to use bundled ffmpeg-static (load dynamically to avoid Next.js bundling issues)
  try {
    // Use dynamic require inside function to avoid Next.js bundling issues
    // ffmpeg-static exports a string path directly
    let ffmpegStatic: any;
    try {
      // Try require first
      ffmpegStatic = require('ffmpeg-static');
    } catch (requireError) {
      console.error('Error requiring ffmpeg-static:', requireError);
      // Try alternative: construct path manually
      const nodeModulesPath = path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
      if (fs.existsSync(nodeModulesPath)) {
        console.log('Found ffmpeg-static via manual path:', nodeModulesPath);
        return nodeModulesPath;
      }
      throw requireError;
    }
    
    console.log('ffmpeg-static require result type:', typeof ffmpegStatic);
    console.log('ffmpeg-static require result:', ffmpegStatic);
    
    // ffmpeg-static exports the path as a string
    const staticPath = typeof ffmpegStatic === 'string' ? ffmpegStatic : (ffmpegStatic?.default || ffmpegStatic);
    
    if (staticPath && typeof staticPath === 'string') {
      console.log('ffmpeg-static path extracted:', staticPath);
      if (fs.existsSync(staticPath)) {
        console.log('✓ ffmpeg-static binary found and verified');
        return staticPath;
      } else {
        console.warn('✗ ffmpeg-static binary not found at path:', staticPath);
        // Try manual path as fallback
        const nodeModulesPath = path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
        if (fs.existsSync(nodeModulesPath)) {
          console.log('Found ffmpeg-static via manual path fallback:', nodeModulesPath);
          return nodeModulesPath;
        }
      }
    } else {
      console.warn('Could not extract path from ffmpeg-static, trying manual path...');
      const nodeModulesPath = path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
      if (fs.existsSync(nodeModulesPath)) {
        console.log('Found ffmpeg-static via manual path:', nodeModulesPath);
        return nodeModulesPath;
      }
    }
  } catch (error) {
    console.error('Could not load ffmpeg-static:', error);
    // Last resort: try manual path
    const nodeModulesPath = path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
    if (fs.existsSync(nodeModulesPath)) {
      console.log('Found ffmpeg-static via manual path (last resort):', nodeModulesPath);
      return nodeModulesPath;
    }
  }

  // Fallback: try system FFmpeg
  try {
    await execAsync('ffmpeg -version');
    console.log('Using system FFmpeg from PATH');
    return 'ffmpeg'; // Use system FFmpeg from PATH
  } catch (error) {
    throw new Error('FFmpeg not found. Please install FFmpeg or ensure ffmpeg-static package is available.');
  }
}

export async function POST(request: NextRequest) {
  let tempDir: string | null = null;
  
  try {
    const body: RenderRequest = await request.json();
    const {
      episodeId,
      segmentNumber,
      clips,
      audioClips,
      totalDuration,
      fps = 24,
      resolution = '1080p'
    } = body;

    if (clips.length === 0) {
      throw new Error('No clips to render');
    }

    // Get FFmpeg path
    const ffmpegPath = await getFFmpegPath();
    console.log('Using FFmpeg at:', ffmpegPath);

    // Create temp directory for processing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'av-render-'));
    console.log('Temp directory:', tempDir);

    const width = resolution === '1080p' ? 1920 : 1280;
    const height = resolution === '1080p' ? 1080 : 720;

    // Download and save media files
    console.log(`Downloading ${clips.length} media files...`);
    const mediaFiles: string[] = [];
    
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      try {
        console.log(`Downloading clip ${i + 1}/${clips.length}...`);
        const response = await fetch(clip.url);
        if (!response.ok) {
          throw new Error(`Failed to download ${clip.url}: ${response.statusText}`);
        }
        const buffer = await response.arrayBuffer();
        const ext = clip.type === 'video' ? (clip.url.match(/\.(mp4|webm|mov)$/i)?.[0] || '.mp4') : '.jpg';
        const filePath = path.join(tempDir, `clip-${i}${ext}`);
        fs.writeFileSync(filePath, Buffer.from(buffer));
        mediaFiles.push(filePath);
        console.log(`Saved clip ${i + 1} to ${filePath} (${buffer.byteLength} bytes)`);
      } catch (error) {
        console.error(`Error downloading clip ${i + 1}:`, error);
        throw error;
      }
    }

    // Download audio files
    const audioFiles: string[] = [];
    for (let i = 0; i < audioClips.length; i++) {
      const audioClip = audioClips[i];
      try {
        const response = await fetch(audioClip.url);
        if (!response.ok) {
          console.warn(`Failed to download audio ${audioClip.url}, skipping...`);
          continue;
        }
        const buffer = await response.arrayBuffer();
        const ext = audioClip.url.match(/\.(mp3|wav|aac|m4a)$/i)?.[0] || '.mp3';
        const audioPath = path.join(tempDir, `audio-${i}${ext}`);
        fs.writeFileSync(audioPath, Buffer.from(buffer));
        audioFiles.push(audioPath);
      } catch (error) {
        console.warn(`Error downloading audio ${i + 1}, skipping:`, error);
      }
    }

    // Build FFmpeg filter complex
    const videoFilters: string[] = [];
    videoFilters.push(`color=c=black:s=${width}x${height}:d=${totalDuration}:r=${fps}[base]`);
    let currentOutput = 'base';
    
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      const inputLabel = `${i}:v`;
      const outputLabel = i === clips.length - 1 ? 'final' : `v${i}`;
      
      if (clip.type === 'video') {
        const scaledLabel = `scaled${i}`;
        const trimmedLabel = `trimmed${i}`;
        videoFilters.push(
          `[${inputLabel}]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1[${scaledLabel}]`,
          `[${scaledLabel}]trim=start=${clip.offset}:end=${clip.offset + clip.duration},setpts=PTS-STARTPTS[${trimmedLabel}]`,
          `[${currentOutput}][${trimmedLabel}]overlay=0:0:enable='between(t,${clip.startTime},${clip.startTime + clip.duration})'[${outputLabel}]`
        );
      } else {
        const scaledLabel = `scaled${i}`;
        const loopedLabel = `looped${i}`;
        const trimmedLabel = `trimmed${i}`;
        videoFilters.push(
          `[${inputLabel}]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1[${scaledLabel}]`,
          `[${scaledLabel}]loop=loop=-1:size=1:start=0[${loopedLabel}]`,
          `[${loopedLabel}]trim=start=0:duration=${clip.duration},setpts=PTS-STARTPTS[${trimmedLabel}]`,
          `[${currentOutput}][${trimmedLabel}]overlay=0:0:enable='between(t,${clip.startTime},${clip.startTime + clip.duration})'[${outputLabel}]`
        );
      }
      currentOutput = outputLabel;
    }

    // Build audio filters
    const audioFilters: string[] = [];
    const audioInputOffset = clips.length;
    
    if (audioFiles.length > 0) {
      for (let i = 0; i < audioClips.length && i < audioFiles.length; i++) {
        const audioClip = audioClips[i];
        const volume = audioClip.volume || 1;
        const delayMs = Math.round(audioClip.startTime * 1000);
        const duration = audioClip.duration;
        const offset = audioClip.offset || 0;
        
        const audioInput = `${audioInputOffset + i}:a`;
        const trimmedLabel = `atrimmed${i}`;
        const delayedLabel = `adelayed${i}`;
        
        audioFilters.push(
          `[${audioInput}]atrim=start=${offset}:end=${offset + duration},asetpts=PTS-STARTPTS,volume=${volume}[${trimmedLabel}]`,
          `[${trimmedLabel}]adelay=${delayMs}|${delayMs}[${delayedLabel}]`
        );
      }
      
      if (audioFilters.length > 0) {
        const delayedInputs = audioClips.slice(0, audioFiles.length)
          .map((_, i) => `[adelayed${i}]`)
          .join('');
        audioFilters.push(`${delayedInputs}amix=inputs=${Math.min(audioClips.length, audioFiles.length)}:duration=longest:dropout_transition=2[audio]`);
      }
    }

    // Build FFmpeg command as array for better Windows compatibility
    const outputPath = path.join(tempDir, 'output.mp4');
    
    const ffmpegArgs: string[] = ['-y'];
    
    // Add video/image inputs
    for (const file of mediaFiles) {
      ffmpegArgs.push('-i', file);
    }
    
    // Add audio inputs
    for (const file of audioFiles) {
      if (fs.existsSync(file)) {
        ffmpegArgs.push('-i', file);
      }
    }
    
    // Combine all filters
    const allFilters = [...videoFilters, ...audioFilters].join(';');
    ffmpegArgs.push('-filter_complex', allFilters);
    
    // Map outputs
    ffmpegArgs.push('-map', '[final]');
    if (audioFilters.length > 0) {
      ffmpegArgs.push('-map', '[audio]');
    }
    
    // Output settings - H.264 codec with proper MP4 formatting for maximum compatibility
    // Force MP4 format, use baseline profile for better compatibility
    ffmpegArgs.push(
      '-f', 'mp4',
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-profile:v', 'baseline',
      '-level', '3.0',
      '-crf', '23',
      '-r', fps.toString(),
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart'
    );
    
    if (audioFilters.length > 0) {
      ffmpegArgs.push('-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2');
    } else {
      ffmpegArgs.push('-an');
    }
    
    // Add -shortest to ensure output matches shortest stream duration
    // Use -avoid_negative_ts make_zero for better compatibility
    ffmpegArgs.push('-shortest', '-avoid_negative_ts', 'make_zero', outputPath);

    console.log('Running FFmpeg command...');
    console.log('FFmpeg path:', ffmpegPath);
    console.log('FFmpeg args:', ffmpegArgs.join(' '));
    
    // Execute FFmpeg using spawn for better control and Windows compatibility
    await new Promise<void>((resolve, reject) => {
      // Verify FFmpeg path exists before spawning
      if (!fs.existsSync(ffmpegPath)) {
        reject(new Error(`FFmpeg executable not found at path: ${ffmpegPath}`));
        return;
      }
      
      let ffmpegProcess;
      try {
        console.log('Spawning FFmpeg process...', { path: ffmpegPath, argsCount: ffmpegArgs.length });
        ffmpegProcess = spawn(ffmpegPath, ffmpegArgs, {
          cwd: tempDir,
          stdio: ['ignore', 'pipe', 'pipe']
        });
        console.log('FFmpeg process spawned successfully, PID:', ffmpegProcess.pid);
      } catch (spawnError) {
        console.error('Failed to spawn FFmpeg:', spawnError);
        reject(new Error(`Failed to start FFmpeg process: ${spawnError instanceof Error ? spawnError.message : 'Unknown error'}`));
        return;
      }
      
      let stdout = '';
      let stderr = '';
      
      ffmpegProcess.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });
      
      ffmpegProcess.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
        // Log progress
        const lines = data.toString().split('\n');
        for (const line of lines) {
          if (line.includes('frame=') || line.includes('time=')) {
            process.stdout.write(`\r${line.trim()}`);
          }
        }
      });
      
      // Set a timeout to prevent hanging
      const timeout = setTimeout(() => {
        if (!ffmpegProcess.killed) {
          ffmpegProcess.kill();
          reject(new Error('FFmpeg process timed out after 5 minutes'));
        }
      }, 300000); // 5 minutes
      
      ffmpegProcess.on('close', (code: number, signal: string | null) => {
        clearTimeout(timeout);
        process.stdout.write('\n'); // New line after progress
        if (code === 0) {
          console.log('FFmpeg completed successfully');
          if (stdout) console.log('FFmpeg stdout:', stdout);
          // Filter out progress lines
          const errorLines = stderr.split('\n').filter(line => 
            line && 
            !line.includes('frame=') && 
            !line.includes('fps=') && 
            !line.includes('bitrate=') &&
            !line.includes('time=') &&
            !line.includes('speed=')
          );
          if (errorLines.length > 0) {
            console.log('FFmpeg warnings:', errorLines.join('\n'));
          }
          resolve();
        } else {
          console.error('FFmpeg exited with code:', code, 'signal:', signal);
          console.error('FFmpeg stdout:', stdout);
          console.error('FFmpeg stderr:', stderr);
          // Extract actual error message from stderr
          const errorLines = stderr.split('\n').filter(line => 
            line && 
            !line.includes('frame=') && 
            !line.includes('fps=') && 
            !line.includes('bitrate=') &&
            !line.includes('time=') &&
            !line.includes('speed=') &&
            (line.toLowerCase().includes('error') || line.toLowerCase().includes('failed') || line.toLowerCase().includes('invalid'))
          );
          const errorMsg = errorLines.length > 0 
            ? errorLines.join('; ') 
            : (stderr || stdout || 'Unknown error').substring(0, 500);
          reject(new Error(`FFmpeg failed with exit code ${code}: ${errorMsg}`));
        }
      });
      
      ffmpegProcess.on('error', (error: Error) => {
        clearTimeout(timeout);
        console.error('FFmpeg process error:', error);
        reject(new Error(`FFmpeg process failed: ${error.message}`));
      });
    });

    // Wait for file to be fully written and accessible
    let retries = 0;
    const maxRetries = 10;
    while (retries < maxRetries) {
      if (fs.existsSync(outputPath)) {
        try {
          const stats = fs.statSync(outputPath);
          if (stats.size > 0) {
            // Try to read a small portion to ensure file is accessible
            fs.readFileSync(outputPath, { start: 0, end: 100 });
            break;
          }
        } catch (readError) {
          // File might still be writing, wait a bit more
        }
      }
      await new Promise(resolve => setTimeout(resolve, 200));
      retries++;
    }
    
    if (!fs.existsSync(outputPath)) {
      throw new Error('FFmpeg failed to create output file');
    }

    const fileStats = fs.statSync(outputPath);
    console.log(`Output file created: ${fileStats.size} bytes`);
    
    // Validate file is not empty
    if (fileStats.size === 0) {
      throw new Error('FFmpeg created an empty file. The video may be corrupted.');
    }
    
    // Validate MP4 file header (check for 'ftyp' box at offset 4)
    try {
      const headerBuffer = fs.readFileSync(outputPath, { start: 0, end: 20 });
      // MP4 files start with size (4 bytes) then 'ftyp'
      const header = headerBuffer.toString('ascii', 4, 8);
      if (header !== 'ftyp' && header !== 'mdat') {
        console.warn('Warning: File header may be invalid. Expected "ftyp" or "mdat", got:', header);
        console.warn('First 20 bytes (hex):', headerBuffer.toString('hex'));
        // Don't throw error, but log warning - some players might still work
      } else {
        console.log('✓ MP4 file header validated:', header);
      }
    } catch (headerError) {
      console.warn('Could not validate file header:', headerError);
    }

    // Upload to S3/R2
    const fileBuffer = fs.readFileSync(outputPath);
    const fileName = `episodes/${episodeId}/renders/scene-${segmentNumber}-${Date.now()}.mp4`;
    const s3Url = await uploadBufferToS3(fileBuffer, fileName, 'video/mp4');

    // Clean up temp files
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    return NextResponse.json({
      success: true,
      url: s3Url,
      fileName: fileName.split('/').pop() || 'output.mp4'
    });

  } catch (error) {
    console.error('Error rendering video:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    const errorName = error instanceof Error ? error.name : 'Error';
    console.error('Error name:', errorName);
    console.error('Error message:', errorMessage);
    console.error('Error stack:', errorStack);
    
    // Clean up temp files on error
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.warn('Error cleaning up temp directory:', cleanupError);
      }
    }
    
    // Check if it's a serverless environment error
    if (errorMessage.includes('serverless') || errorMessage.includes('not available')) {
      return NextResponse.json(
        {
          error: 'Video rendering not available in serverless environment',
          details: 'FFmpeg requires system binaries which are not available in serverless functions. Please use a separate rendering service.',
          suggestion: 'See DEPLOYMENT_VIDEO_RENDERING.md for setup instructions.'
        },
        { status: 503 }
      );
    }
    
    return NextResponse.json(
      { 
        error: 'Failed to render video',
        details: errorMessage,
        name: errorName,
        stack: process.env.NODE_ENV === 'development' ? errorStack : undefined
      },
      { status: 500 }
    );
  }
}
