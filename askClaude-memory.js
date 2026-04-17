// ============================================================
//  askClaude-memory.js
//  Drop-in replacement for the askClaude function in all three bots.
//
//  HOW TO USE:
//  1. Add db.js to your bot repo
//  2. Replace the old askClaude function with this one
//  3. Call initDB() when the server starts
//  4. Remove the old: const conversations = {};
// ============================================================

const axios = require("axios");
const db = require("./db");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// ── Detect language from message ─────────────────────────────
function detectLanguage(text) {
  if (/[\u4e00-\u9fff]/.test(text)) return "zh";
  if (/[\u0400-\u04ff]/.test(text)) return "ru";
  if (/[\uac00-\ud7af]/.test(text)) return "ko";
  if (/[\u3040-\u30ff]/.test(text)) return "ja";
  // Spanish heuristic — common words
  if (/\b(hola|gracias|por favor|cómo|dónde|necesito|tengo|quiero|ayuda|abogado)\b/i.test(text)) return "es";
  return "en";
}

// ── Detect case type from message ────────────────────────────
function detectCaseType(text) {
  const t = text.toLowerCase();
  if (/immigra|visa|green card|citizenship|deporta|asylum|daca|work permit|i-130|i-485|i-765/.test(t)) return "immigration";
  if (/accident|crash|injury|hurt|hospital|medical|pain|car crash|slip|fall/.test(t)) return "personal_injury";
  if (/business|contract|lawsuit|sue|litigation|employment/.test(t)) return "business";
  if (/patent|trademark|copyright|ip|intellectual/.test(t)) return "ip";
  if (/trust|will|estate|probate|inheritance|power of attorney/.test(t)) return "estate";
  return null;
}

// ── Main askClaude with memory ───────────────────────────────
async function askClaudeWithMemory(platform, platformId, userMessage, systemPrompt, options = {}) {
  const {
    isImage = false,
    imageData = null,
    imageMediaType = null,
    isPdf = false,
    pdfData = null,
    isVoiceTranscript = false,
  } = options;

  try {
    // 1. Ensure client exists, detect language
    const lang = detectLanguage(userMessage);
    await db.getOrCreateClient(platform, platformId, lang);

    // 2. Detect and save case type if found
    const caseType = detectCaseType(userMessage);
    if (caseType) {
      await db.updateClient(platform, platformId, { case_type: caseType });
    }

    // 3. Save the incoming user message
    const savedContent = isImage
      ? "[Image sent]"
      : isPdf
      ? "[PDF document sent]"
      : isVoiceTranscript
      ? `[Voice message]: ${userMessage}`
      : userMessage;

    await db.saveMessage(platform, platformId, "user", savedContent);

    // 4. Load client context (profile + summary + recent history)
    const { client, summary, history } = await db.getClientContext(platform, platformId);

    // 5. Build personalized system prompt
    let personalizedSystem = systemPrompt;

    if (client) {
      let contextBlock = "\n\n── CLIENT MEMORY ──";
      if (client.name) contextBlock += `\nClient name: ${client.name}`;
      if (client.preferred_language && client.preferred_language !== "en") {
        contextBlock += `\nPreferred language: ${client.preferred_language} — respond in this language`;
      }
      if (client.case_type) contextBlock += `\nCase type: ${client.case_type}`;
      if (client.first_seen) {
        const firstSeen = new Date(client.first_seen);
        const isReturning = (Date.now() - firstSeen) > 60 * 60 * 1000; // returning if > 1 hour
        if (isReturning) contextBlock += `\nReturning client (first contact: ${firstSeen.toLocaleDateString()})`;
      }
      if (summary) {
        contextBlock += `\n\nConversation summary so far:\n${summary}`;
      }
      contextBlock += "\n── END MEMORY ──";
      personalizedSystem += contextBlock;
    }

    // 6. Build messages array — history + current message
    const messages = [];

    // Add history (already ordered oldest → newest)
    for (const msg of history.slice(-8)) { // keep last 8 exchanges
      if (isImage && msg.role === "user" && msg.content === "[Image sent]") {
        // Skip image placeholders in history — can't re-send images
        continue;
      }
      messages.push({ role: msg.role, content: msg.content });
    }

    // Add current user message
    if (isImage && imageData) {
      messages.push({
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: imageMediaType, data: imageData } },
          { type: "text", text: userMessage || "Analyze this image. Respond in the same language as any text in the image, or in English if unclear." }
        ]
      });
    } else if (isPdf && pdfData) {
      messages.push({
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfData } },
          { type: "text", text: userMessage || "Analyze this legal document and explain what it means in plain language." }
        ]
      });
    } else {
      messages.push({ role: "user", content: userMessage });
    }

    // 7. Call Claude API with web search tool
    const resp = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: personalizedSystem,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages,
      },
      {
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
          "anthropic-beta": "interleaved-thinking-2025-05-14"
        }
      }
    );

    // 8. Extract text response
    const reply = resp.data.content
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("")
      .trim() || "I'm sorry, I didn't catch that. Could you rephrase?";

    // 9. Save the assistant reply
    await db.saveMessage(platform, platformId, "assistant", reply);

    // 10. Try to extract client name from conversation if not yet saved
    if (!client?.name) {
      tryExtractName(platform, platformId, userMessage);
    }

    // 11. Auto-summarize every 25 messages (non-blocking)
    db.maybeAutoSummarize(platform, platformId, ANTHROPIC_API_KEY).catch(() => {});

    return reply;
  } catch (err) {
    console.error("askClaudeWithMemory error:", err.response?.data || err.message);
    return "I'm having a technical issue. Please contact us directly:\n📞 626-678-8677\n📧 jj@tezlawfirm.com";
  }
}

// ── Attempt to extract client name from message ───────────────
// Non-blocking — just a best-effort extraction
function tryExtractName(platform, platformId, text) {
  // Simple patterns: "my name is X", "I'm X", "This is X"
  const match = text.match(/(?:my name is|i'm|i am|this is)\s+([A-Z][a-z]+(?: [A-Z][a-z]+)?)/i);
  if (match) {
    const name = match[1].trim();
    db.updateClient(platform, platformId, { name }).catch(() => {});
  }
}

module.exports = { askClaudeWithMemory };
