import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { readFile } from 'node:fs/promises';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const PORT = Number(process.env.PORT || 8081);

let fileNvidiaApiKey = '';
try {
  const envText = await readFile(new URL('../.env', import.meta.url), 'utf8');
  const line = envText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('#') && l.startsWith('VITE_NVIDIA_API_KEY='));
  if (line) {
    let value = line.slice('VITE_NVIDIA_API_KEY='.length).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    fileNvidiaApiKey = value;
  }
} catch {
  fileNvidiaApiKey = '';
}

function getNvidiaApiKey() {
  return (
    process.env.NVIDIA_API_KEY ||
    process.env.VITE_NVIDIA_API_KEY ||
    fileNvidiaApiKey ||
    ''
  );
}

async function nvidiaChatCompletions({ apiKey, model, messages, params }) {
  const url = 'https://integrate.api.nvidia.com/v1/chat/completions';
  const baseTimeoutMs = Number(process.env.NVIDIA_TIMEOUT_MS || 60000);
  const retryAttempts = Math.max(1, Number(process.env.NVIDIA_RETRY_ATTEMPTS || 2));

  const isRetryableStatus = (status) =>
    status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;

  for (let attempt = 1; attempt <= retryAttempts; attempt++) {
    const controller = new AbortController();
    const timeoutMs = attempt === 1 ? baseTimeoutMs : Math.max(baseTimeoutMs, 45000);
    const t = setTimeout(() => controller.abort(), timeoutMs);

    const maxTokens = params?.max_tokens ?? 96;
    const body = {
      model,
      messages,
      max_tokens: attempt === 1 ? maxTokens : Math.min(maxTokens, 64),
      temperature: params?.temperature ?? 0.4,
      top_p: params?.top_p ?? 0.9,
      frequency_penalty: params?.frequency_penalty ?? 0.0,
      presence_penalty: params?.presence_penalty ?? 0.0,
      stream: false,
    };

    let resp;
    try {
      resp = await fetch(url, {
        signal: controller.signal,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      if (err?.name === 'AbortError') {
        if (attempt < retryAttempts) continue;
        const e = new Error(`NVIDIA request timed out after ${timeoutMs}ms`);
        e.status = 504;
        throw e;
      }
      const e = new Error(`Upstream network error calling NVIDIA: ${err?.message || 'fetch failed'}`);
      e.status = 502;
      throw e;
    } finally {
      clearTimeout(t);
    }

    const rawText = await resp.text().catch(() => '');
    let data = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      data = { raw: rawText?.slice?.(0, 1000) || '' };
    }

    if (resp.ok) return data;

    const msg = data?.error?.message || data?.message || `NVIDIA request failed (HTTP ${resp.status})`;
    if (attempt < retryAttempts && isRetryableStatus(resp.status)) {
      await new Promise((r) => setTimeout(r, 400 + Math.floor(Math.random() * 500)));
      continue;
    }

    const e = new Error(msg);
    e.status = resp.status;
    throw e;
  }

  throw new Error('NVIDIA request failed after retries');
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/login', (req, res) => {
  const username = (req.body?.username ?? '').toString().trim();
  if (!username) {
    return res.status(400).json({ success: false, error: 'username required' });
  }
  res.json({ success: true, username });
});

app.get('/health/nvidia', (_req, res) => {
  const k = getNvidiaApiKey();
  res.json({
    ok: true,
    hasKey: Boolean(k),
    keyHint: k ? `${k.slice(0, 6)}...${k.slice(-4)}` : '',
  });
});

app.post('/api/nvidia/chat', async (req, res) => {
  const apiKey = getNvidiaApiKey();
  if (!apiKey) {
    return res.status(500).json({ error: 'Missing NVIDIA_API_KEY (or VITE_NVIDIA_API_KEY in ../.env)' });
  }

  const model = req.body?.model || 'meta/llama-4-maverick-17b-128e-instruct';
  let messages = req.body?.messages;
  const prompt = req.body?.prompt;

  if (!Array.isArray(messages)) {
    if (typeof prompt === 'string' && prompt.trim()) {
      messages = [{ role: 'user', content: prompt.trim() }];
    } else {
      return res.status(400).json({ error: 'Provide either messages[] or prompt' });
    }
  }

  try {
    const data = await nvidiaChatCompletions({
      apiKey,
      model,
      messages,
      params: req.body?.params,
    });
    const text = (data?.choices?.[0]?.message?.content ?? '').toString().trim();
    res.json({ ...data, text });
  } catch (err) {
    const status = err?.status ?? 502;
    res.status(status).json({
      error: err?.message || 'NVIDIA request failed',
      details: err?.details,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Ai-Chat backend listening on http://localhost:${PORT}`);
});
