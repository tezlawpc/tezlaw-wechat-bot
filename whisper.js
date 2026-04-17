// ============================================================
//  whisper.js — Voice Transcription via OpenAI Whisper
//  Tez Law P.C. — Zara AI Assistant
//  Drop this file into all 3 bot repos.
//  Cost: ~$0.006/minute (roughly $0.01 per voice message)
// ============================================================

const axios = require("axios");
const FormData = require("form-data");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/**
 * Transcribe an audio buffer using OpenAI Whisper API
 * Supports: ogg, opus, mp3, mp4, wav, m4a, webm, amr
 *
 * @param {Buffer} audioBuffer - Raw audio file buffer
 * @param {string} filename - Filename with extension e.g. "voice.ogg"
 * @param {string} [language] - Optional ISO language hint e.g. "es", "zh", "ko"
 * @returns {Promise<string>} - Transcribed text, or null on failure
 */
async function transcribeAudio(audioBuffer, filename, language = null) {
  if (!OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY not set — Whisper transcription disabled");
    return null;
  }

  try {
    const form = new FormData();
    form.append("file", audioBuffer, {
      filename: filename,
      contentType: getAudioMimeType(filename),
    });
    form.append("model", "whisper-1");
    form.append("response_format", "text");

    // If we detected language from previous messages, hint Whisper
    if (language && language !== "en") {
      form.append("language", language);
    }

    const response = await axios.post(
      "https://api.openai.com/v1/audio/transcriptions",
      form,
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          ...form.getHeaders(),
        },
        maxBodyLength: 25 * 1024 * 1024, // 25 MB max
        timeout: 30000, // 30 second timeout
      }
    );

    const transcript = response.data?.trim();
    console.log(`🎤 Whisper transcribed: "${transcript?.substring(0, 80)}..."`);
    return transcript || null;
  } catch (err) {
    const status = err.response?.status;
    const msg = err.response?.data?.error?.message || err.message;
    console.error(`Whisper error (${status}): ${msg}`);
    return null;
  }
}

/**
 * Get MIME type from filename extension
 */
function getAudioMimeType(filename) {
  const ext = filename.split(".").pop().toLowerCase();
  const map = {
    ogg: "audio/ogg",
    opus: "audio/ogg",
    mp3: "audio/mpeg",
    mp4: "audio/mp4",
    m4a: "audio/mp4",
    wav: "audio/wav",
    webm: "audio/webm",
    amr: "audio/amr",
    flac: "audio/flac",
  };
  return map[ext] || "audio/ogg";
}

module.exports = { transcribeAudio };
