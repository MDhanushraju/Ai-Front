function getSpeechRecognitionCtor() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function isSpeechRecognitionSupported() {
  return Boolean(getSpeechRecognitionCtor());
}

async function getVoicesWithTimeout(timeoutMs = 600) {
  if (typeof window === 'undefined') return [];
  const synth = window.speechSynthesis;
  if (!synth?.getVoices) return [];

  const existing = synth.getVoices();
  if (existing && existing.length) return existing;

  return await new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      try {
        synth.removeEventListener?.('voiceschanged', onChanged);
      } catch {
        return;
      }
      resolve(synth.getVoices() || []);
    };
    const onChanged = () => finish();
    try {
      synth.addEventListener?.('voiceschanged', onChanged);
    } catch {
      return resolve([]);
    }
    setTimeout(() => finish(), timeoutMs);
  });
}

function pickPreferredVoice(voices, { lang = 'en-US', gender = 'female' } = {}) {
  const list = Array.isArray(voices) ? voices : [];
  if (!list.length) return null;

  const langKey = (lang || '').toLowerCase();
  const candidates = list.filter((v) =>
    ((v?.lang || '').toLowerCase().startsWith(langKey.slice(0, 2)))
  );
  const pool = candidates.length ? candidates : list;

  const lowered = (v) => `${v?.name || ''} ${v?.voiceURI || ''}`.toLowerCase();

  const googlePool = pool.filter((v) => lowered(v).includes('google'));
  const preferPool = googlePool.length ? googlePool : pool;

  const femaleHints = [
    'female',
    'woman',
    'zira',
    'samantha',
    'victoria',
    'karen',
    'moira',
    'tessa',
    'serena',
    'ava',
    'joanna',
    'kimberly',
    'susan',
    'amy',
    'emma',
    'olivia',
    'mia',
    'sara',
  ];

  if (gender === 'female') {
    const best = preferPool.find((v) => femaleHints.some((h) => lowered(v).includes(h)));
    if (best) return best;
  }

  const localDefault = preferPool.find((v) => v?.default) || preferPool[0];
  return localDefault || null;
}

export function createSpeechRecognition({
  lang = 'en-US',
  continuous = false,
  onStart,
  onEnd,
  onError,
  onInterim,
  onFinal,
} = {}) {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) return null;

  const recognition = new Ctor();
  recognition.lang = lang;
  recognition.continuous = continuous;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => onStart?.();
  recognition.onend = () => onEnd?.();
  recognition.onerror = (event) => onError?.(event);

  recognition.onresult = (event) => {
    try {
      let interim = '';
      let finalText = '';
      let lastFinalConfidence = null;

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result?.[0]?.transcript ?? '';
        const conf = typeof result?.[0]?.confidence === 'number' ? result[0].confidence : null;
        if (result.isFinal) finalText += transcript;
        else interim += transcript;
        if (result.isFinal) lastFinalConfidence = conf;
      }

      const interimClean = interim.trim();
      const finalClean = finalText.trim();

      if (interimClean) onInterim?.(interimClean);
      if (finalClean) onFinal?.(finalClean, { confidence: lastFinalConfidence });
    } catch (e) {
      onError?.(e);
    }
  };

  return recognition;
}

const pendingTts = new Set();

export function cancelSpeech() {
  if (typeof window === 'undefined') return;
  try {
    window.speechSynthesis?.cancel?.();
  } catch {
    return;
  } finally {
    for (const entry of pendingTts) {
      try {
        entry.resolve(false);
        entry.onEnd?.(false);
      } catch {
        // ignore
      }
    }
    pendingTts.clear();
  }
}

export function pauseSpeech() {
  if (typeof window === 'undefined') return;
  try {
    window.speechSynthesis?.pause?.();
  } catch {
    return;
  }
}

export function resumeSpeech() {
  if (typeof window === 'undefined') return;
  try {
    window.speechSynthesis?.resume?.();
  } catch {
    return;
  }
}

export async function speakText(
  text,
  {
    enabled = true,
    lang = 'en-US',
    gender = 'female',
    rate = 0.9,
    pitch = 1.03,
    volume = 0.95,
    cancelExisting = true,
    onStart,
    onEnd,
  } = {}
) {
  if (!enabled) return Promise.resolve(false);
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (!('speechSynthesis' in window)) return Promise.resolve(false);

  const clean = (text ?? '').toString().trim();
  if (!clean) return Promise.resolve(false);

  try {
    if (cancelExisting) window.speechSynthesis.cancel();

    const voices = await getVoicesWithTimeout();
    const preferred = pickPreferredVoice(voices, { lang, gender });

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = preferred?.lang || lang;
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.volume = volume;
    if (preferred) utterance.voice = preferred;
    return new Promise((resolve) => {
      const entry = { resolve, onEnd: typeof onEnd === 'function' ? onEnd : null };
      pendingTts.add(entry);
      utterance.onstart = () => onStart?.();
      utterance.onend = () => {
        pendingTts.delete(entry);
        entry.onEnd?.(true);
        resolve(true);
      };
      utterance.onerror = () => {
        pendingTts.delete(entry);
        entry.onEnd?.(false);
        resolve(false);
      };
      window.speechSynthesis.speak(utterance);
    });
  } catch {
    return Promise.resolve(false);
  }
}

