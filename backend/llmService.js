const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ── Regular analysis ──────────────────────────────────────────────────────────
async function analyzeEmotion(text) {
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY') {
    return fallbackAnalysis(text);
  }
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
    const result = await model.generateContent(buildPrompt(text));
    const clean = result.response.text().trim().replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch (err) {
    console.error('Gemini error, using fallback:', err.message);
    return fallbackAnalysis(text);
  }
}

// ── Streaming analysis ────────────────────────────────────────────────────────
// onComplete(result) is called with final result so caller can cache it
async function analyzeEmotionStream(text, res, onComplete = null) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  // No API key → use fallback, simulate streaming
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY') {
    const result = fallbackAnalysis(text);
    send({ type: 'emotion', emotion: result.emotion });
    send({ type: 'keywords', keywords: result.keywords });
    for (const word of result.summary.split(' ')) {
      send({ type: 'token', token: word + ' ' });
      await sleep(80);
    }
    send({ type: 'done', result });
    if (onComplete) onComplete(result);
    return res.end();
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

    // Stream the summary text word by word
    const summaryPrompt = `In one sentence, describe the emotional state of someone who wrote: "${text}". Just write the sentence, nothing else.`;
    const streamResult = await model.generateContentStream(summaryPrompt);
    let fullSummary = '';

    for await (const chunk of streamResult.stream) {
      const token = chunk.text();
      fullSummary += token;
      send({ type: 'token', token });
    }

    // Get structured data (emotion + keywords)
    const structured = await model.generateContent(buildPrompt(text));
    const clean = structured.response.text().trim().replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    const finalResult = { ...parsed, summary: fullSummary.trim() };

    send({ type: 'emotion', emotion: parsed.emotion });
    send({ type: 'keywords', keywords: parsed.keywords });
    send({ type: 'done', result: finalResult });
    if (onComplete) onComplete(finalResult);
    res.end();

  } catch (err) {
    console.error('Streaming error, using fallback:', err.message);
    const result = fallbackAnalysis(text);
    send({ type: 'emotion', emotion: result.emotion });
    send({ type: 'keywords', keywords: result.keywords });
    for (const word of result.summary.split(' ')) {
      send({ type: 'token', token: word + ' ' });
      await sleep(80);
    }
    send({ type: 'done', result });
    if (onComplete) onComplete(result);
    res.end();
  }
}

function buildPrompt(text) {
  return `Analyze the emotion of this journal entry and respond ONLY with valid JSON (no markdown, no code blocks):
{
  "emotion": "<single dominant emotion: calm/happy/anxious/sad/energized/reflective/grateful/stressed>",
  "keywords": ["<word1>", "<word2>", "<word3>"],
  "summary": "<one sentence summary of the user's mental state>"
}
Journal entry: "${text}"`;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function fallbackAnalysis(text) {
  const lower = text.toLowerCase();
  const emotionMap = {
    calm:       ['calm','peace','quiet','still','relax','gentle','serene','tranquil'],
    happy:      ['happy','joy','great','wonderful','amazing','love','excited','smile'],
    anxious:    ['anxious','worry','nervous','stress','afraid','fear','panic','uneasy'],
    sad:        ['sad','cry','lonely','miss','hurt','down','unhappy','lost'],
    energized:  ['energy','active','alive','power','strong','motivated','focus'],
    reflective: ['think','reflect','wonder','realize','understand','learn','felt'],
    grateful:   ['grateful','thankful','blessed','appreciate','lucky','fortunate'],
  };
  let detectedEmotion = 'reflective', maxMatches = 0;
  for (const [emotion, kws] of Object.entries(emotionMap)) {
    const matches = kws.filter(k => lower.includes(k)).length;
    if (matches > maxMatches) { maxMatches = matches; detectedEmotion = emotion; }
  }
  const stopWords = new Set(['i','the','a','an','and','or','but','in','on','at','to','for','of','with','my','was','is','it','that','this','had','have','after','felt','feel','today','very']);
  const words = lower.match(/\b[a-z]{4,}\b/g) || [];
  const keywords = [...new Set(words.filter(w => !stopWords.has(w)))].slice(0, 3);
  return {
    emotion: detectedEmotion,
    keywords: keywords.length > 0 ? keywords : ['nature', 'reflection', 'awareness'],
    summary: `User expressed a sense of ${detectedEmotion} during their nature session.`,
  };
}

module.exports = { analyzeEmotion, analyzeEmotionStream };
