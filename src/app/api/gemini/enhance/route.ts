import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export const maxDuration = 60; // 1 minute
export const runtime = 'nodejs';

const genAI = new GoogleGenAI({
  apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY || ''
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, text } = body;

    if (!prompt || !text) {
      return NextResponse.json(
        { error: 'Missing required fields: prompt and text' },
        { status: 400 }
      );
    }

    // Build the prompt to generate 3 alternatives
    const fullPrompt = `${prompt}

Original text:
${text}

Please provide exactly 3 alternative versions of this text. Format your response as:
ALTERNATIVE 1:
[text here]

ALTERNATIVE 2:
[text here]

ALTERNATIVE 3:
[text here]`;

    const response = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: fullPrompt,
    });

    const generatedText = response.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!generatedText) {
      return NextResponse.json(
        { error: 'No alternatives generated from Gemini API' },
        { status: 500 }
      );
    }
    
    // Parse the alternatives from the response
    const alternatives: string[] = [];
    const regex = /ALTERNATIVE\s+(\d+):\s*\n([\s\S]*?)(?=ALTERNATIVE\s+\d+:|$)/gi;
    let match;
    
    while ((match = regex.exec(generatedText)) !== null) {
      const altText = match[2].trim();
      if (altText) {
        alternatives.push(altText);
      }
    }

    // If regex didn't work, try splitting by numbered alternatives
    if (alternatives.length === 0) {
      const lines = generatedText.split('\n');
      let currentAlt: string[] = [];
      let altNumber = 0;
      
      for (const line of lines) {
        if (line.match(/^ALTERNATIVE\s+\d+:/i) || line.match(/^\d+\./)) {
          if (currentAlt.length > 0 && altNumber > 0) {
            alternatives.push(currentAlt.join('\n').trim());
          }
          currentAlt = [];
          altNumber++;
        } else if (altNumber > 0) {
          currentAlt.push(line);
        }
      }
      if (currentAlt.length > 0) {
        alternatives.push(currentAlt.join('\n').trim());
      }
    }

    // Fallback: if we still don't have 3 alternatives, split the text into 3 parts or use the whole text
    if (alternatives.length === 0) {
      // Use the whole generated text as one alternative, and create variations
      alternatives.push(generatedText.trim());
    }

    // Ensure we have exactly 3 alternatives
    while (alternatives.length < 3) {
      alternatives.push(alternatives[alternatives.length - 1] || text);
    }

    // Take only the first 3
    const finalAlternatives = alternatives.slice(0, 3);

    return NextResponse.json({
      alternatives: finalAlternatives,
      success: true,
    });
  } catch (error: unknown) {
    console.error('Error in enhance API:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

