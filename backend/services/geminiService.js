/**
 * Gemini AI service - EnergyScope solar assistant.
 *
 * Talks EXCLUSIVELY to Google's official Generative Language API
 * (generativelanguage.googleapis.com) from the backend. The API key lives in
 * GEMINI_API_KEY and is NEVER logged, echoed, or sent to the frontend.
 *
 * Designed for phase 2: real EnergyScope data (today/historical/monthly
 * generation, weather, inverter status, plant info, forecasts) will be
 * injected through buildSystemInstruction()'s optional context argument and
 * appended as a data appendix - the caller contract stays identical.
 *
 * All failures are thrown as GeminiError with a stable .code so routes can
 * map them to clean HTTP responses without leaking internals:
 *   CONFIG | AUTH | RATE_LIMITED | TIMEOUT | EMPTY_RESPONSE | UPSTREAM | BAD_REQUEST
 */

// Google retired gemini-2.5-flash for newly issued API keys (generateContent
// returns 404 "no longer available to new users") and explicitly recommends
// this model as the replacement. Override with GEMINI_MODEL if needed.
const DEFAULT_MODEL = "gemini-3.6-flash";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

class GeminiError extends Error {
  /**
   * @param {string} code stable machine-readable code
   * @param {string} message safe, user-presentable message (no secrets)
   * @param {{status?: number|null}} [meta] upstream HTTP status, diagnostics only
   */
  constructor(code, message, meta = {}) {
    super(message);
    this.name = "GeminiError";
    this.code = code;
    this.upstreamStatus = meta.status ?? null;
  }
}

/** Solar-specialized system instruction. When a verified-data appendix is
 * supplied (phase 2), extra rules govern how that data may be used. */
function buildSystemInstruction(hasVerifiedData = false) {
  // NOTE(phase 2): real EnergyScope context is injected by the AI route as a
  // separate, server-rendered appendix (see plantContextService) - never by
  // the client. The base rules below always apply.
  const base = [
    "You are the EnergyScope Solar Assistant for a UTL Solar rooftop photovoltaic plant monitored through the EnergyScope dashboard.",
    "",
    "Your domain: solar generation, energy production, weather effects on output, inverter status, historical performance, and EnergyScope product features.",
    "",
    "Rules:",
    "- Be concise and practical. Prefer short paragraphs or tight bullet lists.",
    "- NEVER invent plant data. You only know what the backend explicitly supplies to you.",
    "- If specific data (today's kWh, monthly totals, live status, forecasts...) has not been supplied in this conversation, clearly say that the data is currently unavailable rather than estimating silently.",
    "- Clearly distinguish measured/recorded values from estimates or forecasts whenever you mention either.",
    "- Do not modify, recalculate, or promise to recalculate production forecasts.",
    "- For questions outside the solar/EnergyScope domain, answer briefly and steer back to the plant.",
    "- Never claim access to accounts, devices, credentials, or live telemetry that was not provided in this conversation.",
    "- Never reveal internal API credentials, tokens, session information, implementation details, or any secrets.",
    "",
    "Response formatting:",
    "- Do NOT use Markdown bold (**text**) or italics (*text).",
    "- Do NOT use Markdown headings (#), backticks, tables, or code blocks.",
    "- Use plain text only: simple labels, short paragraphs, and plain bullet points (- or *).",
    "- Keep measured values, forecasts, weather data, and performance data clearly distinguishable using plain text labels.",
  ];

  if (!hasVerifiedData) return base.join("\n");

  return base
    .concat([
      "",
      "A block named 'ENERGYSCOPE VERIFIED DATA' is attached below your instructions. It is fresh backend-generated data about THIS user's authenticated plant:",
      "- Treat it as the only source of plant facts. Use it whenever the user asks about their generation, history, weather impact, forecast or performance.",
      "- MEASURED values there come from the UTL Solar RMS API - present them as actual readings.",
      "- FORECAST and PERFORMANCE values there are EnergyScope CALCULATIONS (predictionService / performanceScore). Always attribute them as 'the EnergyScope forecast/score' - never as measured production and never as your own estimate.",
      "- WEATHER values are from Open-Meteo via EnergyScope's weather service.",
      "- Do NOT recalculate, adjust or second-guess any value in that block. Explain it as given.",
      "- If a field says 'unavailable' or is absent, say that this data is temporarily unavailable - do not guess or substitute zeros.",
      "- The data is a snapshot taken when the question arrived; phrase time-sensitive answers accordingly ('as of right now').",
    ])
    .join("\n");
}

