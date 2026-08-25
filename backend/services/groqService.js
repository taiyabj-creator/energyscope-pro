/**
 * Groq AI service - EnergyScope solar assistant.
 *
 * Talks EXCLUSIVELY to Groq's OpenAI-compatible chat completions API
 * (api.groq.com/openai/v1/chat/completions) from the backend. The API key
 * lives in GROQ_API_KEY and is NEVER logged, echoed, or sent to the frontend.
 *
 * Mirrors the geminiService.js contract so either provider can be used
 * interchangeably through aiProviderService.js.
 *
 * All failures are thrown as GroqError with a stable .code so routes can
 * map them to clean HTTP responses without leaking internals:
 *   CONFIG | AUTH | RATE_LIMITED | TIMEOUT | EMPTY_RESPONSE | UPSTREAM
 */

const API_BASE = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-oss-120b";

class GroqError extends Error {
  /**
   * @param {string} code stable machine-readable code
   * @param {string} message safe, user-presentable message (no secrets)
   * @param {{status?: number|null}} [meta] upstream HTTP status, diagnostics only
   */
  constructor(code, message, meta = {}) {
    super(message);
    this.name = "GroqError";
    this.code = code;
    this.upstreamStatus = meta.status ?? null;
  }
}

/**
 * Build the system message content from a base instruction and optional
 * EnergyScope context appendix.
 * @param {string} systemInstruction
 * @param {string|null} systemAppendix
 * @returns {string}
 */
function buildSystemContent(systemInstruction, systemAppendix = null) {
  const parts = [systemInstruction];
  if (systemAppendix) {
    parts.push("", systemAppendix);
  }
  return parts.join("\n");
}

/**
 * Normalize frontend conversation history into OpenAI-compatible message
 * entries. Keeps only valid turns, trims lengths, drops garbage.
 * @param {Array<{role?: unknown, content?: unknown}>} history
 * @param {number} [maxMessages]
 * @returns {Array<{role: string, content: string}>}
 */
function mapHistoryToMessages(history, maxMessages = 12) {
  if (!Array.isArray(history)) return [];
  const mapped = [];
  for (const turn of history.slice(-maxMessages)) {
    const role = turn?.role === "assistant" ? "assistant" : "user";
    const text = typeof turn?.content === "string" ? turn.content.trim().slice(0, 4000) : "";
    if (!text) continue;
    mapped.push({ role, content: text });
  }
  return mapped;
}

