import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY || '');

export async function POST(request: NextRequest) {
  try {
    const { prompt, showName, showDescription, episodeTitle } = await request.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    // Build the full prompt for generating 3 different story ideas
    const fullPrompt = `${prompt}\n\nPlease generate three different and unique story ideas for this episode. Each story should be creative, engaging, and suitable for the target audience. Format your response as three separate story descriptions, each clearly labeled as "Story 1:", "Story 2:", and "Story 3:". Each story should be 2-4 sentences long.`;

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    const generatedText = response.text();

    if (!generatedText) {
      return NextResponse.json({ error: 'No descriptions generated' }, { status: 500 });
    }

    // Parse the response to extract the three stories
    const descriptions: string[] = [];
    
    // Try to split by "Story 1:", "Story 2:", "Story 3:" markers
    const storyPattern = /Story\s+\d+:/gi;
    const parts = generatedText.split(storyPattern);
    
    if (parts.length > 1) {
      // Remove the first part (usually empty or prompt echo)
      parts.slice(1).forEach((part, index) => {
        const cleaned = part.trim();
        if (cleaned) {
          descriptions.push(cleaned);
        }
      });
    }

    // If we didn't get 3 stories from the pattern, try alternative parsing
    if (descriptions.length < 3) {
      // Try splitting by numbered lists or paragraphs
      const lines = generatedText.split('\n').filter(line => line.trim());
      let currentStory = '';
      
      for (const line of lines) {
        // Check if this line starts a new story (contains numbers or specific markers)
        if (/^\d+[\.\)]/.test(line.trim()) || /^Story\s+\d+/i.test(line.trim())) {
          if (currentStory) {
            descriptions.push(currentStory.trim());
            currentStory = '';
          }
          currentStory = line.replace(/^\d+[\.\)]\s*/, '').replace(/^Story\s+\d+:\s*/i, '').trim();
        } else if (line.trim()) {
          currentStory += (currentStory ? ' ' : '') + line.trim();
        }
      }
      
      if (currentStory) {
        descriptions.push(currentStory.trim());
      }
    }

    // If we still don't have 3, try splitting by double newlines or other separators
    if (descriptions.length < 3) {
      const alternativeSplit = generatedText.split(/\n\n+/);
      descriptions.length = 0; // Clear and try again
      alternativeSplit.forEach(part => {
        const cleaned = part.trim();
        if (cleaned && cleaned.length > 20) { // Only add substantial text
          descriptions.push(cleaned);
        }
      });
    }

    // Ensure we have at least 3 descriptions (pad with the full text if needed)
    if (descriptions.length === 0) {
      // Fallback: split the entire text into 3 roughly equal parts
      const textLength = generatedText.length;
      const partLength = Math.floor(textLength / 3);
      descriptions.push(generatedText.substring(0, partLength).trim());
      descriptions.push(generatedText.substring(partLength, partLength * 2).trim());
      descriptions.push(generatedText.substring(partLength * 2).trim());
    } else if (descriptions.length < 3) {
      // If we have fewer than 3, duplicate the last one or split the last one
      while (descriptions.length < 3) {
        descriptions.push(descriptions[descriptions.length - 1] || generatedText);
      }
    }

    // Return exactly 3 descriptions
    return NextResponse.json({ 
      descriptions: descriptions.slice(0, 3).map(d => d.trim()).filter(d => d.length > 0)
    });
  } catch (error) {
    console.error('Error generating episode descriptions:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate episode descriptions' },
      { status: 500 }
    );
  }
}

