// backend/controllers/ai.controller.js
const { fetchContext, buildContextText } = require('../../ai/context-builder');
const { OS_SYSTEM_PROMPT }               = require('../../ai/prompts/system');
const assistant                          = require('../../ai/assistant');
const aiLog                              = require('../models/aiQueryLog.model');
const dailyBrief                         = require('../models/dailyBrief.model');

// ── Per-user rate limiter ──────────────────────────────────────
const userLimits = new Map();
const RATE_LIMIT = 20;
const WINDOW_MS  = 15 * 60 * 1000;

// Hard cap on user-supplied chat input. Keeps prompt budget bounded and
// limits how much hostile content a single message can smuggle in.
const MAX_MESSAGE_LEN = 2000;

// Per-request language override. Front-end sends 'en' | 'tl' | 'auto'
// from the widget's language pill. When locked, we prepend a short
// directive the system prompt knows how to honor.
function langDirective(lang) {
  if (lang === 'en') return '[Reply ONLY in English. Translate any Tagalog terms.]\n\n';
  if (lang === 'tl') return '[Sumagot ka lamang sa Tagalog o Taglish.]\n\n';
  return '';
}

function checkRateLimit(userId) {
  const now   = Date.now();
  const entry = userLimits.get(userId) || { count: 0, reset: now + WINDOW_MS };
  if (now > entry.reset) { entry.count = 0; entry.reset = now + WINDOW_MS; }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  userLimits.set(userId, entry);
  return true;
}

// ── Shared context builder ─────────────────────────────────────
async function getContextMessage() {
  const ctx = await fetchContext();
  return buildContextText(ctx);
}

// ── POST /api/ai/chat (non-streaming, cached) ──────────────────
const chat = async (req, res, next) => {
  try {
    const { message, history = [], lang } = req.body;
    if (!message?.trim())
      return res.status(400).json({ success: false, message: 'message is required' });
    if (message.length > MAX_MESSAGE_LEN)
      return res.status(400).json({ success: false,
        message: 'Message too long (max ' + MAX_MESSAGE_LEN + ' characters).' });
    if (!checkRateLimit(req.user.id))
      return res.status(429).json({ success: false,
        message: 'Too many requests. Wait a moment and try again.' });

    // Attach fresh store data on every turn — without it, follow-up questions
    // ("sales yesterday?", "net balance?") were going to the LLM with only the
    // chat history and produced "I don't have access to the data" dodges.
    const contextText = await getContextMessage();
    const directive   = langDirective(lang);
    const userMessage = contextText + '\n\n' + directive + message;

    const t0 = Date.now();
    const result = await assistant.ask(OS_SYSTEM_PROMPT, history, userMessage,
      { userId: req.user.id });
    res.json({ success: true,
      data: { answer: result.text, cached: result.cached,
              tokensUsed: result.tokensUsed } });
    aiLog.log({
      userId: req.user.id, endpoint: 'chat',
      question: message, lang: lang || 'auto',
      responseLength: result.text?.length, tokensUsed: result.tokensUsed,
      provider: result.provider, latencyMs: Date.now() - t0,
      cached: result.cached,
    });
  } catch (err) {
    aiLog.log({ userId: req.user?.id, endpoint: 'chat',
      question: req.body?.message, lang: req.body?.lang || 'auto',
      error: err.message });
    next(err);
  }
};

