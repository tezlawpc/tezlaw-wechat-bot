const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const xml2js = require("xml2js");
const app = express();
app.use(express.text({ type: "text/xml" }));
app.use(express.json());
const WECHAT_APP_ID = process.env.WECHAT_APP_ID;
const WECHAT_APP_SECRET = process.env.WECHAT_APP_SECRET;
const WECHAT_TOKEN = process.env.WECHAT_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const TEAM_TELEGRAM_CHAT_ID = process.env.TEAM_TELEGRAM_CHAT_ID;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const PORT = process.env.PORT || 3000;
console.log("WECHAT_APP_ID present:", !!WECHAT_APP_ID);
console.log("WECHAT_APP_SECRET present:", !!WECHAT_APP_SECRET);
console.log("ANTHROPIC_API_KEY present:", !!ANTHROPIC_API_KEY);
console.log("WECHAT_TOKEN present:", !!WECHAT_TOKEN);
console.log("WECHAT_TOKEN value:", WECHAT_TOKEN);
const conversations = {};
const SYSTEM_PROMPT = `
Your name is Zara. You are a warm, friendly legal assistant for Tez Law P.C. in West Covina, California.
============================
THE TEAM
============================
JJ ZHANG — Managing Attorney
- Phone: 626-678-8677
- Email: jj@tezlawfirm.com
JUE WANG — USCIS filings & immigration questions
- Email: jue.wang@tezlawfirm.com
MICHAEL LIU — Immigration court hearings & motions
- Email: michael.liu@tezlawfirm.com
LIN MEI — Car accidents & state court filings
- Email: lin.mei@tezlawfirm.com
============================
CONVERSATION STYLE — CRITICAL
============================
You are having a REAL conversation, not writing a legal document.
RULES:
- Keep responses SHORT. 2-4 sentences max for most replies.
- Ask ONE question at a time. Never ask two questions in one message.
- Be casual and warm. Like texting a knowledgeable friend.
- No bullet points unless absolutely necessary.
- No long lists. No headers. No walls of text.
- Respond in whatever language the person writes in (English, Spanish, Chinese).
- When someone tells you their problem, acknowledge it FIRST before asking anything.
- Only ask for more info if you genuinely need it to help them.
WHEN COLLECTING LEAD INFO:
Ask for ONE piece of info at a time, naturally:
- First ask their name
- Then ask what they need help with (if not clear)
- Then ask for a phone or email so someone can follow up
Never ask all three at once.
URGENT SITUATIONS (ICE detention, NTA, court date, serious accident):
Keep it short and direct. Give the phone number immediately.
Example: "That's urgent — please call JJ Zhang right now at 626-678-8677."
ROUTING TO TEAM:
Keep it brief and warm.
Example: "For that, Jue Wang is your person — jue.wang@tezlawfirm.com"
DISCLAIMER:
Mention it naturally once if relevant, not every message.
============================
WHAT YOU KNOW
============================
IMMIGRATION (USCIS → Jue Wang | Court → Michael Liu):
- Green cards: family (I-130), employment (EB-1 to EB-5), humanitarian (asylum, VAWA, U-visa)
- Processing times (2026): Marriage green card ~8-10 months. Naturalization ~5.5 months. EAD ~2 months.
- DACA: renewals only, renew 180 days before expiration
- ICE detention: URGENT — call 626-678-8677, locate via 1-888-351-4024, don't sign anything
- NTA: URGENT — doesn't mean automatic deportation, contact Michael Liu immediately
- Overstay bars: 180 days = 3-year bar; 1+ year = 10-year bar
- H-1B: specialty work visa, 85,000 spots/year, wage-based lottery
- California: AB 60 driver's license for undocumented, SB 54 limits local ICE cooperation
CAR ACCIDENTS (→ Lin Mei: lin.mei@tezlawfirm.com):
- After accident: call 911, get medical attention, document everything, don't admit fault
- Deadlines: personal injury 2 years; government vehicle only 6 MONTHS
- Contingency fee: 33.3% pre-lawsuit, 40% at trial — no upfront cost
- Partial fault: California pure comparative negligence — you can still recover
- Uber/Lyft: screenshot ride status immediately
BUSINESS LITIGATION (→ JJ Zhang | state filings → Lin Mei):
- Non-competes: VOID in California
- Trade secret theft: act fast, TRO available, 3 years from discovery
- Got served: 30 days to respond, preserve all documents
PATENTS & TRADEMARKS (→ JJ Zhang):
- Trademark: 8-12 months, $350/class USPTO fee
- Utility patent: 20 years, $10,000-$30,000+ total
- Provisional patent: $128 small entity, 12-month window then must file full application
ESTATE PLANNING (→ JJ Zhang):
- Living trust avoids probate — an $800K West Covina home = $36,000+ in probate fees
- Probate costs: $500K estate = $26,000; $1M = $46,000
- Prop 19 (2021): only family home qualifies for property tax exclusion now
- Trust packages: $1,500-$3,000 individual, $2,500-$5,000 couple
- No California estate tax; federal exemption $13.99M in 2025
============================
WHEN CLIENTS ASK ABOUT THEIR CASE
============================
If anyone asks about their case status, hearing date, document status, USCIS receipt, or anything specific to their matter — DO NOT try to look it up. Instead:
1. Acknowledge their question warmly
2. Let them know you'll flag it for the team right away
3. Ask for their name and best contact if you don't already have it
4. Reassure them someone will follow up soon
============================
GENERAL AI ASSISTANT
============================
You are not just a legal assistant — you are also a helpful general AI assistant. If someone asks you something outside of law, just help them!
ALWAYS remember: You represent Tez Law P.C. Stay professional and never say anything embarrassing or inappropriate.`;

