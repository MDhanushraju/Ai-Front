import { GoogleGenAI } from "@google/genai";

// Vite exposes env vars only with VITE_ prefix (so we use VITE_GEMINI_API_KEY)
const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

// Your snippet style: create client once
const ai = new GoogleGenAI({ apiKey });

// Your snippet style: call generateContent and return response.text
export async function geminiGenerateText(contents) {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents,
  });
  return response.text ?? "";
}

