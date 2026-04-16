const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const PORT = process.env.PORT || 3000;

console.log("WHATSAPP_TOKEN present:", !!WHATSAPP_TOKEN);
console.log("ANTHROPIC_API_KEY present:", !!ANTHROPIC_API_KEY);
console.log("PHONE_NUMBER_ID present:", !!PHONE_NUMBER_ID);
console.log("PAGE_ACCESS_TOKEN present:", !!PAGE_ACCESS_TOKEN);

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
Example: "That's urgent — please call us right now at 626-678-8677."

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

NEVER give a definitive legal conclusion. Always route to the attorney for specific advice.

============================
DISTRESS DETECTION — CRITICAL
============================

ALWAYS watch for signs that a client is in crisis or distress. These situations require IMMEDIATE escalation to the team.

HIGH URGENCY — respond with emergency message AND notify team immediately:
- ICE raid, detention, or arrest (self or family member)
- "They took my husband/wife/child"
- "I got a notice to appear" / NTA received
- Car accident that just happened
- Someone is injured right now
- "I'm being deported" / removal order
- Domestic violence situation
- "I'm scared" / "I don't know what to do" / "please help me"
- Court date is tomorrow or very soon
- Criminal charges related to immigration

MEDIUM URGENCY — respond with warm empathy + offer to connect with team:
- Lost job due to immigration status
- Visa expired or expiring soon
- Denied benefits or application
- Family separated
- Emotional distress about case outcome

FOR HIGH URGENCY situations, your response must:
1. Acknowledge their distress warmly and immediately
2. Give the firm's direct number: 626-678-8677
3. Tell them NOT to sign anything without speaking to an attorney first
4. Keep it SHORT and action-focused

Example: "I hear you — this is serious and you're not alone. Please call us RIGHT NOW at 626-678-8677. Do NOT sign anything until you speak with an attorney."`;



// ── Welcome message ──────────────────────────────────────
const WELCOME_MESSAGE = `Hey there! 👋 I'm Zara, the virtual assistant for Tez Law P.C.

I'm here to help you figure out your legal options and connect you with the right person on our team. We handle:

🛂 Immigration
🚗 Car Accidents & Personal Injury
⚖️ Business Litigation
™️ Patents & Trademarks
📋 Estate Planning

What's going on? Tell me what's on your mind! 😊`;

const CONTACT_MESSAGE = `Here's the Tez Law P.C. team:

👨‍💼 JJ Zhang (Managing Attorney)
📞 626-678-8677
📧 jj@tezlawfirm.com

📋 Jue Wang (USCIS filings)
📧 jue.wang@tezlawfirm.com

⚖️ Michael Liu (Immigration court)
📧 michael.liu@tezlawfirm.com

🚗 Lin Mei (Car accidents & state court)
📧 lin.mei@tezlawfirm.com

