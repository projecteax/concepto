import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Helper function to check if a value is a placeholder
const isPlaceholder = (value: string | undefined): boolean => {
  if (!value) return true;
  return value.includes('your_') || value.includes('your-');
};

// Initialize S3 client for Cloudflare R2 dynamically
const getS3Client = () => {
  console.log('🔧 Creating S3 client with config:', {
    region: process.env.NEXT_PUBLIC_R2_REGION,
    endpoint: process.env.NEXT_PUBLIC_R2_ENDPOINT,
    accessKeyId: process.env.NEXT_PUBLIC_R2_ACCESS_KEY_ID ? 'SET' : 'NOT SET',
    secretAccessKey: process.env.NEXT_PUBLIC_R2_SECRET_ACCESS_KEY ? 'SET' : 'NOT SET',
    isRegionPlaceholder: isPlaceholder(process.env.NEXT_PUBLIC_R2_REGION),
    isEndpointPlaceholder: isPlaceholder(process.env.NEXT_PUBLIC_R2_ENDPOINT),
    isAccessKeyPlaceholder: isPlaceholder(process.env.NEXT_PUBLIC_R2_ACCESS_KEY_ID),
    isSecretKeyPlaceholder: isPlaceholder(process.env.NEXT_PUBLIC_R2_SECRET_ACCESS_KEY),
  });

  return new S3Client({
    region: (!isPlaceholder(process.env.NEXT_PUBLIC_R2_REGION)) 
      ? process.env.NEXT_PUBLIC_R2_REGION 
      : 'auto',
    endpoint: (!isPlaceholder(process.env.NEXT_PUBLIC_R2_ENDPOINT)) 
      ? process.env.NEXT_PUBLIC_R2_ENDPOINT 
      : '',
    credentials: {
      accessKeyId: (!isPlaceholder(process.env.NEXT_PUBLIC_R2_ACCESS_KEY_ID)) 
        ? process.env.NEXT_PUBLIC_R2_ACCESS_KEY_ID! 
        : 'dummy',
      secretAccessKey: (!isPlaceholder(process.env.NEXT_PUBLIC_R2_SECRET_ACCESS_KEY)) 
        ? process.env.NEXT_PUBLIC_R2_SECRET_ACCESS_KEY! 
        : 'dummy',
    },
    forcePathStyle: true, // Required for R2
    // Add additional configuration for R2
    useAccelerateEndpoint: false,
    disableHostPrefix: true,
  });
};

const getBucketName = () => {
  const bucketName = (!isPlaceholder(process.env.NEXT_PUBLIC_R2_BUCKET)) 
    ? process.env.NEXT_PUBLIC_R2_BUCKET 
    : '';
  console.log('🪣 Bucket name:', bucketName);
  return bucketName;
};

const getPublicUrl = () => {
  const publicUrl = (!isPlaceholder(process.env.NEXT_PUBLIC_R2_PUBLIC_URL)) 
    ? process.env.NEXT_PUBLIC_R2_PUBLIC_URL 
    : '';
  console.log('🌐 Public URL:', publicUrl);
  return publicUrl;
};

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface UploadResult {
  url: string;
  key: string;
  size: number;
}

/**
 * Upload a file to S3
 */
