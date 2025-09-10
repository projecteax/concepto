# Cloudflare R2 Setup Guide

This guide will help you set up Cloudflare R2 for file storage in the Concepto app.

## 1. Create a Cloudflare Account

If you don't have a Cloudflare account, create one at [cloudflare.com](https://cloudflare.com).

## 2. Create an R2 Bucket

1. Go to the [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **R2 Object Storage** in the sidebar
3. Click **"Create bucket"**
4. Choose a unique bucket name (e.g., `concepto-app`)
5. Click **"Create bucket"**

## 3. Configure Bucket Settings

### A. Enable Public Access
1. Go to your bucket → **Settings** tab
2. Scroll down to **"Public access"**
3. Click **"Allow Access"**
4. Choose **"Custom Domain"** or **"R2.dev subdomain"**
5. If using R2.dev subdomain, note the public URL (e.g., `https://pub-xxxxx.r2.dev`)

### B. CORS Configuration (if needed)
1. Go to your bucket → **Settings** tab
2. Scroll down to **"CORS policy"**
3. Add this CORS configuration:

```json
[
    {
        "AllowedHeaders": ["*"],
        "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
        "AllowedOrigins": [
            "http://localhost:3000",
            "https://localhost:3000",
            "http://127.0.0.1:3000",
            "https://127.0.0.1:3000"
        ],
        "ExposeHeaders": ["ETag", "x-amz-meta-custom-header"],
        "MaxAgeSeconds": 3000
    }
]
```

## 4. Create R2 API Token

1. Go to **R2 Object Storage** → **Manage R2 API tokens**
2. Click **"Create API token"**
3. Choose **"Custom token"**
4. Configure the token:
   - **Token name**: `concepto-app-token`
   - **Permissions**: 
     - **Object Read**: Allow
     - **Object Write**: Allow
     - **Object Delete**: Allow
   - **Bucket**: Select your bucket (`concepto-app`)
5. Click **"Create API token"**
6. **Save the Access Key ID and Secret Access Key** - you'll need these!

## 5. Get Your Account ID

1. Go to the right sidebar in your Cloudflare dashboard
2. Find your **Account ID** (it looks like: `ddc632af164a719a57095720365dbff6`)
3. Note this down - you'll need it for the endpoint URL

## 6. Configure Environment Variables

Create a `.env.local` file in your project root:

```env
# Cloudflare R2 Configuration
NEXT_PUBLIC_R2_REGION=auto
NEXT_PUBLIC_R2_BUCKET=concepto-app
NEXT_PUBLIC_R2_ACCESS_KEY_ID=your-access-key-id
NEXT_PUBLIC_R2_SECRET_ACCESS_KEY=your-secret-access-key
NEXT_PUBLIC_R2_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
NEXT_PUBLIC_R2_PUBLIC_URL=https://pub-your-public-domain.r2.dev
```

Replace the values with your actual R2 credentials.

## 7. Test the Setup

1. Restart your development server: `npm run dev`
2. Go to `http://localhost:3000`
3. Navigate to a character's detail page
4. Try uploading an image in the "Pose & Concepts" tab
5. Check your R2 bucket to see if the file was uploaded

## Benefits of Cloudflare R2

- **Cost-effective**: Often cheaper than AWS S3
- **No egress fees**: Free data transfer out
- **S3-compatible**: Works with existing S3 SDKs
- **Global CDN**: Fast access worldwide
- **Simple setup**: Easier than AWS S3 configuration

## Troubleshooting

### "Access Denied" Error
- Check your API token permissions
- Verify the bucket name is correct
- Ensure the bucket allows public access

### "CORS Error" 
- Make sure CORS is configured in your bucket settings
- Check that your localhost URLs are in the allowed origins

### Upload Fails
- Verify your endpoint URL includes your account ID
- Check that your access keys are correct
- Ensure the bucket exists and is accessible

## File Organization

Uploaded files will be organized in R2 as:
```
your-bucket/
├── characters/
│   └── character-id/
│       ├── main/
│       │   └── timestamp-randomid.jpg
│       └── concepts/
│           └── timestamp-randomid.jpg
└── other-assets/
    └── ...
```

This keeps files organized by character and type.
