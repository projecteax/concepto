import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ScreenplayElement } from '@/types';

const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY || '');

type WizardLanguage = 'PL' | 'EN';

type WizardAnswer = {
  id: string;
  question: string;
  answer: string;
};

type WizardQuestionKind = 'yes_no_suggestion' | 'single_choice' | 'free_text';

type WizardQuestion = {
  step: number;
  totalSteps: number;
  id: string;
  kind: WizardQuestionKind;
  question: string;
  suggestion?: string;
  choices?: string[];
  placeholder?: string;
};

type SelectedCharacter = {
  id: string;
  name: string;
  description: string;
  general: Record<string, unknown>;
};

type PlotThemeData = {
  id: string;
  name: string;
  description: string;
  keyElements: string[];
  tags: string[];
};

type WizardRequest =
  | {
      action: 'next';
      language: WizardLanguage;
      showName: string;
      showDescription?: string;
      episodeTitle: string;
      episodeDescription?: string;
      targetAge?: string;
      answers: WizardAnswer[];
      plotTheme?: PlotThemeData;
      selectedCharacters?: SelectedCharacter[];
    }
  | {
      action: 'final';
      language: WizardLanguage;
      showName: string;
      showDescription?: string;
      episodeTitle: string;
      episodeDescription?: string;
      targetAge?: string;
      answers: WizardAnswer[];
      plotTheme?: PlotThemeData;
      selectedCharacters?: SelectedCharacter[];
    };

const TOTAL_STEPS = 8;
const MIN_DIALOGUE_WORDS = 1000;
// Ask for a buffer so we reliably clear the minimum after parsing/normalization.
const TARGET_DIALOGUE_WORDS = MIN_DIALOGUE_WORDS + 250;

const STEP_DEFS: Array<{
  id: string;
  goal: string;
  defaultKind: WizardQuestionKind;
}> = [
  { id: 'premise', goal: 'Define the episode premise/logline in one sentence.', defaultKind: 'yes_no_suggestion' },
  { id: 'protagonist', goal: 'Pick the protagonist focus for this episode.', defaultKind: 'single_choice' },
  { id: 'goal', goal: 'Define the protagonist’s concrete goal (ONE thing).', defaultKind: 'yes_no_suggestion' },
  { id: 'obstacle', goal: 'Define the main obstacle/antagonistic force.', defaultKind: 'yes_no_suggestion' },
  { id: 'locations', goal: 'Pick 3-4 main locations to reuse.', defaultKind: 'single_choice' },
  { id: 'setpieces', goal: 'Choose a fun escalation set-piece (midpoint) and a climax set-piece.', defaultKind: 'single_choice' },
  { id: 'ending', goal: 'Choose the ending: win / partial win / lesson / twist + final “button” joke.', defaultKind: 'single_choice' },
  { id: 'tone', goal: 'Confirm tone, pacing, and dialogue style (age-appropriate).', defaultKind: 'yes_no_suggestion' },
];

function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    // try to extract a JSON object from a fenced or noisy response
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }
}

function countWords(text: string): number {
  return text
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
}

function parseScreenplayElements(rawText: string): {
  elements: Array<Pick<ScreenplayElement, 'type' | 'content'>>;
  dialogueWordCount: number;
} {
  const typePattern = /\[(SCENE-SETTING|ACTION|CHARACTER|PARENTHETICAL|DIALOGUE|GENERAL)\]([\s\S]*?)\[\/\1\]/gi;
  const elements: Array<Pick<ScreenplayElement, 'type' | 'content'>> = [];

  let lastEnd = 0;
  let match: RegExpExecArray | null;
  while ((match = typePattern.exec(rawText)) !== null) {
    const start = match.index ?? 0;
    const end = typePattern.lastIndex;

    // Capture any stray text between blocks and treat as ACTION (salvage)
    const gap = rawText.slice(lastEnd, start).trim();
    if (gap) {
      elements.push({ type: 'action', content: gap });
    }

    const normalizedType = match[1].toLowerCase() as ScreenplayElement['type'];
    let content = (match[2] || '').trim();
    content = content
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .join('\n');

    // If a dialogue block starts with a parenthetical line, split it out
    if (normalizedType === 'dialogue') {
      const lines = content.split('\n');
      if (lines.length >= 2 && /^\(.*\)$/.test(lines[0].trim())) {
        const parenthetical = lines[0].trim();
        const rest = lines.slice(1).join('\n').trim();
        if (parenthetical) elements.push({ type: 'parenthetical', content: parenthetical });
        if (rest) elements.push({ type: 'dialogue', content: rest });
      } else if (content) {
        elements.push({ type: 'dialogue', content });
      }
    } else {
      if (content) elements.push({ type: normalizedType, content });
    }

    lastEnd = end;
  }

  // Capture trailing stray text
  const tail = rawText.slice(lastEnd).trim();
  if (tail) {
    elements.push({ type: 'action', content: tail });
  }

  const dialogueWordCount = elements
    .filter((e) => e.type === 'dialogue')
    .reduce((acc, e) => acc + countWords(e.content), 0);

  return { elements, dialogueWordCount };
}

