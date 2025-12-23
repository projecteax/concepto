import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY || '');

interface ScreenplayElement {
  type: 'scene-setting' | 'character' | 'action' | 'parenthetical' | 'dialogue' | 'general';
  content: string;
}

export async function POST(request: NextRequest) {
  try {
    const {
      showName,
      showDescription,
      episodeTitle,
      episodeDescription,
      targetAge = '6-8',
      language = 'PL',
      creativeBrief,
    } = await request.json();

    if (!showName || !episodeTitle) {
      return NextResponse.json({ error: 'Show name and episode title are required' }, { status: 400 });
    }

    const outputLanguageInstruction =
      language === 'EN'
        ? 'Write ALL screenplay content in English. Keep the [TYPE] markers exactly as specified.'
        : 'Write ALL screenplay content in Polish (PL). Keep the [TYPE] markers exactly as specified.';

    // Build comprehensive prompt following industry standards for 10-minute animation
    const prompt = `You are a professional screenwriter specializing in children's animated television content, following industry-standard formats for 11-minute episodes (half-hour TV slots).

OUTPUT LANGUAGE (MANDATORY):
${outputLanguageInstruction}

CONTEXT:
- Show Name: "${showName}"
- Show Description: "${showDescription || 'An animated show for children'}"
- Episode Title: "${episodeTitle}"
- Episode Description: "${episodeDescription || 'An episode of the show'}"
- Target Audience: Children aged ${targetAge} years old
${creativeBrief ? `\nCREATIVE BRIEF (user decisions - follow these):\n${creativeBrief}\n` : ''}

INDUSTRY STANDARDS - YOU MUST FOLLOW THESE EXACTLY:

1. SCRIPT LENGTH & FORMAT:
   - Total Length: 10 minutes (11-minute format)
   - Script Pages: 12-15 pages (1.1-1.5 pages per minute)
   - Dialogue Word Count: 800-1,200 words MINIMUM (dialogue alone)
   - Total Word Count: Much higher when including scene settings, action descriptions, etc.
   - Speaking Pace: 130-150 words per minute (continuous)
   - Dialogue Density: 75-100 words per minute (actual dialogue)

2. SCENE STRUCTURE:
   - Scene Count: 8-12 scenes (MANDATORY)
   - Average Scene Length: 45 seconds to 1.5 minutes
   - Main Locations: 3-4 primary locations (to keep budget reasonable)
   - Scene Transitions: Use hard cuts (most common), wipes, or dissolves only when necessary
   - Each scene must advance the plot significantly

3. CHARACTER LIMITATIONS:
   - Active Characters: 2-4 characters maximum
   - Focus: One Protagonist and one Antagonist/Foil
   - NO "B" plot - single focused storyline only
   - Side characters exist only to help or hinder the main character's goal

4. THREE-ACT STRUCTURE WITH EXACT TIMING (11-MINUTE BEAT SHEET):

   ACT I - THE SETUP (0:00 - 2:30):
   - Introduce the Goal: Character wants ONE specific thing
   - By 2:30: Character must leave their "normal world" (Inciting Incident)
   - Establish the character's normal world and what they want

   ACT II - THE STRUGGLE (2:30 - 7:30):
   - The "Fun & Games" section
   - Character tries to get the goal and FAILS 3 TIMES
   - Each failure must be BIGGER and FUNNIER than the last (Rising Action)
   - Build tension and visual gags

   ACT III - THE CLIMAX (7:30 - 9:00):
   - The "All is Lost" moment
   - Final, biggest attempt to achieve the goal
   - High visual pacing and action

   RESOLUTION (9:00 - 10:00):
   - Quick wrap-up
   - Character either gets what they wanted OR realizes they didn't need it
   - End on a joke (the "Button")

5. VISUAL ACTION vs DIALOGUE:
   - Animation is a VISUAL medium - "Show, Don't Tell"
   - Large blocks of ACTION description are REQUIRED
   - Action descriptions should be detailed and visual
   - Dialogue should be minimal but impactful
   - Visual gags are preferred over verbal jokes

6. GAG DENSITY (for comedy):
   - One "gag" (visual or verbal joke) every 15-20 seconds
   - Mix of visual gags and verbal humor
   - Gags should escalate in each act

7. DIALOGUE REQUIREMENTS:
   - Minimum 1,000 words of dialogue total
   - Age-appropriate language for ${targetAge} year olds
   - Simple, clear, and engaging
   - Each line should advance plot or character
   - Avoid exposition - show through action instead

FORMATTING INSTRUCTIONS:
You MUST format your response using the following markers. Each element type must be clearly marked:

[SCENE-SETTING]
SCENE XX
[Location description in standard format: INT./EXT. LOCATION - TIME OF DAY]
[/SCENE-SETTING]

[ACTION]
[Detailed visual description of what's happening - be VERY specific and visual. Include character movements, expressions, visual gags, and environmental details. These should be substantial blocks of text.]
[/ACTION]

[CHARACTER]
[Character name in ALL CAPS]
[/CHARACTER]

[PARENTHETICAL]
[(Stage direction, emotion, or delivery note - use frequently to indicate how dialogue should be delivered, what the character is doing, or their emotional state)]
[/PARENTHETICAL]

[DIALOGUE]
[What the character says - substantial dialogue that meets the 1,000+ word requirement]
[/DIALOGUE]

[GENERAL]
[Transition or narrative element - use only when necessary]
[/GENERAL]

CRITICAL REQUIREMENTS:
1. Start with SCENE 01 and number sequentially (SCENE 01, SCENE 02, etc.) up to SCENE 08-12
2. Follow the 3-act structure with timing markers in scene settings or action descriptions
3. Include substantial ACTION blocks - these should be detailed and visual
4. Dialogue must total at least 1,000 words across all scenes
5. Include visual gags every 15-20 seconds (approximately every 2-3 action blocks)
6. Each scene should be 45 seconds to 1.5 minutes of content
7. Use 2-4 characters maximum
8. Follow the beat sheet timing: Setup (0-2:30), Struggle (2:30-7:30), Climax (7:30-9:00), Resolution (9:00-10:00)
9. End with a joke or "button" moment
10. Make action descriptions LONG and DETAILED - this is a visual medium
11. USE PARENTHETICALS FREQUENTLY - Include parentheticals for most dialogue lines to indicate:
    - Emotional state (excited, worried, angry, happy, confused)
    - Delivery style (whispering, shouting, sarcastically, nervously)
    - Physical actions while speaking (while running, pointing, looking around)
    - Reactions (gasping, laughing, sighing)
    - Examples: (excited), (worried), (whispering), (while pointing), (sarcastically), (gasping), (laughing)

FORMATTING EXAMPLE:
[SCENE-SETTING]
SCENE 01
INT. LIVING ROOM - MORNING
[/SCENE-SETTING]

[ACTION]
The room is bright and cheerful. Character A sits on the couch, looking worried. They tap their fingers nervously on the armrest.
[/ACTION]

[CHARACTER]
CHARACTER A
[/CHARACTER]

[PARENTHETICAL]
(worried, looking around)
[/PARENTHETICAL]

[DIALOGUE]
I don't know if this is going to work. What if something goes wrong?
[/DIALOGUE]

[CHARACTER]
CHARACTER B
[/CHARACTER]

[PARENTHETICAL]
(confidently, patting Character A on the shoulder)
[/PARENTHETICAL]

[DIALOGUE]
Don't worry! We've got this. Everything will be fine, you'll see!
[/DIALOGUE]

[ACTION]
Character A looks up, a small smile forming. They stand up, determination in their eyes.
[/ACTION]

IMPORTANT: Use parentheticals for MOST dialogue lines to add emotional depth and delivery instructions. This is standard practice in animation scripts.

Now, write a complete 10-minute animated screenplay following ALL these industry standards exactly. Ensure you have 8-12 scenes, substantial dialogue (1,000+ words), detailed action descriptions, visual gags, frequent parentheticals, and follow the 3-act structure with proper timing.`;

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const generatedText = response.text();

    if (!generatedText) {
      return NextResponse.json({ error: 'No screenplay generated' }, { status: 500 });
    }

    // Parse the response into screenplay elements
    const elements = parseScreenplayResponse(generatedText);

    if (elements.length === 0) {
      return NextResponse.json({ error: 'Failed to parse screenplay elements' }, { status: 500 });
    }

    return NextResponse.json({ 
      elements,
      rawText: generatedText
    });
  } catch (error) {
    console.error('Error generating screenplay:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate screenplay' },
      { status: 500 }
    );
  }
}