export async function uploadToS3(
  file: File,
  key: string
): Promise<UploadResult> {
  try {
    // Validate file
    if (!file) {
      throw new Error('No file provided');
    }

    // Get dynamic values
    const BUCKET_NAME = getBucketName();
    const PUBLIC_URL = getPublicUrl();

    // Check if S3/R2 is configured
    console.log('🔍 R2 Configuration Debug:', {
      BUCKET_NAME,
      R2_ENDPOINT: process.env.NEXT_PUBLIC_R2_ENDPOINT,
      R2_ACCESS_KEY_ID: process.env.NEXT_PUBLIC_R2_ACCESS_KEY_ID ? 'SET' : 'NOT SET',
      R2_SECRET_ACCESS_KEY: process.env.NEXT_PUBLIC_R2_SECRET_ACCESS_KEY ? 'SET' : 'NOT SET',
      isEndpointPlaceholder: isPlaceholder(process.env.NEXT_PUBLIC_R2_ENDPOINT),
      isAccessKeyPlaceholder: isPlaceholder(process.env.NEXT_PUBLIC_R2_ACCESS_KEY_ID),
      isSecretKeyPlaceholder: isPlaceholder(process.env.NEXT_PUBLIC_R2_SECRET_ACCESS_KEY)
    });
    
    console.log('🔍 Detailed Placeholder Check:', {
      endpoint: process.env.NEXT_PUBLIC_R2_ENDPOINT,
      accessKey: process.env.NEXT_PUBLIC_R2_ACCESS_KEY_ID,
      secretKey: process.env.NEXT_PUBLIC_R2_SECRET_ACCESS_KEY,
      endpointCheck: isPlaceholder(process.env.NEXT_PUBLIC_R2_ENDPOINT),
      accessKeyCheck: isPlaceholder(process.env.NEXT_PUBLIC_R2_ACCESS_KEY_ID),
      secretKeyCheck: isPlaceholder(process.env.NEXT_PUBLIC_R2_SECRET_ACCESS_KEY)
    });
    
    if (!BUCKET_NAME || !PUBLIC_URL || isPlaceholder(process.env.NEXT_PUBLIC_R2_ENDPOINT) || 
        isPlaceholder(process.env.NEXT_PUBLIC_R2_ACCESS_KEY_ID) || isPlaceholder(process.env.NEXT_PUBLIC_R2_SECRET_ACCESS_KEY)) {
      console.warn('❌ S3/R2 not configured properly, storing as data URL temporarily');
      console.log('❌ Fallback reason:', {
        noBucket: !BUCKET_NAME,
        noPublicUrl: !PUBLIC_URL,
        endpointPlaceholder: isPlaceholder(process.env.NEXT_PUBLIC_R2_ENDPOINT),
        accessKeyPlaceholder: isPlaceholder(process.env.NEXT_PUBLIC_R2_ACCESS_KEY_ID),
        secretKeyPlaceholder: isPlaceholder(process.env.NEXT_PUBLIC_R2_SECRET_ACCESS_KEY),
        environment: process.env.NODE_ENV,
        allEnvVars: {
          R2_BUCKET: process.env.NEXT_PUBLIC_R2_BUCKET,
          R2_ENDPOINT: process.env.NEXT_PUBLIC_R2_ENDPOINT,
          R2_ACCESS_KEY_ID: process.env.NEXT_PUBLIC_R2_ACCESS_KEY_ID ? 'SET' : 'NOT SET',
          R2_SECRET_ACCESS_KEY: process.env.NEXT_PUBLIC_R2_SECRET_ACCESS_KEY ? 'SET' : 'NOT SET',
          R2_PUBLIC_URL: process.env.NEXT_PUBLIC_R2_PUBLIC_URL
        }
      });
      
      // Fallback: convert to data URL
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          resolve({
            url: reader.result as string,
            key: key,
            size: file.size,
          });
        };
        reader.readAsDataURL(file);
      });
    }

    console.log('✅ Proceeding with R2 upload...');
    
    // Convert File to ArrayBuffer to avoid stream issues
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Create upload command
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: uint8Array,
      ContentType: file.type,
      ContentLength: file.size,
      // Add metadata (ensure ASCII-only characters)
      Metadata: {
        originalName: file.name.replace(/[^\x00-\x7F]/g, ''), // Remove non-ASCII characters
        uploadedAt: new Date().toISOString(),
      },
    });

    // Upload file
    console.log('🚀 Starting S3 upload...', { key, bucket: BUCKET_NAME });
    const s3Client = getS3Client();
    
    try {
      const response = await s3Client.send(command);
      console.log('✅ S3 upload successful!', { response });

      if (!response.ETag) {
        throw new Error('Upload failed - no ETag returned');
      }

      // Generate public URL using R2 public domain
      const url = `${PUBLIC_URL}/${key}`;
      console.log('🔗 Generated public URL:', url);
      console.log('🔍 URL construction debug:', {
        PUBLIC_URL,
        key,
        fullUrl: url,
        publicUrlType: typeof PUBLIC_URL,
        keyType: typeof key,
        publicUrlLength: PUBLIC_URL?.length,
        keyLength: key?.length
      });

      // Validate URL format
      if (!url.startsWith('http')) {
        console.error('❌ Invalid URL format:', url);
        throw new Error(`Invalid public URL format: ${url}`);
      }

      return {
        url,
        key,
        size: file.size,
      };
    } catch (uploadError) {
      console.error('❌ S3 upload failed:', uploadError);
      throw uploadError;
    }
  } catch (error) {
    console.error('S3 upload error:', error);
    throw new Error(`Failed to upload file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Delete a file from S3
 */
export async function deleteFromS3(key: string): Promise<void> {
  try {
    const BUCKET_NAME = getBucketName();
    if (!BUCKET_NAME) {
      throw new Error('S3 bucket name not configured');
    }

    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const s3Client = getS3Client();
    await s3Client.send(command);
  } catch (error) {
    console.error('S3 delete error:', error);
    throw new Error(`Failed to delete file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generate a unique key for file uploads
 */
export function generateFileKey(prefix: string, fileName: string, customName?: string): string {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 15);
  const extension = fileName.split('.').pop() || '';
  // Remove trailing slash from prefix if it exists to avoid double slashes
  const cleanPrefix = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
  
  // If customName is provided, use it; otherwise use timestamp-randomId
  const namePart = customName 
    ? `${customName}_${timestamp}-${randomId}` 
    : `${timestamp}-${randomId}`;
  
  const key = `${cleanPrefix}/${namePart}.${extension}`;
  console.log('🔑 Generated file key:', { prefix, cleanPrefix, fileName, customName, key });
  return key;
}

/**
 * Generate a structured filename for AI reference images
 * @param assetName - The name of the asset (character, location, or gadget)
 * @param category - The category of reference (e.g., 'full_body', 'ref01', 'full_gadget')
 * @param extension - File extension
 * @returns Structured filename like "character_name_full_body.jpg"
 */
export function generateStructuredFileName(assetName: string, category: string, extension: string): string {
  // Sanitize asset name: remove special characters, convert to lowercase, replace spaces with underscores
  const sanitizedName = assetName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remove special characters
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/_+/g, '_') // Replace multiple underscores with single
    .replace(/^_|_$/g, ''); // Remove leading/trailing underscores
  
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 8);
  
  return `${sanitizedName}_${category}_${timestamp}-${randomId}.${extension}`;
}

