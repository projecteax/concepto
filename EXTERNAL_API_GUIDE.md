# External API Guide for Blender Plugin

## Overview

This API allows external applications (like a Blender plugin) to interact with the Concepto app to:
- Fetch episode and shot data
- Update shot information (audio, visual, images)
- Upload/replace images (main image, start frame, end frame)

## How It Works

### 1. Authentication
The API uses **API Key authentication**. You'll need to:
1. Generate an API key in the Concepto app (stored in Firebase)
2. Include the API key in the `X-API-Key` header for all requests
3. The API validates the key before processing requests

### 2. Data Flow

```
Blender Plugin → API Request (with API Key) → Next.js API Route → Firebase → Response
```

### 3. What the Blender Plugin Needs

The plugin needs to capture and send:
- **Show ID**: Which show the episode belongs to
- **Episode ID**: Which episode contains the shot
- **Segment ID**: Which segment contains the shot
- **Shot ID**: The specific shot to update
- **Audio Text**: The audio/dialogue text
- **Visual Text**: The visual description
- **Main Image**: The rendered image to use as main
- **Start Frame**: First frame of the shot
- **End Frame**: Last frame of the shot

### 4. Workflow

1. **Setup Phase** (one-time):
   - User configures Blender plugin with:
     - API endpoint URL (e.g., `https://your-app.com/api/external`)
     - API Key
     - Show ID, Episode ID, Segment ID, Shot ID

2. **Capture Phase** (in Blender):
   - Plugin captures:
     - Current audio text from shot
     - Current visual text from shot
     - Rendered images (main, start frame, end frame)

3. **Render Phase** (when user clicks "Render" in Blender):
   - Plugin sends all captured data to API
   - API updates Firebase with new data
   - Images are uploaded to S3/R2
   - Shot is updated with new image URLs

## API Endpoints

### Base URL
```
https://your-app.com/api/external
```

### Authentication
All requests must include:
```
X-API-Key: your-api-key-here
```

### Endpoints

#### 1. Create API Key
```
POST /api/external/api-keys
Content-Type: application/json

Body:
{
  "name": "Blender Plugin Key"
}

Response:
{
  "success": true,
  "data": {
    "id": "key-id",
    "key": "ck_abc123...",  // SAVE THIS - only shown once!
    "name": "Blender Plugin Key",
    "createdAt": "2024-01-01T00:00:00Z"
  },
  "warning": "Save this API key now - it will not be shown again!"
}
```

#### 2. Get Episode Data
```
GET /api/external/episodes/:episodeId
Headers:
  X-API-Key: your-api-key

Response:
{
  "success": true,
  "data": {
    "id": "episode-id",
    "title": "Episode Title",
    "avScript": {
      "segments": [
        {
          "id": "segment-id",
          "segmentNumber": 1,
          "title": "Segment Title",
          "shots": [...]
        }
      ]
    }
  }
}
```

#### 3. Get Shot Data
```
GET /api/external/shots/:shotId
Headers:
  X-API-Key: your-api-key

Response:
{
  "success": true,
  "data": {
    "shot": {
      "id": "shot-id",
      "segmentId": "segment-id",
      "shotNumber": 1.1,
      "audio": "Audio text",
      "visual": "Visual description",
      "imageUrl": "https://...",
      ...
    },
    "episodeId": "episode-id",
    "segmentId": "segment-id"
  }
}
```

#### 4. Update Shot
```
PUT /api/external/shots/:shotId
Headers:
  X-API-Key: your-api-key
  Content-Type: application/json

Body:
{
  "audio": "Updated audio text",
  "visual": "Updated visual description",
  "wordCount": 50,  // optional
  "runtime": 3.5    // optional
}

Response:
{
  "success": true,
  "message": "Shot updated successfully"
}
```

#### 5. Upload Shot Images
```
POST /api/external/shots/:shotId/images
Headers:
  X-API-Key: your-api-key
  Content-Type: multipart/form-data

Form Data:
  - mainImage: File (optional) - Main image
  - startFrame: File (optional) - Start frame image
  - endFrame: File (optional) - End frame image

Response:
{
  "success": true,
  "message": "Images uploaded successfully",
  "data": {
    "mainImage": "https://...",
    "startFrame": "https://...",
    "endFrame": "https://..."
  }
}
```

## Data Structure

### Shot Object
```typescript
{
  id: string;
  segmentId: string;
  shotNumber: number;
  take: string;
  audio: string;           // Audio/dialogue text
  visual: string;           // Visual description
  imageUrl?: string;        // Main image URL
  startFrameUrl?: string;   // Start frame image URL
  endFrameUrl?: string;    // End frame image URL
  // ... other fields
}
```

