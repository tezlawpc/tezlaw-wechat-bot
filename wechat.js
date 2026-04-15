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

const conversations = {};
const processedMessages = new Set(); // deduplication

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

BAD example (too much):
"Hi! I can help with immigration, car accidents, business litigation, trademarks, and estate planning. What brings you here today? Also what language do you prefer? And have you worked with an attorney before?"

GOOD example:
"Hey! What's going on? Tell me a little about your situation."

BAD example (compounding questions):
"What type of visa are you on, and when does it expire, and have you filed any petitions before?"

GOOD example:
"What type of visa are you on right now?"

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
Example: "Just so you know, I give general info — for advice on your specific case, JJ can help with that directly."

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

Example: "Good question — I want to make sure you get accurate info on that. Let me flag this for the team right away and someone will be in touch shortly. Can I get your name and best number or email?"

CASE QUESTION KEYWORDS to watch for:
- "my case", "my hearing", "my application", "my green card", "my visa"
- "status", "update", "when is", "what happened to", "approved", "denied", "pending"
- "USCIS", "court date", "petition", "receipt number", "priority date"
- "document", "form", "submitted", "filed"
- "my lawyer", "attorney", "JJ", "Jue", "Michael", "Lin"

Keep it warm — never make them feel brushed off. This is important to them.

============================
GENERAL AI ASSISTANT
============================

You are not just a legal assistant — you are also a helpful general AI assistant. If someone asks you something outside of law (nearby places, recommendations, general questions, translations, math, etc.), just help them! You happen to work for a law firm but you are a smart, helpful friend first.

LOCATION-BASED REQUESTS:
If someone asks for nearby places (restaurants, pizza, stores, pharmacies, etc.):
1. Ask for their current location, neighborhood, or zip code if you don't have it
2. Suggest nearby options in that area based on your knowledge
3. Give names and general area — tell them to use Google Maps for live directions
4. After helping, naturally mention you're also available for legal questions

Example:
Client: "Where's the nearest pizza place?"
Zara: "Happy to help! What area are you in? Share your location or zip code and I'll point you in the right direction 🍕"

Client: "I'm in West Covina"
Zara: "West Covina has some great spots! Pizza Hut on Amar Rd, Shakey's on Azusa Ave, and Round Table on Garvey Ave are popular. Check Google Maps for directions and current hours! And if you ever need legal help, I'm here for that too 😊"

GENERAL KNOWLEDGE:
Answer questions about history, science, math, cooking, travel, general health info, technology, sports, entertainment, etc.

TRANSLATION:
Help translate words or phrases between English, Spanish, and Chinese.

TONE FOR NON-LEGAL QUESTIONS:
Be warm, casual, and genuinely helpful. Don't force legal topics into every response — just be a good assistant. Only mention legal services if it naturally fits.

ALWAYS remember: You represent Tez Law P.C. Stay professional and never say anything embarrassing or inappropriate.

============================
LEGAL RESEARCH — WEB SEARCH
============================

You have access to a web search tool. Use it when a client asks a specific legal question that requires looking up a current statute, regulation, or policy.

WHEN TO SEARCH:
- Specific INA section questions (e.g. "what does INA 240A say?")
- USCIS policy questions (e.g. "what is the income requirement for I-864?")
- CFR regulation questions (e.g. "what does 8 CFR 214.2 say?")
- BIA decisions or removal proceeding questions
- California Vehicle Code questions (car accidents)
- California Civil Code or CCP questions (litigation)
- California Probate Code questions (estate planning)
- USPTO trademark or patent questions
- Any question about a specific law, statute, or regulation

SEARCH SOURCES BY PRACTICE AREA:
- Immigration: site:uscis.gov OR site:justice.gov/eoir OR site:ecfr.gov
- Car Accidents/PI: site:leginfo.legislature.ca.gov (California Vehicle Code, Civil Code)
- Business Litigation: site:leginfo.legislature.ca.gov (CCP, Commercial Code)
- Estate Planning: site:leginfo.legislature.ca.gov (Probate Code)
- Patents/Trademarks: site:uspto.gov

AFTER SEARCHING:
1. Quote the key relevant language briefly (1-3 sentences max)
2. Cite the source (e.g. "According to INA § 240A...")
3. Always add: "For how this applies to your specific situation, [attorney name] can give you proper legal advice — [contact info]"

