import { apiRequest } from "./client";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

interface ChatApiResponse {
  success: boolean;
  reply?: string;
  message?: string;
}

/** Extract the backend's `{ success, message }` body from an apiRequest error
 * (`API Error <status>: <body text>`). Falls back to a friendly default. */
function chatError(err: unknown): Error {
  const match = err instanceof Error ? /^API Error \d+: (.+)$/s.exec(err.message) : null;
  const bodyText = match?.[1];
  if (bodyText) {
    try {
      const parsed = JSON.parse(bodyText) as { message?: string };
      if (parsed?.message) return new Error(parsed.message);
    } catch {
      // fall through to generic message
    }
  }
  return new Error("The AI assistant is unavailable right now. Please try again.");
}

/**
 * Ask the EnergyScope solar assistant. The backend proxies Gemini; the API
 * key and all model details stay server-side.
 */
export async function sendAiChat(message: string, history: ChatTurn[]): Promise<string> {
  let data: ChatApiResponse;

  try {
    data = await apiRequest<ChatApiResponse>("/ai/chat", {
      method: "POST",
      body: JSON.stringify({ message, history }),
    });
  } catch (err) {
    throw chatError(err);
  }

  if (!data.success || typeof data.reply !== "string" || !data.reply.trim()) {
    throw new Error(data.message ?? "The AI assistant returned an empty response.");
  }

  return data.reply;
}
