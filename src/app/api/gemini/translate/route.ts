import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

// Increase body size limit for large screenplays (10MB)
export const maxDuration = 300; // 5 minutes
export const runtime = 'nodejs';

const genAI = new GoogleGenAI({
  apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY || ''
});

// Maximum characters per chunk (leaving room for prompt overhead)
const MAX_CHUNK_SIZE = 20000; // ~20k chars per chunk
const ELEMENTS_PER_CHUNK = 50; // Process ~50 elements at a time

interface ElementChunk {
  type: string;
  content: string;
  index: number;
}

function parseScreenplayElements(text: string): ElementChunk[] {
  const lines = text.split('\n');
  const elements: ElementChunk[] = [];
  let currentType: string | null = null;
  let currentContent: string[] = [];
  let elementIndex = 0;

  for (const line of lines) {
    const typeMatch = line.match(/^\[([A-Z-]+)\]$/);
    if (typeMatch) {
      // Save previous element
      if (currentType && currentContent.length > 0) {
        elements.push({
          type: currentType.toLowerCase(),
          content: currentContent.join('\n').trim(),
          index: elementIndex++
        });
      }
      // Start new element
      currentType = typeMatch[1].toLowerCase();
      currentContent = [];
    } else if (currentType && line.trim()) {
      currentContent.push(line);
    }
  }

  // Save last element
  if (currentType && currentContent.length > 0) {
    elements.push({
      type: currentType.toLowerCase(),
      content: currentContent.join('\n').trim(),
      index: elementIndex++
    });
  }

  return elements;
}

function createChunkText(elements: ElementChunk[]): string {
  let text = '';
  elements.forEach((el) => {
    const typeUpper = el.type.toUpperCase().replace(/_/g, '-');
    text += `[${typeUpper}]\n${el.content}\n\n`;
  });
  return text.trim();
}

async function translateChunk(
  chunk: ElementChunk[],
  prompt: string,
  screenplayTitle: string,
  chunkNumber: number,
  totalChunks: number
): Promise<string> {
  const chunkText = createChunkText(chunk);
  
  let fullPrompt = `${prompt}\n\n`;
  fullPrompt += `Screenplay Title: ${screenplayTitle || 'Untitled'}\n`;
  fullPrompt += `This is chunk ${chunkNumber} of ${totalChunks}.\n\n`;
  fullPrompt += `Polish Screenplay Text:\n${chunkText}\n\n`;
  fullPrompt += `Please translate the above screenplay text to English. Maintain the exact same structure, including all element types (SCENE-SETTING, CHARACTER, ACTION, PARENTHETICAL, DIALOGUE, GENERAL). `;
  fullPrompt += `Keep the same formatting and line breaks. Only translate the content, not the element type markers. `;
  fullPrompt += `Return the translated text with the same structure, preserving all [TYPE] markers.`;

  try {
    const response = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: fullPrompt,
    });

    const translatedText = response.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!translatedText) {
      throw new Error('No translation text in response');
    }

    return translatedText.trim();
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error translating chunk ${chunkNumber}:`, error);
    throw new Error(`Failed to translate chunk ${chunkNumber}: ${errorMessage}`);
  }
}

export async function POST(request: NextRequest) {
  try {
    // Parse request body with error handling
    let body: { prompt?: string; polishText?: string; screenplayTitle?: string };
    try {
      body = await request.json() as { prompt?: string; polishText?: string; screenplayTitle?: string };
    } catch (parseError: unknown) {
      console.error('Error parsing request body:', parseError);
      return NextResponse.json(
        { error: 'Invalid request body. The screenplay may be too large. Try splitting it into smaller parts.' },
        { status: 400 }
      );
    }

    const {
      prompt,
      polishText,
      screenplayTitle,
    } = body;

    if (!polishText || !polishText.trim()) {
      return NextResponse.json(
        { error: 'Polish text is required' },
        { status: 400 }
      );
    }

    if (!prompt || !prompt.trim()) {
      return NextResponse.json(
        { error: 'Translation prompt is required' },
        { status: 400 }
      );
    }

    console.log(`Translating screenplay: ${polishText.length} characters, ${screenplayTitle || 'Untitled'}`);

    // Parse screenplay into elements
    const elements = parseScreenplayElements(polishText);
    
    if (elements.length === 0) {
      return NextResponse.json(
        { error: 'No screenplay elements found in text. Make sure the text includes [TYPE] markers.' },
        { status: 400 }
      );
    }

    console.log(`Parsed ${elements.length} elements, will process in chunks`);

    // Split into chunks
    const chunks: ElementChunk[][] = [];
    for (let i = 0; i < elements.length; i += ELEMENTS_PER_CHUNK) {
      chunks.push(elements.slice(i, i + ELEMENTS_PER_CHUNK));
    }

    // If it's small enough, process in one go
    if (chunks.length === 1 && polishText.length < MAX_CHUNK_SIZE) {
      const chunkText = createChunkText(elements);
      let fullPrompt = `${prompt}\n\n`;
      fullPrompt += `Screenplay Title: ${screenplayTitle || 'Untitled'}\n\n`;
      fullPrompt += `Polish Screenplay Text:\n${chunkText}\n\n`;
      fullPrompt += `Please translate the above screenplay text to English. Maintain the exact same structure, including all element types (SCENE-SETTING, CHARACTER, ACTION, PARENTHETICAL, DIALOGUE, GENERAL). `;
      fullPrompt += `Keep the same formatting and line breaks. Only translate the content, not the element type markers. `;
      fullPrompt += `Return the translated text with the same structure, preserving all [TYPE] markers.`;

      const response = await genAI.models.generateContent({
        model: "gemini-2.5-flash",
        contents: fullPrompt,
      });

      const translatedText = response.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!translatedText) {
        throw new Error('No translation generated');
      }

      return NextResponse.json({
        translatedText: translatedText.trim(),
        success: true,
        chunksProcessed: 1,
        totalChunks: 1,
      });
    }

    // Process chunks sequentially to avoid rate limits
    const translatedChunks: string[] = [];
    
    console.log(`Processing ${chunks.length} chunks...`);
    
    for (let i = 0; i < chunks.length; i++) {
      try {
        console.log(`Translating chunk ${i + 1}/${chunks.length}...`);
        const chunk = chunks[i];
        const translatedChunk = await translateChunk(
          chunk,
          prompt,
          screenplayTitle || 'Untitled',
          i + 1,
          chunks.length
        );
        translatedChunks.push(translatedChunk);
        console.log(`Chunk ${i + 1}/${chunks.length} completed`);
        
        // Small delay between chunks to avoid rate limiting
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (chunkError: unknown) {
        const errorMessage = chunkError instanceof Error ? chunkError.message : 'Unknown error';
        console.error(`Error in chunk ${i + 1}:`, chunkError);
        throw new Error(`Failed to translate chunk ${i + 1} of ${chunks.length}: ${errorMessage}`);
      }
    }
    
    console.log(`All ${chunks.length} chunks translated successfully`);

    // Combine all translated chunks
    const translatedText = translatedChunks.join('\n\n');

    return NextResponse.json({
      translatedText: translatedText.trim(),
      success: true,
      chunksProcessed: chunks.length,
      totalChunks: chunks.length,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('Error translating text:', error);
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

