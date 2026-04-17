// ============================================================
//  db.js — Zara Memory Layer (PostgreSQL)
//  Tez Law P.C.
//  Drop this file into each bot repo (telegram, whatsapp, wechat)
//  and add DATABASE_URL to Render environment variables.
// ============================================================

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

// ── Initialize tables on first run ──────────────────────────
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id SERIAL PRIMARY KEY,
        platform VARCHAR(20) NOT NULL,       -- 'telegram' | 'whatsapp' | 'wechat'
        platform_id VARCHAR(100) NOT NULL,   -- chat_id / wa_id / openid
        name VARCHAR(200),
        preferred_language VARCHAR(10) DEFAULT 'en',
        case_type VARCHAR(100),              -- 'immigration' | 'personal_injury' | etc.
        first_seen TIMESTAMP DEFAULT NOW(),
        last_seen TIMESTAMP DEFAULT NOW(),
        UNIQUE(platform, platform_id)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        platform VARCHAR(20) NOT NULL,
        platform_id VARCHAR(100) NOT NULL,
        role VARCHAR(10) NOT NULL,           -- 'user' | 'assistant'
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_messages_lookup
        ON messages(platform, platform_id, created_at DESC);
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS client_summaries (
        id SERIAL PRIMARY KEY,
        platform VARCHAR(20) NOT NULL,
        platform_id VARCHAR(100) NOT NULL,
        summary TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(platform, platform_id)
      );
    `);

    console.log("✅ DB tables ready");
  } catch (err) {
    console.error("❌ DB init error:", err.message);
  }
}

// ── Get or create client record ──────────────────────────────
async function getOrCreateClient(platform, platformId, detectedLanguage = null) {
  try {
    const res = await pool.query(
      `INSERT INTO clients (platform, platform_id, preferred_language, last_seen)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (platform, platform_id) DO UPDATE
         SET last_seen = NOW()
             ${detectedLanguage ? ", preferred_language = $3" : ""}
       RETURNING *`,
      detectedLanguage
        ? [platform, platformId, detectedLanguage]
        : [platform, platformId, "en"]
    );
    return res.rows[0];
  } catch (err) {
    console.error("getOrCreateClient error:", err.message);
    return null;
  }
}

// ── Update client info (name, case type, language) ──────────
async function updateClient(platform, platformId, updates = {}) {
  try {
    const fields = [];
    const values = [platform, platformId];
    let i = 3;
    if (updates.name) { fields.push(`name = $${i++}`); values.push(updates.name); }
    if (updates.case_type) { fields.push(`case_type = $${i++}`); values.push(updates.case_type); }
    if (updates.preferred_language) { fields.push(`preferred_language = $${i++}`); values.push(updates.preferred_language); }
    if (!fields.length) return;
    await pool.query(
      `UPDATE clients SET ${fields.join(", ")} WHERE platform=$1 AND platform_id=$2`,
      values
    );
  } catch (err) {
    console.error("updateClient error:", err.message);
  }
}

// ── Save a message to history ────────────────────────────────
async function saveMessage(platform, platformId, role, content) {
  try {
    await pool.query(
      `INSERT INTO messages (platform, platform_id, role, content)
       VALUES ($1, $2, $3, $4)`,
      [platform, platformId, role, content.substring(0, 4000)] // cap at 4000 chars
    );
  } catch (err) {
    console.error("saveMessage error:", err.message);
  }
}

// ── Get recent conversation history (last N messages) ────────
async function getHistory(platform, platformId, limit = 10) {
  try {
    const res = await pool.query(
      `SELECT role, content FROM (
         SELECT role, content, created_at
         FROM messages
         WHERE platform = $1 AND platform_id = $2
         ORDER BY created_at DESC
         LIMIT $3
       ) sub
       ORDER BY created_at ASC`,
      [platform, platformId, limit]
    );
    return res.rows; // [{ role, content }, ...]
  } catch (err) {
    console.error("getHistory error:", err.message);
    return [];
  }
}

// ── Get or generate a summary of older messages ──────────────
// Keeps context window lean — summarizes anything older than 20 messages
async function getClientContext(platform, platformId) {
  try {
    const client = await pool.query(
      `SELECT name, preferred_language, case_type, first_seen
       FROM clients WHERE platform=$1 AND platform_id=$2`,
      [platform, platformId]
    );
    if (!client.rows.length) return { client: null, summary: null, history: [] };

    const c = client.rows[0];

    const summaryRow = await pool.query(
      `SELECT summary FROM client_summaries
       WHERE platform=$1 AND platform_id=$2`,
      [platform, platformId]
    );
    const summary = summaryRow.rows[0]?.summary || null;

    const history = await getHistory(platform, platformId, 10);

    return { client: c, summary, history };
  } catch (err) {
    console.error("getClientContext error:", err.message);
    return { client: null, summary: null, history: [] };
  }
}

// ── Save a Claude-generated summary ─────────────────────────
async function saveSummary(platform, platformId, summary) {
  try {
    await pool.query(
      `INSERT INTO client_summaries (platform, platform_id, summary, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (platform, platform_id) DO UPDATE
         SET summary = $3, updated_at = NOW()`,
      [platform, platformId, summary]
    );
  } catch (err) {
    console.error("saveSummary error:", err.message);
  }
}

// ── Clear history for a user (called on /reset) ──────────────
async function clearHistory(platform, platformId) {
  try {
    await pool.query(
      `DELETE FROM messages WHERE platform=$1 AND platform_id=$2`,
      [platform, platformId]
    );
    await pool.query(
      `DELETE FROM client_summaries WHERE platform=$1 AND platform_id=$2`,
      [platform, platformId]
    );
  } catch (err) {
    console.error("clearHistory error:", err.message);
  }
}

// ── Auto-summarize when message count exceeds threshold ──────
// Call this after every 25 messages to keep DB lean
async function maybeAutoSummarize(platform, platformId, anthropicApiKey) {
  try {
    const countRes = await pool.query(
      `SELECT COUNT(*) FROM messages WHERE platform=$1 AND platform_id=$2`,
      [platform, platformId]
    );
    const count = parseInt(countRes.rows[0].count);

    // Only summarize when count is a multiple of 25 AND > 25
    if (count < 25 || count % 25 !== 0) return;

    // Get all messages for summarization
    const allMsgs = await pool.query(
      `SELECT role, content FROM messages
       WHERE platform=$1 AND platform_id=$2
       ORDER BY created_at ASC
       LIMIT 30`,
      [platform, platformId]
    );

    const conversation = allMsgs.rows
      .map(m => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n");

    const axios = require("axios");
    const resp = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [{
          role: "user",
          content: `Summarize this legal intake conversation in 3-4 sentences. Focus on: the client's legal issue, their situation, any key details mentioned (names, dates, case type), and what help they're seeking. Be concise.\n\n${conversation}`
        }]
      },
      {
        headers: {
          "x-api-key": anthropicApiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json"
        }
      }
    );

    const summary = resp.data.content[0].text;
    await saveSummary(platform, platformId, summary);

    // Delete oldest 20 messages to keep DB lean
    await pool.query(
      `DELETE FROM messages WHERE id IN (
         SELECT id FROM messages
         WHERE platform=$1 AND platform_id=$2
         ORDER BY created_at ASC LIMIT 20
       )`,
      [platform, platformId]
    );

    console.log(`📝 Auto-summarized ${platform}:${platformId}`);
  } catch (err) {
    console.error("maybeAutoSummarize error:", err.message);
  }
}

module.exports = {
  initDB,
  getOrCreateClient,
  updateClient,
  saveMessage,
  getHistory,
  getClientContext,
  saveSummary,
  clearHistory,
  maybeAutoSummarize,
};
