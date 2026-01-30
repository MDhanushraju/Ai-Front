// Wrapper that uses the Gemini snippet-based API file.
import { geminiGenerateText } from "./geminiApi";

export async function generateGeminiReply(prompt) {
  if (!import.meta.env.VITE_GEMINI_API_KEY) {
    throw new Error(
      "Missing VITE_GEMINI_API_KEY. Add it to the project root .env file and restart Vite."
    );
  }
  return await geminiGenerateText(prompt);
}

