export async function chatgptGenerateText(prompt, { model = 'gpt-4o-mini' } = {}) {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Missing VITE_OPENAI_API_KEY. Add it to the project root .env and restart Vite.'
    );
  }

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: String(prompt ?? '') },
      ],
    }),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = data?.error?.message || data?.message || 'OpenAI request failed';
    throw new Error(msg);
  }

  return data?.choices?.[0]?.message?.content?.trim?.() || '';
}

