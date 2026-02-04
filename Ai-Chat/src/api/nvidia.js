import { nvidiaGenerateText } from './nvidiaApi';

export async function generateNvidiaReply(prompt) {
  return await nvidiaGenerateText(prompt);
}