/**
 * Normalize frontend conversation history into Gemini `contents` entries.
 * Keeps only valid alternating-friendly turns, trims lengths, drops garbage.
 * @param {Array<{role?: unknown, content?: unknown}>} history
 * @param {number} [maxMessages]
 */
function mapHistoryToGemini(history, maxMessages = 12) {
  if (!Array.isArray(history)) return [];
  const mapped = [];
  for (const turn of history.slice(-maxMessages)) {
    const role = turn?.role === "assistant" ? "model" : "user";
    const text = typeof turn?.content === "string" ? turn.content.trim().slice(0, 4000) : "";
    if (!text) continue;
    mapped.push({ role, parts: [{ text }] });
  }
  return mapped;
}

function requestTimeoutMs() {
  const parsed = Number(process.env.GEMINI_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30000;
}

function model() {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

function maxOutputTokens() {
  const parsed = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1024;
}

/**
 * Send one chat turn to Gemini.
 * @param {{message: string, history?: Array<{role: string, content: string}>,
 *   systemAppendix?: string|null}} params `systemAppendix` (phase 2) is a
 *   server-rendered verified-data block appended to the system instruction.
 *   It never contains secrets and is never client-supplied.
 * @returns {Promise<{reply: string, model: string}>}
 */
async function askGemini({ message, history = [], systemAppendix = null } = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new GeminiError(
      "CONFIG",
      "The AI assistant is not configured on this server. Set GEMINI_API_KEY to enable it.",
    );
  }
  const text = typeof message === "string" ? message.trim() : "";
  if (!text) {
    throw new GeminiError("BAD_REQUEST", "Message must be a non-empty string.");
  }

  const contents = [
    ...mapHistoryToGemini(history),
    { role: "user", parts: [{ text: text.slice(0, 4000) }] },
  ];

  const systemParts = [{ text: buildSystemInstruction(Boolean(systemAppendix)) }];
  if (systemAppendix) {
    // Appendix is server-generated verified data; it lives in the system
    // instruction so conversation history stays untouched.
    systemParts.push({ text: String(systemAppendix).slice(0, 12000) });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs());

  let response;
  try {
    response = await fetch(`${API_BASE}/${encodeURIComponent(model())}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: systemParts },
        contents,
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: maxOutputTokens(),
        },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new GeminiError(
        "TIMEOUT",
        "The AI assistant took too long to respond. Please try again.",
      );
    }
    throw new GeminiError(
      "UPSTREAM",
      "Could not reach the AI service right now. Please try again shortly.",
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.json();
      detail = typeof body?.error?.message === "string" ? body.error.message : "";
    } catch {
      detail = "";
    }
    if (response.status === 429) {
      throw new GeminiError(
        "RATE_LIMITED",
        "The AI assistant is receiving too many requests right now. Please try again in a moment.",
        { status: response.status },
      );
    }
    if (response.status === 400 && /api[ _-]?key/i.test(detail)) {
      throw new GeminiError(
        "AUTH",
        "The configured AI API key was rejected. Check GEMINI_API_KEY on the server.",
        { status: response.status },
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new GeminiError(
        "AUTH",
        "The configured AI API key was rejected. Check GEMINI_API_KEY on the server.",
        { status: response.status },
      );
    }
    if (response.status === 404) {
      throw new GeminiError(
        "CONFIG",
        `The configured AI model was not found (model: ${model()}). Adjust GEMINI_MODEL.`,
        { status: response.status },
      );
    }
    throw new GeminiError(
      "UPSTREAM",
      "The AI service returned an error. Please try again shortly.",
      { status: response.status },
    );
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new GeminiError("EMPTY_RESPONSE", "The AI assistant returned an unreadable response.");
  }

  const reply = (data?.candidates?.[0]?.content?.parts ?? [])
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();

  if (!reply) {
    const reason = data?.candidates?.[0]?.finishReason ?? data?.promptFeedback?.blockReason;
    throw new GeminiError(
      "EMPTY_RESPONSE",
      reason
        ? `The AI assistant returned no content (reason: ${reason}). Try rephrasing your question.`
        : "The AI assistant returned an empty response. Please try again.",
    );
  }

  return { reply, model: data?.modelVersion || model() };
}

module.exports = {
  GeminiError,
  buildSystemInstruction,
  mapHistoryToGemini,
  maxOutputTokens,
  askGemini,
};