// ── Smart Legal Research Cache ────────────────────────────
const fs = require("fs");
const CACHE_FILE = "/var/data/legal_cache.json";
const CACHE_TTL = {
  statute: 30 * 24 * 60 * 60 * 1000,
  caselaw: 7 * 24 * 60 * 60 * 1000,
  policy: 7 * 24 * 60 * 60 * 1000,
  fees: 3 * 24 * 60 * 60 * 1000,
  general: 14 * 24 * 60 * 60 * 1000,
};
function detectCacheType(question) {
  const q = question.toLowerCase();
  if (q.includes("processing time") || q.includes("fee") || q.includes("cost") || q.includes("how long")) return "fees";
  if (q.includes("bia") || q.includes("case law") || q.includes("decision") || q.includes("matter of")) return "caselaw";
  if (q.includes("policy") || q.includes("uscis policy") || q.includes("policy manual")) return "policy";
  if (q.includes("ina") || q.includes("cfr") || q.includes("section") || q.includes("statute")) return "statute";
  return "general";
}
function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  } catch (e) { console.log("Cache load error:", e.message); }
  return {};
}
function saveCache(cache) {
  try { fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2)); }
  catch (e) { console.log("Cache save error:", e.message); }
}
function getCacheKey(message) {
  return message.toLowerCase().trim().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, "_").substring(0, 100);
}
function getCachedAnswer(message) {
  const cache = loadCache();
  const key = getCacheKey(message);
  const entry = cache[key];
  if (!entry) return null;
  const ttl = CACHE_TTL[detectCacheType(message)];
  const age = Date.now() - entry.timestamp;
  if (age > ttl) return null;
  return entry.answer;
}
function setCachedAnswer(message, answer) {
  const cache = loadCache();
  const key = getCacheKey(message);
  cache[key] = { answer, timestamp: Date.now(), type: detectCacheType(message), question: message.substring(0, 100) };
  saveCache(cache);
}
function isLegalResearchQuestion(message) {
  const q = message.toLowerCase();
  const legalKeywords = ["ina", "cfr", "section", "statute", "code", "regulation", "uscis", "bia", "removal", "deportation", "vehicle code", "civil code", "probate code", "uspto", "patent", "trademark", "processing time", "filing fee", "what does", "what is the law"];
  return legalKeywords.some(kw => q.includes(kw));
}

// ── Claude API ────────────────────────────────────────────
async function askClaude(userId, userMessage) {
  if (!conversations[userId]) conversations[userId] = [];
  conversations[userId].push({ role: "user", content: userMessage });
  const recentHistory = conversations[userId].slice(-20);
  if (isLegalResearchQuestion(userMessage)) {
    const cached = getCachedAnswer(userMessage);
    if (cached) {
      conversations[userId].push({ role: "assistant", content: cached });
      return cached;
    }
  }
  const response = await axios.post(
    "https://api.anthropic.com/v1/messages",
    {
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: recentHistory,
    },
    {
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
    }
  );
  const reply = response.data.content
    .filter(block => block.type === "text")
    .map(block => block.text)
    .join("") || "请联系我们的团队获取帮助。电话: 626-678-8677";
  conversations[userId].push({ role: "assistant", content: reply });
  if (isLegalResearchQuestion(userMessage) && reply.length > 50) {
    setCachedAnswer(userMessage, reply);
  }
  await checkAndNotifyLead(userId, userMessage, reply, "WeChat");
  return reply;
}

