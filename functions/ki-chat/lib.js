/* KI-Chat – Logik der Function (ohne Netzwerk, damit sie sich testen lässt).
 *
 * Der Server entscheidet, wer anfragt (x-appwrite-user-id) und ob die Person im Team „ki-tester“ ist.
 * Gespeichert werden Chats (Tabelle chats) und Nachrichten (Tabelle chat_messages), jeweils nur für die eigene Person lesbar.
 * Läuft ohne Abhängigkeiten auf node-16.0. */
"use strict";

const LIMITS = {
  textMax: 4000,       // Zeichen pro Nachricht
  historyMessages: 30, // so viele frühere Nachrichten sieht die KI
  historyChars: 24000, // und höchstens so viele Zeichen davon
  titleMax: 60,
  chatsMax: 100,       // Chats pro Konto
  replyMax: 20000,
};

const SYSTEM_PROMPT = "Du bist der KI-Chat von Pensum, einem Toolkit für Schülerinnen und Schüler. Antworte freundlich, klar und in der Sprache der Frage (meist Deutsch). " +
  "Erkläre Schritt für Schritt. Wenn du dir nicht sicher bist, sag das offen. Formatiere bei Bedarf mit Absätzen, Listen und Codeblöcken. " +
  "AUFGABEN: Schickt die Person eine Aufgabe (als Bild oder Text), löse sie vollständig und richtig. Schreib zuerst höchstens zwei Sätze Einordnung. " +
  "Setze dann die fertige Lösung, so wie man sie ins Heft schreiben würde (Rechenweg und Ergebnis, ohne Markdown-Zeichen wie ** oder #), in genau einen Codeblock mit der Sprache lösung, also so: ```lösung\n…\n```." +
  "Mehrere Teilaufgaben stehen alle in diesem einen Block, jeweils mit a), b) usw. Nach dem Block darf ein kurzer Hinweis stehen, mehr nicht.";

/** Klassenstufen, aus denen man wählen kann, und wie die KI dazu antwortet. */
const GRADES = {
  8: "Nutze einfache Sprache und kurze Sätze. Erkläre Fachbegriffe, bevor du sie benutzt, und nimm Beispiele aus dem Alltag. Keine langen Herleitungen.",
  9: "Nutze verständliche Sprache mit den wichtigsten Fachbegriffen, jeweils kurz erklärt. Zeige den Rechen- oder Denkweg in kleinen Schritten, mit einem passenden Beispiel.",
  10: "Nutze Fachbegriffe wie im Unterricht der 10. Klasse und begründe die Schritte. Zeige Herleitungen, wo sie helfen, und weise auf typische Fehler hin, die in Prüfungen (z. B. zum mittleren Schulabschluss) vorkommen.",
  11: "Antworte auf Oberstufen-Niveau: präzise Fachsprache, Zusammenhänge zwischen den Themen, saubere Begründungen und Herleitungen. Du darfst von den Lernenden mitdenken lassen.",
  12: "Antworte auf Abitur-Niveau: genaue Fachsprache, Tiefe und Transfer. Argumentiere sauber, nenne Voraussetzungen und Grenzen, und formuliere Lösungswege so, wie sie in Abiturklausuren erwartet werden.",
};

/** Klasse aus der Anfrage (8 bis 12) oder null. */
function cleanGrade(value) {
  const n = Number(value);
  return Number.isInteger(n) && GRADES[n] ? n : null;
}

/** Systemanweisung, angepasst an die Klasse. Ohne gültige Klasse bleibt es bei der allgemeinen Anweisung. */
function systemPrompt(grade) {
  const g = cleanGrade(grade);
  return g ? `${SYSTEM_PROMPT} Die Person besucht Klasse ${g}. ${GRADES[g]}` : SYSTEM_PROMPT;
}

const CARDS = { countMax: 40, countDefault: 15, frontMax: 1000, backMax: 1000, textMax: 8000 };

