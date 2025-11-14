import { GoogleGenAI } from '@google/genai';
import { GenerationRequest } from '@/types';
import { uploadToS3 } from './s3-service';

const genAI = new GoogleGenAI({
  apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY || 'AIzaSyByJ-A6QupTOvOS-4cxcKHvn8acIz-SH_Y'
});

export async function generateConceptImage(request: GenerationRequest): Promise<string> {
  try {
    // Enhanced prompt based on category and tags
    const enhancedPrompt = buildEnhancedPrompt(request);
    
    const response = await genAI.models.generateContent({
      model: "gemini-2.5-flash-image-preview",
      contents: enhancedPrompt,
      // @ts-expect-error - imageConfig not yet in SDK types but supported by API
      config: {
        responseModalities: ["IMAGE"],
        imageConfig: {
          aspectRatio: "16:9",
        },
      },
    });

    // Extract image data from response
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        try {
          // Convert base64 to blob and upload to R2/S3
          const imageData = part.inlineData.data;
          if (!imageData) {
            throw new Error('No image data found');
          }
          const byteCharacters = atob(imageData);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: 'image/png' });
          const file = new File([blob], `generated-${Date.now()}.png`, { type: 'image/png' });
          
          // Upload to R2/S3
          const fileKey = `generated/${request.showId}/${Date.now()}-${request.category}.png`;
          const uploadResult = await uploadToS3(file, fileKey);
          
          return uploadResult.url;
        } catch (uploadError) {
          console.error('Failed to upload generated image:', uploadError);
          // Don't fallback to data URL as it causes size limit issues
          // Instead, throw an error to prevent saving oversized data
          throw new Error('Image generation failed: Cloud storage not configured properly. Please contact support.');
        }
      }
    }
    
    throw new Error('No image data found in response');
  } catch (error) {
    console.error('Error generating image:', error);
    // Fallback to placeholder if generation fails
    return `https://via.placeholder.com/512x512/6366f1/ffffff?text=${encodeURIComponent(request.prompt)}`;
  }
}

function buildEnhancedPrompt(request: GenerationRequest): string {
  const { prompt, category, tags, style } = request;
  
  let enhancedPrompt = `Generate a ${category} concept art for a kids' TV show. `;
  enhancedPrompt += `Description: ${prompt}. `;
  
  if (tags.length > 0) {
    enhancedPrompt += `Include these elements: ${tags.join(', ')}. `;
  }
  
  enhancedPrompt += `Style: Colorful, kid-friendly, cartoon-like, suitable for children's television. `;
  
  if (style) {
    enhancedPrompt += `Additional style notes: ${style}. `;
  }
  
  return enhancedPrompt;
}