// ── POST /api/ai/chat/stream (SSE streaming) ───────────────────
const chatStream = async (req, res, next) => {
  try {
    const { message, history = [], lang } = req.body;
    if (!message?.trim())
      return res.status(400).json({ success: false, message: 'message is required' });
    if (message.length > MAX_MESSAGE_LEN)
      return res.status(400).json({ success: false,
        message: 'Message too long (max ' + MAX_MESSAGE_LEN + ' characters).' });
    if (!checkRateLimit(req.user.id))
      return res.status(429).json({ success: false });

    res.setHeader('Content-Type',      'text/event-stream');
    res.setHeader('Cache-Control',     'no-cache');
    res.setHeader('Connection',        'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const contextText = await getContextMessage();
    const directive   = langDirective(lang);
    const userMessage = contextText + '\n\n' + directive + message;

    const t0 = Date.now();
    const response = await assistant.ask(
      OS_SYSTEM_PROMPT, history, userMessage, { stream: true }
    );

    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText  = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(l => l.startsWith('data: '));
      for (const line of lines) {
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') continue;
        try {
          const parsed = JSON.parse(raw);
          const text   = parsed.choices?.[0]?.delta?.content || '';
          if (text) {
            fullText += text;
            res.write('data: ' + JSON.stringify({ text }) + '\n\n');
          }
        } catch (_) { /* skip malformed chunk */ }
      }
    }

    const updatedHistory = [
      ...history,
      { role: 'user',      content: message },
      { role: 'assistant', content: fullText },
    ];
    res.write('data: ' + JSON.stringify({
      done: true, history: updatedHistory
    }) + '\n\n');
    res.end();

    // Streaming path bypasses the cache; provider attribution is "groq"
    // by primary-path assumption (quota fallback to deepseek can't be
    // observed from the raw Response object).
    aiLog.log({
      userId: req.user.id, endpoint: 'stream',
      question: message, lang: lang || 'auto',
      responseLength: fullText.length, tokensUsed: null,
      provider: 'groq', latencyMs: Date.now() - t0,
      cached: false,
    });

  } catch (err) {
    aiLog.log({ userId: req.user?.id, endpoint: 'stream',
      question: req.body?.message, lang: req.body?.lang || 'auto',
      error: err.message });
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Os is unavailable.' });
    } else {
      res.write('data: ' + JSON.stringify({ error: true }) + '\n\n');
      res.end();
    }
  }
};

// Shared compute step — used by both the /summary endpoint (lazy path)
// and the 6am scheduler (pre-warm path). Always writes to daily_brief
// keyed on Manila today, so subsequent reads in the same day hit cache.
async function computeAndStoreDailyBrief(generatedBy) {
  const contextText = await getContextMessage();
  const question    =
    contextText + '\n\nGive a brief daily business summary. ' +
    'Include today\'s performance, top selling item, and one ' +
    'actionable tip. Return JSON: ' +
    '{ "summary": "...", "urgency": "low|medium|high", ' +
    '"tip": "..." }. ' +
    'Respond ONLY with the JSON object.';

  const t0     = Date.now();
  const result = await assistant.ask(OS_SYSTEM_PROMPT, [], question, {});
  const latencyMs = Date.now() - t0;

  let parsed;
  try {
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : result.text);
  } catch (_) {
    parsed = { summary: result.text, urgency: 'low', tip: '' };
  }

  const today = dailyBrief.manilaToday();
  await dailyBrief.save({
    date:        today,
    payload:     parsed,
    tokensUsed:  result.tokensUsed,
    latencyMs,
    generatedBy: generatedBy || 'lazy',
  });
  return { payload: parsed, tokensUsed: result.tokensUsed,
           latencyMs, provider: result.provider };
}

// ── GET /api/ai/summary ────────────────────────────────────────
const dailySummary = async (req, res, next) => {
  try {
    if (!checkRateLimit(req.user.id))
      return res.status(429).json({ success: false,
        message: 'Too many requests. Wait a moment and try again.' });

    const today  = dailyBrief.manilaToday();
    const cached = await dailyBrief.getForDate(today);

    if (cached) {
      // Day-scoped persistent cache — instant for everyone after the
      // first read (or after the 6am cron pre-warm).
      res.json({ success: true,
        data: { ...cached.payload, cached: true,
                generatedBy: cached.generatedBy } });
      aiLog.log({ userId: req.user.id, endpoint: 'summary',
        responseLength: JSON.stringify(cached.payload).length,
        tokensUsed: cached.tokensUsed, provider: 'cache',
        latencyMs: 0, cached: true });
      return;
    }

    // Lazy compute: first user of the day pays the cold start, then
    // everyone else benefits from the DB-backed cache.
    const t0     = Date.now();
    const fresh  = await computeAndStoreDailyBrief('lazy');
    res.json({ success: true,
      data: { ...fresh.payload, cached: false, generatedBy: 'lazy' } });
    aiLog.log({ userId: req.user.id, endpoint: 'summary',
      responseLength: JSON.stringify(fresh.payload).length,
      tokensUsed: fresh.tokensUsed, provider: fresh.provider,
      latencyMs: Date.now() - t0, cached: false });
  } catch (err) {
    aiLog.log({ userId: req.user?.id, endpoint: 'summary', error: err.message });
    next(err);
  }
};

