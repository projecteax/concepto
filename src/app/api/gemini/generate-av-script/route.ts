import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export const maxDuration = 300; // 5 minutes per segment for longer scripts
export const runtime = 'nodejs';

const genAI = new GoogleGenAI({
  apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY || ''
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, scriptContent, language, segmentNumber, totalSegments } = body;

    if (!prompt || !scriptContent) {
      return NextResponse.json(
        { error: 'Missing required fields: prompt and scriptContent' },
        { status: 400 }
      );
    }

    // Check if content is too large (Gemini has token limits)
    // Rough estimate: 1 token ≈ 4 characters
    const estimatedTokens = (prompt.length + scriptContent.length) / 4;
    const MAX_TOKENS = 1000000; // Gemini 2.5 Pro supports up to 1M tokens
    
    if (estimatedTokens > MAX_TOKENS) {
      return NextResponse.json(
        { error: `Script is too large (estimated ${Math.ceil(estimatedTokens / 1000)}k tokens). Please split into smaller segments.` },
        { status: 400 }
      );
    }

    console.log(`Processing ${segmentNumber ? `segment ${segmentNumber} of ${totalSegments}` : 'full script'} (${Math.ceil(estimatedTokens / 1000)}k tokens)`);
    
    try {
      // The prompt already includes the script content, so we use it directly
      const response = await genAI.models.generateContent({
        model: "gemini-2.5-pro",
        contents: prompt,
      });

      const generatedText = response.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!generatedText) {
        return NextResponse.json(
          { error: 'No AV script generated from Gemini API' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        text: generatedText,
        success: true,
        segmentNumber,
        totalSegments,
      });
    } catch (geminiError: unknown) {
      const geminiErrorMessage = geminiError instanceof Error ? geminiError.message : 'Unknown Gemini API error';
      console.error('Gemini API error:', geminiErrorMessage);
      
      // Provide more helpful error messages
      if (geminiErrorMessage.includes('timeout') || geminiErrorMessage.includes('deadline')) {
        return NextResponse.json(
          { error: 'Request timed out. The script may be too long. Try splitting it into smaller segments.' },
          { status: 504 }
        );
      }
      
      if (geminiErrorMessage.includes('quota') || geminiErrorMessage.includes('rate limit')) {
        return NextResponse.json(
          { error: 'API quota exceeded. Please try again later.' },
          { status: 429 }
        );
      }
      
      throw geminiError; // Re-throw to be caught by outer catch
    }
  } catch (error: unknown) {
    console.error('Error in generate-av-script API:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    
    // Check for network/timeout errors
    if (errorMessage.includes('fetch failed') || errorMessage.includes('ECONNRESET') || errorMessage.includes('ETIMEDOUT')) {
      return NextResponse.json(
        { error: 'Network error or timeout. The script may be too long. Please try splitting it into smaller segments or try again later.' },
        { status: 504 }
      );
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

