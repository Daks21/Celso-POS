// backend/controllers/ai.controller.js
const { fetchContext, buildContextText } = require('../../ai/context-builder');
const { OS_SYSTEM_PROMPT }               = require('../../ai/prompts/system');
const assistant                          = require('../../ai/assistant');

// ── Per-user rate limiter ──────────────────────────────────────
const userLimits = new Map();
const RATE_LIMIT = 20;
const WINDOW_MS  = 15 * 60 * 1000;

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
    const { message, history = [] } = req.body;
    if (!message?.trim())
      return res.status(400).json({ success: false, message: 'message is required' });
    if (!checkRateLimit(req.user.id))
      return res.status(429).json({ success: false,
        message: 'Too many requests. Wait a moment and try again.' });

    const contextText = history.length === 0 ? await getContextMessage() : null;
    const userMessage = contextText
      ? contextText + '\n\n' + message
      : message;

    const result = await assistant.ask(OS_SYSTEM_PROMPT, history, userMessage,
      { userId: req.user.id });
    res.json({ success: true,
      data: { answer: result.text, cached: result.cached,
              tokensUsed: result.tokensUsed } });
  } catch (err) { next(err); }
};

// ── POST /api/ai/chat/stream (SSE streaming) ───────────────────
const chatStream = async (req, res, next) => {
  try {
    const { message, history = [] } = req.body;
    if (!message?.trim())
      return res.status(400).json({ success: false, message: 'message is required' });
    if (!checkRateLimit(req.user.id))
      return res.status(429).json({ success: false });

    res.setHeader('Content-Type',      'text/event-stream');
    res.setHeader('Cache-Control',     'no-cache');
    res.setHeader('Connection',        'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const contextText = history.length === 0 ? await getContextMessage() : null;
    const userMessage = contextText
      ? contextText + '\n\n' + message
      : message;

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

  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Os is unavailable.' });
    } else {
      res.write('data: ' + JSON.stringify({ error: true }) + '\n\n');
      res.end();
    }
  }
};

// ── GET /api/ai/summary ────────────────────────────────────────
const dailySummary = async (req, res, next) => {
  try {
    if (!checkRateLimit(req.user.id))
      return res.status(429).json({ success: false,
        message: 'Too many requests. Wait a moment and try again.' });

    const contextText = await getContextMessage();
    const question    =
      contextText + '\n\nGive a brief daily business summary. ' +
      'Include today\'s performance, top selling item, and one ' +
      'actionable tip. Return JSON: ' +
      '{ "summary": "...", "urgency": "low|medium|high", ' +
      '"tip": "..." }. ' +
      'Respond ONLY with the JSON object.';
    const result = await assistant.ask(OS_SYSTEM_PROMPT, [], question,
      { userId: req.user.id });
    let parsed;
    try {
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : result.text);
    } catch (_) {
      parsed = { summary: result.text, urgency: 'low', tip: '' };
    }
    res.json({ success: true,
      data: { ...parsed, cached: result.cached } });
  } catch (err) { next(err); }
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
  } catch (err) { next(err); }
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
  } catch (err) { next(err); }
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
  } catch (err) { next(err); }
};

module.exports = { chat, chatStream, dailySummary,
                   restockAdvice, forecast, profitCoaching };
