# Video Rendering Deployment Guide

## Overview

The AV Preview video rendering feature uses **FFmpeg with bundled binaries** for local development. For serverless deployments (Vercel, etc.), a separate rendering service is required.

## How It Works

- **Local Development**: Uses `fluent-ffmpeg` with `@ffmpeg-installer/ffmpeg` (bundled binaries)
- **Production/Serverless**: Detects serverless environment and returns helpful error message
- Requires system-level FFmpeg binaries (not available in serverless)

## Deployment

### Local Development

✅ **Works automatically!** The bundled FFmpeg binaries are included with the package.

### Vercel / Serverless Platforms

❌ **Not supported directly** - Serverless functions cannot execute FFmpeg binaries.

**Solutions:**

1. **Separate Rendering Service** (Recommended)
   - Deploy a Docker container with FFmpeg
   - Use a VPS or dedicated server
   - Call the service from your Next.js API

2. **Cloud Video APIs**
   - AWS MediaConvert
   - Cloudflare Stream
   - Mux
   - Video.js Cloud

3. **Hybrid Approach**
   - Client-side rendering for short videos (using FFmpeg.wasm in browser)
   - Server-side for longer videos (separate service)

### Custom CDN (Optional)

If you want to use your own CDN or bundle the WASM files:

1. Set environment variable:
   ```bash
   NEXT_PUBLIC_FFMPEG_BASE_URL=https://your-cdn.com/ffmpeg
   ```

2. Ensure these files are accessible:
   - `ffmpeg-core.js`
   - `ffmpeg-core.wasm`

### Docker / Self-Hosted

Works the same way - no special configuration needed. The WASM files are fetched at runtime.

## Performance Considerations

- **Memory**: WASM FFmpeg uses more memory than native FFmpeg
- **Speed**: Slightly slower than native FFmpeg, but acceptable for most use cases
- **Timeout**: Vercel Pro plan has 60s timeout (may need to increase for long videos)
- **File Size**: WASM files are ~25MB total (loaded once per function invocation)

## Limitations

1. **Execution Time**: 
   - Vercel Hobby: 10 seconds (may be too short for video rendering)
   - Vercel Pro: 60 seconds (should work for most videos)
   - Consider upgrading to Pro plan or using a separate rendering service for long videos

2. **Memory**:
   - Vercel Hobby: 1024 MB
   - Vercel Pro: 3008 MB
   - Large videos may hit memory limits

3. **Cold Starts**: 
   - First request may be slower due to WASM loading
   - Subsequent requests in the same function instance are faster

## Troubleshooting

### "Failed to load FFmpeg" Error

1. Check network connectivity (CDN must be accessible)
2. Verify `NEXT_PUBLIC_FFMPEG_BASE_URL` is set correctly if using custom CDN
3. Check server logs for detailed error messages

### Timeout Errors

- Video rendering is taking too long
- Solutions:
  - Upgrade to Vercel Pro (60s timeout)
  - Use a separate rendering service (see alternative solutions)
  - Optimize video length or resolution

### Memory Errors

- Video is too large or complex
- Solutions:
  - Reduce video resolution (use 720p instead of 1080p)
  - Split rendering into smaller chunks
  - Use a separate rendering service with more memory

## Alternative Solutions

If WASM FFmpeg doesn't meet your needs:

1. **Separate Rendering Service**: Docker container with native FFmpeg
2. **Cloud Video APIs**: AWS MediaConvert, Cloudflare Stream, Mux
3. **Queue-Based**: Use job queue (BullMQ, AWS SQS) with worker service

## Environment Variables

```bash
# Optional: Custom FFmpeg WASM CDN URL
NEXT_PUBLIC_FFMPEG_BASE_URL=https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd
```

## Testing

After deployment, test video rendering:
1. Go to an episode's AV Preview tab
2. Select a scene
3. Click "Render Video"
4. Check that the video downloads successfully

If you encounter issues, check:
- Server logs in Vercel dashboard
- Browser console for client-side errors
- Network tab for failed requests