📍 West Covina, California`;

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
  if (q.includes("ina") || q.includes("cfr") || q.includes("§") || q.includes("vehicle code") ||
      q.includes("civil code") || q.includes("probate code") || q.includes("statute") || q.includes("section")) return "statute";
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
  return message.toLowerCase().trim().replace(/[^a-z0-9\s§]/g, "").replace(/\s+/g, "_").substring(0, 100);
}

function getCachedAnswer(message) {
  const cache = loadCache();
  const key = getCacheKey(message);
  const entry = cache[key];
  if (!entry) return null;
  const ttl = CACHE_TTL[detectCacheType(message)];
  const age = Date.now() - entry.timestamp;
  if (age > ttl) { console.log(`Cache expired for "${key}"`); return null; }
  console.log(`✅ Cache hit for "${key}" (age: ${Math.round(age/3600000)}h)`);
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
  const legalKeywords = [
    "ina", "cfr", "§", "section", "statute", "code", "regulation",
    "uscis", "bia", "eoir", "removal", "deportation",
    "vehicle code", "civil code", "probate code", "ccp",
    "uspto", "patent", "trademark",
    "processing time", "filing fee", "form i-",
    "case law", "matter of", "decision", "ruling",
    "what does", "what is the law", "is it legal", "what are the requirements"
  ];
  return legalKeywords.some(kw => q.includes(kw));
}

// ── Claude API ────────────────────────────────────────────
async function askClaude(userId, userMessage, platform) {
  if (!conversations[userId]) conversations[userId] = [];
  conversations[userId].push({ role: "user", content: userMessage });
  const recentHistory = conversations[userId].slice(-20);

  // Check cache for legal research questions
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
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search"
        }
      ],
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

  // Extract text from response — may include tool use blocks
  const reply = response.data.content
    .filter(block => block.type === "text")
    .map(block => block.text)
    .join("") || "Let me connect you with our team for that. Call us at 626-678-8677 or email jj@tezlawfirm.com.";
  conversations[userId].push({ role: "assistant", content: reply });

  // Cache legal research answers for future use
  if (isLegalResearchQuestion(userMessage) && reply.length > 50) {
    setCachedAnswer(userMessage, reply);
  }

  // Check if user shared contact info and send lead notification
  await checkAndNotifyLead(userId, userMessage, reply, platform || "WhatsApp/Messenger");

  return reply;
}

// ── Lead detection & email notification ──────────────────
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
    const recentMessages = history.slice(-10).map(m =>
      `${m.role === "user" ? "Client" : "Zara"}: ${m.content}`
    ).join("\n");

    const TEAM_CHAT_ID = process.env.TEAM_TELEGRAM_CHAT_ID;
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

    if (TEAM_CHAT_ID && TELEGRAM_BOT_TOKEN) {
      const message =
        `🆕 New Lead from ${platform}!\n\n` +
        `${phone ? `📞 Phone: ${phone}\n` : ""}` +
        `${email ? `📧 Email: ${email}\n` : ""}` +
        `\n💬 Recent chat:\n${recentMessages}\n\n` +
        `⚡ Please follow up ASAP!`;

      await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        chat_id: TEAM_CHAT_ID,
        text: message,
        parse_mode: "Markdown"
      });

      console.log(`✅ Lead notification sent to team Telegram — ${phone || email}`);
    } else {
      console.log(`LEAD DETECTED on ${platform}: ${phone || email}`);
    }
  } catch (err) {
    console.error("Lead notification error:", err.message);
  }
}

// ── WhatsApp sender ───────────────────────────────────────
async function sendWhatsAppMessage(to, text) {
  const url = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;
  const response = await axios.post(url, {
    messaging_product: "whatsapp",
    to: to,
    type: "text",
    text: { body: text }
  }, {
    headers: {
      "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json"
    }
  });
  console.log("WhatsApp send status:", response.status);
  return response;
}

// ── Facebook Messenger sender ─────────────────────────────
async function sendMessengerMessage(recipientId, text) {
  const PAGE_ID = process.env.PAGE_ID;
  const url = `https://graph.facebook.com/v18.0/${PAGE_ID}/messages`;
  const response = await axios.post(url, {
    recipient: { id: recipientId },
    message: { text: text }
  }, {
    headers: {
      "Authorization": `Bearer ${PAGE_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    }
  });
  console.log("Messenger send status:", response.status);
  return response;
}

// ── Process message (shared logic) ───────────────────────
async function processMessage(userId, userText, sendFn, platform) {
  const lowerText = userText.toLowerCase().trim();

  if (["hi", "hello", "hey", "hola", "start", "你好"].includes(lowerText)) {
    conversations[userId] = [];
    await sendFn(WELCOME_MESSAGE);
    return;
  }

  if (["contact", "team", "contacto"].includes(lowerText)) {
    await sendFn(CONTACT_MESSAGE);
    return;
  }

  if (lowerText === "reset") {
    conversations[userId] = [];
    await sendFn("Fresh start! What can I help you with? 😊");
    return;
  }

  const reply = await askClaude(userId, userText, platform);
  await sendFn(reply);

  // Check for distress and notify team
  const urgency = detectDistress(userText);
  if (urgency !== "none") {
    await notifyTeamDistress(userId, userText, urgency, platform);
  }
}


// ── Distress detection ────────────────────────────────────
function detectDistress(message) {
  const msg = message.toLowerCase();
  const highUrgency = [
    "ice", "detained", "arrested", "deportation", "deported", "removal",
    "notice to appear", "nta", "they took", "raid", "emergency",
    "accident just happened", "injured", "hospital", "bleeding",
    "scared", "please help", "don't know what to do", "help me",
    "court tomorrow", "hearing tomorrow", "sign anything",
    "拘留", "被抓", "遣返", "紧急", "帮我", "害怕",
    "detenido", "arrestado", "deportación", "ayúdame", "miedo"
  ];
  const mediumUrgency = [
    "visa expired", "status expired", "out of status", "denied",
    "lost my job", "fired", "separated", "family separated",
    "worried", "desperate", "no options"
  ];
  if (highUrgency.some(kw => msg.includes(kw))) return "high";
  if (mediumUrgency.some(kw => msg.includes(kw))) return "medium";
  return "none";
}

async function notifyTeamDistress(userId, userMessage, urgency, platform) {
  try {
    const TEAM_CHAT_ID = process.env.TEAM_TELEGRAM_CHAT_ID;
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    if (!TEAM_CHAT_ID || !BOT_TOKEN) return;
    const emoji = urgency === "high" ? "🚨" : "⚠️";
    const label = urgency === "high" ? "HIGH URGENCY" : "MEDIUM URGENCY";
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: TEAM_CHAT_ID,
      text: `${emoji} ${label} — ${platform}\n\nClient: "${userMessage.substring(0, 200)}"\n\nPlease follow up immediately! 📞 626-678-8677`
    });
    console.log(`🚨 Distress notification sent (${urgency})`);
  } catch (err) {
    console.error("Distress notification error:", err.message);
  }
}

// ── WhatsApp media download ───────────────────────────────
async function downloadWhatsAppMedia(mediaId) {
  const metaResp = await axios.get(
    `https://graph.facebook.com/v18.0/${mediaId}`,
    { headers: { "Authorization": `Bearer ${WHATSAPP_TOKEN}` } }
  );
  const { url, mime_type } = metaResp.data;
  const fileResp = await axios.get(url, {
    headers: { "Authorization": `Bearer ${WHATSAPP_TOKEN}` },
    responseType: "arraybuffer"
  });
  return { buffer: Buffer.from(fileResp.data), mimeType: mime_type };
}

async function askClaudeWithMedia(userId, buffer, mediaType, caption, platform) {
  const base64 = buffer.toString("base64");
  const userPrompt = caption || "Please analyze this. If it's a legal document, explain what it is and what it means.";
  const contentBlock = mediaType === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
    : { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } };

  const response = await axios.post(
    "https://api.anthropic.com/v1/messages",
    {
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: [contentBlock, { type: "text", text: userPrompt }] }]
    },
    { headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" } }
  );
  const reply = response.data.content.filter(b => b.type === "text").map(b => b.text).join("") ||
    "I had trouble reading that file. Please try again or contact us at 626-678-8677.";
  if (!conversations[userId]) conversations[userId] = [];
  conversations[userId].push({ role: "user", content: `[File sent] ${caption || ""}` });
  conversations[userId].push({ role: "assistant", content: reply });
  await checkAndNotifyLead(userId, caption || "", reply, platform);
  return reply;
}

