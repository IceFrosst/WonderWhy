const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'can', 'did', 'do', 'does',
  'for', 'from', 'had', 'has', 'have', 'how', 'i', 'if', 'in', 'into', 'is', 'it',
  'of', 'on', 'or', 'that', 'the', 'this', 'to', 'was', 'were', 'what', 'when',
  'where', 'which', 'who', 'why', 'will', 'with', 'would', 'you', 'your',
]);

const LANGUAGE_NAMES = {
  en: 'English', fi: 'Finnish', sv: 'Swedish', de: 'German', es: 'Spanish', fr: 'French',
};

function stem(word) {
  let root = word;
  for (const suffix of ['ing', 'ed']) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 3) { root = word.slice(0, -suffix.length); break; }
  }
  if (root === word && /(?:ch|sh|ss|x|z)es$/.test(word) && word.length > 4) root = word.slice(0, -2);
  else if (root === word && word.endsWith('s') && word.length > 3) root = word.slice(0, -1);
  if (root.endsWith('e') && root.length > 3) root = root.slice(0, -1);
  return root;
}

function tokens(value) {
  return new Set(String(value || '').toLowerCase().split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word))
    .map(stem)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word)));
}

function overlap(questionTokens, values) {
  const words = new Set();
  for (const value of values) for (const word of tokens(value)) words.add(word);
  let score = 0;
  for (const word of questionTokens) if (words.has(word)) score += 1;
  return score;
}

/** Pick the earliest best matching library step without using a model. */
export function pickStep(object, question) {
  const questionTokens = tokens(question);
  if (!object || !questionTokens.size || !Array.isArray(object.chapters)) return null;
  let best = null;
  object.chapters.forEach((chapter, lensIndex) => {
    const captions = Array.isArray(chapter?.captions) ? chapter.captions : [];
    const translated = Array.isArray(chapter?.translatedCaptions) ? chapter.translatedCaptions : [];
    const english = Array.isArray(chapter?.englishCaptions) ? chapter.englishCaptions : [];
    const titleScore = 0.5 * overlap(questionTokens, [chapter?.title, chapter?.translatedTitle, chapter?.englishTitle]);
    const leadScore = 0.5 * overlap(questionTokens, [chapter?.lead, chapter?.translatedLead, chapter?.englishLead]);
    captions.forEach((caption, stepIndex) => {
      const score = overlap(questionTokens, [caption, translated[stepIndex], english[stepIndex]]) + titleScore + leadScore;
      if (!best || score > best.score) {
        best = {
          lensId: `${object.id}.${chapter.lens}`,
          lensIndex,
          step: stepIndex + 1,
          caption: translated[stepIndex] || caption,
          score,
        };
      }
    });
  });
  return best && best.score > 0 ? best : null;
}

/** Build the complete text-only request used by follow-up question providers. */
export function buildAskPrompt({ object, question, lang = 'en' }) {
  const lines = [];
  for (const chapter of object?.chapters || []) {
    const lensId = `${object.id}.${chapter.lens}`;
    if (chapter.title || chapter.lead) lines.push(`${lensId}: ${chapter.title || ''}${chapter.lead ? ` - ${chapter.lead}` : ''}`);
    for (let index = 0; index < (chapter.captions || []).length; index += 1) {
      lines.push(`[${lensId} step ${index + 1}] ${chapter.captions[index]}`);
    }
  }
  const language = LANGUAGE_NAMES[lang] || LANGUAGE_NAMES.en;
  return `Answer a follow-up question about this object using the listed text.

${lines.join('\n')}

Question: ${JSON.stringify(String(question || ''))}

Reply with strict JSON only, no markdown, using this shape and replacing the placeholders with JSON values:
{"answer": "one sentence of at most 14 words, plain words, in ${language}", "lensId": "<one of the listed ids or null>", "step": <number or null>}

The answer must agree with the listed text. You may add one fact the list does not contain only if you are certain it is true. Choose the listed lens and step that best support the answer. Use null for both when no listed step fits.`;
}

/** Keep a model answer within the protocol's hard word and character caps. */
export function truncateAnswer(value) {
  const answer = String(value || '').trim();
  const words = answer.split(/\s+/).filter(Boolean);
  if (words.length > 14) return `${words.slice(0, 14).join(' ').slice(0, 299)}\u2026`;
  return answer.slice(0, 300);
}

function jsonObjects(source) {
  const results = [];
  for (let start = 0; start < source.length; start += 1) {
    if (source[start] !== '{') continue;
    let depth = 0; let quoted = false; let escaped = false;
    for (let index = start; index < source.length; index += 1) {
      const char = source[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quoted = false;
        continue;
      }
      if (char === '"') quoted = true;
      else if (char === '{') depth += 1;
      else if (char === '}' && --depth === 0) { results.push(source.slice(start, index + 1)); break; }
    }
  }
  return results;
}

/** Parse and validate a provider's follow-up answer. */
export function parseAskReply(value, object) {
  try {
    const source = String(value || '').replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    for (const candidate of jsonObjects(source)) {
      let parsed;
      try { parsed = JSON.parse(candidate); } catch { continue; }
      if (!parsed || typeof parsed !== 'object' || typeof parsed.answer !== 'string') continue;
      const answer = truncateAnswer(parsed.answer);
      const chapters = Array.isArray(object?.chapters) ? object.chapters : [];
      const lensIndex = chapters.findIndex((chapter) => `${object.id}.${chapter.lens}` === parsed.lensId);
      const lensId = lensIndex >= 0 ? parsed.lensId : null;
      const stepCount = lensIndex >= 0 && Array.isArray(chapters[lensIndex].captions) ? chapters[lensIndex].captions.length : 0;
      const step = lensId && Number.isInteger(parsed.step) && parsed.step >= 1 && parsed.step <= stepCount ? parsed.step : null;
      return { answer, lensId, step };
    }
    return null;
  } catch {
    return null;
  }
}
