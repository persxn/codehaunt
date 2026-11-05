/**
 * Tutor guardrails v2 (ADR-042). Security-critical: Claude-owned. Pure.
 *
 * Classes each student question by intent and picks the hint level, so the server can steer the tutor turn by turn
 * instead of relying on the system prompt alone. Heuristics on the question text only: the tutor never sees the
 * code or the statement (ADR-033). Whatever the model then writes, the reply filter still enforces the code limits.
 */

export type TutorIntent = 'answer_seeking' | 'debugging' | 'hint' | 'concept' | 'general';
export type HintLevel = 1 | 2 | 3 | 4;

const SOLUTION_NOUN = String.raw`(code|solution|answer|program|implementation|output|source|logic|algorithm)`;
const QUALIFIER = String.raw`(full|complete|whole|entire|final|working|correct|exact|right|actual)`;
// "the complete C++ solution": a language name may sit between the qualifier and the noun (live check, WP-11).
const LANG = String.raw`((python|python3|c\+\+|cpp|java|c)\s+)?`;

const ANSWER_SEEKING: RegExp[] = [
  // "give me the code", "write the complete solution", "show me your full program"
  new RegExp(String.raw`\b(give|write|show|send|tell|provide|paste|type|share|generate|make)\b(\s+(me|us))?\s+(the|your|this|that|its|a|an)?\s*(${QUALIFIER}\s+)*${LANG}${SOLUTION_NOUN}\b(?!\s+(example|of\s+(a|an)\b))`, 'i'),
  // "complete code", "full solution" anywhere
  new RegExp(String.raw`\b${QUALIFIER}\s+${LANG}(source\s+)?(code|solution|program|implementation|answer)\b`, 'i'),
  // Piece by piece: "lines 1-4", "the next lines", "the rest", "put it all together" (WP-08 / WP-11 live checks).
  /\blines?\s+\d+\s*(-|–|to|through)\s*\d+\b/i,
  /\b(the\s+)?(rest|remaining)(\s+(lines?|code|part|of\s+(it|the\s+(code|solution|program))))?\s*[?.!]*\s*$/i,
  /\b(next|remaining|following|first|last)\s+(\d+\s+)?lines?\b/i,
  /\bput\s+(it|them|everything)\s+(all\s+)?together\b/i,
  // Pseudo-code or the steps of their task.
  /\bpseudo[\s-]?code\b/i,
  /\b(steps|algorithm)\s+(to|for)\s+(solve|solving|this|the|my)\b/i,
  new RegExp(String.raw`\b${LANG}(solution|code|program)\s+(for|to)\s+(it|this|that)\b`, 'i'),
  // "solve this / it / the problem for me"
  /\bsolve\b[^.?!\n]{0,30}\b(this|it|that|the (problem|question|task)|for me|my (problem|question|task))\b/i,
  // "just tell me the output", "only the answer"
  new RegExp(String.raw`\b(just|only|simply)\b[^.?!\n]{0,25}\b${SOLUTION_NOUN}\b`, 'i'),
  /\bwithout (any )?(explanation|explaining|hints?)\b/i,
  /\b(do|finish|complete) (it|this|that|the (problem|question|task)) for me\b/i,
  new RegExp(String.raw`\b${SOLUTION_NOUN}\s+(for|to)\s+(this|the|my)\s+(problem|question|task|exercise)\b`, 'i'),
  /\bwhat('?s| is| would be) the (final |correct |right )?(answer|solution)\b/i,
  /\b(code|program) (it|this|that) (up )?for me\b/i,
];

const DEBUGGING =
  /\b(error|exception|wrong answer|WA|TLE|MLE|time limit|memory limit|segfault|segmentation|crash(es|ed)?|doesn'?t work|does not work|not working|fails?|failing|failed|bug|buggy|my code|my solution|my program|my approach|my attempt|i tried|i wrote|returns? (the )?wrong|prints? (the )?wrong|instead of|compil(e|er|ation)|runtime|traceback|stack overflow|infinite loop|off by one)\b/i;
const HINT =
  /\b(hint|clue|nudge|stuck|where (do|should|can) i (start|begin)|how (do|should|can|would) i (start|begin|approach|think about)|which approach|what approach|direction|idea)\b/i;
const CONCEPT =
  /^\s*(what|why|how|when|which|explain|define|describe|can you explain|could you explain|tell me about|is it|is there|does|do)\b|\b(what is|what are|what does|explain|difference between|meaning of|how does|how do .* work|time complexity|space complexity|big[- ]o|example of|examples? (for|with|using))\b/i;

/** The intent of one question. Answer-seeking wins over the others ("my code fails, give me the correct code"). */
export function classifyIntent(question: string): TutorIntent {
  const q = question.replace(/\s+/g, ' ').trim();
  if (!q) return 'general';
  if (ANSWER_SEEKING.some((r) => r.test(q))) return 'answer_seeking';
  if (DEBUGGING.test(q)) return 'debugging';
  if (HINT.test(q)) return 'hint';
  if (CONCEPT.test(q)) return 'concept';
  return 'general';
}

/**
 * The hint level for this turn: one higher for every earlier answer-seeking or hint question in the same chat
 * session, capped at 4. A new session (a fresh context) starts again at 1.
 */
export function hintLevel(earlier: readonly TutorIntent[]): HintLevel {
  const asked = earlier.filter((i) => i === 'answer_seeking' || i === 'hint').length;
  return Math.min(4, 1 + asked) as HintLevel;
}

const NO_LABEL = ' Do not name or number the hint level in your reply.';

const LEVEL_TEXT: Record<HintLevel, string> = {
  1: 'a level-1 hint: a conceptual nudge. Name the idea or concept to think about, without the approach.',
  2: 'a level-2 hint: help them break the task into smaller steps, in words, without code.',
  3: 'a level-3 hint: point to the key operation, condition, data structure or observation, without code for their task.',
  4: 'a level-4 hint: ask what they tried and point to exactly where such an attempt usually goes wrong and why. Still never the complete solution.',
};

/**
 * The one-line instruction added to the system prompt for this turn (not stored in the history). Empty when the
 * question needs no steering.
 */
/** `hintsOnly` = words only: a hints-only problem or an event with 0 code lines (ADR-046 default). */
export function steeringLine(intent: TutorIntent, level: HintLevel, hintsOnly: boolean): string {
  const words = hintsOnly ? ' Words only: no code, no pseudo-code, no formulas.' : '';
  switch (intent) {
    case 'answer_seeking':
      return `This turn: the student is asking for the answer, the full code or the next part of it. Do not give it: no code, no formulas or index expressions for their task, no list of the steps that solve it. Begin with a short friendly line such as "Let's work it out together.", then give ${LEVEL_TEXT[level]}${NO_LABEL}${words}`;
    case 'hint':
      return `This turn: the student asks for a hint. Give ${LEVEL_TEXT[level]} Do not state formulas or the full sequence of steps for their task.${NO_LABEL}${words}`;
    case 'debugging':
      return `This turn: the student describes an attempt or a bug. Help them find it: name the likely cause and why it happens, as an explanation or a guiding question. Do not write the corrected code.${words}`;
    case 'concept':
      return hintsOnly
        ? 'This turn: the student asks about a concept. Explain it clearly in words only, without code, and without solving their task.'
        : 'This turn: the student asks about a general concept. Explain it properly; a tiny example on a different made-up case is fine.';
    default:
      return words.trim();
  }
}
