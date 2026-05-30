// ai/providers/deepseek.js
const DS_URL = 'https://api.deepseek.com/v1/chat/completions';

async function getCompletion(messages, options = {}) {
  const body = {
    model:       'deepseek-chat',
    messages,
    max_tokens:  options.maxTokens || parseInt(process.env.AI_MAX_TOKENS) || 600,
    temperature: options.temperature || 0.7,
    stream:      options.stream || false,
  };

  const response = await fetch(DS_URL, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': 'Bearer ' + (process.env.DEEPSEEK_API_KEY || ''),
    },
    body: JSON.stringify(body),
    signal: options.signal,   // aborts the upstream call if the client disconnects
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const e   = new Error(
      'DeepSeek ' + response.status + ': ' + (err.error?.message || 'API error')
    );
    e.status = response.status;
    throw e;
  }

  if (options.stream) return response;

  const data = await response.json();
  return {
    text:         data.choices[0].message.content,
    tokensUsed:   data.usage?.total_tokens || 0,
    finishReason: data.choices[0].finish_reason,
  };
}

module.exports = { getCompletion };