const CARDS_PROMPT = "Du erstellst Karteikarten für Schülerinnen und Schüler. Antworte NUR mit JSON in der Form {\"cards\":[{\"front\":\"...\",\"back\":\"...\"}]}. " +
  "Jede Karte hat genau eine Frage oder einen Begriff (front) und eine kurze, richtige Antwort (back), die man schriftlich eintippen könnte. Keine Doppelten, kein Markdown. " +
  "VOKABELN: Enthält das Bild oder der Text eine Vokabelliste, übernimm jedes Wort genau so, wie es dasteht: front = Wort in der Fremdsprache, back = deutsche Übersetzung. " +
  "Mehrere Bedeutungen trennst du mit / (zum Beispiel \"Haus / Gebäude\"). Rate nichts dazu, lass Unleserliches weg. " +
  "BILD oder PDF mit Heftseite, Buchseite oder Lernzettel: Mach daraus die wichtigsten Frage-Antwort-Karten zum Inhalt. " +
  "THEMA: Nur ein Thema ohne Material: Erstelle abwechslungsreiche, sachlich richtige Karten dazu. " +
  "Schreibe in der Sprache des Materials, Erklärungen auf Deutsch. Liefere höchstens die gewünschte Anzahl Karten.";

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,35}$/;
const IMAGE = { maxBase64: 2_400_000, maxPdfBase64: 3_500_000 }; // ca. 1,8 MB Bild (der Browser verkleinert vorher) und ca. 2,6 MB PDF

