# Deployment Guide

## Environment Variables Setup

The application requires several environment variables to be set in your deployment platform (Vercel, Netlify, etc.).

### Required Environment Variables

Copy these from your local `.env.local` file and set them in your deployment platform:

```bash
# Gemini API Configuration
NEXT_PUBLIC_GEMINI_API_KEY=your_gemini_api_key

# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id

# Cloudflare R2 Configuration (for file uploads)
NEXT_PUBLIC_R2_REGION=auto
NEXT_PUBLIC_R2_BUCKET=your-r2-bucket-name
NEXT_PUBLIC_R2_ACCESS_KEY_ID=your-r2-access-key-id
NEXT_PUBLIC_R2_SECRET_ACCESS_KEY=your-r2-secret-access-key
NEXT_PUBLIC_R2_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
NEXT_PUBLIC_R2_PUBLIC_URL=https://pub-your-public-domain.r2.dev
```

### Setting Environment Variables in Vercel

1. Go to your Vercel dashboard
2. Select your project
3. Go to Settings → Environment Variables
4. Add each variable with the exact name and value
5. Make sure to set them for all environments (Production, Preview, Development)
6. Redeploy your application

### Setting Environment Variables in Netlify

1. Go to your Netlify dashboard
2. Select your site
3. Go to Site settings → Environment variables
4. Add each variable with the exact name and value
5. Redeploy your site

### Verification

After setting the environment variables and redeploying:

1. Check the browser console for R2 configuration logs
2. Look for "✅ Proceeding with R2 upload..." instead of "❌ S3/R2 not configured"
3. Try uploading an image to verify it works

### Troubleshooting

If you see "❌ S3/R2 not configured" in the console:

1. Verify all environment variables are set correctly
2. Check that variable names match exactly (case-sensitive)
3. Ensure no trailing spaces in variable values
4. Redeploy after making changes

### Fallback Behavior

If R2 is not configured, the application will:
- Store images as data URLs temporarily
- Show a warning in the console
- Still function but images won't be persistent across sessions

## Build and Deploy

```bash
# Build the application
npm run build

# Deploy (if using Vercel CLI)
vercel --prod

# Or push to your connected Git repository
git push origin main
```

## Post-Deployment Checklist

- [ ] Environment variables are set
- [ ] Application builds successfully
- [ ] Image uploads work (check console for R2 logs)
- [ ] Character concept editing saves to database
- [ ] All asset detail pages load correctly
