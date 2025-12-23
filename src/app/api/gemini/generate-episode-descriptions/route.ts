import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY || '');

export async function POST(request: NextRequest) {
  try {
    const { prompt, showName, showDescription, episodeTitle, plotTheme } = (await request.json()) as {
      prompt?: string;
      showName?: string;
      showDescription?: string;
      episodeTitle?: string;
      plotTheme?: {
        id?: string;
        name?: string;
        description?: string;
        keyElements?: string[];
        tags?: string[];
      } | null;
    };

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const themeSection =
      plotTheme && typeof plotTheme.name === 'string' && plotTheme.name.trim()
        ? `\n\nPLOT THEME (MANDATORY):\n- Name: ${plotTheme.name}\n- Description: ${plotTheme.description || '(none)'}\n- Key elements: ${(Array.isArray(plotTheme.keyElements) ? plotTheme.keyElements : [])
            .filter((x) => typeof x === 'string' && x.trim())
            .slice(0, 10)
            .join(', ') || '(none)'}\n\nIMPORTANT: The plot theme can follow a three‑act framework (setup / confrontation / resolution), but that does NOT imply only three scenes. Treat it as a storytelling structure.`
        : '';

    const contextHeader = `CONTEXT:\n- Show: "${showName || '(unknown)'}"\n- Show description: "${showDescription || '(none)'}"\n- Episode title: "${episodeTitle || '(untitled)'}"${themeSection}`;

    // Build the full prompt for generating 3 different episode descriptions (2-4 sentences each)
    const fullPrompt = `${contextHeader}\n\nUSER REQUEST / STYLE GUIDANCE:\n${prompt}\n\nTASK:\nGenerate three different and unique EPISODE DESCRIPTIONS for this episode.\n- Each option should reflect the selected plot theme (if provided) and include at least 1-2 of the theme's key elements naturally.\n- Keep each description 2-4 sentences.\n- Use a professional, broadcaster-friendly tone (logline-ish but readable).\n- Do NOT list scenes. Do NOT mention \"Act I/II/III\" explicitly.\n\nFORMAT:\nReturn three separate options labeled exactly:\nStory 1:\n...\nStory 2:\n...\nStory 3:\n...`;

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

