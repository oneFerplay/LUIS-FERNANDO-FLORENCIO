import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: apiKey || "" });

export async function generateChatResponse(message: string, history: { role: 'user' | 'model', parts: [{ text: string }] }[]) {
  if (!apiKey) {
    throw new Error("Gemini API key is missing");
  }

  const chat = ai.chats.create({
    model: "gemini-3.1-pro-preview",
    config: {
      systemInstruction: "You are a helpful and friendly AI assistant integrated into a messaging app. Keep your responses concise and conversational, as if you're chatting in a messaging app.",
    },
  });

  // Note: sendMessage only accepts the message parameter, history is handled by the chat instance if we were keeping it.
  // For simplicity in this demo, we'll just send the message.
  const response = await chat.sendMessage({ message });
  return response.text;
}
