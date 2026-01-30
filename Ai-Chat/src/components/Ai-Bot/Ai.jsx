import { useState, useRef, useEffect } from 'react';
import './Ai.css';
import { generateGeminiReply } from '../../api/gemini';
import {
  createSpeechRecognition,
  isSpeechRecognitionSupported,
  speakText,
} from '../../api/voice';

function AiBot({ username, onLogout }) {
  const [messages, setMessages] = useState([
    {
      id: 1,
      type: 'ai',
      text: 'Hello, how can I help you today?',
    },
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false); // New: loading state
  const [isListening, setIsListening] = useState(false);
  const [voiceOutEnabled, setVoiceOutEnabled] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const chatEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const heardTextRef = useRef('');
  const submittedFromVoiceRef = useRef(false);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (overrideText) => {
    const textToSend = (overrideText ?? inputMessage).trim();
    if (!textToSend || isLoading) return;

    const userMessage = {
      id: Date.now(),
      type: 'user',
      text: textToSend,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const replyText = await generateGeminiReply(textToSend);
      const aiMessage = { id: Date.now() + 1, type: 'ai', text: replyText || '...' };
      setMessages((prev) => [...prev, aiMessage]);
      speakText(aiMessage.text, { enabled: voiceOutEnabled });
    } catch (error) {
      console.error('AI Error:', error);
      const errorMessage = {
        id: Date.now() + 1,
        type: 'ai',
        text:
          error?.message ||
          'Sorry, I encountered an error. Please check your API key and restart the app.',
      };
      setMessages((prev) => [...prev, errorMessage]);
      speakText(errorMessage.text, { enabled: voiceOutEnabled });
    } finally {
      setIsLoading(false);
    }
  };

  // Setup Speech Recognition once (auto-submit after hearing)
  useEffect(() => {
    if (!isSpeechRecognitionSupported()) return;

    const recognition = createSpeechRecognition({
      lang: 'en-US',
      onStart: () => {
        submittedFromVoiceRef.current = false;
        setIsListening(true);
      },
      onEnd: () => {
        setIsListening(false);
        // If no final callback fired, still auto-submit what we heard
        const fallback = heardTextRef.current?.trim();
        if (!submittedFromVoiceRef.current && fallback) {
          handleSendMessage(fallback);
        }
        heardTextRef.current = '';
      },
      onError: () => setIsListening(false),
      onInterim: (text) => {
        heardTextRef.current = text;
        setInputMessage(text);
      },
      onFinal: (text) => {
        heardTextRef.current = text;
        setInputMessage(text);
        submittedFromVoiceRef.current = true;
        handleSendMessage(text); // auto submit immediately
      },
    });

    recognitionRef.current = recognition;

    return () => {
      try {
        recognition?.stop();
      } catch {
        // ignore
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
    try {
      if (isListening) recognition.stop();
      else recognition.start();
    } catch {
      // ignore
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('username');
    onLogout?.();
  };

  const handleDeleteAccount = () => {
    const currentUsername = username || localStorage.getItem('username');
    if (!currentUsername) {
      handleLogout();
      return;
    }

    const ok = window.confirm(
      'Are you sure you want to delete this account? This cannot be undone.'
    );
    if (!ok) return;

    try {
      const raw = localStorage.getItem('users');
      const users = raw ? JSON.parse(raw) : [];
      const nextUsers = Array.isArray(users)
        ? users.filter((u) => u?.username !== currentUsername)
        : [];
      localStorage.setItem('users', JSON.stringify(nextUsers));
    } catch {
      // If storage is corrupted, still log out
    } finally {
      localStorage.removeItem('username');
      onLogout?.();
    }
  };

  return (
    <div className="ai-bot-container">
      <div className="ai-bot-screen">
        
        <div className="ai-header" id="aiHeader">
          <div className="ai-header-row">
            <h1 className="ai-header-title" id="aiHeaderTitle">AI Assistance</h1>
            <button
              type="button"
              className="ai-menu-trigger"
              id="aiMenuTrigger"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-controls="aiMenu"
              title="Menu"
            >
              ⋯
            </button>
          </div>

          {/* Menu (keeps morning look: no buttons over title) */}
          <div className={`ai-menu ${menuOpen ? 'ai-menu--open' : ''}`} id="aiMenu">
            <button
              type="button"
              className="ai-header-button"
              id="voiceOutToggle"
              onClick={() => {
                setVoiceOutEnabled((v) => !v);
                setMenuOpen(false);
              }}
              title="Voice output on/off"
            >
              {voiceOutEnabled ? 'Voice On' : 'Voice Off'}
            </button>
            <button
              type="button"
              className="ai-header-button ai-logout-button"
              id="logoutButton"
              onClick={() => {
                setMenuOpen(false);
                handleLogout();
              }}
            >
              Logout
            </button>
            <button
              type="button"
              className="ai-header-button ai-delete-button"
              id="deleteAccountButton"
              onClick={() => {
                setMenuOpen(false);
                handleDeleteAccount();
              }}
            >
              Delete
            </button>
          </div>
          <div className="ai-header-divider"></div>
        </div>

        {/* Chat Messages Area */}
        <div className="chat-messages-area" id="chatMessagesArea">
          <div className="date-separator" id="dateSeparator">
            TODAY
          </div>

          {messages.map((message) => {
            const isUser = message.type === 'user';
            return (
              <div
                key={message.id}
                className={`message-wrapper ${isUser ? 'user-message-wrapper' : 'ai-message-wrapper'}`}
              >
                <div className={`message-label ${isUser ? 'user-label' : 'ai-label'}`} id={isUser ? 'userLabel' : 'aiLabel'}>
                  {isUser ? 'YOU' : 'AI ASSISTANT'}
                </div>
                <div className={`message-bubble ${isUser ? 'user-bubble' : 'ai-bubble'}`} id={isUser ? 'userBubble' : 'aiBubble'}>
                  <p className="message-text" id="messageText">{message.text}</p>
                </div>
                <div className={`message-avatar ${isUser ? 'user-avatar' : 'ai-avatar'}`} id={isUser ? 'userAvatar' : 'aiAvatar'}>
                  {isUser ? (
                    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                      <circle cx="16" cy="12" r="6" fill="#FF6B35" />
                      <path d="M8 28c0-4 3.5-8 8-8s8 4 8 8" stroke="#333" strokeWidth="2" fill="none" />
                    </svg>
                  ) : (
                    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                      <circle cx="16" cy="16" r="14" fill="#2D8CFF" />
                      <circle cx="16" cy="16" r="6" fill="#5AA3FF" />
                    </svg>
                  )}
                </div>
              </div>
            );
          })}

          {isLoading && (
            <div className="message-wrapper ai-message-wrapper">
              <div className="message-label ai-label">AI ASSISTANT</div>
              <div className="message-bubble ai-bubble">
                <p className="message-text">Typing...</p>
              </div>
              <div className="message-avatar ai-avatar">
                {/* AI avatar SVG */}
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                  <circle cx="16" cy="16" r="14" fill="#2D8CFF" />
                  <circle cx="16" cy="16" r="6" fill="#5AA3FF" />
                </svg>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input Bar - disable while loading */}
        <div className="input-bar" id="inputBar">
          <div className="input-bar-user-avatar" id="inputBarUserAvatar">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="12" r="6" fill="#FF6B35" />
              <path d="M8 28c0-4 3.5-8 8-8s8 4 8 8" stroke="#333" strokeWidth="2" fill="none" />
              <circle cx="20" cy="10" r="2" fill="#2D8CFF" />
            </svg>
          </div>
          <input
            type="text"
            className="message-input"
            id="messageInput"
            placeholder={isLoading ? "AI is responding..." : "Type a message..."}
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isLoading}
          />
          <button
            className={`voice-button ${isListening ? 'voice-button--listening' : ''}`}
            id="voiceButton"
            aria-label="Voice input"
            disabled={isLoading}
            onClick={toggleListening}
            title={isListening ? 'Stop listening' : 'Start voice input'}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 1C10.34 1 9 2.34 9 4V12C9 13.66 10.34 15 12 15C13.66 15 15 13.66 15 12V4C15 2.34 13.66 1 12 1Z"
                fill="rgba(255,255,255,0.85)"
              />
              <path
                d="M19 10V12C19 15.87 15.87 19 12 19M5 10V12C5 15.87 8.13 19 12 19M12 19V23M8 23H16"
                stroke="rgba(255,255,255,0.85)"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <button
            className="send-button"
            id="sendButton"
            onClick={handleSendMessage}
            disabled={!inputMessage.trim() || isLoading}
            aria-label="Send message"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        <div className="nav-bar-indicator" id="navBarIndicator"></div>
      </div>
    </div>
  );
}

export default AiBot;
