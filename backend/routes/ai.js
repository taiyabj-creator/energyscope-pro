/**
 * AI chat routes (Gemini-backed EnergyScope solar assistant).
 *
 * Mounted behind the standard authMiddleware in server.js. The browser only
 * ever talks to this backend; the Gemini API key never leaves the server.
 *
 * Phase 1: generic chat. Conversation history is kept client-side and sent
 * with each request. A later phase injects real EnergyScope data context via
 * geminiService.buildSystemInstruction().
 */

const express = require("express");
const rateLimit = require("express-rate-limit");
const { askAI } = require("../services/aiProviderService");
const { GeminiError } = require("../services/geminiService");
const { GroqError } = require("../services/groqService");
const {
  getContextCached,
  renderContextAppendix,
  contextHasAnyData,
} = require("../services/plantContextService");

const router = express.Router();

// Cost/quota guard for an external paid API. Generous enough for normal
// dashboard use, tight enough to cap abuse of a compromised session.
const chatLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many AI requests. Please wait a few minutes before trying again.",
  },
});

const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_ITEMS = 12;

/** @param {unknown} value */
function parseHistory(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-MAX_HISTORY_ITEMS).map((turn) => ({
    role: turn?.role === "assistant" ? "assistant" : "user",
    content: typeof turn?.content === "string" ? turn.content.trim().slice(0, 4000) : "",
  }));
}

router.post("/chat", chatLimiter, async (req, res) => {
  const body = req.body ?? {};
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!message) {
    return res.status(400).json({
      success: false,
      message: "A non-empty 'message' string is required.",
    });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({
      success: false,
      message: `Message is too long (max ${MAX_MESSAGE_LENGTH} characters).`,
    });
  }

  // Phase 2: collect VERIFIED EnergyScope data for this authenticated user's
  // plant. The appendix is built server-side from req.token/req.session (the
  // same auth context every data route uses); the client cannot influence it.
  // If collection fails, the chatbot degrades to phase-1 behavior - never
  // fake values, never a failed chat.
  let systemAppendix = null;
  try {
    const context = await getContextCached(req.token, req.session);
    if (context && contextHasAnyData(context)) {
      systemAppendix = renderContextAppendix(context);
    }
  } catch (err) {
    console.warn(`[AI] Plant context unavailable (${err?.message}); answering without it.`);
  }

  try {
    const { reply } = await askAI({
      message,
      history: parseHistory(body.history),
      systemAppendix,
    });
    res.json({ success: true, reply });
  } catch (err) {
    if (!(err instanceof GeminiError) && !(err instanceof GroqError)) {
      console.error("[AI] Unexpected chat failure:", err?.message);
      return res.status(500).json({
        success: false,
        message: "The AI assistant is unavailable right now.",
      });
    }
    // err.message is authored by the provider service and contains no secrets.
    console.error(`[AI] Chat failed (${err.code}).`);
    const statusByCode = {
      CONFIG: 503,
      AUTH: 503,
      RATE_LIMITED: 429,
      TIMEOUT: 504,
      EMPTY_RESPONSE: 502,
      UPSTREAM: 502,
    };
    res.status(statusByCode[err.code] ?? 500).json({
      success: false,
      message: err.message,
    });
  }
});

module.exports = router;