// ── GET /api/ai/restock ────────────────────────────────────────
const restockAdvice = async (req, res, next) => {
  try {
    if (!checkRateLimit(req.user.id))
      return res.status(429).json({ success: false,
        message: 'Too many requests. Wait a moment and try again.' });

    const contextText = await getContextMessage();
    const question    =
      contextText + '\n\nProvide a ranked restock list based on ' +
      'low stock levels and sales velocity. Return JSON: ' +
      '{ "items": [{ "name": "...", "stock": N, "priority": ' +
      '"urgent|soon|monitor", "reason": "..." }] }. ' +
      'Respond ONLY with the JSON object.';
    const t0 = Date.now();
    const result = await assistant.ask(OS_SYSTEM_PROMPT, [], question,
      { userId: req.user.id });
    let parsed;
    try {
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : result.text);
    } catch (_) {
      parsed = { items: [] };
    }
    res.json({ success: true,
      data: { ...parsed, cached: result.cached } });
    aiLog.log({ userId: req.user.id, endpoint: 'restock',
      responseLength: result.text?.length, tokensUsed: result.tokensUsed,
      provider: result.provider, latencyMs: Date.now() - t0,
      cached: result.cached });
  } catch (err) {
    aiLog.log({ userId: req.user?.id, endpoint: 'restock', error: err.message });
    next(err);
  }
};

// ── GET /api/ai/forecast ───────────────────────────────────────
const forecast = async (req, res, next) => {
  try {
    if (!checkRateLimit(req.user.id))
      return res.status(429).json({ success: false,
        message: 'Too many requests. Wait a moment and try again.' });

    const contextText = await getContextMessage();
    const tomorrow    = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dowName     = ['Sunday','Monday','Tuesday','Wednesday',
                         'Thursday','Friday','Saturday']
                       [tomorrow.getDay()];
    const question    =
      contextText + '\n\nBased on day-of-week patterns, forecast ' +
      'tomorrow (' + dowName + '). Return JSON: ' +
      '{ "day": "' + dowName + '", "expectedRevenue": "₱X", ' +
      '"confidence": "low|medium|high", "note": "..." }. ' +
      'Respond ONLY with the JSON object.';
    const t0 = Date.now();
    const result = await assistant.ask(OS_SYSTEM_PROMPT, [], question,
      { userId: req.user.id });
    let parsed;
    try {
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : result.text);
    } catch (_) {
      parsed = { note: result.text };
    }
    res.json({ success: true,
      data: { ...parsed, cached: result.cached } });
    aiLog.log({ userId: req.user.id, endpoint: 'forecast',
      responseLength: result.text?.length, tokensUsed: result.tokensUsed,
      provider: result.provider, latencyMs: Date.now() - t0,
      cached: result.cached });
  } catch (err) {
    aiLog.log({ userId: req.user?.id, endpoint: 'forecast', error: err.message });
    next(err);
  }
};

// ── GET /api/ai/profit ─────────────────────────────────────────
const profitCoaching = async (req, res, next) => {
  try {
    if (!checkRateLimit(req.user.id))
      return res.status(429).json({ success: false,
        message: 'Too many requests. Wait a moment and try again.' });

    const contextText = await getContextMessage();
    const question    =
      contextText + '\n\nAnalyze product margins and identify ' +
      'opportunities to improve profitability. Return JSON: ' +
      '{ "insights": [{ "product": "...", "finding": "...", ' +
      '"action": "..." }], "summary": "..." }. ' +
      'Respond ONLY with the JSON object.';
    const t0 = Date.now();
    const result = await assistant.ask(OS_SYSTEM_PROMPT, [], question,
      { userId: req.user.id });
    let parsed;
    try {
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : result.text);
    } catch (_) {
      parsed = { insights: [], summary: result.text };
    }
    res.json({ success: true,
      data: { ...parsed, cached: result.cached } });
    aiLog.log({ userId: req.user.id, endpoint: 'profit',
      responseLength: result.text?.length, tokensUsed: result.tokensUsed,
      provider: result.provider, latencyMs: Date.now() - t0,
      cached: result.cached });
  } catch (err) {
    aiLog.log({ userId: req.user?.id, endpoint: 'profit', error: err.message });
    next(err);
  }
};

module.exports = { chat, chatStream, dailySummary,
                   restockAdvice, forecast, profitCoaching,
                   computeAndStoreDailyBrief };
