import { useEffect, useRef, useState } from 'react';
import './AiCentral.css';
import { API_BASE, nvidiaGenerateText, nvidiaGenerateTextStream } from '../../api/nvidiaApi';
import {
  createSpeechRecognition,
  isSpeechRecognitionSupported,
  cancelSpeech,
  pauseSpeech,
  resumeSpeech,
  speakText,
} from '../../api/voice';

function AiBot({ onLogout }) {
  const [isListening, setIsListening] = useState(false);
  const [voiceModeOn, setVoiceModeOn] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [lastError, setLastError] = useState('');
  const [backendStatus, setBackendStatus] = useState('unknown'); // 'unknown' | 'ok' | 'down'
  const [speechStatus, setSpeechStatus] = useState('unknown'); // 'unknown' | 'ok' | 'unsupported'
  const accountMenuRef = useRef(null);
  const recognitionRef = useRef(null);
  const heardTextRef = useRef('');
  const submitTimerRef = useRef(null);
  const pendingSubmitRef = useRef(false);
  const submittedFromVoiceRef = useRef(false);
  const conversationModeRef = useRef(false);
  const restartTimeoutRef = useRef(null);
  const isLoadingRef = useRef(false);
  const isListeningRef = useRef(false);
  const watchdogIntervalRef = useRef(null);
  const commandWatchdogIntervalRef = useRef(null);
  const ttsActiveRef = useRef(false);
  const requestAbortRef = useRef(null);
  const currentAiSpeechRef = useRef('');
  const ttsQueueRef = useRef(Promise.resolve());
  const ttsQueueKeyRef = useRef(0);
  const lastSubmittedTextRef = useRef('');
  const lastSubmittedAtRef = useRef(0);
  const rememberedNameRef = useRef('');
  const lastRecKickAtRef = useRef(0);
  const lastRecEventAtRef = useRef(0);
  const lastStatusRef = useRef('Tap the mic to start.');

  const conversationRef = useRef([
    {
      role: 'system',
      content:
        "You're a friendly human-like conversation partner. Talk naturally like a close friend: warm, casual, and supportive. Don't answer like a textbook or a Q&A bot—respond like you're chatting in real time. Use contractions, short paragraphs, and occasional gentle follow-up questions. Avoid bullet lists unless the user asks. Reply in 3–6 short sentences by default, but go shorter if the user asks for a quick answer.",
    },
  ]);

  const MAX_TURNS = 4; // balance context + latency

  const getSynthActive = () =>
    typeof window !== 'undefined' &&
    (window.speechSynthesis?.speaking || window.speechSynthesis?.paused);

  const [statusText, setStatusText] = useState(lastStatusRef.current);

  useEffect(() => {
    // Quick runtime checks (helps explain "failed to fetch" / mic issues).
    try {
      setSpeechStatus(isSpeechRecognitionSupported() ? 'ok' : 'unsupported');
    } catch {
      setSpeechStatus('unsupported');
    }

    // Load remembered name (if any)
    try {
      const saved = localStorage.getItem('ai_user_name') || '';
      if (saved) rememberedNameRef.current = saved;
    } catch {
      // ignore
    }

    const controller = new AbortController();
    fetch((API_BASE || '') + '/health', { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(() => setBackendStatus('ok'))
      .catch(() => setBackendStatus('down'));

    const onDocPointerDown = (e) => {
      if (!accountMenuOpen) return;
      const el = accountMenuRef.current;
      if (!el) return;
      if (!el.contains(e.target)) setAccountMenuOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setAccountMenuOpen(false);
    };
    document.addEventListener('pointerdown', onDocPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      controller.abort();
      document.removeEventListener('pointerdown', onDocPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      if (submitTimerRef.current) {
        clearTimeout(submitTimerRef.current);
        submitTimerRef.current = null;
      }
    };
  }, [accountMenuOpen]);

  const extractNameFromText = (raw) => {
    const s = (raw ?? '').toString().trim();
    if (!s) return '';

    const patterns = [
      /\bmy\s+name\s+is\s+([a-z][a-z' -]{1,40})/i,
      /\bi\s*am\s+([a-z][a-z' -]{1,40})/i,
      /\bi'?m\s+([a-z][a-z' -]{1,40})/i,
      /\bcall\s+me\s+([a-z][a-z' -]{1,40})/i,
    ];

    for (const re of patterns) {
      const m = s.match(re);
      if (!m) continue;
      let name = (m[1] || '').trim();
      name = name.replace(/\b(please|bro|sir|ma'am|mam|miss|buddy|friend)\b.*$/i, '').trim();
      name = name
        .replace(/[^a-z' -]/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!name) return '';
      if (name.length > 40) name = name.slice(0, 40).trim();
      return name
        .split(' ')
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
    }
    return '';
  };

  const rememberUserName = (name) => {
    const clean = (name ?? '').toString().trim();
    if (!clean) return;
    rememberedNameRef.current = clean;
    try {
      localStorage.setItem('ai_user_name', clean);
    } catch {
      // ignore
    }

    const base = conversationRef.current?.[0]?.content || '';
    const withoutOld = base.replace(/\n?\s*The user's name is .*?\.\s*Use it naturally sometimes, especially when greeting or confirming\.\s*/i, '').trim();
    const next =
      `${withoutOld}\n\n` +
      `The user's name is ${clean}. Use it naturally sometimes, especially when greeting or confirming.`;
    conversationRef.current = [{ role: 'system', content: next }, ...conversationRef.current.slice(1)];
  };

  const stripNameIntro = (raw) => {
    const s = (raw ?? '').toString().trim();
    if (!s) return '';
    const cleaned = s
      .replace(/^\s*my\s+name\s+is\s+[a-z][a-z' -]{1,40}\s*[,.!]?\s*/i, '')
      .replace(/^\s*i\s*am\s+[a-z][a-z' -]{1,40}\s*[,.!]?\s*/i, '')
      .replace(/^\s*i'?m\s+[a-z][a-z' -]{1,40}\s*[,.!]?\s*/i, '')
      .replace(/^\s*call\s+me\s+[a-z][a-z' -]{1,40}\s*[,.!]?\s*/i, '')
      .trim();
    return cleaned;
  };

  const stopRecognition = () => {
    const recognition = recognitionRef.current;
    try {
      recognition?.stop?.();
    } catch {
      return;
    }
  };

  const abortCurrentRequest = () => {
    if (!requestAbortRef.current) return;
    try {
      requestAbortRef.current.abort();
    } catch {
      // ignore
    } finally {
      requestAbortRef.current = null;
    }
  };

  const startRecognition = () => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    if (!conversationModeRef.current) return;
    if (pendingSubmitRef.current) return;
    // Allow interrupting even while "thinking"
    if (isListeningRef.current) return;
    if (getSynthActive() && !ttsActiveRef.current) return;
    try {
      // Keep recognition continuous so we can always barge-in mid-speech.
      recognition.continuous = true;
      recognition.start();
    } catch {
      return;
    }
  };

  // webkitSpeechRecognition can get "stuck" after repeated cancels/interrupts.
  // This does a short stop→start to keep it responsive (rate-limited).
  const kickRecognition = () => {
    if (!conversationModeRef.current) return;
    const now = Date.now();
    // Too-frequent stop/start can make Chrome stop responding.
    if (now - (lastRecKickAtRef.current || 0) < 900) return;
    lastRecKickAtRef.current = now;
    try {
      stopRecognition();
    } catch {
      // ignore
    }
    setTimeout(() => {
      try {
        startRecognition();
      } catch {
        // ignore
      }
    }, 80);
  };

  const scheduleRestart = (delayMs = 150) => {
    if (!conversationModeRef.current) return;
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
    restartTimeoutRef.current = setTimeout(() => {
      restartTimeoutRef.current = null;
      startRecognition();
    }, delayMs);
  };

  const startWatchdog = () => {
    if (watchdogIntervalRef.current) return;
    watchdogIntervalRef.current = setInterval(() => {
      if (!conversationModeRef.current) return;
      if (pendingSubmitRef.current) return;
      if (isListeningRef.current) return;
      startRecognition();
    }, 700);
  };

  const stopWatchdog = () => {
    if (!watchdogIntervalRef.current) return;
    clearInterval(watchdogIntervalRef.current);
    watchdogIntervalRef.current = null;
  };

  const startCommandWatchdog = () => {
    if (commandWatchdogIntervalRef.current) return;
    commandWatchdogIntervalRef.current = setInterval(() => {
      if (!conversationModeRef.current) return;
      // Only needed while speaking.
      if (!(ttsActiveRef.current || getSynthActive())) return;
      if (pendingSubmitRef.current) return;
      const now = Date.now();
      // If recognition is not listening OR hasn't produced any events recently, restart it once.
      if (!isListeningRef.current || now - (lastRecEventAtRef.current || 0) > 1400) {
        kickRecognition();
      }
    }, 550);
  };

  const stopCommandWatchdog = () => {
    if (!commandWatchdogIntervalRef.current) return;
    clearInterval(commandWatchdogIntervalRef.current);
    commandWatchdogIntervalRef.current = null;
  };

  const normalizeVoiceCommand = (text) =>
    (text ?? '')
      .toString()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .trim()
      .replace(/\s+/g, ' ');

  const looksLikeEchoOfAiSpeech = (heard) => {
    const synthActive = ttsActiveRef.current || getSynthActive();
    if (!synthActive) return false;
    const ai = normalizeVoiceCommand(currentAiSpeechRef.current);
    const h = normalizeVoiceCommand(heard);
    if (!ai || !h) return false;

    // If the recognized text is basically a substring of what the AI is saying,
    // treat it as echo *unless* it contains clear new intent words.
    // Be conservative here; false positives break barge-in.
    if (ai.includes(h) && h.length >= 10) {
      const words = (s) => s.split(' ').filter((w) => w.length >= 3);
      const aiSet = new Set(words(ai));
      const hWords = words(h);
      const novel = hWords.filter((w) => !aiSet.has(w));
      // If user introduces at least 1 novel word, assume it's a real barge-in.
      if (novel.length >= 1) return false;
      return true;
    }

    const words = (s) => s.split(' ').filter((w) => w.length >= 3);
    const hWords = words(h);
    const aiSet = new Set(words(ai));
    if (!hWords.length || !aiSet.size) return false;
    let hit = 0;
    for (const w of hWords) if (aiSet.has(w)) hit += 1;
    const overlap = hit / hWords.length;
    const novel = hWords.filter((w) => !aiSet.has(w));
    // High overlap is usually echo, but keep threshold high to avoid blocking real interrupts.
    if (overlap >= 0.85 && hWords.length >= 4 && novel.length < 1) return true;
    return false;
  };

  const getVoiceCommand = (text) => {
    const normalized = normalizeVoiceCommand(text);
    if (!normalized) return null;

    // Match commands anywhere in the phrase (interim often contains extra words).
    const hasStop = /\b(stop|cancel)\b/.test(normalized) || /\bshut\s+up\b/.test(normalized);
    const hasPause = /\bpause\b/.test(normalized);
    const hasResume = /\b(resume|continue|start)\b/.test(normalized);

    if (!hasStop && !hasPause && !hasResume) return null;

    // Stop is always highest priority (urgent).
    if (hasStop) return 'stop';

    // For pause vs resume in the same phrase, use the last one (most recent intent).
    const lastPause = normalized.lastIndexOf('pause');
    const lastResume = Math.max(
      normalized.lastIndexOf('resume'),
      normalized.lastIndexOf('continue'),
      normalized.lastIndexOf('start')
    );
    if (hasPause && hasResume) return lastResume > lastPause ? 'resume' : 'pause';
    if (hasPause) return 'pause';
    if (hasResume) return 'resume';

    return null;
  };

  const handleVoiceCommand = (cmd) => {
    const c = normalizeVoiceCommand(cmd);
    if (!c) return false;

    if (c === 'pause') {
      pauseSpeech();
      kickRecognition();
      return true;
    }
    if (c === 'resume' || c === 'continue' || c === 'start') {
      resumeSpeech();
      kickRecognition();
      return true;
    }
    if (c === 'stop' || c === 'cancel' || c === 'shut up') {
      cancelSpeech();
      ttsActiveRef.current = false;
      abortCurrentRequest();
      // Also cancel any queued "chunk" speech immediately.
      ttsQueueKeyRef.current += 1;
      ttsQueueRef.current = Promise.resolve();
      heardTextRef.current = '';
      if (submitTimerRef.current) {
        clearTimeout(submitTimerRef.current);
        submitTimerRef.current = null;
      }
      pendingSubmitRef.current = false;
      setStatusText('Listening…');
      scheduleRestart(0);
      kickRecognition();
      return true;
    }
    return false;
  };

  const isShortAck = (normalized) => {
    const n = (normalized ?? '').toString().trim();
    return n === 'ok' || n === 'okay' || n === 'yeah' || n === 'yes' || n === 'no' || n === 'hmm';
  };

  const looksLikeUserInterrupt = (normalized) => {
    const n = (normalized ?? '').toString().trim();
    if (!n) return false;
    if (isShortAck(n)) return true;
    // Common "barge-in" starters that users say to interrupt the AI.
    return /\b(wait|hold on|listen|actually|sorry|excuse me|hey|stop|cancel|no|but)\b/.test(n);
  };

  const forceStopToListen = (rawText, { submit = false, kick = true } = {}) => {
    const raw = (rawText ?? '').toString().trim();
    if (!raw) return;
    cancelSpeech();
    ttsActiveRef.current = false;
    currentAiSpeechRef.current = '';
    abortCurrentRequest();
    ttsQueueKeyRef.current += 1;
    ttsQueueRef.current = Promise.resolve();
    setStatusText('Listening…');
    // Allow submitting this new topic.
    submittedFromVoiceRef.current = false;
    heardTextRef.current = raw;
    if (submit) scheduleSubmitAfterSilence(500, true);
    scheduleRestart(0);
    if (kick) kickRecognition();
  };

  const enqueueSpeakChunk = (chunk, { isLast = false } = {}) => {
    let text = (chunk ?? '').toString().trim();
    // Never speak "..." or "dot dot dot" (live/production can get empty response when backend is unreachable)
    if (/^[.\s]+$/.test(text) || /^(dot\s*)+$/i.test(text)) text = '';
    if (!text) {
      if (isLast) {
        ttsQueueRef.current = ttsQueueRef.current.then(() => {
          ttsActiveRef.current = false;
          currentAiSpeechRef.current = '';
        });
      }
      return;
    }

    const myKey = ttsQueueKeyRef.current;
    ttsQueueRef.current = ttsQueueRef.current.then(async () => {
      if (ttsQueueKeyRef.current !== myKey) return;
      await speakText(text, {
        enabled: true,
        gender: 'female',
        // Slightly lower volume helps your voice be recognized during barge-in.
        volume: 0.85,
        cancelExisting: false,
      });
      if (isLast && ttsQueueKeyRef.current === myKey) {
        ttsActiveRef.current = false;
        currentAiSpeechRef.current = '';
      }
    });
  };

  const scheduleSubmitAfterSilence = (delayMs = 1000, allowWhileSpeaking = false) => {
    if (submitTimerRef.current) {
      clearTimeout(submitTimerRef.current);
      submitTimerRef.current = null;
    }
    pendingSubmitRef.current = true;
    submitTimerRef.current = setTimeout(() => {
      submitTimerRef.current = null;
      const text = heardTextRef.current?.trim();
      if (!text) {
        pendingSubmitRef.current = false;
        return;
      }
      // In continuous recognition mode, onStart may not fire again, so the old
      // "submittedFromVoiceRef" lock can get stuck true after the first turn.
      // Use a time/text dedupe instead.
      const now = Date.now();
      const norm = text.replace(/\s+/g, ' ').trim();
      if (
        norm &&
        norm.toLowerCase() === (lastSubmittedTextRef.current || '').toLowerCase() &&
        now - (lastSubmittedAtRef.current || 0) < 1200
      ) {
        pendingSubmitRef.current = false;
        return;
      }
      // Only submit when AI isn't speaking
      if (!allowWhileSpeaking && (ttsActiveRef.current || getSynthActive())) {
        // Wait a bit more until speaking stops.
        scheduleSubmitAfterSilence(delayMs, allowWhileSpeaking);
        return;
      }
      lastSubmittedTextRef.current = norm;
      lastSubmittedAtRef.current = now;
      heardTextRef.current = '';
      pendingSubmitRef.current = false;
      handleUserUtterance(text);
    }, delayMs);
  };

  const handleUserUtterance = async (textToSendRaw) => {
    const textToSend = String(textToSendRaw ?? '').trim();
    if (!textToSend) return;

    // If the user says their name, remember it and acknowledge immediately.
    const maybeName = extractNameFromText(textToSend);
    if (maybeName) {
      rememberUserName(maybeName);
      try {
        enqueueSpeakChunk(`Okay, ${maybeName}.`);
      } catch {
        // ignore
      }
      // If user only provided their name, don't call the model (prevents repeating).
      const rest = stripNameIntro(textToSend);
      if (!rest) {
        setStatusText('Listening…');
        scheduleRestart(0);
        return;
      }
    }

    // If something is already happening, stop it and switch topics immediately.
    try {
      cancelSpeech();
    } catch {
      // ignore
    }
    ttsActiveRef.current = false;
    currentAiSpeechRef.current = '';
    ttsQueueKeyRef.current += 1;
    ttsQueueRef.current = Promise.resolve();

    abortCurrentRequest();

    isLoadingRef.current = true;
    setLastError('');
    setStatusText('Thinking…');
    // Keep listening even while thinking/speaking so the user can interrupt anytime.

    try {
      // If the user included a name-intro + other content, avoid sending the intro again.
      const userContent = maybeName ? stripNameIntro(textToSend) : textToSend;
      const nextHistory = [...conversationRef.current, { role: 'user', content: userContent }];
      const sys = nextHistory[0];
      const tail = nextHistory.slice(1).slice(-MAX_TURNS * 2);
      conversationRef.current = [sys, ...tail];

      const controller = new AbortController();
      requestAbortRef.current = controller;
      // Streaming: start speaking as soon as we receive the first tokens.
      // NOTE: NVIDIA streaming may be unavailable/slow in some environments; we fall back automatically.
      let aiText = '';
      let speakBuf = '';
      let spokeAnything = false;

      const flushIfReady = (force = false) => {
        const trimmed = speakBuf.trim();
        if (!trimmed) return;
        const ready =
          force ||
          /[.!?]\s*$/.test(trimmed) ||
          trimmed.length >= 70 ||
          (spokeAnything && trimmed.length >= 40);
        if (!ready) return;
        speakBuf = '';
        spokeAnything = true;
        enqueueSpeakChunk(trimmed);
      };

      try {
        const finalText = await nvidiaGenerateTextStream(conversationRef.current, {
          signal: controller.signal,
          onDelta: (delta, meta) => {
            if (!delta) return;
            aiText = meta?.full ?? `${aiText}${delta}`;
            currentAiSpeechRef.current = aiText;
            speakBuf += delta;

            // Enable interrupts immediately (so “stop” works right away).
            if (!ttsActiveRef.current) {
              ttsActiveRef.current = true;
              startRecognition();
              // We keep the mic active during speech, so show Listening instead of Thinking.
              setStatusText('Listening…');
            }

            flushIfReady(false);
          },
        });
        aiText = (finalText || aiText || '').toString();
      } catch (err) {
        // If streaming fails, fall back to a single non-stream call (avoids repetition + extra timeouts).
        if (err?.name === 'AbortError') throw err;
        let ackTimer = null;
        try {
          ackTimer = setTimeout(() => {
            if (ttsActiveRef.current) return;
            ttsActiveRef.current = true;
            startRecognition();
            setStatusText('Listening…');
            enqueueSpeakChunk('Okay…');
          }, 650);

          const full = await nvidiaGenerateText(conversationRef.current, {
            signal: controller.signal,
            max_tokens: 96,
            temperature: 0.35,
          });
          const fullText = (full || '').toString().trim();
          if (fullText) {
            aiText = fullText;
            enqueueSpeakChunk(fullText);
            spokeAnything = true;
          }
        } finally {
          if (ackTimer) clearTimeout(ackTimer);
        }
      }

      requestAbortRef.current = null;
      const finalAi = (aiText || '').toString().trim();
      // We have the answer now; no longer "thinking".
      isLoadingRef.current = false;
      conversationRef.current.push({ role: 'assistant', content: finalAi || '(No response)' });
      currentAiSpeechRef.current = finalAi;

      // Finish speaking: flush remaining buffer then wait for queued chunks.
      flushIfReady(true);

      // If streaming produced little/no queued speech, speak the full text (never speak "...").
      if (!spokeAnything && finalAi) {
        ttsActiveRef.current = true;
        startRecognition();
        setStatusText('Listening…');
        enqueueSpeakChunk(finalAi, { isLast: true });
      } else {
        enqueueSpeakChunk('', { isLast: true });
      }
      await ttsQueueRef.current;
    } catch (error) {
      if (
        error?.name === 'AbortError' ||
        (typeof error?.message === 'string' && error.message.toLowerCase().includes('aborted'))
      ) {
        // Switched to a new topic; don't speak an error.
        return;
      }
      console.error('AI Error:', error);
      const msg =
        error?.message ||
        'Sorry, I encountered an error. Please check your NVIDIA API key and restart the app.';
      setLastError(String(msg));
      ttsActiveRef.current = true;
      currentAiSpeechRef.current = msg;
      startRecognition();
      setStatusText('Listening…');
      ttsQueueKeyRef.current += 1;
      ttsQueueRef.current = Promise.resolve();
      enqueueSpeakChunk(msg, { isLast: true });
      await ttsQueueRef.current;
    } finally {
      isLoadingRef.current = false;
      setStatusText('Listening…');
      scheduleRestart();
    }
  };

  useEffect(() => {
    if (!isSpeechRecognitionSupported()) return;

    const recognition = createSpeechRecognition({
      lang: 'en-US',
      continuous: false,
      onStart: () => {
        submittedFromVoiceRef.current = false;
        heardTextRef.current = '';
        lastRecEventAtRef.current = Date.now();
        if (submitTimerRef.current) {
          clearTimeout(submitTimerRef.current);
          submitTimerRef.current = null;
        }
        pendingSubmitRef.current = false;
        isListeningRef.current = true;
        setIsListening(true);
        setStatusText('Listening…');
      },
      onEnd: () => {
        lastRecEventAtRef.current = Date.now();
        isListeningRef.current = false;
        setIsListening(false);
        // If the user stopped talking, wait 1s before sending.
        if (heardTextRef.current?.trim()) {
          setStatusText('Got it…');
          scheduleSubmitAfterSilence();
          return;
        }
        // If the AI is currently speaking, we want to stay in "listening" mode for barge-in commands.
        if (ttsActiveRef.current || getSynthActive()) {
          setStatusText('Listening…');
        } else {
          setStatusText(isLoadingRef.current ? 'Thinking…' : 'Listening…');
        }
        scheduleRestart();
      },
      onError: () => {
        lastRecEventAtRef.current = Date.now();
        isListeningRef.current = false;
        setIsListening(false);
        setStatusText('Listening…');
        // During AI speech, recognition errors are common; restart quickly so commands keep working.
        if (ttsActiveRef.current || getSynthActive()) {
          kickRecognition();
          scheduleRestart(120);
          return;
        }
        scheduleRestart(800);
      },
      onInterim: (text) => {
        lastRecEventAtRef.current = Date.now();
        const synthActive = ttsActiveRef.current || getSynthActive();

        if (synthActive) {
          // IMPORTANT: always check "stop" first, even if the mic is hearing AI speech.
          const cmd = getVoiceCommand(text);
          if (cmd && handleVoiceCommand(cmd)) {
            submittedFromVoiceRef.current = true;
            return;
          }
          if (looksLikeEchoOfAiSpeech(text)) return;
          // If user starts speaking (any non-echo speech), stop AI voice immediately and keep listening.
          // Don't "kick" recognition here; it can cut off the first words.
          forceStopToListen(text, { submit: false, kick: false });
          return;
        }
        // Commands should also work while "thinking".
        const cmdThinking = getVoiceCommand(text);
        if (cmdThinking && handleVoiceCommand(cmdThinking)) {
          submittedFromVoiceRef.current = true;
          return;
        }
        // If AI is thinking and user starts talking, cancel the current request immediately.
        if (isLoadingRef.current) {
          abortCurrentRequest();
        }
        // Continuous recognition can keep running across turns; unlock when new speech starts.
        if (submittedFromVoiceRef.current) submittedFromVoiceRef.current = false;
        heardTextRef.current = text;
        scheduleSubmitAfterSilence(isLoadingRef.current ? 450 : 1000);
      },
      onFinal: (text, meta) => {
        lastRecEventAtRef.current = Date.now();
        const synthActive = ttsActiveRef.current || getSynthActive();

        // Commands should work during speaking and thinking.
        const cmd = getVoiceCommand(text, meta?.confidence);
        if (cmd) {
          const used = handleVoiceCommand(cmd);
          if (used) {
            submittedFromVoiceRef.current = true;
            return;
          }
        }

        // If the AI is currently speaking, ignore non-command speech (prevents echo/accidental sends)
        if (synthActive) {
          const normalized = normalizeVoiceCommand(text);
          if (looksLikeUserInterrupt(normalized)) {
            forceStopToListen(text, { submit: !isShortAck(normalized), kick: true });
            return;
          }
          if (!looksLikeEchoOfAiSpeech(text)) {
            // Treat as barge-in: stop speaking and queue the new topic.
            cancelSpeech();
            ttsActiveRef.current = false;
            currentAiSpeechRef.current = '';
            heardTextRef.current = text;
            // IMPORTANT: allow this new topic to be submitted (don't block it).
            submittedFromVoiceRef.current = false;
            // Faster turn-taking when user interrupts mid-speech
            scheduleSubmitAfterSilence(250, true);
          }
          return;
        }
        // Don't submit immediately; wait for 1s of silence after user finishes.
        heardTextRef.current = text;
        scheduleSubmitAfterSilence();
      },
    });

    recognitionRef.current = recognition;

    return () => {
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
        restartTimeoutRef.current = null;
      }
      stopWatchdog();
      stopCommandWatchdog();
      try {
        recognition?.stop();
      } catch {
        return;
      }
      recognitionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleListening = () => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      alert('Voice input is not supported in this browser.');
      return;
    }
    const next = !conversationModeRef.current;
    conversationModeRef.current = next;
    setVoiceModeOn(next);
    if (!next) {
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
        restartTimeoutRef.current = null;
      }
      stopWatchdog();
      stopCommandWatchdog();
      stopRecognition();
      cancelSpeech();
      isListeningRef.current = false;
      setIsListening(false);
      setStatusText('Tap the mic to start.');
      return;
    }
    startWatchdog();
    startCommandWatchdog();
    setStatusText('Listening…');
    scheduleRestart(0);
  };

  const handleLogout = () => {
    localStorage.removeItem('username');
    onLogout?.();
  };

  const handleDeleteAccount = () => {
    const currentUsername = localStorage.getItem('username');
    if (!currentUsername) {
      handleLogout();
      return;
    }
    const ok = window.confirm('Delete this account? This cannot be undone.');
    if (!ok) return;
    try {
      const raw = localStorage.getItem('users');
      const users = raw ? JSON.parse(raw) : [];
      const nextUsers = Array.isArray(users)
        ? users.filter((u) => (u?.username ?? '') !== currentUsername)
        : [];
      localStorage.setItem('users', JSON.stringify(nextUsers));
    } catch {
      // ignore
    } finally {
      localStorage.removeItem('username');
      onLogout?.();
    }
  };

  return (
    <div className="ai-central">
      <div className="ai-central-header">
        <div className="ai-central-brand">
          <span aria-hidden="true">*</span>
          <span>AI Central</span>
        </div>
        <div className="ai-central-actions" ref={accountMenuRef}>
          <button
            type="button"
            className="ai-central-account-btn"
            onClick={() => setAccountMenuOpen((v) => !v)}
            aria-expanded={accountMenuOpen}
          >
            Account <span aria-hidden="true">▾</span>
          </button>
          {accountMenuOpen && (
            <div className="ai-central-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setAccountMenuOpen(false);
                  handleLogout();
                }}
              >
                Logout
              </button>
              <button
                type="button"
                role="menuitem"
                className="ai-central-danger"
                onClick={() => {
                  setAccountMenuOpen(false);
                  handleDeleteAccount();
                }}
              >
                Delete account
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="ai-central-main">
        <div className="ai-central-card">
          <h1 className="ai-central-title">How can I help you today?</h1>
          <p className="ai-central-subtitle">Press the button to begin your interaction.</p>

          <button
            type="button"
            className={`ai-central-mic ${voiceModeOn ? 'ai-central-mic--on' : ''} ${
              isListening ? 'ai-central-mic--listening' : ''
            }`}
            onClick={toggleListening}
            aria-pressed={voiceModeOn}
            title={voiceModeOn ? 'Stop voice mode' : 'Start voice mode'}
          >
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"
                fill="rgba(255,255,255,0.92)"
              />
              <path
                d="M19 11v1a7 7 0 0 1-14 0v-1"
                stroke="rgba(255,255,255,0.92)"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M12 19v3M8 22h8"
                stroke="rgba(255,255,255,0.92)"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>

          <div className="ai-central-status">
            {statusText}
          </div>
          <div className="ai-central-status">
            Backend: {backendStatus} · Speech: {speechStatus}
          </div>
          {lastError && <div className="ai-central-error">{lastError}</div>}
        </div>
      </div>
    </div>
  );
}

export default AiBot;
