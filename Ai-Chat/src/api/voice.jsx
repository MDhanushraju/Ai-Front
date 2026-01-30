export function isSpeechRecognitionSupported() {
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function isSpeechSynthesisSupported() {
  return Boolean(window.speechSynthesis && window.SpeechSynthesisUtterance);
}

export function createSpeechRecognition({
  lang = 'en-US',
  onStart,
  onEnd,
  onError,
  onInterim,
  onFinal,
} = {}) {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;

  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = lang;

  recognition.onstart = () => onStart?.();
  recognition.onend = () => onEnd?.();
  recognition.onerror = (e) => onError?.(e);

  recognition.onresult = (event) => {
    let transcript = '';
    let hasFinal = false;

    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const res = event.results[i];
      transcript += res?.[0]?.transcript ?? '';
      if (res?.isFinal) hasFinal = true;
    }

    const text = transcript.trim();
    if (!text) return;

    onInterim?.(text);
    if (hasFinal) onFinal?.(text);
  };

  return recognition;
}

export function speakText(
  text,
  { enabled = true, lang = 'en-US', rate = 1, pitch = 1, volume = 1 } = {}
) {
  if (!enabled) return;
  if (!isSpeechSynthesisSupported()) return;
  if (!text) return;

  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = lang;
    utter.rate = rate;
    utter.pitch = pitch;
    utter.volume = volume;
    window.speechSynthesis.speak(utter);
  } catch {
    // ignore
  }
}