/** Erkennt Bild- oder PDF-Typ an den ersten Bytes (der Typ aus dem Browser wird nicht geglaubt). Gibt null zurück, wenn es keins von beiden ist. */
function detectMime(base64) {
  if (typeof base64 !== "string" || base64.length < 32 || base64.length > IMAGE.maxPdfBase64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return null;
  const head = Buffer.from(base64.slice(0, 24), "base64");
  if (head.toString("latin1", 0, 4) === "%PDF") return "application/pdf";
  if (base64.length > IMAGE.maxBase64) return null;
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (head[0] === 0x89 && head.toString("latin1", 1, 4) === "PNG") return "image/png";
  if (head.toString("latin1", 0, 4) === "RIFF" && head.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  return null;
}

/** Karten aus der Antwort der KI lesen: gültiges JSON (auch in einem Codeblock), bereinigt, ohne Leere und Doppelte. */
function parseCards(out, max = CARDS.countMax) {
  let raw = String(out == null ? "" : out).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let json = null;
  try { json = JSON.parse(raw); } catch (_) {
    const m = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (m) { try { json = JSON.parse(m[0]); } catch (__) { /* leer */ } }
  }
  const list = Array.isArray(json) ? json : json && Array.isArray(json.cards) ? json.cards : [];
  const seen = new Set();
  const cards = [];
  for (const c of list) {
    const front = cleanText(c && c.front, CARDS.frontMax);
    const back = cleanText(c && c.back, CARDS.backMax);
    const key = front.toLowerCase();
    if (!front || !back || seen.has(key)) continue;
    seen.add(key);
    cards.push({ front, back });
    if (cards.length >= max) break;
  }
  return cards;
}

/** Fehler mit Text, den Nutzer sehen dürfen. Alle anderen Fehler werden nur protokolliert. */
class UserError extends Error {
  constructor(message, status = 400, code = "error") { super(message); this.status = status; this.code = code; }
}

/** Bereinigt eine Nachricht: Zeilenenden, Steuerzeichen, Länge. Leer ergibt "". */
function cleanText(value, max = LIMITS.textMax) {
  return String(value == null ? "" : value)
    .replace(/\r\n?/g, "\n")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .slice(0, max);
}

/** Name eines Chats vom Nutzer: Zeilenumbrüche und Mehrfach-Leerzeichen werden zu einem Leerzeichen, höchstens titleMax Zeichen. Leer ergibt "". */
function cleanTitle(value) {
  return cleanText(value, 500).replace(/\s+/g, " ").slice(0, LIMITS.titleMax).trim();
}

/** Titel eines neuen Chats aus der ersten Frage. */
function makeTitle(text) {
  const s = cleanText(text).replace(/\s+/g, " ");
  if (!s) return "Neuer Chat";
  return s.length > LIMITS.titleMax ? s.slice(0, LIMITS.titleMax).replace(/\s+\S*$/, "") + " …" : s;
}

/** Wählt die letzten Nachrichten für die KI aus (Anzahl und Zeichen begrenzt) und sorgt dafür, dass der Verlauf mit „user“ beginnt. */
function trimHistory(messages) {
  const out = [];
  let chars = 0;
  for (let i = messages.length - 1; i >= 0 && out.length < LIMITS.historyMessages; i--) {
    const m = messages[i];
    chars += m.text.length;
    if (out.length && chars > LIMITS.historyChars) break;
    out.unshift({ role: m.role === "model" ? "model" : "user", text: m.text });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

const chatView = (c) => ({ id: c.$id, title: c.title, updatedAt: c.$updatedAt });

/**
 * Anfrage verarbeiten.
 *   { action: "send", chatId?, text, image?, grade? }  -> { ok, chat, reply: { id, text }, steps: [{ id, label, detail, ms? }] }
 *     image: Base64-JPEG/PNG/WebP (wird nur für diese Frage genutzt), grade: Klasse 8 bis 12 (bestimmt, wie die KI antwortet)
 *   { action: "cards", text?, image?, count?, grade? } -> { ok, cards: [{ front, back }] }  (Karteikarten aus Thema, Text, Foto oder PDF; es wird nichts gespeichert)
 *   { action: "delete", chatId }       -> { ok }
 *   { action: "rename", chatId, title } -> { ok, title }
 * deps: { db, gemini, isMember, log, error, now? }  (now: Uhr in Millisekunden, nur für Tests)
 */
async function handle({ body, userId }, deps) {
  try {
    if (!userId) throw new UserError("Nicht angemeldet.", 401, "auth");
    if (!(await deps.isMember(userId))) throw new UserError("Der KI-Chat ist nur für das Team „Ki-Tester“ freigeschaltet.", 403, "forbidden");

    const action = body && body.action;
    /** Der Chat, falls er dieser Person gehört, sonst 404 (auch bei fremden Chats, damit man ihre Existenz nicht erfährt). */
    const ownChat = async (id) => {
      const chatId = String(id || "");
      if (!ID_RE.test(chatId)) throw new UserError("Unbekannter Chat.", 404, "not_found");
      const chat = await deps.db.getChat(chatId);
      if (!chat || chat.userId !== userId) throw new UserError("Unbekannter Chat.", 404, "not_found");
      return chat;
    };
    if (action === "delete") {
      const chat = await ownChat(body.chatId);
      await deps.db.deleteChat(chat.$id);
      return { status: 200, json: { ok: true } };
    }
    if (action === "rename") {
      const chat = await ownChat(body.chatId);
      const title = cleanTitle(body.title);
      if (!title) throw new UserError("Gib dem Chat einen Namen.");
      await deps.db.renameChat(chat.$id, title);
      return { status: 200, json: { ok: true, title } };
    }
    if (action === "cards") {
      let image = null;
      if (body.image) {
        const mime = detectMime(body.image);
        if (!mime) throw new UserError("Diese Datei kann die KI nicht lesen. Nimm ein JPEG, PNG, WebP oder ein PDF (bis ca. 2,5 MB).", 422, "image");
        image = { mime, data: body.image };
      }
      const material = cleanText(body.text, CARDS.textMax);
      if (!material && !image) throw new UserError("Gib ein Thema oder einen Text ein oder fotografiere eine Seite.");
      const n = Math.min(CARDS.countMax, Math.max(1, Math.round(Number(body.count)) || CARDS.countDefault));
      const grade = cleanGrade(body.grade);
      const task = image
        ? `Erstelle bis zu ${n} Karteikarten aus ${image.mime === "application/pdf" ? "diesem PDF" : "diesem Bild"}.${material ? ` Hinweis der Person: ${material}` : ""}`
        : (material.includes("\n") || material.length >= 80)
          ? `Erstelle bis zu ${n} Karteikarten aus diesem Text:\n\n${material}`
          : `Erstelle bis zu ${n} Karteikarten zum Thema: ${material}`;
      const out = await deps.gemini(CARDS_PROMPT + (grade ? ` Passe das Niveau an Klasse ${grade} an.` : ""), [{ role: "user", text: task }], { image, json: true, maxTokens: 8192, temperature: 0.4 });
      const cards = parseCards(typeof out === "string" ? out : out && out.text, n);
      if (!cards.length) throw new UserError("Daraus konnte die KI keine Karten machen. Versuch ein anderes Thema oder ein deutlicheres Foto.", 422, "empty");
      return { status: 200, json: { ok: true, cards } };
    }
    if (action !== "send") throw new UserError("Ungültige Anfrage.");

    let image = null;
    if (body.image) {
      const mime = detectMime(body.image);
      if (!mime) throw new UserError("Diese Datei kann der KI-Chat nicht lesen. Nimm ein JPEG, PNG, WebP oder ein PDF (bis ca. 2,5 MB).", 422, "image");
      image = { mime, data: body.image };
    }
    const typed = cleanText(body.text);
    if (!typed && !image) throw new UserError("Schreib zuerst eine Nachricht.");
    const isPdf = !!image && image.mime === "application/pdf";
    const text = typed || (isPdf ? "Löse die Aufgaben in diesem PDF." : "Beschreibe das Bild.");

    // Die echten Schritte dieser Anfrage mit Dauer: Die Oberfläche zeigt sie als einklappbare Liste unter der Antwort.
    const now = deps.now || Date.now;
    const steps = [];

    let chat = null;
    let history = [];
    if (body.chatId) {
      const chatId = String(body.chatId);
      if (!ID_RE.test(chatId)) throw new UserError("Unbekannter Chat.", 404, "not_found");
      chat = await deps.db.getChat(chatId);
      if (!chat || chat.userId !== userId) throw new UserError("Unbekannter Chat.", 404, "not_found");
      const t = now();
      history = trimHistory(await deps.db.recentMessages(chatId));
      steps.push({ id: "history", label: "Verlauf gelesen", detail: history.length === 1 ? "1 Nachricht" : `${history.length} Nachrichten`, ms: Math.max(0, now() - t) });
    } else if ((await deps.db.countChats(userId)) >= LIMITS.chatsMax) {
      throw new UserError(`Du hast ${LIMITS.chatsMax} Chats. Lösche einen alten Chat, um einen neuen zu starten.`, 409, "limit");
    }

    // Erst die KI fragen, dann speichern: Schlägt sie fehl, bleibt nichts Halbes zurück.
    const grade = cleanGrade(body.grade);
    if (image) steps.push({ id: "image", label: isPdf ? "PDF gelesen" : "Bild gelesen", detail: "Nur für diese Frage" }); // gelesen wird es in der Antwort, darum ohne eigene Dauer
    const tAnswer = now();
    const out = await deps.gemini(systemPrompt(grade), [...history, { role: "user", text }], { image });
    const reply = cleanText(typeof out === "string" ? out : out && out.text, LIMITS.replyMax);
    if (!reply) throw new UserError("Die KI hat nicht geantwortet. Versuch es noch einmal.", 502, "empty");
    steps.push({ id: "answer", label: "Antwort geschrieben", detail: grade ? `Für Klasse ${grade}` : "", ms: Math.max(0, now() - tAnswer) });

    const tSave = now();
    if (!chat) chat = await deps.db.createChat(userId, makeTitle(text));
    // Die Datei selbst wird nicht gespeichert, nur der Hinweis darauf.
    await deps.db.addMessage(userId, chat.$id, "user", image ? `${text}\n\n📎 ${isPdf ? "PDF" : "Bild"} angehängt` : text);
    const saved = await deps.db.addMessage(userId, chat.$id, "model", reply);
    try { await deps.db.touchChat(chat.$id, chat.title); } catch (e) { deps.error("Chat-Zeitstempel nicht aktualisiert: " + (e && e.message)); } // nur für die Sortierung, darf die Antwort nicht verlieren
    steps.push({ id: "save", label: "Chat gespeichert", detail: "", ms: Math.max(0, now() - tSave) });
    return { status: 200, json: { ok: true, chat: chatView(chat), reply: { id: saved.$id, text: reply }, steps } };
  } catch (e) {
    if (e instanceof UserError) return { status: e.status, json: { ok: false, error: e.message, code: e.code } };
    deps.error("KI-Chat fehlgeschlagen: " + (e && e.message));
    if (e && e.setup) return { status: 503, json: { ok: false, error: "Der KI-Chat ist noch nicht eingerichtet.", code: "setup" } };
    return { status: 502, json: { ok: false, error: "Der KI-Chat antwortet gerade nicht. Versuch es später noch einmal.", code: "error" } };
  }
}

module.exports = { CARDS, CARDS_PROMPT, parseCards, LIMITS, IMAGE, GRADES, SYSTEM_PROMPT, UserError, cleanText, cleanTitle, cleanGrade, systemPrompt, makeTitle, trimHistory, detectMime, handle };
