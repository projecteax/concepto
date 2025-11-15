# External API Setup Summary

## ✅ What's Been Created

### 1. API Authentication System
- **File**: `src/lib/api-auth.ts`
- **Function**: Validates API keys from Firestore
- **How it works**: API keys are stored in Firestore `apiKeys` collection, validated on each request

### 2. API Endpoints Created

#### `/api/external/api-keys`
- **POST**: Create new API key
- **GET**: List user's API keys

#### `/api/external/episodes/:episodeId`
- **GET**: Fetch episode with all segments and shots

#### `/api/external/shots/:shotId`
- **GET**: Fetch specific shot data
- **PUT**: Update shot (audio, visual, metadata)

#### `/api/external/shots/:shotId/images`
- **POST**: Upload/replace images (main, start frame, end frame)

### 3. Server-Side S3 Upload
- **File**: `src/lib/s3-service-server.ts`
- **Function**: Handles file uploads from API routes to S3/R2

### 4. Documentation
- **File**: `EXTERNAL_API_GUIDE.md`
- **Contains**: Complete API documentation, examples, and setup instructions

## 🔧 How It Works

### Authentication Flow
1. User creates API key via `/api/external/api-keys` endpoint
2. API key is stored in Firestore with user ID
3. Blender plugin includes API key in `X-API-Key` header
4. Each API request validates the key before processing

### Data Flow
```
Blender Plugin
  ↓ (HTTP Request with API Key)
Next.js API Route
  ↓ (Validates API Key)
Firebase Firestore
  ↓ (Reads/Updates Data)
S3/R2 Storage
  ↓ (Uploads Images)
Response to Plugin
```

### Image Upload Flow
1. Plugin sends images as `multipart/form-data`
2. API route receives files
3. Files uploaded to S3/R2 with organized paths: `episodes/{episodeId}/shots/{shotId}/...`
4. URLs returned to plugin
5. Shot updated in Firestore with new image URLs

## 📋 What You Need to Do Next

### 1. Set Up Firestore Collection
Create the `apiKeys` collection in Firestore (it will be created automatically when first API key is generated, but you can pre-create it with security rules).

### 2. Create API Key Management UI (Optional)
Add a page in your app where users can:
- Generate API keys
- View their keys
- Revoke keys

**Suggested location**: User settings or a new "API Keys" section

### 3. Test the API
You can test using curl or Postman:

```bash
# Create API key
curl -X POST https://your-app.com/api/external/api-keys \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Key"}'

# Get shot data
curl -X GET https://your-app.com/api/external/shots/SHOT_ID \
  -H "X-API-Key: your-api-key"
```

### 4. Configure CORS (if needed)
If your Blender plugin makes requests from a browser, add CORS headers in `next.config.js`:

```javascript
async headers() {
  return [
    {
      source: '/api/external/:path*',
      headers: [
        { key: 'Access-Control-Allow-Origin', value: '*' },
        { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,OPTIONS' },
        { key: 'Access-Control-Allow-Headers', value: 'X-API-Key,Content-Type' },
      ],
    },
  ];
}
```

### 5. Add Rate Limiting (Recommended)
Consider adding rate limiting using:
- Upstash Redis
- Vercel Edge Config
- Or a middleware solution

### 6. Environment Variables
Ensure these are set in production:
- `NEXT_PUBLIC_R2_BUCKET`
- `NEXT_PUBLIC_R2_ENDPOINT`
- `NEXT_PUBLIC_R2_ACCESS_KEY_ID`
- `NEXT_PUBLIC_R2_SECRET_ACCESS_KEY`
- `NEXT_PUBLIC_R2_PUBLIC_URL`

## 🎯 For Blender Plugin Development

### Required Information
The plugin needs these IDs (can be captured from URL or user input):
- Show ID
- Episode ID
- Segment ID
- Shot ID

### What to Capture
- Audio text (from shot's audio field)
- Visual text (from shot's visual field)
- Main image (rendered frame)
- Start frame (first frame of shot)
- End frame (last frame of shot)

### API Calls to Make
1. **GET** `/api/external/shots/:shotId` - Get current shot data
2. **PUT** `/api/external/shots/:shotId` - Update audio/visual text
3. **POST** `/api/external/shots/:shotId/images` - Upload images

## 🔒 Security Notes

1. **API Keys**: Never commit API keys to version control
2. **HTTPS**: Always use HTTPS in production
3. **Validation**: All inputs are validated
4. **Firestore Rules**: Set up security rules for `apiKeys` collection:
   ```javascript
   match /apiKeys/{keyId} {
     allow read: if request.auth != null && request.auth.uid == resource.data.userId;
     allow create: if request.auth != null;
     allow update, delete: if request.auth != null && request.auth.uid == resource.data.userId;
   }
   ```

## 📝 Next Steps

1. Test the API endpoints
2. Create API key management UI
3. Set up Firestore security rules
4. Configure CORS if needed
5. Add rate limiting
6. Build your Blender plugin!

## 🐛 Troubleshooting

### "API key required" error
- Check that `X-API-Key` header is included
- Verify API key exists in Firestore
- Check that `isActive` is `true`

### "Shot not found" error
- Verify the shot ID is correct
- Check that the shot exists in an episode's AV script

### Image upload fails
- Check S3/R2 configuration
- Verify file size is within limits
- Check file format (PNG, JPEG, WebP)

### CORS errors
- Add CORS headers in `next.config.js`
- Check allowed origins
- Verify headers are allowed