## Image Upload Format

Images should be sent as:
- **Content-Type**: `multipart/form-data` or `application/json` with base64
- **Formats**: PNG, JPEG, WebP
- **Recommended**: PNG for best quality

## Error Handling

All errors return JSON:
```json
{
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

Common error codes:
- `UNAUTHORIZED`: Invalid or missing API key
- `NOT_FOUND`: Shot/Episode not found
- `VALIDATION_ERROR`: Invalid data format
- `UPLOAD_ERROR`: Image upload failed

## Rate Limiting

- 100 requests per minute per API key
- 1000 requests per hour per API key

## Security Considerations

1. **API Keys**: Store securely, never commit to version control
2. **HTTPS**: Always use HTTPS in production
3. **CORS**: API only accepts requests from configured origins
4. **Validation**: All input is validated and sanitized

## What Else Do You Need?

### 1. API Key Management UI (Optional but Recommended)
Create a UI in your app where users can:
- Generate new API keys
- View existing API keys (without showing the actual key)
- Revoke/deactivate API keys
- See usage statistics

**Location**: Could be in user settings or a dedicated "API Keys" page

### 2. Environment Variables
Make sure these are set in your production environment:
- `NEXT_PUBLIC_R2_BUCKET` - Your R2 bucket name
- `NEXT_PUBLIC_R2_ENDPOINT` - Your R2 endpoint URL
- `NEXT_PUBLIC_R2_ACCESS_KEY_ID` - R2 access key
- `NEXT_PUBLIC_R2_SECRET_ACCESS_KEY` - R2 secret key
- `NEXT_PUBLIC_R2_PUBLIC_URL` - Public URL for uploaded files

### 3. Firestore Collection Structure
The API expects a `apiKeys` collection in Firestore with this structure:
```typescript
{
  key: string;           // The actual API key
  userId: string;       // User who owns this key
  name: string;         // Human-readable name
  isActive: boolean;    // Whether key is active
  createdAt: Timestamp;
  lastUsedAt?: Timestamp;
}
```

### 4. CORS Configuration
If your Blender plugin runs in a browser context, configure CORS:
- Add your API domain to allowed origins
- Allow `X-API-Key` header
- Allow `Content-Type` header

### 5. Rate Limiting (Recommended)
Consider adding rate limiting to prevent abuse:
- Use a service like Upstash Redis
- Limit: 100 requests/minute per API key
- Limit: 1000 requests/hour per API key

### 6. Error Monitoring
Set up error tracking (e.g., Sentry) to monitor API errors

## Example Blender Plugin Flow

```python
# 1. Configure
api_key = "your-api-key"
base_url = "https://your-app.com/api/external"
shot_id = "shot-123"

# 2. Get current shot data
response = requests.get(
    f"{base_url}/shots/{shot_id}",
    headers={"X-API-Key": api_key}
)
shot_data = response.json()

# 3. Capture data in Blender
audio_text = get_audio_text()
visual_text = get_visual_text()
main_image = render_main_image()
start_frame = render_start_frame()
end_frame = render_end_frame()

# 4. Update shot
requests.put(
    f"{base_url}/shots/{shot_id}",
    headers={"X-API-Key": api_key},
    json={
        "audio": audio_text,
        "visual": visual_text
    }
)

# 5. Upload images
requests.post(
    f"{base_url}/shots/{shot_id}/images",
    headers={"X-API-Key": api_key},
    files={
        "mainImage": main_image_file,
        "startFrame": start_frame_file,
        "endFrame": end_frame_file
    }
)
```

## Blender Plugin Requirements

### What the Plugin Needs to Know:
1. **IDs to Capture**:
   - Show ID (from URL or user input)
   - Episode ID (from URL or user input)
   - Segment ID (from URL or user input)
   - Shot ID (from URL or user input)

2. **Data to Capture**:
   - Audio text box content
   - Visual text box content
   - Main rendered image (current frame or specific render)
   - Start frame image (first frame of shot)
   - End frame image (last frame of shot)

3. **When to Send**:
   - On "Render" button click
   - Optionally: Auto-save on changes

4. **Error Handling**:
   - Show user-friendly error messages
   - Retry failed uploads
   - Log errors for debugging

### Plugin Configuration UI:
The plugin should have a settings panel where users can:
- Enter API endpoint URL
- Enter API key
- Enter/select Show ID, Episode ID, Segment ID, Shot ID
- Test connection
- View last sync status