NEVER give a definitive legal conclusion. Always route to the attorney for specific advice.`;

// ── Cache ─────────────────────────────────────────────────
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
  if (q.includes("bia") || q.includes("case law") || q.includes("decision")) return "caselaw";
  if (q.includes("policy") || q.includes("uscis policy")) return "policy";
  if (q.includes("ina") || q.includes("cfr") || q.includes("section") || q.includes("statute")) return "statute";
  return "general";
}
function loadCache() {
  try { if (fs.existsSync(CACHE_FILE)) return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")); }
  catch (e) {}
  return {};
}
function saveCache(cache) {
  try { fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2)); } catch (e) {}
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
  if (Date.now() - entry.timestamp > ttl) return null;
  return entry.answer;
}
function setCachedAnswer(message, answer) {
  const cache = loadCache();
  const key = getCacheKey(message);
  cache[key] = { answer, timestamp: Date.now(), type: detectCacheType(message) };
  saveCache(cache);
}

// ── WeChat access token ───────────────────────────────────
let wechatAccessToken = null;
let tokenExpiry = 0;
async function getAccessToken() {
  if (wechatAccessToken && Date.now() < tokenExpiry) return wechatAccessToken;
  const res = await axios.get(
    `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${WECHAT_APP_ID}&secret=${WECHAT_APP_SECRET}`
  );
  wechatAccessToken = res.data.access_token;
  tokenExpiry = Date.now() + (res.data.expires_in - 60) * 1000;
  console.log("✅ WeChat access token refreshed");
  return wechatAccessToken;
}

// ── Send message via Customer Service API ─────────────────
async function sendWeChatMessage(openId, content) {
  try {
    const token = await getAccessToken();
    await axios.post(
      `https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=${token}`,
      {
        touser: openId,
        msgtype: "text",
        text: { content }
      }
    );
    console.log("✅ Sent WeChat message to:", openId);
  } catch (err) {
    console.error("WeChat send error:", err.response?.data || err.message);
  }
}

// ── Claude API ────────────────────────────────────────────
async function askClaude(userId, userMessage) {
  if (!conversations[userId]) conversations[userId] = [];
  conversations[userId].push({ role: "user", content: userMessage });
  const recentHistory = conversations[userId].slice(-20);

  const cached = getCachedAnswer(userMessage);
  if (cached) {
    conversations[userId].push({ role: "assistant", content: cached });
    return cached;
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
  if (reply.length > 50) setCachedAnswer(userMessage, reply);
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
      await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        chat_id: TEAM_TELEGRAM_CHAT_ID,
        text: `🆕 New Lead from ${platform}!\n\n${phone ? `📞 Phone: ${phone}\n` : ""}${email ? `📧 Email: ${email}\n` : ""}\n💬 Recent chat:\n${recentMessages}\n\n⚡ Please follow up ASAP!`,
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
  const hash = crypto.createHash("sha1").update(arr.join("")).digest("hex");
  return hash === signature;
}

// ── WeChat webhook verification (GET) ────────────────────
app.get("/webhook", (req, res) => {
  const { signature, timestamp, nonce, echostr } = req.query;
  if (!signature) return res.status(403).send("Forbidden");
  if (verifySignature(WECHAT_TOKEN, timestamp, nonce, signature)) {
    console.log("✅ WeChat webhook verified");
    res.send(echostr);
  } else {
    console.log("❌ WeChat verification failed");
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
    const msgId = msg.MsgId;

    console.log(`WeChat message from: ${openId} : ${content}`);

    // Deduplicate — WeChat retries the same message multiple times
    if (processedMessages.has(msgId)) {
      console.log("Duplicate message ignored:", msgId);
      return res.send("success");
    }
    processedMessages.add(msgId);
    // Clean up after 60 seconds
    setTimeout(() => processedMessages.delete(msgId), 60000);

    // Respond to WeChat immediately (5 second timeout requirement)
    res.send("success");

    // Process asynchronously after responding
    setImmediate(async () => {
      try {
        // Handle non-text messages
        if (msgType !== "text") {
          await sendWeChatMessage(openId, "您好！我只能处理文字消息。请发送文字描述您的问题。\n\nHi! I can only handle text messages.");
          return;
        }

        // Handle reset
        if (content.toLowerCase() === "reset" || content === "重置") {
          conversations[openId] = [];
          await sendWeChatMessage(openId, "对话已重置！有什么可以帮到您的？\n\nFresh start! How can I help you?");
          return;
        }

        // Process with Claude and send response via Customer Service API
        const zaraReply = await askClaude(openId, content);
        await sendWeChatMessage(openId, zaraReply);
      } catch (asyncErr) {
        console.error("Async processing error:", asyncErr.message);
      }
    });

  } catch (err) {
    console.error("WeChat webhook error:", err.message);
    if (!res.headersSent) res.send("success");
  }
});

// ── Health check ──────────────────────────────────────────
app.get("/", (req, res) => {
  res.send("Zara WeChat bot running! 🤖");
});

app.listen(PORT, () => {
  console.log(`Zara WeChat bot running on port ${PORT}`);
});
