// ai/providers/groq.js
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

async function getCompletion(messages, options = {}) {
  const body = {
    model:       process.env.AI_MODEL || 'llama-3.3-70b-versatile',
    messages,
    max_tokens:  options.maxTokens || parseInt(process.env.AI_MAX_TOKENS) || 600,
    temperature: options.temperature || 0.7,
    stream:      options.stream || false,
  };

  const response = await fetch(GROQ_URL, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': 'Bearer ' + process.env.GROQ_API_KEY,
    },
    body: JSON.stringify(body),
    signal: options.signal,   // aborts the upstream call if the client disconnects
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const e   = new Error(
      'Groq ' + response.status + ': ' + (err.error?.message || 'API error')
    );
    e.status = response.status;
    throw e;
  }

  if (options.stream) return response; // caller reads body stream

  const data = await response.json();
  return {
    text:         data.choices[0].message.content,
    tokensUsed:   data.usage?.total_tokens || 0,
    finishReason: data.choices[0].finish_reason,
  };
}

module.exports = { getCompletion };
