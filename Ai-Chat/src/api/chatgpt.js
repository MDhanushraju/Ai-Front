import { chatgptGenerateText } from './chatgptApi';

export async function generateChatGPTReply(prompt) {
  return await chatgptGenerateText(prompt, { model: 'gpt-4o-mini' });
}

