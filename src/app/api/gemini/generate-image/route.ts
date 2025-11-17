import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { uploadToS3 } from '@/lib/s3-service';

const genAI = new GoogleGenAI({
  apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY || ''
});

export async function POST(request: NextRequest) {
  try {
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
      episodeId?: string;
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
    
    if (style === 'storyboard') {
      fullPrompt += ' Use storyboard style with bold lines around main characters or main elements on the scene and thinner lines on background and environment.';
    } else if (style === '3d-render') {
      fullPrompt += ' Use 3D Pixar style rendering with smooth surfaces, vibrant colors, and cinematic lighting.';
    }

    // Prepare parts for the API call - using the same format as existing gemini.ts
    // Order: text prompt, location images (environment), character images, gadget images, sketch, previous image
    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
    
    // Add text prompt first
    parts.push({ text: fullPrompt });

    // Add location images if provided (environment context first)
    if (locations && Array.isArray(locations)) {
      for (const location of locations) {
        if (location.images && Array.isArray(location.images)) {
          for (const imageUrl of location.images.slice(0, 1)) { // Only 1 image per location
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

    // Add character images if provided (only fullBody)
    if (characters && Array.isArray(characters)) {
      for (const character of characters) {
        if (character.images && Array.isArray(character.images)) {
          for (const imageUrl of character.images.slice(0, 1)) { // Only 1 fullBody image per character
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

    // Add gadget images if provided
    if (gadgets && Array.isArray(gadgets)) {
      for (const gadget of gadgets) {
        if (gadget.images && Array.isArray(gadget.images)) {
          for (const imageUrl of gadget.images.slice(0, 1)) { // Only 1 image per gadget
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

    // Add previous image for refinement if provided
    if (previousImage) {
      try {
        const imageResponse = await fetch(previousImage);
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
    // Try gemini-2.5-flash-image-preview first, fallback to gemini-2.5-flash
    let response;
    
    // If we only have text (no images), pass as string like existing code
    // If we have images, pass as array of parts
    const contents = parts.length === 1 && parts[0].text && !parts[0].inlineData 
      ? parts[0].text 
      : parts;
    
    try {
      // Type assertion to bypass SDK type limitations for imageConfig
      const configWithImageConfig = {
        responseModalities: ["IMAGE"],
        imageConfig: {
          aspectRatio: "16:9",
        },
      } as never;
      
      response = await genAI.models.generateContent({
        model: "gemini-2.5-flash-image-preview",
        contents: contents,
        config: configWithImageConfig,
      });
    } catch (error: unknown) {
      // If image-preview model doesn't work, try regular flash
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.log('Image preview model failed, trying regular flash:', errorMessage);
      try {
        // Type assertion to bypass SDK type limitations for imageConfig
        const configWithImageConfig = {
          responseModalities: ["IMAGE"],
          imageConfig: {
            aspectRatio: "16:9",
          },
        } as never;
        
        response = await genAI.models.generateContent({
          model: "gemini-2.5-flash",
          contents: contents,
          config: configWithImageConfig,
        });
      } catch (fallbackError: unknown) {
        const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : 'Unknown error';
        console.error('Both models failed:', fallbackError);
        throw new Error(`Image generation failed: ${fallbackMessage}`);
      }
    }

    // Extract image from response - same pattern as existing code
    let imageData: { data: string; mimeType?: string } | null = null;
    
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData && part.inlineData.data) {
        imageData = {
          data: part.inlineData.data,
          mimeType: part.inlineData.mimeType || 'image/png',
        };
        break;
      }
    }
    
    if (!imageData || !imageData.data) {
      console.error('No image data in response');
      return NextResponse.json(
        { error: 'No image generated. Please check your API key and model availability.' },
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