function parseScreenplayResponse(text: string): ScreenplayElement[] {
  const elements: ScreenplayElement[] = [];
  
  // Pattern to match [TYPE]...[/TYPE] blocks (non-greedy)
  const typePattern = /\[(SCENE-SETTING|ACTION|CHARACTER|PARENTHETICAL|DIALOGUE|GENERAL)\]([\s\S]*?)\[\/\1\]/gi;
  
  let match;
  const matches: Array<{ type: string; content: string; index: number }> = [];
  
  // Collect all matches first
  while ((match = typePattern.exec(text)) !== null) {
    matches.push({
      type: match[1],
      content: match[2],
      index: match.index
    });
  }
  
  // Process matches in order
  matches.forEach(match => {
    // Normalize type: SCENE-SETTING -> scene-setting, others to lowercase
    let normalizedType = match.type.toLowerCase();
    if (normalizedType === 'scene-setting') {
      normalizedType = 'scene-setting';
    }
    
    const type = normalizedType as ScreenplayElement['type'];
    let content = match.content.trim();
    
    // Clean up content - remove extra whitespace but preserve meaningful line breaks
    content = content.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n');
    
    if (content.length > 0) {
      elements.push({
        type,
        content,
        // Note: id and position will be added by the client
      });
    }
  });
  
  // Fallback: if no structured elements found, try to parse by lines
  if (elements.length === 0) {
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    let currentType: ScreenplayElement['type'] = 'general';
    let lastType: ScreenplayElement['type'] = 'general';
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Try to detect type from line content
      if (trimmedLine.match(/^(INT\.|EXT\.|INT\/EXT\.)/i)) {
        currentType = 'scene-setting';
        elements.push({ type: currentType, content: trimmedLine });
        lastType = currentType;
      } else if (trimmedLine.match(/^[A-Z][A-Z\s]+$/) && trimmedLine.length < 30 && !trimmedLine.includes('.') && !trimmedLine.includes('(')) {
        // Likely a character name (all caps, short, no punctuation)
        currentType = 'character';
        elements.push({ type: currentType, content: trimmedLine });
        lastType = currentType;
      } else if (trimmedLine.startsWith('(') && trimmedLine.endsWith(')')) {
        // Parenthetical
        currentType = 'parenthetical';
        elements.push({ type: currentType, content: trimmedLine.slice(1, -1).trim() });
        lastType = currentType;
      } else if (trimmedLine.length > 0) {
        // Default to dialogue if we just had a character, otherwise action
        if (lastType === 'character') {
          currentType = 'dialogue';
        } else if (lastType !== 'dialogue' && lastType !== 'parenthetical') {
          currentType = 'action';
        } else if (lastType === 'parenthetical') {
          currentType = 'dialogue';
        } else {
          currentType = lastType;
        }
        elements.push({ type: currentType, content: trimmedLine });
        lastType = currentType;
      }
    }
  }
  
  return elements;
}

