/**
 * AI provider abstraction - EnergyScope solar assistant.
 *
 * Routes chat requests to the configured backend AI provider (gemini or groq).
 * The active provider is set by AI_PROVIDER in .env (defaults to "groq").
 *
 * Both providers receive identical contracts and produce identical output
 * shapes: { reply: string, model: string }.
 *
 * Provider-specific errors (GeminiError, GroqError) are re-thrown as-is so
 * the route layer can map codes to HTTP status. The abstraction adds nothing
 * beyond routing.
 */

const { askGemini } = require("./geminiService");
const { askGroq } = require("./groqService");

const PROVIDERS = { gemini: askGemini, groq: askGroq };

function activeProvider() {
  const name = (process.env.AI_PROVIDER || "groq").toLowerCase().trim();
  return PROVIDERS[name] ? name : "groq";
}

/**
 * Send a chat turn to the configured AI provider.
 * @param {{message: string, history?: Array<{role: string, content: string}>,
 *   systemAppendix?: string|null}} params
 * @returns {Promise<{reply: string, model: string}>}
 */
async function askAI(params) {
  const name = activeProvider();
  const handler = PROVIDERS[name];
  return handler(params);
}

module.exports = { askAI, activeProvider };
