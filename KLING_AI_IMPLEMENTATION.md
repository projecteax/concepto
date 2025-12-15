# Kling AI Video Generation - Implementation Guide

## Overview
This document describes the complete implementation of Kling AI video generation in the Concepto application.

## Key Findings & Solutions

### 1. **Correct API Endpoint**
- ❌ **WRONG**: `/v1/image-to-video` (returns 404)
- ✅ **CORRECT**: `/v1/videos/image2video`
- Status check endpoint: `/v1/videos/image2video/{taskId}`

### 2. **Request Body Format**
Kling AI expects **snake_case** field names:

**Single Image Mode:**
```json
{
  "model_name": "kling-v2-5-turbo",
  "image": "https://example.com/image.jpg",
  "prompt": "Your prompt here",
  "negative_prompt": "",
  "mode": "std",
  "duration": "5"
}
```

**Start + End Frames Mode:**
```json
{
  "model_name": "kling-v2-5-turbo",
  "image": "https://example.com/start-frame.jpg",
  "image_tail": "https://example.com/end-frame.jpg",
  "prompt": "Your prompt here",
  "negative_prompt": "",
  "mode": "pro",
  "duration": "10"
}
```

**⚠️ Important:** `cfg_scale` is **NOT** supported by Kling v2.x models (including v2-5-turbo). Only use cfg_scale with v1.x models.

**Key Fields:**
- `model_name` (optional): Defaults to `"kling-v1"`. Available: `kling-v1`, `kling-v1-5`, `kling-v1-6`, `kling-v2-master`, `kling-v2-1`, `kling-v2-1-master`, `kling-v2-5-turbo`
- `image` (required): Main/start frame URL or Base64 (without `data:image/` prefix)
- `image_tail` (optional): End frame URL or Base64 (for frame interpolation)
- `prompt` (optional): Positive text prompt (max 2500 characters)
- `negative_prompt` (optional): Negative text prompt (max 2500 characters)
- `mode` (required): `"std"` for Standard or `"pro"` for Pro mode
- `duration` (required): `"5"` or `"10"` (string, not number)
- `cfg_scale` (v1.x ONLY): Configuration scale [0, 1] - **NOT supported by v2.x models**

**NOT** this format:
```json
{
  "model": "kling-v2-5-turbo",
  "image_url": "...",  // ❌ Wrong
  "image_urls": ["..."],  // ❌ Wrong
  "aspect_ratio": "16:9",  // ❌ Not used
  "sound": false  // ❌ Not used
}
```

### 3. **JWT Authentication**
Matches Java/Python implementation exactly:

```javascript
const now = Math.floor(Date.now() / 1000);
const payload = {
  iss: accessKey,           // Issuer: access key
  exp: now + 1800,          // Expires: current time + 30 minutes
  nbf: now - 5,             // Not before: current time - 5 seconds
};

const token = jwt.sign(payload, secretKey, {
  algorithm: 'HS256',
  header: {
    alg: 'HS256',
    typ: 'JWT',
  },
});

// Authorization header
Authorization: `Bearer ${token}`
```

### 4. **Response Format**
All Kling AI responses follow this structure:

```json
{
  "code": 0,              // 0 = success
  "message": "SUCCEED",
  "request_id": "...",
  "data": {
    "task_id": "...",
    "task_status": "submitted",  // submitted -> processing -> succeed/failed
    "task_result": {
      "videos": [
        {
          "url": "https://...",  // Final video URL
          "duration": 5
        }
      ]
    },
    "task_status_msg": "...",
    "created_at": 1234567890,
    "updated_at": 1234567890
  }
}
```

### 5. **Task Status Values**
- `submitted` - Task submitted successfully
- `processing` - Video generation in progress
- `succeed` - Video generation complete ✅
- `failed` - Video generation failed ❌

**NOT** `SUCCESS` or `FAILED` (wrong casing)

### 6. **Video URL Extraction**
```javascript
const videos = taskData.task_result?.videos || [];
const videoUrl = videos[0]?.url;
```

**NOT** `taskData.video_url` or `taskData.result.video_url`

## Environment Variables

Add to `.env.local`:

```bash
# Option 1: Single API Key (if available)
NEXT_PUBLIC_KLING_API_KEY=your_api_key_here

# Option 2: Access Key + Secret Key (for JWT authentication)
KLING_ACCESS_KEY=AdtFCTKDfPBfMYYfMg43fbJNdMFnF8rp
KLING_SECRET_KEY=8A4RRfkb4fmrLe93BrHCM43bGRmNgLMm

# Optional: Custom API base URL (default: https://api-singapore.klingai.com)
KLING_API_BASE_URL=https://api-singapore.klingai.com
```

