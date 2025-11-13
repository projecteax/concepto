import { NextRequest, NextResponse } from 'next/server';

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1/text-to-speech';

export async function POST(request: NextRequest) {
  try {
    if (!ELEVENLABS_API_KEY) {
      return NextResponse.json(
        { error: 'ElevenLabs API key not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { 
      text, 
      voiceId
    } = body;

    if (!text || !voiceId) {
      return NextResponse.json(
        { error: 'Text and voiceId are required' },
        { status: 400 }
      );
    }

    // Build request body for v3
    // v3 uses simplified voice_settings with only stability (0.0, 0.5, or 1.0)
    // 0.0 = Creative, 0.5 = Natural, 1.0 = Robust
    const requestBody: any = {
      text,
      model_id: 'eleven_v3', // Using v3 (alpha) - highest quality with tag support
      voice_settings: {
        stability: 0.5, // Default to Natural (0.5)
        similarity_boost: 0.5,
      },
    };

    // Call ElevenLabs API
    const response = await fetch(`${ELEVENLABS_API_URL}/${voiceId}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs API error:', errorText);
      console.error('Request body sent:', JSON.stringify(requestBody, null, 2));
      return NextResponse.json(
        { error: `ElevenLabs API error: ${response.status} ${errorText}` },
        { status: response.status }
      );
    }

    // Get audio as ArrayBuffer
    const audioBuffer = await response.arrayBuffer();

    // Convert to base64 for easier handling
    const base64Audio = Buffer.from(audioBuffer).toString('base64');

    return NextResponse.json({
      success: true,
      audioBase64: base64Audio,
      mimeType: 'audio/mpeg',
    });
  } catch (error) {
    console.error('Error generating audio:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

