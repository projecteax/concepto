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
    
    if (!BUCKET_NAME || isPlaceholder(process.env.NEXT_PUBLIC_R2_ENDPOINT) || 
        isPlaceholder(process.env.NEXT_PUBLIC_R2_ACCESS_KEY_ID) || isPlaceholder(process.env.NEXT_PUBLIC_R2_SECRET_ACCESS_KEY)) {
      console.warn('❌ S3/R2 not configured, storing as data URL temporarily');
      console.log('❌ Fallback reason:', {
        noBucket: !BUCKET_NAME,
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
export function generateFileKey(prefix: string, fileName: string): string {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 15);
  const extension = fileName.split('.').pop() || '';
  // Remove trailing slash from prefix if it exists to avoid double slashes
  const cleanPrefix = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
  const key = `${cleanPrefix}/${timestamp}-${randomId}.${extension}`;
  console.log('🔑 Generated file key:', { prefix, cleanPrefix, fileName, key });
  return key;
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
  // Check file size (50MB limit for 3D models, 10MB for images)
  const maxSize = file.type.startsWith('image/') ? 10 * 1024 * 1024 : 50 * 1024 * 1024;
  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File size must be less than ${maxSize / 1024 / 1024}MB`,
    };
  }

  // Check file type - allow images and 3D model files
  const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  const allowed3DTypes = ['application/octet-stream', 'model/fbx', 'model/gltf-binary', 'application/x-blender'];
  const allowedExtensions = ['.fbx', '.usdz', '.blend', '.glb', '.gltf'];
  
  const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
  const isImage = allowedImageTypes.includes(file.type);
  const is3DModel = allowed3DTypes.includes(file.type) || allowedExtensions.includes(fileExtension);
  
  if (!isImage && !is3DModel) {
    return {
      valid: false,
      error: 'Only image files (JPEG, PNG, GIF, WebP) and 3D model files (FBX, USDZ, Blend, GLB, GLTF) are allowed',
    };
  }

  return { valid: true };
}
