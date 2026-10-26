/**
 * LearnForge Dynamic Curriculum Generator
 *
 * Generates custom, milestone-driven systems programming tracks on demand
 * using the local AI proxy (Gemini 3.8 / Argon).
 */

import { AI_CONFIG, CourseTrack } from './types';
import { SupportedLanguage } from '../../types';

export interface GenerateTrackOptions {
  topic: string;
  language?: SupportedLanguage;
  level?: 'Beginner' | 'Intermediate' | 'Advanced';
}

function normalizeLanguage(lang: string | undefined): SupportedLanguage {
  if (!lang) return 'go';
  const l = lang.toLowerCase().trim();
  if (l.includes('rust')) return 'rust';
  if (l.includes('python') || l.includes('py')) return 'python';
  if (l.includes('typescript') || l.includes('ts') || l.includes('javascript') || l.includes('js')) return 'typescript';
  return 'go';
}

export async function generateCustomTrack(
  options: GenerateTrackOptions,
  onStatusUpdate?: (status: string) => void
): Promise<CourseTrack> {
  const { topic, level = 'Intermediate' } = options;

  // Auto-detect language if specified in topic
  let detectedLanguage = options.language;
  if (!detectedLanguage) {
    const lower = topic.toLowerCase();
    if (lower.includes('rust') || lower.includes('borrow') || lower.includes('tokio')) {
      detectedLanguage = 'rust';
    } else if (lower.includes('python') || lower.includes('asyncio') || lower.includes('django') || lower.includes('fastapi')) {
      detectedLanguage = 'python';
    } else if (lower.includes('typescript') || lower.includes('javascript') || lower.includes('node') || lower.includes('react')) {
      detectedLanguage = 'typescript';
    } else if (lower.includes('golang') || lower.includes(' go ') || lower.endsWith(' go') || lower.startsWith('go ')) {
      detectedLanguage = 'go';
    }
  }

  onStatusUpdate?.('Analyzing topic & choosing optimal systems architecture…');

  const systemPrompt = `You are the LearnForge Curriculum Architect.
You generate rigorous, milestone-driven systems programming courses for technical engineers based purely on their requested topic.

Pedagogical Axiom: "Hear and forget. See and remember. Build and understand."
Every milestone must be hands-on with:
1. An atomic, focused mental model.
2. Starter boilerplate code with a clear TODO.
3. Automated test code that verifies invariants when executed.

Output strictly valid JSON (no markdown formatting, no code fences) with the exact structure:
{
  "title": "<Concise Course Title>",
  "tagline": "<1-sentence summary of what the engineer will build>",
  "language": "<One of: 'go', 'rust', 'python', 'typescript' - select the most idiomatic language for this topic>",
  "difficulty": "${level}",
  "estimatedHours": 4,
  "description": "<2-3 sentence technical overview>",
  "concepts": ["Concept 1", "Concept 2", "Concept 3"],
  "initialPrompt": "<Welcome message introducing the first concept>",
  "milestones": [
    {
      "id": "m1",
      "title": "<Milestone 1 Title>",
      "concept": "<Core invariant>",
      "prompt": "<Detailed requirements and instructions for Milestone 1>",
      "starter_code": "<Runnable boilerplate with TODO for the student>",
      "test_code": "<Automated test suite asserting correctness>",
      "hints": ["Hint 1", "Hint 2"]
    },
    {
      "id": "m2",
      "title": "<Milestone 2 Title>",
      "concept": "<Core invariant>",
      "prompt": "<Detailed requirements and instructions for Milestone 2>",
      "starter_code": "<Runnable boilerplate with TODO for the student>",
      "test_code": "<Automated test suite asserting correctness>",
      "hints": ["Hint 1", "Hint 2"]
    },
    {
      "id": "m3",
      "title": "<Milestone 3 Title>",
      "concept": "<Core invariant>",
      "prompt": "<Detailed requirements and instructions for Milestone 3>",
      "starter_code": "<Runnable boilerplate with TODO for the student>",
      "test_code": "<Automated test suite asserting correctness>",
      "hints": ["Hint 1", "Hint 2"]
    }
  ]
}`;

  onStatusUpdate?.('Designing milestones, starter code, and test suites…');

  const userPrompt = `Topic to master: "${topic}".
Skill level: ${level}.
${detectedLanguage ? `Preferred programming language: ${detectedLanguage}.` : `Select the best suited programming language from ('go', 'rust', 'python', 'typescript') for this topic.`}
Generate 3 progressive milestones leading to a working production component with complete runnable starter code and automated test assertions.`;

  const payload = {
    model: AI_CONFIG.DEFAULT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    response_format: { type: 'json_object' },
  };

  const response = await fetch(AI_CONFIG.DEFAULT_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`AI service returned HTTP ${response.status}: ${errorText || response.statusText}`);
  }

  const data = await response.json();
  const rawContent = data.choices?.[0]?.message?.content;
  if (!rawContent) {
    throw new Error('AI returned an empty curriculum response');
  }

  onStatusUpdate?.('Finalizing course track…');

  // Strip any accidental markdown formatting
  let cleanJson = rawContent.trim();
  if (cleanJson.startsWith('```json')) {
    cleanJson = cleanJson.replace(/^```json/, '').replace(/```$/, '').trim();
  } else if (cleanJson.startsWith('```')) {
    cleanJson = cleanJson.replace(/^```/, '').replace(/```$/, '').trim();
  }

  const parsed = JSON.parse(cleanJson);
  const trackId = `custom-${topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32)}-${Date.now().toString(36)}`;
  const chosenLanguage = normalizeLanguage(parsed.language || detectedLanguage);

  const track: CourseTrack = {
    id: trackId,
    title: parsed.title || topic,
    tagline: parsed.tagline || `Master ${topic}`,
    language: chosenLanguage,
    difficulty: parsed.difficulty || level,
    estimatedHours: parsed.estimatedHours || 4,
    description: parsed.description || `Hands-on guided track for ${topic}.`,
    concepts: Array.isArray(parsed.concepts) ? parsed.concepts : [topic],
    initialPrompt: parsed.initialPrompt || `Welcome to **${parsed.title || topic}**! Let's get started with Milestone 1.`,
    milestones: (parsed.milestones || []).map((m: any, idx: number) => ({
      id: `${trackId}-m${idx + 1}`,
      title: m.title || `Milestone ${idx + 1}`,
      concept: m.concept || m.title,
      prompt: m.prompt || 'Complete the exercise according to the tests.',
      starter_code: m.starter_code || '// Starter code',
      test_code: m.test_code || '// Tests',
      hints: Array.isArray(m.hints) ? m.hints : [],
    })),
  };

  return track;
}
