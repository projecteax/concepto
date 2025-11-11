import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';

// Helper to convert seconds to FCP timecode format (HH:MM:SS:FF)
function secondsToTimecode(seconds: number, fps: number = 25): string {
  const totalFrames = Math.floor(seconds * fps);
  const hours = Math.floor(totalFrames / (fps * 3600));
  const minutes = Math.floor((totalFrames % (fps * 3600)) / (fps * 60));
  const secs = Math.floor((totalFrames % (fps * 60)) / fps);
  const frames = totalFrames % fps;
  
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
}

// Helper to convert seconds to FCP duration format
function secondsToDuration(seconds: number, fps: number = 25): string {
  const totalFrames = Math.floor(seconds * fps);
  return `${totalFrames}/${fps}s`;
}

// Generate FCP XML
function generateFCPXML(
  slides: Array<{ id: string; imageUrl: string; duration: number; startTime: number; order: number }>,
  audioTracks: Array<{ id: string; audioUrl: string; startTime: number; duration: number; order: number }>,
  totalDuration: number,
  episodeId: string,
  imageFileNameMap: Map<string, string>,
  audioFileNameMap: Map<string, string>
): string {
  const fps = 25;
  const timecode = secondsToTimecode(0, fps);
  const duration = secondsToDuration(totalDuration, fps);
  
  // Sort slides and audio by start time
  const sortedSlides = [...slides].sort((a, b) => a.startTime - b.startTime);
  const sortedAudio = [...audioTracks].sort((a, b) => a.startTime - b.startTime);
  
  // Generate asset elements
  const imageAssets = sortedSlides.map((slide, index) => {
    const fileName = imageFileNameMap.get(slide.imageUrl) || `image-${index + 1}.jpg`;
    return `
      <asset id="r${index + 1}" name="${fileName}" uid="..." src="media/${fileName}" start="${secondsToTimecode(0, fps)}" duration="${secondsToDuration(slide.duration, fps)}" hasVideo="1" format="r1" hasAudio="0"/>
    `;
  }).join('');
  
  const audioAssets = sortedAudio.map((track, index) => {
    const fileName = audioFileNameMap.get(track.audioUrl) || `audio-${index + 1}.mp3`;
    return `
      <asset id="r${sortedSlides.length + index + 1}" name="${fileName}" uid="..." src="media/${fileName}" start="${secondsToTimecode(0, fps)}" duration="${secondsToDuration(track.duration, fps)}" hasVideo="0" format="r1" hasAudio="1"/>
    `;
  }).join('');
  
  // Generate clip elements for slides
  const slideClips = sortedSlides.map((slide, index) => {
    const fileName = imageFileNameMap.get(slide.imageUrl) || `image-${index + 1}.jpg`;
    const offset = secondsToTimecode(slide.startTime, fps);
    const clipDuration = secondsToDuration(slide.duration, fps);
    return `
      <clip id="r${index + 1}" name="${fileName}">
        <file id="r${index + 1}" name="${fileName}" uid="..." path="media/${fileName}" timecode="${timecode}" format="r1" tcStart="${timecode}" tcEnd="${secondsToTimecode(slide.duration, fps)}"/>
        <sourcetrack>
          <mediatype video="1" audio="0"/>
        </sourcetrack>
        <filter>
          <effect id="r${index + 1}" name="Transform"/>
        </filter>
      </clip>
    `;
  }).join('');
  
  // Generate clip elements for audio
  const audioClips = sortedAudio.map((track, index) => {
    const fileName = audioFileNameMap.get(track.audioUrl) || `audio-${index + 1}.mp3`;
    const offset = secondsToTimecode(track.startTime, fps);
    const clipDuration = secondsToDuration(track.duration, fps);
    return `
      <clip id="r${sortedSlides.length + index + 1}" name="${fileName}" offset="${offset}" duration="${clipDuration}">
        <file id="r${sortedSlides.length + index + 1}" name="${fileName}" uid="..." path="media/${fileName}" timecode="${timecode}" format="r1" tcStart="${timecode}" tcEnd="${secondsToTimecode(track.duration, fps)}"/>
        <sourcetrack>
          <mediatype video="0" audio="1"/>
        </sourcetrack>
      </clip>
    `;
  }).join('');
  
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.9">
  <resources>
    <format id="r1" name="FFVideoFormat1080p25" frameDuration="1/25s" width="1920" height="1080" colorSpace="1-1-1 (Rec. 709)"/>
    ${imageAssets}
    ${audioAssets}
  </resources>
  <library>
    <event name="Episode ${episodeId}">
      <project name="AV Editing Export">
        <sequence format="r1" tcStart="${timecode}" tcFormat="NDF" audioLayout="stereo" audioRate="48k">
          <spine>
            ${slideClips}
          </spine>
          <audio>
            ${audioClips}
          </audio>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>`;
  
  return xml;
}

// Download a file (server-side, no CORS issues)
async function downloadFile(url: string): Promise<Buffer | null> {
  try {
    // Handle data URLs
    if (url.startsWith('data:')) {
      const base64Data = url.split(',')[1];
      if (base64Data) {
        return Buffer.from(base64Data, 'base64');
      }
      return null;
    }
    
    // Fetch the file (server-side has no CORS restrictions)
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Concepto/1.0)',
      },
    });
    
    if (!response.ok) {
      console.error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
      return null;
    }
    
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error(`Error downloading ${url}:`, error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { slides, audioTracks, totalDuration, episodeId } = body;
    
    if (!slides || !Array.isArray(slides)) {
      return NextResponse.json({ error: 'Invalid slides data' }, { status: 400 });
    }
    
    console.log(`📦 Server-side export: ${slides.length} slides, ${audioTracks?.length || 0} audio tracks`);
    
    const zip = new JSZip();
    
    // Generate filename mapping
    const generateFileName = (url: string, type: 'image' | 'audio', index: number): string => {
      const urlParts = url.split('/');
      const originalFileName = urlParts[urlParts.length - 1].split('?')[0];
      const extension = originalFileName.includes('.') 
        ? originalFileName.split('.').pop()?.toLowerCase() || (type === 'image' ? 'jpg' : 'mp3')
        : (type === 'image' ? 'jpg' : 'mp3');
      return `${type}-${index + 1}.${extension}`;
    };
    
    // Collect unique URLs
    const uniqueImageUrls: string[] = Array.from(new Set(slides.filter((s: { imageUrl?: string }) => s.imageUrl).map((s: { imageUrl: string }) => s.imageUrl)));
    const uniqueAudioUrls: string[] = Array.from(new Set((audioTracks || []).filter((t: { audioUrl?: string }) => t.audioUrl).map((t: { audioUrl: string }) => t.audioUrl)));
    
    const imageFileNameMap = new Map<string, string>();
    uniqueImageUrls.forEach((url, index) => {
      imageFileNameMap.set(url, generateFileName(url, 'image', index));
    });
    
    const audioFileNameMap = new Map<string, string>();
    uniqueAudioUrls.forEach((url, index) => {
      audioFileNameMap.set(url, generateFileName(url, 'audio', index));
    });
    
    // Download images (server-side, no CORS)
    console.log(`📥 Downloading ${uniqueImageUrls.length} images server-side...`);
    const imagePromises = uniqueImageUrls.map(async (imageUrl: string, index: number) => {
      console.log(`  Downloading image ${index + 1}/${uniqueImageUrls.length}: ${imageUrl}`);
      const buffer = await downloadFile(imageUrl);
      if (buffer) {
        const fileName = imageFileNameMap.get(imageUrl)!;
        zip.file(`media/${fileName}`, buffer);
        console.log(`  ✅ Added image: ${fileName} (${(buffer.length / 1024).toFixed(2)} KB)`);
        return { originalUrl: imageUrl, fileName };
      }
      console.warn(`  ⚠️ Failed to download image: ${imageUrl}`);
      return null;
    });
    
    // Download audio files (server-side, no CORS)
    console.log(`📥 Downloading ${uniqueAudioUrls.length} audio files server-side...`);
    const audioPromises = uniqueAudioUrls.map(async (audioUrl: string, index: number) => {
      console.log(`  Downloading audio ${index + 1}/${uniqueAudioUrls.length}: ${audioUrl}`);
      const buffer = await downloadFile(audioUrl);
      if (buffer) {
        const fileName = audioFileNameMap.get(audioUrl)!;
        zip.file(`media/${fileName}`, buffer);
        console.log(`  ✅ Added audio: ${fileName} (${(buffer.length / 1024).toFixed(2)} KB)`);
        return { originalUrl: audioUrl, fileName };
      }
      console.warn(`  ⚠️ Failed to download audio: ${audioUrl}`);
      return null;
    });
    
    // Wait for all downloads
    const imageResults = await Promise.allSettled(imagePromises);
    const audioResults = await Promise.allSettled(audioPromises);
    
    const successfulImages = imageResults
      .filter((r): r is PromiseFulfilledResult<{ originalUrl: string; fileName: string }> => 
        r.status === 'fulfilled' && r.value !== null
      )
      .map(r => r.value);
    
    const successfulAudios = audioResults
      .filter((r): r is PromiseFulfilledResult<{ originalUrl: string; fileName: string }> => 
        r.status === 'fulfilled' && r.value !== null
      )
      .map(r => r.value);
    
    console.log(`✅ Downloaded ${successfulImages.length}/${uniqueImageUrls.length} images and ${successfulAudios.length}/${uniqueAudioUrls.length} audio files`);
    
    if (successfulImages.length === 0 && successfulAudios.length === 0) {
      return NextResponse.json({ error: 'Failed to download any media files' }, { status: 500 });
    }
    
    // Generate FCP XML
    const xmlContent = generateFCPXML(
      slides,
      audioTracks || [],
      totalDuration,
      episodeId,
      imageFileNameMap,
      audioFileNameMap
    );
    zip.file('timeline.fcpxml', xmlContent);
    
    // Generate ZIP
    console.log('📦 Generating ZIP file...');
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    
    // Convert Buffer to Uint8Array for NextResponse
    const uint8Array = new Uint8Array(zipBuffer);
    
    // Return ZIP as download
    return new NextResponse(uint8Array, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="av-editing-export-${episodeId}-${Date.now()}.zip"`,
      },
    });
  } catch (error) {
    console.error('❌ Error in export API:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

