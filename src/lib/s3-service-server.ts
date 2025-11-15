import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Helper function to check if a value is a placeholder
const isPlaceholder = (value: string | undefined): boolean => {
  if (!value) return true;
  return value.includes('your_') || value.includes('your-');
};

// Initialize S3 client for Cloudflare R2 (server-side)
const getS3Client = () => {
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
    forcePathStyle: true,
    useAccelerateEndpoint: false,
    disableHostPrefix: true,
  });
};

const getBucketName = () => {
  return (!isPlaceholder(process.env.NEXT_PUBLIC_R2_BUCKET)) 
    ? process.env.NEXT_PUBLIC_R2_BUCKET 
    : '';
};

const getPublicUrl = () => {
  return (!isPlaceholder(process.env.NEXT_PUBLIC_R2_PUBLIC_URL)) 
    ? process.env.NEXT_PUBLIC_R2_PUBLIC_URL 
    : '';
};

export interface UploadResult {
  url: string;
  key: string;
  size: number;
}

/**
 * Upload a file to S3/R2 from server-side (API route)
 */
export async function uploadToS3Server(
  file: File,
  key: string
): Promise<UploadResult> {
  try {
    if (!file) {
      throw new Error('No file provided');
    }

    const BUCKET_NAME = getBucketName();
    const PUBLIC_URL = getPublicUrl();
    const s3Client = getS3Client();

    if (!BUCKET_NAME) {
      throw new Error('S3/R2 bucket not configured');
    }

    // Convert File to Buffer for server-side upload
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to S3/R2
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: file.type || 'image/png',
    });

    await s3Client.send(command);

    // Construct public URL
    const url = PUBLIC_URL 
      ? `${PUBLIC_URL}/${key}`
      : `https://${BUCKET_NAME}.r2.cloudflarestorage.com/${key}`;

    return {
      url,
      key,
      size: file.size,
    };
  } catch (error) {
    console.error('Error uploading to S3/R2:', error);
    throw error;
  }
}