/**
 * Generate a presigned URL for direct uploads (alternative approach)
 */
export async function generatePresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn: number = 3600
): Promise<string> {
  try {
    const BUCKET_NAME = getBucketName();
    if (!BUCKET_NAME) {
      throw new Error('S3 bucket name not configured');
    }

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    });

    const s3Client = getS3Client();
    return await getSignedUrl(s3Client, command, { expiresIn });
  } catch (error) {
    console.error('Presigned URL generation error:', error);
    throw new Error(`Failed to generate presigned URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Validate file before upload
 */
export function validateFile(file: File): { valid: boolean; error?: string } {
  // Check file size (100MB limit for videos, 50MB for 3D models and audio, 10MB for images)
  let maxSize = 50 * 1024 * 1024; // Default 50MB
  if (file.type.startsWith('image/')) {
    maxSize = 10 * 1024 * 1024; // 10MB for images
  } else if (file.type.startsWith('video/')) {
    maxSize = 100 * 1024 * 1024; // 100MB for videos
  }
  
  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File size must be less than ${maxSize / 1024 / 1024}MB`,
    };
  }

  // Check file type - allow images, videos, 3D model files, and audio files
  const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  const allowedVideoTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo'];
  const allowed3DTypes = ['application/octet-stream', 'model/fbx', 'model/gltf-binary', 'application/x-blender'];
  const allowedAudioTypes = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/mp3', 'audio/m4a', 'audio/aac'];
  const allowed3DExtensions = ['.fbx', '.usdz', '.blend', '.glb', '.gltf'];
  const allowedAudioExtensions = ['.mp3', '.wav', '.ogg', '.webm', '.m4a', '.aac'];
  const allowedVideoExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.avi'];
  
  const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
  const isImage = allowedImageTypes.includes(file.type);
  const isVideo = allowedVideoTypes.includes(file.type) || allowedVideoExtensions.includes(fileExtension);
  const is3DModel = allowed3DTypes.includes(file.type) || allowed3DExtensions.includes(fileExtension);
  const isAudio = allowedAudioTypes.includes(file.type) || allowedAudioExtensions.includes(fileExtension);
  
  if (!isImage && !isVideo && !is3DModel && !isAudio) {
    return {
      valid: false,
      error: 'Only image files (JPEG, PNG, GIF, WebP), video files (MP4, WebM, OGG, MOV, AVI), 3D model files (FBX, USDZ, Blend, GLB, GLTF), and audio files (MP3, WAV, OGG, WebM, M4A, AAC) are allowed',
    };
  }

  return { valid: true };
}
