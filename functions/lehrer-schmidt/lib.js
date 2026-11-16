/* Reine Hilfen für die Videosuche (ohne Netzwerk, deshalb testbar). */
"use strict";

class UserError extends Error {}

/** Thema säubern: Steuerzeichen raus, Leerraum glätten, höchstens 100 Zeichen. */
function cleanTopic(input) {
  return String(input == null ? "" : input).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}

const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'" };
const decode = (s) => String(s || "").replace(/&(?:amp|lt|gt|quot|apos|#39);/g, (m) => ENTITIES[m]);

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** YouTube-Suchantwort → schlanke Liste { id, title, channel, published }. */
function mapResults(json) {
  const items = (json && Array.isArray(json.items)) ? json.items : [];
  const out = [];
  for (const it of items) {
    const id = it && it.id && it.id.videoId;
    const sn = (it && it.snippet) || {};
    if (!VIDEO_ID.test(String(id || ""))) continue;
    out.push({ id, title: decode(sn.title).slice(0, 200), channel: decode(sn.channelTitle).slice(0, 100), published: String(sn.publishedAt || "").slice(0, 10) });
  }
  return out;
}

/** Such-URL der YouTube Data API: nur Videos des Kanals, deutsch, ohne Ungeeignetes. */
function searchUrl({ topic, channelId, key, max = 6 }) {
  const q = new URLSearchParams({
    part: "snippet", type: "video", channelId, q: topic, maxResults: String(max),
    relevanceLanguage: "de", safeSearch: "strict", videoEmbeddable: "true", key,
  });
  return "https://www.googleapis.com/youtube/v3/search?" + q.toString();
}

function channelUrl({ handle, key }) {
  return "https://www.googleapis.com/youtube/v3/channels?" + new URLSearchParams({ part: "id", forHandle: handle, key }).toString();
}

/** Kleiner Zwischenspeicher mit Ablaufzeit (die Suche kostet Kontingent bei YouTube). */
function createCache(ttlMs, max = 200, now = Date.now) {
  const map = new Map();
  return {
    get(k) {
      const e = map.get(k);
      if (!e) return undefined;
      if (e.until < now()) { map.delete(k); return undefined; }
      return e.value;
    },
    set(k, value) {
      if (map.size >= max) map.delete(map.keys().next().value);
      map.set(k, { value, until: now() + ttlMs });
    },
  };
}

module.exports = { UserError, cleanTopic, mapResults, searchUrl, channelUrl, createCache, VIDEO_ID };