function stringifyAnswers(answers: WizardAnswer[], language: WizardLanguage): string {
  const header =
    language === 'EN'
      ? 'User answers so far (use these as requirements):'
      : 'Dotychczasowe odpowiedzi użytkownika (traktuj je jako wymagania):';

  if (!answers.length) return `${header}\n- (none yet)`;
  return `${header}\n${answers
    .map((a, i) => `- Q${i + 1} (${a.id}): ${a.question}\n  A: ${a.answer}`)
    .join('\n')}`;
}

function buildQuestionSystemPrompt(language: WizardLanguage): string {
  return language === 'EN'
    ? `You are a professional TV animation screenwriter and story editor.
You will propose ONE question at a time to refine a children’s 10-minute episode screenplay.
Return ONLY strict JSON. No markdown.`
    : `Jesteś profesjonalnym scenarzystą animacji telewizyjnej i story edytorem.
Zadasz JEDNO pytanie naraz, aby doprecyzować scenariusz 10-minutowego odcinka dla dzieci.
Zwróć TYLKO poprawny JSON. Bez markdown.`;
}

function buildQuestionUserPrompt(params: {
  language: WizardLanguage;
  showName: string;
  showDescription?: string;
  episodeTitle: string;
  episodeDescription?: string;
  targetAge?: string;
  stepIndex: number;
  answers: WizardAnswer[];
  plotTheme?: PlotThemeData;
  selectedCharacters?: SelectedCharacter[];
}): string {
  const def = STEP_DEFS[params.stepIndex];
  const age = params.targetAge || '6-8';
  const langLine =
    params.language === 'EN'
      ? 'Ask the question in English.'
      : 'Zadaj pytanie po polsku (PL).';

  const plotThemeContext =
    params.plotTheme && params.plotTheme.name
      ? `\nPLOT THEME (MANDATORY):\n- Name: ${params.plotTheme.name}\n- Description: ${params.plotTheme.description || '(none)'}\n- Key elements: ${(params.plotTheme.keyElements || []).join(', ') || '(none)'}\n\nIMPORTANT: Themes often follow a three‑act framework (setup / confrontation / resolution), but that does NOT mean only three scenes. Treat it as a story progression framework.\n`
      : '';

  const charactersContext =
    params.selectedCharacters && params.selectedCharacters.length > 0
      ? `\nCHARACTERS (MANDATORY - must appear in this episode):\n${params.selectedCharacters
          .map((c) => `- ${c.name}: ${c.description || '(no description)'}`)
          .join('\n')}\n`
      : '';

  return `CONTEXT:
Show: ${params.showName}
Show description: ${params.showDescription || '(none)'}
Episode title: ${params.episodeTitle}
Episode description: ${params.episodeDescription || '(none)'}
Target age: ${age}
${plotThemeContext}${charactersContext}

STEP ${params.stepIndex + 1} OF ${TOTAL_STEPS}
Step id: ${def.id}
Step goal: ${def.goal}
Preferred UI kind: ${def.defaultKind}

${stringifyAnswers(params.answers, params.language)}

INSTRUCTIONS:
- ${langLine}
- Keep it short and decisive.
- If kind is "yes_no_suggestion": include a single, concrete suggestion we can accept with yes/no.
- If kind is "single_choice": include 3-5 distinct choices, each a short phrase.
- Avoid vague questions. Tie choices to the show/episode context.
${params.plotTheme ? '- Ensure the question/choices respect the selected plot theme and its key elements.\n' : ''}${
    params.selectedCharacters && params.selectedCharacters.length > 0
      ? '- Ensure the question/choices can involve the selected characters.\n'
      : ''
  }

OUTPUT JSON SCHEMA (exact keys):
{
  "step": number,
  "totalSteps": ${TOTAL_STEPS},
  "id": "${def.id}",
  "kind": "${def.defaultKind}",
  "question": string,
  "suggestion": string | undefined,
  "choices": string[] | undefined,
  "placeholder": string | undefined
}`;
}

