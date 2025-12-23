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
    };

const TOTAL_STEPS = 8;

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
}): string {
  const def = STEP_DEFS[params.stepIndex];
  const age = params.targetAge || '6-8';
  const langLine =
    params.language === 'EN'
      ? 'Ask the question in English.'
      : 'Zadaj pytanie po polsku (PL).';

  return `CONTEXT:
Show: ${params.showName}
Show description: ${params.showDescription || '(none)'}
Episode title: ${params.episodeTitle}
Episode description: ${params.episodeDescription || '(none)'}
Target age: ${age}

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

    const creativeBrief = answers.map((a, i) => `Q${i + 1} (${a.id}): ${a.question}\nA: ${a.answer}`).join('\n\n');

    // Reuse the existing screenplay generator prompt by calling the internal route logic:
    // We directly call Gemini here to avoid extra HTTP hop and keep control of output.
    const outputLanguageInstruction =
      language === 'EN'
        ? 'Write ALL screenplay content in English. Keep the [TYPE] markers exactly as specified.'
        : 'Write ALL screenplay content in Polish (PL). Keep the [TYPE] markers exactly as specified.';

    const finalPrompt = `You are a professional screenwriter specializing in children's animated television content, following industry-standard formats for 11-minute episodes (half-hour TV slots).

OUTPUT LANGUAGE (MANDATORY):
${outputLanguageInstruction}

CONTEXT:
- Show Name: "${showName}"
- Show Description: "${showDescription || 'An animated show for children'}"
- Episode Title: "${episodeTitle}"
- Episode Description: "${episodeDescription || 'An episode of the show'}"
- Target Audience: Children aged ${targetAge} years old

USER DECISIONS (MANDATORY - obey these):
${creativeBrief}

FORMATTING INSTRUCTIONS:
You MUST format your response using the following markers. Each element type must be clearly marked:

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

QUALITY REQUIREMENTS (best practices):
- 3-act structure for an 10-minute episode: Setup (0-2:30), Struggle (2:30-7:30), Climax (7:30-9:00), Resolution (9:00-10:00)
- 8-12 scenes, numbered sequentially starting at SCENE 01
- 2-4 speaking characters max
- Strong visual action blocks ("show, don't tell"), frequent parentheticals
- End on a comedic "button"
- Keep language age-appropriate and clear

Now write the full screenplay.`;

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
    const result = await model.generateContent(finalPrompt);
    const rawText = result.response.text();

    if (!rawText) {
      return NextResponse.json({ error: 'No screenplay generated' }, { status: 500 });
    }

    // Parse using the same strategy as generate-screenplay route (copied minimal parser)
    const typePattern = /\[(SCENE-SETTING|ACTION|CHARACTER|PARENTHETICAL|DIALOGUE|GENERAL)\]([\s\S]*?)\[\/\1\]/gi;
    const elements: Array<Pick<ScreenplayElement, 'type' | 'content'>> = [];
    let match: RegExpExecArray | null;

    while ((match = typePattern.exec(rawText)) !== null) {
      const normalizedType = match[1].toLowerCase() as ScreenplayElement['type'];
      let content = match[2].trim();
      content = content
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
        .join('\n');
      if (content) elements.push({ type: normalizedType, content });
    }

    if (elements.length === 0) {
      return NextResponse.json({ error: 'Failed to parse screenplay elements', rawText }, { status: 500 });
    }

    return NextResponse.json({ elements, rawText });
  } catch (error: unknown) {
    console.error('Error in screenplay wizard:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


