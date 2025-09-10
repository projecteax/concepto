import { GoogleGenAI } from '@google/genai';
import { GenerationRequest } from '@/types';

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
    });

    // Extract image data from response
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        // Convert base64 to data URL for display
        const imageData = part.inlineData.data;
        return `data:image/png;base64,${imageData}`;
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