// ── Webhook receiver ──────────────────────────────────────
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  console.log("Webhook received:", JSON.stringify(body).substring(0, 300));

  // ── WhatsApp messages ─────────────────────────────────
  if (body.object === "whatsapp_business_account") {
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message) return;

    const from = message.from;
    const messageType = message.type;

    try {
      // IMAGE
      if (messageType === "image") {
        const { buffer, mimeType } = await downloadWhatsAppMedia(message.image.id);
        const caption = message.image.caption || "";
        const reply = await askClaudeWithMedia(from, buffer, mimeType, caption, "WhatsApp");
        await sendWhatsAppMessage(from, reply);
        return;
      }

      // DOCUMENT (PDF)
      if (messageType === "document") {
        const { buffer, mimeType } = await downloadWhatsAppMedia(message.document.id);
        const caption = message.document.caption || message.document.filename || "";
        if (mimeType === "application/pdf") {
          const reply = await askClaudeWithMedia(from, buffer, "application/pdf", caption, "WhatsApp");
          await sendWhatsAppMessage(from, reply);
        } else {
          await sendWhatsAppMessage(from, "I can read images and PDF documents. Please send your document as a PDF or image.");
        }
        return;
      }

      // AUDIO/VOICE
      if (messageType === "audio") {
        await sendWhatsAppMessage(from, "I received your voice message! I can't process audio yet, but you can type your question and I'll help right away. 😊");
        return;
      }

      // TEXT
      if (messageType === "text") {
        const userText = message.text.body;
        console.log("WhatsApp from:", from, ":", userText);
        await processMessage(from, userText, (text) => sendWhatsAppMessage(from, text), "WhatsApp");
        return;
      }

      // OTHER
      await sendWhatsAppMessage(from, "I can read text messages, images, and PDF documents. What can I help you with?");

    } catch (err) {
      console.error("WhatsApp error:", err.response?.data || err.message);
      try {
        await sendWhatsAppMessage(from, "Something went wrong — sorry! 😔\n📞 626-678-8677\n📧 jj@tezlawfirm.com");
      } catch (e) { console.error("Failed to send error:", e.message); }
    }
    return;
  }

  // ── Facebook Messenger messages ───────────────────────
  if (body.object === "page") {
    const entry = body.entry?.[0];
    const messagingEvent = entry?.messaging?.[0];
    if (!messagingEvent || !messagingEvent.message) return;

    const senderId = messagingEvent.sender.id;
    const messageText = messagingEvent.message.text;

    if (!messageText) {
      await sendMessengerMessage(senderId, "Hey! I can read text messages right now. What's on your mind? 😊");
      return;
    }

    console.log("Messenger from:", senderId, ":", messageText);
    try {
      await processMessage(senderId, messageText, (text) => sendMessengerMessage(senderId, text), "Facebook Messenger");
    } catch (err) {
      console.error("Messenger error:", err.response?.data || err.message);
      try {
        await sendMessengerMessage(senderId, "Something went wrong — sorry! 😔\n📞 626-678-8677\n📧 jj@tezlawfirm.com");
      } catch (e) { console.error("Failed to send error:", e.message); }
    }
    return;
  }
});

app.get("/", (req, res) => res.send("Tez Law P.C. — Zara is running on WhatsApp & Facebook Messenger."));

app.listen(PORT, () => {
  console.log(`Zara bot running on port ${PORT}`);
});