## Implementation Files

### Modified Files:
1. **`src/app/api/gemini/generate-video/route.ts`**
   - Added JWT authentication with `jsonwebtoken` library
   - Updated endpoint to `/v1/videos/image2video`
   - Changed request body format to snake_case
   - Fixed status polling endpoint and response parsing
   - Updated task status values (`succeed` instead of `SUCCESS`)
   - Fixed video URL extraction path

2. **`src/components/ImageGenerationDialog.tsx`**
   - Added Kling AI model option ("Kling v2.5 Turbo")
   - Added `klingDuration` state for 5s/10s selection
   - Modified duration UI to show only 5s and 10s buttons for Kling
   - Updated request body to include `klingDuration`

3. **`env.example`**
   - Added Kling AI environment variable documentation
   - Documented both authentication methods

4. **`package.json`**
   - Added `jsonwebtoken` dependency

## Testing Results

✅ **JWT Generation**: Working correctly, matches Java/Python implementation
✅ **API Endpoint**: `/v1/videos/image2video` responds with 200 OK
✅ **Request Format**: Accepts snake_case keys correctly
✅ **Status Polling**: `/v1/videos/image2video/{taskId}` returns task status
✅ **Response Parsing**: Successfully extracts task_id and task_status

## Mode Options
- **Standard (`std`)**: Faster generation, good quality
- **Pro (`pro`)**: Slower generation, higher quality

Users can select the mode in the UI before generating.

## Duration Options
- Kling AI **only** supports **5 seconds** or **10 seconds**
- No other durations are available
- Duration must be passed as a **string**: `"5"` or `"10"`

## Frame Options
- **Single Image**: Use only `image` field (main image or reference)
  - ✅ Works with: Standard mode (5s or 10s), Pro mode (5s or 10s)
- **Start + End Frames**: Use `image` (start) and `image_tail` (end) for frame interpolation
  - ✅ **ONLY** works with: **Pro mode + 10 seconds**
  - ❌ Not supported: Standard mode (any duration), Pro mode + 5s
- At least one of `image` or `image_tail` must be provided
- Cannot use `image`+`image_tail` with dynamic masks or camera control

### Important Constraint
The `image_tail` parameter for start+end frame interpolation has strict requirements:
```
model: kling-v2-5-turbo
mode: pro (required)
duration: "10" (required)
image: start frame URL
image_tail: end frame URL
```

If you try to use `image_tail` with Standard mode or 5s duration, you'll get:
```
Error: model/mode/duration(kling-v2-5-turbo/std/5) is not supported with image_tail
```

## Model Information
- **Model Name**: `kling-v2-5-turbo`
- **Input**: Single image URL (primary frame)
- **Output**: Video URL in `task_result.videos[0].url`
- **Processing Time**: Varies, typically 1-10 minutes
- **Max Polling**: 20 minutes (120 attempts × 10 seconds)

## Common Issues & Solutions

### Issue 1: 404 Not Found
**Cause**: Using wrong endpoint `/v1/image-to-video`
**Solution**: Use `/v1/videos/image2video` (no hyphen in "image2video")

### Issue 2: 400 Bad Request - "Failed to resolve the request body"
**Cause**: Using camelCase or wrong field names
**Solution**: Use snake_case: `model_name`, `negative_prompt`, `cfg_scale`

### Issue 3: "image can not be null"
**Cause**: Using `image_url` or `image_urls` instead of `image`
**Solution**: Use single field `image` with a string URL

### Issue 4: "No message available"
**Cause**: Error not being caught and formatted properly
**Solution**: All errors now wrapped in try-catch with proper JSON response

## Next Steps

The implementation is now complete and ready to test in the UI:

1. Start the development server: `npm run dev`
2. Navigate to a shot with images
3. Select "Kling v2.5 Turbo" from the video model dropdown
4. Choose duration (5s or 10s)
5. Click "Generate Video"
6. Monitor the console for detailed logs

## Logging

The implementation includes comprehensive logging:
- ✅ Credentials check
- ✅ JWT generation
- ✅ API request details
- ✅ Response status
- ✅ Task polling progress
- ✅ Final video URL

Check the terminal/console for detailed debug information.

