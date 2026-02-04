// Frontend calls backend at localhost:8081 (via Vite proxy in dev: /api, /health, /login)
const API_BASE = import.meta.env.DEV ? '' : 'http://localhost:8081';
const BACKEND_URL = (API_BASE || '') + '/api/nvidia/chat';
export { API_BASE };

function extractSseDelta(json) {
  const delta = json?.choices?.[0]?.delta?.content;
  if (typeof delta === 'string') return delta;
  const msg = json?.choices?.[0]?.message?.content;
  if (typeof msg === 'string') return msg;
  return '';
}

export async function nvidiaGenerateText(
  promptOrMessages,
  {
    model = 'meta/llama-4-maverick-17b-128e-instruct',
    max_tokens = 96,
    temperature = 0.4,
    top_p = 0.9,
    frequency_penalty = 0.0,
    presence_penalty = 0.0,
    stream = false,
    signal,
  } = {}
) {
  if (stream) throw new Error('Use nvidiaGenerateTextStream for stream=true.');

  try {
    const resp = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        model,
        messages: Array.isArray(promptOrMessages) ? promptOrMessages : undefined,
        prompt: Array.isArray(promptOrMessages) ? undefined : String(promptOrMessages ?? ''),
        params: {
          max_tokens,
          temperature,
          top_p,
          frequency_penalty,
          presence_penalty,
        },
      }),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const msg = data?.error || data?.message || 'Backend request failed';
      const detailsMsg =
        data?.details?.error?.message ||
        data?.details?.message ||
        data?.details?.raw ||
        (typeof data?.details === 'string' ? data.details : '');
      const extra = detailsMsg ? ` | ${String(detailsMsg).slice(0, 220)}` : '';
      throw new Error(`${msg}${extra} (HTTP ${resp.status})`);
    }

    const text = data?.text ?? data?.choices?.[0]?.message?.content ?? '';
    return (text ?? '').toString().trim();
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    if (typeof err?.message === 'string' && err.message.toLowerCase().includes('aborted')) throw err;
    throw new Error(
      err?.message || 'Network error. Start the backend: cd Front/React/Ai-Chat/back && npm run dev'
    );
  }
}

export async function nvidiaGenerateTextStream(
  promptOrMessages,
  {
    model = 'meta/llama-4-maverick-17b-128e-instruct',
    max_tokens = 96,
    temperature = 0.4,
    top_p = 0.9,
    frequency_penalty = 0.0,
    presence_penalty = 0.0,
    onDelta,
    signal,
  } = {}
) {
  const resp = await fetch(BACKEND_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      model,
      messages: Array.isArray(promptOrMessages) ? promptOrMessages : undefined,
      prompt: Array.isArray(promptOrMessages) ? undefined : String(promptOrMessages ?? ''),
      stream: true,
      params: {
        max_tokens,
        temperature,
        top_p,
        frequency_penalty,
        presence_penalty,
      },
    }),
  });

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    const msg = data?.error || data?.message || 'Backend request failed';
    const detailsMsg =
      data?.details?.error?.message ||
      data?.details?.message ||
      data?.details?.raw ||
      (typeof data?.details === 'string' ? data.details : '');
    const extra = detailsMsg ? ` | ${String(detailsMsg).slice(0, 220)}` : '';
    throw new Error(`${msg}${extra} (HTTP ${resp.status})`);
  }

  const contentType = (resp.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('application/json')) {
    const data = await resp.json().catch(() => ({}));
    const text = (data?.text ?? data?.choices?.[0]?.message?.content ?? '').toString().trim();
    if (text && onDelta) onDelta(text, { full: text });
    return text;
  }

  if (!resp.body) throw new Error('Streaming not supported by this browser.');

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let full = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    const lines = buf.split(/\r?\n/);
    buf = lines.pop() || '';

    for (const lineRaw of lines) {
      const line = lineRaw.trim();
      if (!line || !line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;

      let json;
      try {
        json = JSON.parse(payload);
      } catch {
        continue;
      }
      const delta = extractSseDelta(json);
      if (!delta) continue;
      full += delta;
      try {
        onDelta?.(delta, { full });
      } catch {
        // ignore
      }
    }
  }

  return full.trim();
}
