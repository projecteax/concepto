import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const genAI = new GoogleGenAI({
  apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY || ''
});

export const maxDuration = 60; // 1 minute
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      characterName, 
      characterAge, 
      showName, 
      showDescription, 
      targetAge = '6-8',
      customPrompt 
    } = body;

    if (!characterName) {
      return NextResponse.json(
        { error: 'Character name is required' },
        { status: 400 }
      );
    }

    // Build the prompt
    let prompt = customPrompt || `You are generating a backstory for a character named ${characterName}`;
    
    if (characterAge) {
      prompt += `, who is ${characterAge} years old`;
    }
    
    prompt += `, for an animated show called "${showName || 'Untitled Show'}"`;
    
    if (showDescription) {
      prompt += ` with the following description: ${showDescription}`;
    }
    
    prompt += `. This show is for kids aged ${targetAge}. Generate a backstory that is appropriate for this age group, engaging, and helps establish the character's personality and motivations. Keep it to no more than 6 sentences.`;

    const response = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const generatedText = response.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!generatedText) {
      return NextResponse.json(
        { error: 'No backstory generated from Gemini API' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      backstory: generatedText.trim(),
      success: true,
    });
  } catch (error: unknown) {
    console.error('Error generating backstory:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to generate backstory: ${errorMessage}` },
      { status: 500 }
    );
  }
}


