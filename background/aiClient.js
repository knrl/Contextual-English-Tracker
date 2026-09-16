import { getApiKey, getSettings } from "./storage.js";

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-5";
const ANTHROPIC_VERSION = "2023-06-01";

// Per-level guidance injected into the prompt, so generated sentences and
// distractors are pitched at the learner rather than at whatever level the
// model defaults to.
const CEFR_GUIDANCE = {
  A2: "CEFR A2 (elementary). Use short, simple sentences and high-frequency everyday vocabulary. Distractors should be clearly different from the answer, not subtle.",
  B1: "CEFR B1 (intermediate). Use straightforward sentences on familiar topics. Distractors may be related in meaning but should be distinguishable with some thought.",
  B2: "CEFR B2 (upper intermediate). Use sentences of moderate complexity on both concrete and abstract topics. Distractors should be plausible near-synonyms requiring real discrimination.",
  C1: "CEFR C1 (advanced). Use complex sentences, including idiomatic and figurative usage. Distractors should differ mainly in register, connotation or collocation.",
  C2: "CEFR C2 (proficient). Use sophisticated, nuanced language including subtle idiom and stylistic variation. Distractors should be very fine-grained, differing only in precise shades of meaning.",
};

export const CEFR_LEVELS = Object.keys(CEFR_GUIDANCE);

const SYSTEM_PROMPT_TEMPLATE = `You generate vocabulary study exercises for a spaced-repetition app.
Given a target word and the original sentence/context it was found in, return EXACTLY one JSON object
with this shape and nothing else (no markdown fences, no commentary):

{
  "wordInfo": {
    "definition": "<a short, plain-language meaning of the target word AS IT IS USED in the given context, one sentence, written so a learner could understand it at a glance>",
    "partOfSpeech": "<the word's part of speech in this context: noun, verb, adjective, adverb, preposition, conjunction, pronoun, or interjection>"
  },
  "cloze": {
    "sentence": "<the original sentence with the target word replaced by ____>",
    "explanation": "<a short explanation of the word's meaning and a memory hook (e.g. root/origin, a vivid mental image, or a related word) to help it stick>"
  },
  "typedRecall": {
    "sentence": "<a NEW sentence, different from the cloze one, using a blank ____ where the target word belongs, with enough surrounding context that a learner who knows the word can recall and TYPE it unaided (harder than cloze: no options to recognize from)>",
    "explanation": "<a short explanation of the word's meaning and a memory hook, similar in spirit to cloze's but can reuse or vary the hook>"
  },
  "definitionMatch": {
    "definition": "<a concise dictionary-style definition of the target word, without using the word itself>",
    "options": ["<target word>", "<plausible distractor word 1>", "<distractor 2>", "<distractor 3>"],
    "answer": "<the target word, exactly matching one entry in options, shuffled position>",
    "explanation": "<why the answer fits the definition, and briefly why each distractor does NOT>"
  },
  "editor": {
    "sentence": "<a NEW sentence that uses the target word INCORRECTLY (wrong meaning/form)>",
    "explanation": "<explain what's wrong AND what the word actually means/how it should be used correctly>"
  },
  "correctForm": {
    "sentence": "<a NEW sentence with a blank ____ where some inflected/conjugated form of the target word belongs>",
    "baseWord": "<the target word in its base/dictionary form>",
    "answer": "<the correctly inflected form that fills the blank>",
    "explanation": "<the grammar rule or pattern that explains why this is the correct form>"
  },
  "paraphraseRewrite": {
    "sentence": "<a NEW sentence that uses the target word>",
    "instruction": "Rewrite this sentence without using the word '<target word>', keeping the same meaning.",
    "explanation": "<one good example paraphrase, plus what the target word's core meaning/nuance is that any paraphrase must preserve>"
  },
  "synonymTrap": {
    "sentence": "<a NEW sentence using a blank ____ where the word or a synonym belongs>",
    "options": ["<answer>", "<close synonym 1>", "<close synonym 2>", "<close synonym 3>"],
    "answer": "<the correct option, exactly matching one entry in options, shuffled position>",
    "explanation": "<the subtle difference in meaning/connotation/register between the answer and each distractor that makes them NOT interchangeable here>"
  },
  "creative": {
    "prompt": "<a short prompt asking the user to write one sentence using the target word in a specific scenario>",
    "explanation": "<one example sentence that uses the word well in this scenario, plus a tip on the word's typical usage/register>"
  },
  "scenarioResponse": {
    "scenario": "<a short real-world scenario or question that naturally invites a response using the target word>",
    "explanation": "<one example response that uses the word naturally, plus what makes this word the right fit for this scenario>"
  }
}

Rules:
- Output must be valid JSON, parseable with JSON.parse, and match the shape exactly.
- Keep all sentences natural and concise.
- Target this learner level: {{CEFR_GUIDANCE}}
- Pitch sentence complexity, the vocabulary used AROUND the target word, and how subtle the distractors are to that level. The target word itself stays as captured, whatever its difficulty.
- Every "options" array must contain 4 distinct strings in randomized order, one of which equals "answer".
- Every "explanation" should be 1-3 sentences: teach the WHY, not just restate the answer. Favor concrete memory hooks (etymology, imagery, a related word the learner likely already knows) over abstract description.
- If "Original context" is exactly "(none provided)", the word was added manually with no captured sentence: invent one natural example sentence yourself and use that as if it were the original context throughout, including for "cloze.sentence".`;