export async function POST(request: NextRequest) {
  try {
    const raw = (await request.json()) as unknown;

    const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
    if (!isRecord(raw)) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const action = raw['action'];
    if (action !== 'next' && action !== 'final') {
      return NextResponse.json({ error: "action must be 'next' or 'final'" }, { status: 400 });
    }

    const language = raw['language'];
    if (language !== 'PL' && language !== 'EN') {
      return NextResponse.json({ error: 'language must be PL or EN' }, { status: 400 });
    }

    const showName = raw['showName'];
    const episodeTitle = raw['episodeTitle'];
    if (typeof showName !== 'string' || !showName.trim() || typeof episodeTitle !== 'string' || !episodeTitle.trim()) {
      return NextResponse.json({ error: 'showName and episodeTitle are required' }, { status: 400 });
    }

    const showDescription = typeof raw['showDescription'] === 'string' ? raw['showDescription'] : undefined;
    const episodeDescription = typeof raw['episodeDescription'] === 'string' ? raw['episodeDescription'] : undefined;
    const targetAge = typeof raw['targetAge'] === 'string' ? raw['targetAge'] : '6-8';

    const answersRaw = raw['answers'];
    const answers: WizardAnswer[] = [];
    if (Array.isArray(answersRaw)) {
      for (const item of answersRaw) {
        if (!isRecord(item)) continue;
        const id = item['id'];
        const question = item['question'];
        const answer = item['answer'];
        if (typeof id === 'string' && typeof question === 'string' && typeof answer === 'string') {
          answers.push({ id, question, answer });
        }
      }
    } else {
      return NextResponse.json({ error: 'answers must be an array' }, { status: 400 });
    }

    // Parse plotTheme and selectedCharacters from request (used in both 'next' and 'final' actions)
    const plotThemeRaw = raw['plotTheme'];
    const plotTheme: PlotThemeData | undefined = isRecord(plotThemeRaw) && 
      typeof plotThemeRaw['id'] === 'string' &&
      typeof plotThemeRaw['name'] === 'string' &&
      typeof plotThemeRaw['description'] === 'string'
      ? {
          id: plotThemeRaw['id'],
          name: plotThemeRaw['name'],
          description: plotThemeRaw['description'],
          keyElements: Array.isArray(plotThemeRaw['keyElements']) ? plotThemeRaw['keyElements'].filter((e: unknown) => typeof e === 'string') : [],
          tags: Array.isArray(plotThemeRaw['tags']) ? plotThemeRaw['tags'].filter((t: unknown) => typeof t === 'string') : [],
        }
      : undefined;

    const selectedCharactersRaw = raw['selectedCharacters'];
    const selectedCharacters: SelectedCharacter[] = [];
    if (Array.isArray(selectedCharactersRaw)) {
      for (const char of selectedCharactersRaw) {
        if (!isRecord(char)) continue;
        const id = char['id'];
        const name = char['name'];
        const description = char['description'];
        const general = char['general'];
        if (typeof id === 'string' && typeof name === 'string') {
          selectedCharacters.push({
            id,
            name,
            description: typeof description === 'string' ? description : '',
            general: isRecord(general) ? general : {},
          });
        }
      }
    }

    if (action === 'next') {
      const stepIndex = Math.min(answers.length, TOTAL_STEPS - 1);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

      const prompt =
        `${buildQuestionSystemPrompt(language)}\n\n` +
        buildQuestionUserPrompt({
          language,
          showName,
          showDescription,
          episodeTitle,
          episodeDescription,
          targetAge,
          stepIndex,
          answers,
          plotTheme,
          selectedCharacters,
        });

      const result = await model.generateContent(prompt);
      const generatedText = result.response.text();
      const parsed = safeJsonParse<WizardQuestion>(generatedText);

      if (parsed && typeof parsed.question === 'string' && typeof parsed.step === 'number') {
        return NextResponse.json({ question: parsed });
      }

      // Hard fallback (non-blocking)
      const def = STEP_DEFS[stepIndex];
      const fallbackQuestion: WizardQuestion = {
        step: stepIndex,
        totalSteps: TOTAL_STEPS,
        id: def.id,
        kind: def.defaultKind,
        question:
          language === 'EN'
            ? 'What should happen next? (Briefly describe your preference.)'
            : 'Co ma się wydarzyć dalej? (Krótko opisz preferencję.)',
        placeholder: language === 'EN' ? 'Your answer…' : 'Twoja odpowiedź…',
      };
      return NextResponse.json({ question: fallbackQuestion });
    }

    // action === 'final'
    if (answers.length < TOTAL_STEPS) {
      return NextResponse.json(
        { error: `Need at least ${TOTAL_STEPS} answers to generate a screenplay` },
        { status: 400 },
      );
    }

    // plotTheme and selectedCharacters are already parsed above

    const creativeBrief = answers.map((a, i) => `Q${i + 1} (${a.id}): ${a.question}\nA: ${a.answer}`).join('\n\n');

    // Reuse the existing screenplay generator prompt by calling the internal route logic:
    // We directly call Gemini here to avoid extra HTTP hop and keep control of output.
    const outputLanguageInstruction =
      language === 'EN'
        ? 'Write ALL screenplay content in English. Keep the [TYPE] markers exactly as specified.'
        : 'Write ALL screenplay content in Polish (PL). Keep the [TYPE] markers exactly as specified.';

    let plotThemeSection = '';
    if (plotTheme) {
      plotThemeSection = `
PLOT THEME (MANDATORY - use this as the structural framework):
Name: ${plotTheme.name}
Description: ${plotTheme.description}
Key Elements: ${plotTheme.keyElements.join(', ')}
Tags: ${plotTheme.tags.join(', ')}

CRITICAL: The plot theme provides the narrative structure. Themes often follow a three-act structure (Setup, Confrontation, Resolution), but this does NOT mean only three scenes. Each act should contain multiple scenes (typically 3-5 scenes per act) that progressively develop the theme's key elements. The three-act structure is a framework for story progression, not a scene count limitation.`;
    }

    let charactersSection = '';
    if (selectedCharacters && selectedCharacters.length > 0) {
      charactersSection = `
CHARACTERS (MANDATORY - these characters MUST appear and speak in the episode):
${selectedCharacters.map(char => {
  const personality = isRecord(char.general) && typeof char.general.personality === 'string' 
    ? ` (Personality: ${char.general.personality})` 
    : '';
  return `- ${char.name}: ${char.description || 'No description provided'}${personality}`;
}).join('\n')}

These characters must be actively involved in the story and have dialogue.`;
    }

    const finalPrompt = `You are a professional screenwriter specializing in children's animated television content, following industry-standard formats for 10-minute episodes.

OUTPUT LANGUAGE (MANDATORY):
${outputLanguageInstruction}

CONTEXT:
- Show Name: "${showName}"
- Show Description: "${showDescription || 'An animated show for children'}"
- Episode Title: "${episodeTitle}"
- Episode Description: "${episodeDescription || 'An episode of the show'}"
- Target Audience: Children aged ${targetAge} years old
${plotThemeSection}
${charactersSection}

USER DECISIONS (MANDATORY - obey these):
${creativeBrief}

FORMATTING INSTRUCTIONS:
You MUST format your response using the following markers. Each element type must be clearly marked.
CRITICAL: Do NOT output any text outside of these blocks. Every line must be inside exactly one block.
CRITICAL: Parentheticals MUST be in [PARENTHETICAL] blocks, not inside [DIALOGUE].

[SCENE-SETTING]
SCENE XX
[Location description in standard format: INT./EXT. LOCATION - TIME OF DAY]
[/SCENE-SETTING]

[ACTION]
[Detailed visual description...]
[/ACTION]

[CHARACTER]
[Character name in ALL CAPS]
[/CHARACTER]

[PARENTHETICAL]
[(Stage direction/emotion/delivery note)]
[/PARENTHETICAL]

[DIALOGUE]
[What the character says]
[/DIALOGUE]

[GENERAL]
[Transition or narrative element]
[/GENERAL]

QUALITY REQUIREMENTS (industry standards):
- ${plotTheme ? 'Follow the three-act structure framework provided by the plot theme. ' : 'Use a three-act structure: '}Setup (0-2:30), Confrontation/Struggle (2:30-7:30), Climax (7:30-9:00), Resolution (9:00-10:00)
- IMPORTANT: The three-act structure is a narrative framework, NOT a scene count limit. Each act should contain multiple scenes (typically 3-5 scenes per act) that progress the story. Total: 8-15 scenes, numbered sequentially starting at SCENE 01
- ${selectedCharacters && selectedCharacters.length > 0 ? `Use these characters: ${selectedCharacters.map(c => c.name).join(', ')}. ` : ''}Limit to 2-4 speaking characters per scene
- Strong visual action blocks ("show, don't tell"), frequent parentheticals
- End on a comedic "button" (final joke/punchline)
- Keep language age-appropriate and clear
- ${plotTheme ? `Weave the plot theme's key elements (${plotTheme.keyElements.join(', ')}) naturally throughout the acts and scenes.` : ''}
- Dialogue requirement: MINIMUM ${MIN_DIALOGUE_WORDS} words total across all [DIALOGUE] blocks. Aim for at least ${TARGET_DIALOGUE_WORDS} words.
- Self-check requirement (MANDATORY): Before you finish, verify the total words across all [DIALOGUE] blocks is >= ${MIN_DIALOGUE_WORDS}. If not, expand dialogue until it is.
- Cold open allowed: You may begin with [SCENE-SETTING] and [ACTION] before the first speaking character to set up atmosphere/stakes.

Now write the full screenplay following industry-standard formatting.`;

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

    let rawText = '';
    let elements: Array<Pick<ScreenplayElement, 'type' | 'content'>> = [];
    let dialogueWordCount = 0;

    // Multiple passes: generate then (if needed) expand dialogue to meet the minimum words.
    for (let attempt = 0; attempt < 4; attempt++) {
      const promptToUse =
        attempt === 0
          ? finalPrompt
          : `You are revising an existing screenplay draft.\n\nCURRENT METRIC:\n- Current dialogue word count: ${dialogueWordCount}\n- Minimum required: ${MIN_DIALOGUE_WORDS}\n- Target: ${TARGET_DIALOGUE_WORDS}\n\nGOAL:\n- Keep the same plot, beats, and structure.\n- Expand dialogue significantly until the total dialogue words >= ${MIN_DIALOGUE_WORDS} (aim for ${TARGET_DIALOGUE_WORDS}).\n- Add natural banter, reactions, clarifying lines, and short comedic beats.\n- Increase dialogue density especially in the middle act and during complications.\n- Do NOT add new characters beyond those already present.\n- Do NOT add new major plotlines.\n\nFORMAT RULES (STRICT):\n- Do NOT output any text outside of the required blocks.\n- Parentheticals MUST be in [PARENTHETICAL] blocks, never inside [DIALOGUE].\n\nHere is the current draft (revise it):\n\n${rawText}`;

      const result = await model.generateContent(promptToUse);
      rawText = result.response.text();

      if (!rawText) break;

      const parsed = parseScreenplayElements(rawText);
      elements = parsed.elements;
      dialogueWordCount = parsed.dialogueWordCount;

      if (elements.length > 0 && dialogueWordCount >= MIN_DIALOGUE_WORDS) {
        break;
      }
    }

    if (!rawText) {
      return NextResponse.json({ error: 'No screenplay generated' }, { status: 500 });
    }

    // Parse with a resilient parser (also salvages stray text and splits parentheticals in dialogue).
    if (elements.length === 0) {
      const parsed = parseScreenplayElements(rawText);
      elements = parsed.elements;
      dialogueWordCount = parsed.dialogueWordCount;
    }

    if (elements.length === 0) {
      return NextResponse.json({ error: 'Failed to parse screenplay elements', rawText }, { status: 500 });
    }

    return NextResponse.json({ elements, rawText, dialogueWordCount, minDialogueWords: MIN_DIALOGUE_WORDS });
  } catch (error: unknown) {
    console.error('Error in screenplay wizard:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


