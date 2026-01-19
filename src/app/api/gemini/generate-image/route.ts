import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { uploadToS3 } from '@/lib/s3-service';
import { checkAiAccessInRoute } from '@/lib/ai-access-check';

const genAI = new GoogleGenAI({
  apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY || ''
});

export async function POST(request: NextRequest) {
  try {
    // Check if API key is configured
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey || apiKey.trim() === '') {
      console.error('Gemini API key is not configured');
      return NextResponse.json(
        { error: 'API key is not configured. Please check your environment variables.' },
        { status: 500 }
      );
    }
    
    // Log API key status (first few chars only for security)
    console.log(`[Image Generation] API key configured: ${apiKey ? `${apiKey.substring(0, 10)}...` : 'NOT SET'}`);
    
    // Optional AI access check (safety check - frontend should handle the main check)
    const accessCheck = await checkAiAccessInRoute(request);
    if (accessCheck) {
      return accessCheck;
    }
    const body = await request.json() as {
      prompt?: string;
      style?: string;
      locationDescription?: string;
      visualDescription?: string;
      characters?: Array<{ images?: string[] }>;
      locations?: Array<{ images?: string[] }>;
      gadgets?: Array<{ images?: string[] }>;
      sketchImage?: string;
      previousImage?: string;
      // Back-compat / alternate names sent by the client
      initialImageUrl?: string;
      startFrame?: string;
      endFrame?: string;
      episodeId?: string;
      showId?: string;
    };
    const {
      prompt,
      style,
      locationDescription,
      visualDescription,
      characters,
      locations,
      gadgets,
      sketchImage,
      previousImage,
      initialImageUrl,
      startFrame,
      endFrame,
      episodeId,
    } = body;

    // Build the prompt with style instructions
    // The prompt comes from the frontend, but we should validate it
    let fullPrompt = prompt || '';
    
    if (!fullPrompt.trim()) {
      // If no prompt provided, build a basic one from available data
      if (locationDescription) {
        fullPrompt = `Generate an image of ${locationDescription}`;
      }
      if (visualDescription) {
        fullPrompt += fullPrompt ? ` and ${visualDescription}` : `Generate an image of ${visualDescription}`;
      }
      if (!fullPrompt.trim()) {
        return NextResponse.json(
          { error: 'Prompt, location description, or visual description is required' },
          { status: 400 }
        );
      }
    }
    
    // Handle art styles for concept generation
    if (style === 'storyboard') {
      fullPrompt += ' Use storyboard style with bold lines around main characters or main elements on the scene and thinner lines on background and environment.';
    } else if (style === '3d-render' || style === '3d-pixar') {
      fullPrompt += ' Use 3D Pixar style rendering with smooth surfaces, vibrant colors, and cinematic lighting.';
    } else if (style === '2d-disney') {
      fullPrompt += ' Use classic 2D Disney animation style with bold lines, vibrant colors, and expressive character design.';
    } else if (style === 'studio-ghibli') {
      fullPrompt += ' Use Studio Ghibli style with soft, painterly 2D art, natural colors, and detailed backgrounds.';
    } else if (style === '2d-cartoon') {
      fullPrompt += ' Use modern 2D cartoon style with clean lines, flat colors, and contemporary animation aesthetics.';
    } else if (style === '3d-realistic') {
      fullPrompt += ' Use photorealistic 3D rendering with detailed textures, realistic lighting, and high-quality materials.';
    } else if (style === 'watercolor') {
      fullPrompt += ' Use watercolor painting style with soft, flowing colors, organic textures, and artistic brushwork.';
    } else if (style === 'digital-painting') {
      fullPrompt += ' Use hand-painted digital art style with artistic brushstrokes, rich textures, and painterly aesthetics.';
    }

    // If we have a reference image, instruct the model to preserve composition and only apply changes.
    // This helps "edit" style prompts like "make lighting more blue" stay anchored to the source image.
    const referenceImageUrl = previousImage || initialImageUrl || startFrame || endFrame;
    if (referenceImageUrl) {
      fullPrompt +=
        '\n\nIMPORTANT: Use the provided reference image as the base. Preserve the composition, characters, camera angle, framing, and layout. Apply only the requested changes and keep everything else as consistent as possible.';
    }

    // Prepare parts for the API call - using the same format as existing gemini.ts
    // Order: text prompt, location images (environment), character images, gadget images, sketch, previous image
    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
    
    // Add text prompt first
    parts.push({ text: fullPrompt });

    // Add location images if provided (for concept generation, allow multiple reference images)
    if (locations && Array.isArray(locations)) {
      for (const location of locations) {
        if (location.images && Array.isArray(location.images)) {
          // For concept generation, use all provided images (up to 4 for API limits)
          const maxImages = 4;
          for (const imageUrl of location.images.slice(0, maxImages)) {
            try {
              const imageResponse = await fetch(imageUrl);
              if (imageResponse.ok) {
                const imageBuffer = await imageResponse.arrayBuffer();
                const base64Image = Buffer.from(imageBuffer).toString('base64');
                const mimeType = imageResponse.headers.get('content-type') || 'image/png';
                
                parts.push({
                  inlineData: {
                    data: base64Image,
                    mimeType,
                  },
                });
              }
            } catch (error) {
              console.error('Error processing location image:', error);
            }
          }
        }
      }
    }

    // Add character images if provided (for concept generation, allow multiple reference images)
    if (characters && Array.isArray(characters)) {
      for (const character of characters) {
        if (character.images && Array.isArray(character.images)) {
          // For concept generation, use all provided images (up to 4 for API limits)
          const maxImages = 4;
          for (const imageUrl of character.images.slice(0, maxImages)) {
            try {
              // Fetch the image and convert to base64
              const imageResponse = await fetch(imageUrl);
              if (imageResponse.ok) {
                const imageBuffer = await imageResponse.arrayBuffer();
                const base64Image = Buffer.from(imageBuffer).toString('base64');
                const mimeType = imageResponse.headers.get('content-type') || 'image/png';
                
                parts.push({
                  inlineData: {
                    data: base64Image,
                    mimeType,
                  },
                });
              }
            } catch (error) {
              console.error('Error processing character image:', error);
            }
          }
        }
      }
    }

    // Add gadget images if provided (for concept generation, allow multiple reference images)
    if (gadgets && Array.isArray(gadgets)) {
      for (const gadget of gadgets) {
        if (gadget.images && Array.isArray(gadget.images)) {
          // For concept generation, use all provided images (up to 4 for API limits)
          const maxImages = 4;
          for (const imageUrl of gadget.images.slice(0, maxImages)) {
            try {
              const imageResponse = await fetch(imageUrl);
              if (imageResponse.ok) {
                const imageBuffer = await imageResponse.arrayBuffer();
                const base64Image = Buffer.from(imageBuffer).toString('base64');
                const mimeType = imageResponse.headers.get('content-type') || 'image/png';
                
                parts.push({
                  inlineData: {
                    data: base64Image,
                    mimeType,
                  },
                });
              }
            } catch (error) {
              console.error('Error processing gadget image:', error);
            }
          }
        }
      }
    }

    // Add sketch image if provided
    if (sketchImage) {
      try {
        // Convert data URL to base64
        const base64Data = sketchImage.replace(/^data:image\/\w+;base64,/, '');
        const mimeType = sketchImage.match(/^data:image\/(\w+);base64,/)?.[1] || 'png';
        
        parts.push({
          inlineData: {
            data: base64Data,
            mimeType: `image/${mimeType}`,
          },
        });
      } catch (error) {
        console.error('Error processing sketch image:', error);
      }
    }

    // Add reference image for refinement / conditioning if provided
    // (previousImage is the preferred field; others are fallbacks for back-compat)
    if (referenceImageUrl) {
      try {
        const imageResponse = await fetch(referenceImageUrl);
        if (imageResponse.ok) {
          const imageBuffer = await imageResponse.arrayBuffer();
          const base64Image = Buffer.from(imageBuffer).toString('base64');
          const mimeType = imageResponse.headers.get('content-type') || 'image/png';
          
          parts.push({
            inlineData: {
              data: base64Image,
              mimeType,
            },
          });
        }
      } catch (error) {
        console.error('Error processing previous image:', error);
      }
    }

    // Generate image using the same pattern as existing gemini.ts
    // Note: For image generation, we need to use a model that supports it
    // Try different model names as some may be deprecated or region-restricted
    let response;
    let modelUsed = "gemini-2.5-flash-image"; // Try newer model name first
    
    // If we only have text (no images), pass as string like existing code
    // If we have images, pass as array of parts
    const contents = parts.length === 1 && parts[0].text && !parts[0].inlineData 
      ? parts[0].text 
      : parts;
    
    // Type assertion to bypass SDK type limitations for imageConfig
    const configWithImageConfig = {
      responseModalities: ["IMAGE"],
      imageConfig: {
        aspectRatio: "16:9",
      },
    } as never;
    
    // Try multiple model names in order of preference
    const modelsToTry = [
      "gemini-2.5-flash-image",
      "gemini-2.5-flash-image-preview",
      "gemini-2.0-flash-exp-image-generation",
    ];
    
    console.log(`[Image Generation] Attempting to generate image with ${modelsToTry.length} model(s)`);
    console.log(`[Image Generation] Contents type: ${typeof contents}, is array: ${Array.isArray(contents)}, length: ${Array.isArray(contents) ? contents.length : 'N/A'}`);
    
    let lastError: Error | null = null;
    for (const modelName of modelsToTry) {
      try {
        console.log(`[Image Generation] Trying model: ${modelName}`);
        modelUsed = modelName;
        response = await genAI.models.generateContent({
          model: modelName,
          contents: contents,
          config: configWithImageConfig,
        });
        console.log(`[Image Generation] Success with model: ${modelName}`);
        // If we get here, the model worked
        break;
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorObj = error as { error?: { message?: string; code?: number; status?: string }; message?: string; code?: number; status?: string; response?: { status?: number; statusText?: string } };
        
        // Log the full error for debugging
        console.error(`[Image Generation] Model ${modelName} error:`, error);
        console.error(`[Image Generation] Error message:`, errorMessage);
        console.error(`[Image Generation] Error object keys:`, Object.keys(errorObj || {}));
        
        // Extract the actual error message from various possible locations
        const actualErrorMsg = errorObj?.error?.message || errorObj?.message || errorMessage;
        const errorStatus = errorObj?.error?.status || errorObj?.status;
        const errorCode = errorObj?.error?.code || errorObj?.code;
        const httpStatus = errorObj?.response?.status;
        
        console.error(`[Image Generation] Actual error message:`, actualErrorMsg);
        console.error(`[Image Generation] Error status:`, errorStatus);
        console.error(`[Image Generation] Error code:`, errorCode);
        console.error(`[Image Generation] HTTP status:`, httpStatus);
        
        // Check for API key/authentication errors (only if explicitly about auth)
        if (actualErrorMsg.toLowerCase().includes('api key') || 
            actualErrorMsg.toLowerCase().includes('authentication') ||
            actualErrorMsg.toLowerCase().includes('unauthorized') ||
            actualErrorMsg.toLowerCase().includes('invalid api key') ||
            httpStatus === 401 ||
            httpStatus === 403 ||
            errorCode === 401 ||
            errorCode === 403) {
          lastError = new Error(`API authentication failed: ${actualErrorMsg}. Please check your Gemini API key configuration.`);
          // Don't try other models if it's an auth error
          break;
        }
        
        // Check if it's a geo-restriction or model availability error
        if (actualErrorMsg.includes('not available in your country') ||
            (actualErrorMsg.includes('not available') && actualErrorMsg.includes('country')) ||
            errorStatus === 'FAILED_PRECONDITION') {
          lastError = new Error(`Image generation is not available in your region. Model ${modelName} returned: ${actualErrorMsg}`);
          continue; // Try next model
        }
        
        // Check if model doesn't support image generation
        if (actualErrorMsg.includes('only supports text') ||
            actualErrorMsg.includes('INVALID_ARGUMENT') ||
            errorStatus === 'INVALID_ARGUMENT') {
          lastError = new Error(`Model ${modelName} does not support image generation: ${actualErrorMsg}`);
          continue; // Try next model
        }
        
        // For other errors, log and continue to next model
        console.log(`Model ${modelName} failed with error:`, actualErrorMsg);
        lastError = error instanceof Error ? error : new Error(actualErrorMsg || errorMessage);
        continue;
      }
    }
    
    // If all models failed, throw a helpful error
    if (!response) {
      const errorMessage = lastError?.message || 'All image generation models failed';
      console.error('All image generation models failed. Last error:', lastError);
      return NextResponse.json(
        { 
          error: errorMessage,
          details: 'Image generation may not be available in your region or with your API key tier. Please check your Gemini API access or try again later.',
        },
        { status: 503 }
      );
    }

    // Extract image from response - same pattern as existing code
    let imageData: { data: string; mimeType?: string } | null = null;
    
    // Log the response structure for debugging
    console.log('[Image Generation] Response structure:', {
      hasCandidates: !!response.candidates,
      candidatesLength: response.candidates?.length || 0,
      firstCandidate: response.candidates?.[0] ? {
        hasContent: !!response.candidates[0].content,
        hasParts: !!response.candidates[0].content?.parts,
        partsLength: response.candidates[0].content?.parts?.length || 0,
        partsTypes: response.candidates[0].content?.parts?.map((p: unknown) => {
          const part = p as { inlineData?: unknown; text?: unknown };
          return {
            hasInlineData: !!part.inlineData,
            hasText: !!part.text,
          };
        }) || [],
      } : null,
    });
    
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData && part.inlineData.data) {
        imageData = {
          data: part.inlineData.data,
          mimeType: part.inlineData.mimeType || 'image/png',
        };
        console.log('[Image Generation] Found image data in response');
        break;
      } else if (part.text) {
        // Log if we got text instead of image
        const textContent = (part as { text: string }).text;
        console.warn('[Image Generation] Got text response instead of image:', textContent.substring(0, 200));
      }
    }
    
    if (!imageData || !imageData.data) {
      console.error('[Image Generation] No image data in response');
      
      // Check finish reason and safety ratings
      const candidate = response.candidates?.[0];
      const finishReason = candidate?.finishReason;
      const safetyRatings = candidate?.safetyRatings;
      
      console.error('[Image Generation] Finish reason:', finishReason);
      console.error('[Image Generation] Safety ratings:', safetyRatings);
      
      // Check if we got text instead of image
      const textParts = candidate?.content?.parts?.filter((p: unknown) => {
        const part = p as { text?: string };
        return part.text;
      }) || [];
      
      if (textParts.length > 0) {
        const textContent = (textParts[0] as { text: string }).text;
        console.error('[Image Generation] Text response received:', textContent);
        return NextResponse.json(
          { 
            error: 'The API returned text instead of an image. This model may not support image generation.',
            details: textContent.substring(0, 500),
            finishReason: finishReason,
          },
          { status: 500 }
        );
      }
      
      // Check finish reason for specific errors
      if (finishReason === 'SAFETY' || finishReason === 'RECITATION') {
        return NextResponse.json(
          { 
            error: 'Image generation was blocked due to safety or content policy restrictions.',
            details: `Finish reason: ${finishReason}. Please modify your prompt and try again.`,
            finishReason: finishReason,
          },
          { status: 400 }
        );
      }
      
      if (finishReason === 'OTHER' || finishReason === 'MAX_TOKENS') {
        return NextResponse.json(
          { 
            error: 'Image generation failed due to model limitations.',
            details: `Finish reason: ${finishReason}. The model may not support image generation or the request was too complex.`,
            finishReason: finishReason,
          },
          { status: 500 }
        );
      }
      
      // Log full response for debugging (truncated)
      const responseStr = JSON.stringify(response, null, 2);
      console.error('[Image Generation] Full response (first 1000 chars):', responseStr.substring(0, 1000));
      
      return NextResponse.json(
        { 
          error: 'No image generated. The API response did not contain image data.',
          details: `Finish reason: ${finishReason || 'UNKNOWN'}. The model may not support image generation. Please check the server logs for more details.`,
          finishReason: finishReason,
        },
        { status: 500 }
      );
    }

    // Convert base64 to blob and upload to S3 - same pattern as existing code
    try {
      const byteCharacters = atob(imageData.data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: imageData.mimeType || 'image/png' });
      const file = new File([blob], `generated-${Date.now()}.png`, { 
        type: imageData.mimeType || 'image/png' 
      });
      
      const timestamp = Date.now();
      const fileKey = `episodes/${episodeId}/av-script/generated/${timestamp}-${style}.png`;
      const uploadResult = await uploadToS3(file, fileKey);
      
      if (!uploadResult) {
        return NextResponse.json(
          { error: 'Failed to upload generated image' },
          { status: 500 }
        );
      }

      // Also save to backup folder (separate backup, no Firebase connection)
      try {
        const backupKey = `concepto-app/AIbackups/images/${timestamp}-${Math.random().toString(36).substring(7)}.png`;
        await uploadToS3(file, backupKey);
        console.log('✅ Image backup saved to:', backupKey);
      } catch (backupError) {
        // Log but don't fail the request if backup fails
        console.warn('⚠️ Failed to save image backup (non-critical):', backupError);
      }

      return NextResponse.json({
        imageUrl: uploadResult.url,
        modelName: modelUsed,
        generatedAt: new Date().toISOString(),
        success: true,
      });
    } catch (uploadError) {
      console.error('Failed to upload generated image:', uploadError);
      return NextResponse.json(
        { error: 'Image generation failed: Cloud storage not configured properly.' },
        { status: 500 }
      );
    }
  } catch (error: unknown) {
    console.error('Error generating image:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('Error details:', {
      message: errorMessage,
      stack: errorStack,
      name: error instanceof Error ? error.name : 'Error',
    });
    return NextResponse.json(
      { 
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? errorStack : undefined
      },
      { status: 500 }
    );
  }
}