// ── Lead detection ────────────────────────────────────────
async function checkAndNotifyLead(userId, userMessage, botReply, platform) {
  try {
    const phoneRegex = /(\+?1?\s?)?(\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4})/;
    const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;
    const hasPhone = phoneRegex.test(userMessage);
    const hasEmail = emailRegex.test(userMessage);
    if (!hasPhone && !hasEmail) return;
    const phone = hasPhone ? userMessage.match(phoneRegex)?.[0] : null;
    const email = hasEmail ? userMessage.match(emailRegex)?.[0] : null;
    const history = conversations[userId] || [];
    const recentMessages = history.slice(-6).map(m =>
      `${m.role === "user" ? "Client" : "Zara"}: ${m.content.substring(0, 100)}`
    ).join("\n");
    if (TEAM_TELEGRAM_CHAT_ID && TELEGRAM_BOT_TOKEN) {
      const message =
        `🆕 New Lead from ${platform}!\n\n` +
        `${phone ? `📞 Phone: ${phone}\n` : ""}` +
        `${email ? `📧 Email: ${email}\n` : ""}` +
        `\n💬 Recent chat:\n${recentMessages}\n\n` +
        `⚡ Please follow up ASAP!`;
      await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        chat_id: TEAM_TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "Markdown"
      });
      console.log(`✅ Lead notification sent — ${phone || email}`);
    }
  } catch (err) {
    console.error("Lead notification error:", err.message);
  }
}

// ── WeChat signature verification ────────────────────────
function verifySignature(token, timestamp, nonce, signature) {
  const arr = [token, timestamp, nonce].sort();
  const str = arr.join("");
  const hash = crypto.createHash("sha1").update(str).digest("hex");
  console.log("Token used:", token);
  console.log("Sorted array:", arr);
  console.log("Computed hash:", hash);
  console.log("WeChat signature:", signature);
  console.log("Match:", hash === signature);
  return hash === signature;
}

// ── Build XML reply ───────────────────────────────────────
function buildXmlReply(toUser, fromUser, content) {
  const timestamp = Math.floor(Date.now() / 1000);
  return `<xml>
  <ToUserName><![CDATA[${toUser}]]></ToUserName>
  <FromUserName><![CDATA[${fromUser}]]></FromUserName>
  <CreateTime>${timestamp}</CreateTime>
  <MsgType><![CDATA[text]]></MsgType>
  <Content><![CDATA[${content}]]></Content>
</xml>`;
}

// ── WeChat webhook verification (GET) ────────────────────
app.get("/webhook", (req, res) => {
  const { signature, timestamp, nonce, echostr } = req.query;
  console.log("=== WeChat verification attempt ===");
  console.log("Query params:", req.query);
  if (verifySignature(WECHAT_TOKEN, timestamp, nonce, signature)) {
    console.log("✅ WeChat webhook verified successfully");
    res.send(echostr);
  } else {
    console.log("❌ WeChat webhook verification failed");
    res.status(403).send("Forbidden");
  }
});

// ── WeChat message handler (POST) ────────────────────────
app.post("/webhook", async (req, res) => {
  try {
    const { signature, timestamp, nonce } = req.query;
    if (!verifySignature(WECHAT_TOKEN, timestamp, nonce, signature)) {
      return res.status(403).send("Forbidden");
    }
    const parser = new xml2js.Parser({ explicitArray: false });
    const result = await parser.parseStringPromise(req.body);
    const msg = result.xml;
    const openId = msg.FromUserName;
    const toUser = msg.ToUserName;
    const msgType = msg.MsgType;
    const content = msg.Content;
    console.log(`WeChat message from: ${openId} : ${content}`);
    if (msgType !== "text") {
      const reply = buildXmlReply(openId, toUser, "您好！我只能处理文字消息。请发送文字描述您的问题。\n\nHi! I can only handle text messages.");
      res.set("Content-Type", "text/xml");
      return res.send(reply);
    }
    if (content.toLowerCase() === "reset" || content === "重置") {
      conversations[openId] = [];
      const reply = buildXmlReply(openId, toUser, "对话已重置！有什么可以帮到您的？\n\nFresh start! How can I help you?");
      res.set("Content-Type", "text/xml");
      return res.send(reply);
    }
    const zaraReply = await askClaude(openId, content);
    const xmlReply = buildXmlReply(openId, toUser, zaraReply);
    res.set("Content-Type", "text/xml");
    res.send(xmlReply);
  } catch (err) {
    console.error("WeChat webhook error:", err.message);
    res.send("success");
  }
});

// ── Health check ──────────────────────────────────────────
app.get("/", (req, res) => {
  res.send("Zara WeChat bot running on port " + PORT);
});

app.listen(PORT, () => {
  console.log(`Zara WeChat bot running on port ${PORT}`);
});
