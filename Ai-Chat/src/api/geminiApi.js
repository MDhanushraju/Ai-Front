import { GoogleGenAI } from "@google/genai";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

const ai = new GoogleGenAI({ apiKey });

export async function geminiGenerateText(contents) {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents,
  });
  return response.text ?? "";
}