function buildSystemPrompt(cefrLevel) {
  const guidance = CEFR_GUIDANCE[cefrLevel] || CEFR_GUIDANCE.B2;
  return SYSTEM_PROMPT_TEMPLATE.replace("{{CEFR_GUIDANCE}}", guidance);
}

const REQUIRED_TYPES = [
  "cloze",
  "typedRecall",
  "definitionMatch",
  "editor",
  "correctForm",
  "paraphraseRewrite",
  "synonymTrap",
  "creative",
  "scenarioResponse",
];

const MULTIPLE_CHOICE_TYPES = ["definitionMatch", "synonymTrap"];

function buildUserMessage(word, context) {
  return `Target word: "${word}"\nOriginal context: "${context}"`;
}

// Low-level call shared by exercise generation and free-text grading: sends
// one system+user message pair to Claude and returns the raw text response.
// Callers own their own prompt shape and parsing.
async function callClaudeRaw(systemPrompt, userMessage, maxTokens) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error("No API key configured");
  }

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    let bodyText = "";
    try {
      bodyText = await response.text();
    } catch {
      // ignore — best-effort diagnostics only
    }
    throw new Error(`Claude API error: ${response.status} ${bodyText}`.slice(0, 300));
  }

  const data = await response.json();
  // Text can live in any content block, not necessarily the first one (e.g.
  // when the model also returns a thinking/tool-use block ahead of the text).
  const textBlock = Array.isArray(data.content) ? data.content.find((b) => b.type === "text" && b.text) : null;
  const text = textBlock?.text;
  if (!text) {
    const stopReason = data.stop_reason || "unknown";
    const blockTypes = Array.isArray(data.content) ? data.content.map((b) => b.type).join(",") : "none";
    throw new Error(
      `Empty response from Claude API (stop_reason=${stopReason}, content blocks=[${blockTypes}])`
    );
  }
  return text;
}

async function callClaude(word, context) {
  const settings = await getSettings();
  return callClaudeRaw(buildSystemPrompt(settings.cefrLevel), buildUserMessage(word, context), 4096);
}

function parseExercises(rawText) {
  const cleaned = rawText.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const parsed = JSON.parse(cleaned);

  for (const key of REQUIRED_TYPES) {
    if (!parsed[key]) throw new Error(`Missing exercise type: ${key}`);
  }
  for (const key of MULTIPLE_CHOICE_TYPES) {
    const ex = parsed[key];
    if (
      !Array.isArray(ex.options) ||
      ex.options.length !== 4 ||
      !ex.options.includes(ex.answer)
    ) {
      throw new Error(`Malformed multiple-choice exercise: ${key}`);
    }
  }

  // wordInfo isn't an exercise — split it out so `exercises` stays a clean
  // map of exercise type -> exercise. Not treated as required: a missing
  // definition should degrade the hover tooltip, not fail the whole
  // generation and drop the user to the cloze-only fallback.
  const { wordInfo, ...exercises } = parsed;
  return { exercises, wordInfo: wordInfo || null };
}

function buildLocalFallback(word, context) {
  const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const blanked = context.replace(new RegExp(`\\b${escapedWord}\\b`, "i"), "____");
  const usableBlank = blanked !== context && blanked.trim() !== "____";
  return {
    cloze: {
      sentence: usableBlank ? blanked : `____ (${word})`,
      explanation: "AI-generated explanations aren't available right now (see the error above) — the answer is the captured word itself.",
    },
  };
}

export async function generateExercises(word, context) {
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const rawText = await callClaude(word, context);
      const { exercises, wordInfo } = parseExercises(rawText);
      return { exercises, wordInfo, status: "ready", error: null };
    } catch (err) {
      lastError = err?.message || String(err);
      if (attempt === 1) {
        return { exercises: buildLocalFallback(word, context), wordInfo: null, status: "failed", error: lastError };
      }
    }
  }
}

// Grades a free-text answer for one of the open-ended production types
// (paraphraseRewrite, creative, scenarioResponse). Optional: the default for
// these types is still "compose in your head, then reveal a model example"
// (no API call, no cost) — this is only invoked if the user chooses to type
// an answer and asks for feedback on it.
const GRADING_SYSTEM_PROMPT = `You grade a language learner's free-text answer to a vocabulary exercise.
Return EXACTLY one JSON object and nothing else (no markdown fences, no commentary):

{
  "correct": <true if the answer correctly and naturally uses the target word for this exercise, false otherwise>,
  "feedback": "<1-2 sentences of specific, encouraging feedback: what worked, and if not fully correct, what to fix>"
}

Grading should be lenient on grammar/spelling slips but strict on whether the target word is used with its correct meaning and, where the exercise specifies one, whether the instruction was actually followed (e.g. a paraphrase must not reuse the target word).`;

function buildGradingUserMessage(word, exerciseType, prompt, userAnswer) {
  return `Target word: "${word}"\nExercise type: ${exerciseType}\nExercise prompt given to the learner: "${prompt}"\nLearner's answer: "${userAnswer}"`;
}

function parseGradingResponse(rawText) {
  const cleaned = rawText.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const parsed = JSON.parse(cleaned);
  if (typeof parsed.correct !== "boolean" || typeof parsed.feedback !== "string") {
    throw new Error("Malformed grading response");
  }
  return parsed;
}

export async function gradeFreeTextAnswer(word, exerciseType, prompt, userAnswer) {
  try {
    const rawText = await callClaudeRaw(
      GRADING_SYSTEM_PROMPT,
      buildGradingUserMessage(word, exerciseType, prompt, userAnswer),
      512
    );
    const { correct, feedback } = parseGradingResponse(rawText);
    return { ok: true, correct, feedback };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}
