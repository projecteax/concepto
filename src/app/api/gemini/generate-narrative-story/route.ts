import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { checkAiAccessInRoute } from '@/lib/ai-access-check';

const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY || '');

type Language = 'PL' | 'EN';

type ScreenplayBlockType =
  | 'SCENE-SETTING'
  | 'ACTION'
  | 'CHARACTER'
  | 'PARENTHETICAL'
  | 'DIALOGUE'
  | 'GENERAL';

function countWords(text: string): number {
  return text
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
}

function extractBlocks(screenplayText: string): Array<{ type: ScreenplayBlockType; content: string }> {
  const pattern = /\[(SCENE-SETTING|ACTION|CHARACTER|PARENTHETICAL|DIALOGUE|GENERAL)\]([\s\S]*?)\[\/\1\]/gi;
  const blocks: Array<{ type: ScreenplayBlockType; content: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(screenplayText)) !== null) {
    const type = match[1].toUpperCase() as ScreenplayBlockType;
    const content = (match[2] || '').trim();
    if (content) blocks.push({ type, content });
  }
  return blocks;
}

function uniqueStrings(items: string[], limit = 80): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const it of items) {
    const k = it.trim();
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
    if (out.length >= limit) break;
  }
  return out;
}

function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    // Optional AI access check (safety check - frontend should handle the main check)
    const accessCheck = await checkAiAccessInRoute(request);
    if (accessCheck) {
      return accessCheck;
    }
    const body = (await request.json()) as {
      language?: Language;
      showName?: string;
      showDescription?: string;
      episodeTitle?: string;
      targetAge?: string;
      screenplayText?: string;
      minWords?: number;
    };

    const language: Language = body.language === 'EN' ? 'EN' : 'PL';
    const minWords = typeof body.minWords === 'number' && body.minWords > 0 ? body.minWords : 1200;
    const targetAge = body.targetAge || '6-8';

    const showName = body.showName || '';
    const showDescription = body.showDescription || '';
    const episodeTitle = body.episodeTitle || '';
    const screenplayText = body.screenplayText || '';

    if (!episodeTitle || !screenplayText.trim()) {
      return NextResponse.json({ error: 'episodeTitle and screenplayText are required' }, { status: 400 });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

    const outputLanguage =
      language === 'EN'
        ? 'Write the narrative in English.'
        : 'Napisz opowieść po polsku (PL).';

    // Parse screenplay blocks as ground truth (the client sends tagged blocks)
    const blocks = extractBlocks(screenplayText);
    const dialogueBlocks = uniqueStrings(
      blocks.filter((b) => b.type === 'DIALOGUE').map((b) => b.content),
      120,
    );
    const timeline = blocks
      .filter((b) => b.type === 'SCENE-SETTING' || b.type === 'ACTION')
      .slice(0, 80)
      .map((b, i) => `${i + 1}. [${b.type}] ${b.content.replace(/\s+/g, ' ').slice(0, 280)}`)
      .join('\n');

    const fidelityRules =
      `FIDELITY RULES (CRITICAL - do not violate):\n` +
      `- The narrative MUST follow the screenplay's plot and sequence of events. Do NOT invent new events or reorder major events.\n` +
      `- Do NOT add new characters. Use only characters implied by the screenplay.\n` +
      `- Dialogue must NEVER be paraphrased. If you include any dialogue in quotes, it MUST match EXACTLY one of the allowed dialogue blocks.\n` +
      `- If you cannot keep dialogue verbatim, OMIT dialogue and use narration instead.\n` +
      `- Do NOT mention screenplay formatting, tags, or scene headings.\n` +
      `- Title must be EXACTLY: "${episodeTitle}".\n`;

    const allowedDialogueSection =
      dialogueBlocks.length > 0
        ? `\nALLOWED DIALOGUE BLOCKS (verbatim only; do not change punctuation):\n${dialogueBlocks
            .map((d, i) => `D${i + 1}: ${d.replace(/\n+/g, ' ')}`)
            .join('\n')}\n`
        : '\nALLOWED DIALOGUE BLOCKS: (none provided)\n';

    const timelineSection = timeline ? `\nSCREENPLAY EVENT TIMELINE (ground truth):\n${timeline}\n` : '';

    // Step 1: Ask for an outline + style bible, returned as JSON (must follow the timeline)
    const outlinePrompt = `You are a children's story writer (storybook / fairy-tale / bedtime story tone) and story editor.

${outputLanguage}

CONTEXT:
- Show: "${showName}"
- Show description: "${showDescription}"
- Episode title: "${episodeTitle}"
- Target age: ${targetAge}

${fidelityRules}
${timelineSection}
${allowedDialogueSection}

TASK:
Create an outline and narration style guide for a FULL bedtime-story prose adaptation (NOT a summary) that follows the screenplay events.
The final story should feel like a real children's book chapter: vivid, playful, with clear moment-to-moment action.

OUTPUT: return ONLY strict JSON with this schema:
{
  "title": "${episodeTitle}",
  "styleGuide": string,  // 8-14 short bullet-like sentences describing voice and rules
  "beats": string[]      // 12-20 beats, each 1-2 sentences, in story order. Each beat should be a SCENE-LIKE moment (what happens, where, and what changes).
}`;

    const outlineRes = await model.generateContent(outlinePrompt);
    const outlineText = outlineRes.response.text();
    const outline = safeJsonParse<{ title: string; styleGuide: string; beats: string[] }>(outlineText) || {
      title: episodeTitle,
      styleGuide:
        language === 'EN'
          ? 'Warm, simple bedtime-story voice. Clear sentences. Gentle humor. No screenplay formatting.'
          : 'Ciepły, prosty głos bajki na dobranoc. Jasne zdania. Delikatny humor. Bez formatowania scenariusza.',
      beats: [],
    };

    // Step 2: Generate narrative in chunks to reliably reach minimum length.
    let story = '';
    const maxParts = 5;
    const minPerPart = 420; // words, rough target

    for (let part = 1; part <= maxParts; part++) {
      const currentWords = countWords(story);
      if (currentWords >= minWords) break;

      const remaining = Math.max(minWords - currentWords, minPerPart);
      const perPartTarget = Math.min(Math.max(remaining, minPerPart), 900);

      const continuationPrompt = `You are writing a children's bedtime story prose adaptation.

${outputLanguage}

TITLE (must match exactly): ${episodeTitle}
STYLE GUIDE:
${outline.styleGuide}

STORY BEATS (use these as the backbone; keep events consistent):
${(outline.beats || []).map((b, i) => `${i + 1}. ${b}`).join('\n') || '(none)'}

${fidelityRules}
${timelineSection}
${allowedDialogueSection}

ALREADY WRITTEN (continue seamlessly; do not repeat large parts):
${story ? story.slice(-8000) : '(nothing yet)'}

TASK:
- Write the NEXT part of the story in continuous prose (this is NOT a summary).
- Aim for about ${perPartTarget} words in this part.
- Expand moment-to-moment: dramatize actions, reactions, and small beats. Treat beats like scenes.
- Use vivid but simple sensory details (wind, sounds, colors, small funny observations) suitable for age ${targetAge}.
- Keep sentences clear and readable. Avoid long abstract explanations.
- Use paragraph breaks (at least 6 paragraphs in this part).
- IMPORTANT: Do NOT compress events into 1-2 sentences. Each major beat should become multiple sentences/paragraphs.
- Do NOT use screenplay tags, character labels, or scene headings.
- Avoid meta commentary (no “in this story…”, no “the script says…”).
- Dialogue rule: If you include dialogue in quotes, it MUST be copied EXACTLY from the allowed dialogue blocks above (no paraphrasing, no changes). If you cannot keep it verbatim, OMIT dialogue and narrate instead.

OUTPUT: return ONLY the prose text for this part.`;

      const partRes = await model.generateContent(continuationPrompt);
      const partText = partRes.response.text().trim();
      if (!partText) break;

      story = `${story}${story ? '\n\n' : ''}${partText}`;
    }

    // Step 3: If still short, do a final expansion pass.
    const finalWords = countWords(story);
    if (finalWords < minWords) {
      const expandPrompt = `You are revising a children's bedtime story prose adaptation.

${outputLanguage}

CURRENT WORD COUNT: ${finalWords}
MIN REQUIRED: ${minWords}

${fidelityRules}
${timelineSection}
${allowedDialogueSection}

TASK:
- Expand the story into FULL storybook prose (NOT a summary) by adding:
  - moment-to-moment action,
  - small sensory details,
  - emotions and intentions,
  - gentle humor and playful metaphors (age-appropriate),
  - short interactions and reactions.
- Do NOT change plot facts.
- Keep the same tone and readability.
- Keep it as continuous prose (no screenplay formatting).
- Do NOT introduce new dialogue lines. If you add dialogue, it MUST be verbatim from allowed dialogue blocks.

STORY:
${story}

OUTPUT: return ONLY the revised full story text.`;

      const expRes = await model.generateContent(expandPrompt);
      const expanded = expRes.response.text().trim();
      if (expanded) story = expanded;
    }

    const wordCount = countWords(story);
    // Title is enforced as episodeTitle (never take model-provided titles).
    return NextResponse.json({ story, wordCount, minWords, title: episodeTitle });
  } catch (error) {
    console.error('Error generating narrative story:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate narrative story' },
      { status: 500 },
    );
  }
}