function requestTimeoutMs() {
  const parsed = Number(process.env.GROQ_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30000;
}

function model() {
  return process.env.GROQ_MODEL || DEFAULT_MODEL;
}

/**
 * Send one chat turn to Groq.
 * @param {{message: string, history?: Array<{role: string, content: string}>,
 *   systemAppendix?: string|null}} params
 * @returns {Promise<{reply: string, model: string}>}
 */
async function askGroq({ message, history = [], systemAppendix = null } = {}) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new GroqError(
      "CONFIG",
      "The AI assistant is not configured on this server. Set GROQ_API_KEY to enable it.",
    );
  }
  const text = typeof message === "string" ? message.trim() : "";
  if (!text) {
    throw new GroqError("CONFIG", "Message must be a non-empty string.");
  }

  const messages = [
    {
      role: "system",
      content: buildSystemContent(
        "You are the EnergyScope Solar Assistant for a UTL Solar rooftop photovoltaic plant monitored through the EnergyScope dashboard.\n\n" +
          "Your domain: solar generation, energy production, weather effects on output, inverter status, historical performance, and EnergyScope product features.\n\n" +
          "Rules:\n" +
          "- Be concise and practical. Prefer short paragraphs or tight bullet lists.\n" +
          "- NEVER invent plant data. You only know what the backend explicitly supplies to you.\n" +
          "- If specific data (today's kWh, monthly totals, live status, forecasts...) has not been supplied in this conversation, clearly say that the data is currently unavailable rather than estimating silently.\n" +
          "- Clearly distinguish measured/recorded values from estimates or forecasts whenever you mention either.\n" +
          "- Do not modify, recalculate, or promise to recalculate production forecasts.\n" +
          "- For questions outside the solar/EnergyScope domain, answer briefly and steer back to the plant.\n" +
          "- Never claim access to accounts, devices, credentials, or live telemetry that was not provided in this conversation.\n" +
          "- Never reveal internal API credentials, tokens, session information, implementation details, or any secrets.\n\n" +
          "Response formatting:\n" +
          "- Do NOT use Markdown bold (**text**) or italics (*text).\n" +
          "- Do NOT use Markdown headings (#), backticks, tables, or code blocks.\n" +
          "- Use plain text only: simple labels, short paragraphs, and plain bullet points (- or *).\n" +
          "- Keep measured values, forecasts, weather data, and performance data clearly distinguishable using plain text labels.",
        systemAppendix,
      ),
    },
    ...mapHistoryToMessages(history),
    { role: "user", content: text.slice(0, 4000) },
  ];

  const usedModel = model();
  const startTime = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs());

  let response;
  try {
    response = await fetch(API_BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: usedModel,
        messages,
        temperature: 0.4,
        max_tokens: Number(process.env.GROQ_MAX_OUTPUT_TOKENS) || 1024,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    const durationMs = Date.now() - startTime;
    if (err?.name === "AbortError") {
      console.warn(`[Groq] TIMEOUT | model=${usedModel} | duration=${durationMs}ms`);
      throw new GroqError(
        "TIMEOUT",
        "The AI assistant took too long to respond. Please try again.",
      );
    }
    console.error(
      `[Groq] FETCH_ERROR | model=${usedModel} | duration=${durationMs}ms | err=${err?.message?.slice(0, 120)}`,
    );
    throw new GroqError(
      "UPSTREAM",
      "Could not reach the AI service right now. Please try again shortly.",
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    let detail = "";
    let errorType = "";
    let errorCode = "";
    try {
      const body = await response.json();
      detail = typeof body?.error?.message === "string" ? body.error.message : "";
      errorType = typeof body?.error?.type === "string" ? body.error.type : "";
      errorCode = typeof body?.error?.code === "string" ? body.error.code : "";
    } catch {
      detail = "";
    }
    const durationMs = Date.now() - startTime;
    console.error(
      `[Groq] HTTP ${response.status} | model=${usedModel} | duration=${durationMs}ms` +
        (errorType ? ` | type=${errorType}` : "") +
        (errorCode ? ` | code=${errorCode}` : "") +
        (detail ? ` | detail=${detail.slice(0, 200)}` : ""),
    );
    if (response.status === 429) {
      throw new GroqError(
        "RATE_LIMITED",
        "The AI assistant is receiving too many requests right now. Please try again in a moment.",
        { status: response.status },
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new GroqError(
        "AUTH",
        "The configured AI API key was rejected. Check GROQ_API_KEY on the server.",
        { status: response.status },
      );
    }
    throw new GroqError("UPSTREAM", "The AI service returned an error. Please try again shortly.", {
      status: response.status,
    });
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new GroqError("EMPTY_RESPONSE", "The AI assistant returned an unreadable response.");
  }

  const reply = (data?.choices ?? [])
    .map((c) => (typeof c?.message?.content === "string" ? c.message.content : ""))
    .join("")
    .trim();

  if (!reply) {
    const reason = data?.choices?.[0]?.finish_reason ?? null;
    const durationMs = Date.now() - startTime;
    console.error(
      `[Groq] EMPTY_RESPONSE | model=${usedModel} | duration=${durationMs}ms` +
        (reason ? ` | finish_reason=${reason}` : ""),
    );
    throw new GroqError(
      "EMPTY_RESPONSE",
      reason
        ? `The AI assistant returned no content (reason: ${reason}). Try rephrasing your question.`
        : "The AI assistant returned an empty response. Please try again.",
    );
  }

  const durationMs = Date.now() - startTime;
  console.log(
    `[Groq] OK | model=${data?.model || usedModel} | duration=${durationMs}ms | chars=${reply.length}`,
  );
  return { reply, model: data?.model || usedModel };
}

module.exports = {
  GroqError,
  buildSystemContent,
  mapHistoryToMessages,
  askGroq,
};
