import { useState, useCallback } from 'react';
import { uploadToS3, generateFileKey, validateFile, UploadProgress, UploadResult } from '@/lib/s3-service';

export interface UploadState {
  isUploading: boolean;
  progress: number;
  error: string | null;
  result: UploadResult | null;
}

export interface UseS3UploadReturn {
  uploadState: UploadState;
  uploadFile: (file: File, prefix: string) => Promise<UploadResult | null>;
  resetUpload: () => void;
}

export function useS3Upload(): UseS3UploadReturn {
  const [uploadState, setUploadState] = useState<UploadState>({
    isUploading: false,
    progress: 0,
    error: null,
    result: null,
  });

  const uploadFile = useCallback(async (file: File, prefix: string): Promise<UploadResult | null> => {
    // Reset state
    setUploadState({
      isUploading: true,
      progress: 0,
      error: null,
      result: null,
    });

    try {
      // Validate file
      const validation = validateFile(file);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      // Generate unique key
      const key = generateFileKey(prefix, file.name);

      // Upload to S3
      const result = await uploadToS3(file, key, (progress: UploadProgress) => {
        setUploadState(prev => ({
          ...prev,
          progress: progress.percentage,
        }));
      });

      // Success
      setUploadState({
        isUploading: false,
        progress: 100,
        error: null,
        result,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      
      setUploadState({
        isUploading: false,
        progress: 0,
        error: errorMessage,
        result: null,
      });

      return null;
    }
  }, []);

  const resetUpload = useCallback(() => {
    setUploadState({
      isUploading: false,
      progress: 0,
      error: null,
      result: null,
    });
  }, []);

  return {
    uploadState,
    uploadFile,
    resetUpload,
  };
}
