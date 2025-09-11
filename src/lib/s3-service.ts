import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Helper function to check if a value is a placeholder
const isPlaceholder = (value: string | undefined): boolean => {
  if (!value) return true;
  return value.includes('your_') || value.includes('your-') || value === 'auto';
};

// Initialize S3 client for Cloudflare R2
const s3Client = new S3Client({
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

const BUCKET_NAME = (!isPlaceholder(process.env.NEXT_PUBLIC_R2_BUCKET)) 
  ? process.env.NEXT_PUBLIC_R2_BUCKET 
  : '';
const PUBLIC_URL = (!isPlaceholder(process.env.NEXT_PUBLIC_R2_PUBLIC_URL)) 
  ? process.env.NEXT_PUBLIC_R2_PUBLIC_URL 
  : '';

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

    // Check if S3/R2 is configured
    if (!BUCKET_NAME || !process.env.NEXT_PUBLIC_R2_ENDPOINT || 
        !process.env.NEXT_PUBLIC_R2_ACCESS_KEY_ID || !process.env.NEXT_PUBLIC_R2_SECRET_ACCESS_KEY) {
      console.warn('S3/R2 not configured, storing as data URL temporarily');
      
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
    const response = await s3Client.send(command);

    if (!response.ETag) {
      throw new Error('Upload failed - no ETag returned');
    }

    // Generate public URL using R2 public domain
    const url = `${PUBLIC_URL}/${key}`;

    return {
      url,
      key,
      size: file.size,
    };
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
    if (!BUCKET_NAME) {
      throw new Error('S3 bucket name not configured');
    }

    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

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
  return `${prefix}/${timestamp}-${randomId}.${extension}`;
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
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    });

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
  // Check file size (10MB limit)
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    return {
      valid: false,
      error: 'File size must be less than 10MB',
    };
  }

  // Check file type
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: 'Only image files (JPEG, PNG, GIF, WebP) are allowed',
    };
  }

  return { valid: true };
}
