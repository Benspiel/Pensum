/* Goodnotes-Tool – Tinten-Engine.
 *
 * Unverändert übernommene Logik aus Inkly (https://github.com/Benspiel/Inkly, app.js, MIT-Lizenz):
 * Layout auf Papierlinien, Skelettierung der Handschrift-Zeichen (Zhang-Suen), Goodnotes-Strichformat
 * (Protobuf + LZ4 „bv41“), Neuvergabe der IDs und der Export als .goodnotes bzw. PDF.
 *
 * Gekapselt als Modul ohne Oberfläche: createInkEngine() liefert Zustand und Funktionen, die
 * Oberfläche liegt in goodnotes.js. Gegenüber Inkly wurde nur angepasst, was die Kapselung braucht:
 *   - renderPages(text) bekommt den Text als Parameter statt ihn aus dem Textfeld zu lesen,
 *   - lastK (Maßstab der letzten Vorschau) wird in render() gesetzt statt im Render-Timer.
 * Die Export-Logik selbst (buildGoodnotes, buildPdf, Strichformat) ist nicht verändert.
 *
 * Alles läuft im Browser. Es werden keine Inhalte hochgeladen.
 *
 * Erwartet als globale Skripte: JSZip, jsPDF (window.jspdf) und templates.js (window.GOODI_TEMPLATES).
 *
 * Grundlage: Eine echte, aus Goodnotes exportierte .goodnotes-Datei dient als Hülle.
 *  - "ink": Die Zeichen werden skelettiert und als echte Goodnotes-Stiftstriche in notes/<ID>
 *    geschrieben – radierbar, auswählbar, umfärbbar. Die Papier-PDF der Vorlage bleibt unverändert.
 *  - "pdf": Der Text wird als Bild in die PDF-Anlage (attachments/<ID>) eingebettet.
 * Strichformat: notes/<ID> ist eine Folge von Protobuf-Datensätzen mit Längenpräfix, je Strich ein
 * Kopf- und ein Inhaltsdatensatz. Die Punktdaten liegen LZ4-komprimiert im Apple-Rahmen
 * ("bv41" … "bv4$") in einem "tpl"-Block mit dem Schema vuA(v)A(S(uu))A(S(uuuu))vA(f).
 * Koordinaten in Goodnotes-Einheiten = PDF-Punkte × 11/6, Ursprung oben links.
 */
export function createInkEngine() {
  "use strict";

  const A4 = [595.28, 841.89];
  const PAGE_W = 1654; // ~200 dpi bei A4-Breite
  const GN_SCALE = 11 / 6; // Goodnotes-Einheiten pro PDF-Punkt
  const UUID_RE = /[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/g;
  // In jedem Goodnotes-Export identisch (auch über verschiedene Notizbücher hinweg) –
  // eine feste Kennung, die beim Neuvergeben der IDs unverändert bleiben muss.
  const KEEP_IDS = new Set(["5A53E89E-F4C2-4548-8DD3-E9DF9FB4592E"]);
  const TPL_SCHEMA = "vuA(v)A(S(uu))A(S(uuuu))vA(f)";

  // Maße in PDF-Punkten, gemessen von der Seitenoberkante (aus den Goodnotes-Vorlagen).
  const PAPERS = {
    lined:         { label: "Liniert",     spacing: 25,   first: 49.5, rows: true,  startSlot: 1, font: 0.95 },
    "lined-small": { label: "Eng liniert", spacing: 17.5, first: 50,   rows: true,  startSlot: 1, font: 1.05 },
    grid:          { label: "Kariert",     spacing: 16,   first: 15.5, rows: true,  cols: 15.5, startSlot: 3, font: 1.15 },
    blank:         { label: "Blanko",      spacing: 25,   first: 49.5, rows: false, startSlot: 1, font: 0.95 },
  };
  const LINE_COLOR = "#d0d2d3";
  const LINE_PT = 0.5;

  const state = {
    mode: "ink",
    font: "Caveat",
    weight: 1,        // Strichstärke-Faktor im Tinten-Modus (1 = wie die Schrift)
    paper: "lined",
    ink: "#1d3f9e",
    size: 1,
    jitter: 1,
    custom: null, // eigene Vorlage { name, bytes, pdfPath, pageSize, hasInk }
    builtin: {},  // Cache der eingebauten Vorlagen
    pages: [],    // Vorschau-Canvas je Seite
    inkPages: [], // Striche je Seite (Pixelkoordinaten der Vorschau)
    handVary: 0,  // Verformung der eigenen Handschrift je Zeichen (0 = aus)
    hand: null,   // eigene Handschrift { glyphs: { ch: { adv, strokes: [[x, y], …][] } } } in Geviert-Einheiten
  };

  // Eigene, selbst gezeichnete Handschrift (Profil). Wird statt einer Schriftdatei verwendet.
  const HAND_ID = "__hand__";
  const HAND_W = 0.075;      // Strichbreite in Geviert-Einheiten
  const HAND_SPACE = 0.32;   // Breite eines Leerzeichens
  const HAND_MISSING = 0.45; // Vorschub für nicht gezeichnete Zeichen
  const HAND_ALIAS = { "„": '"', "“": '"', "”": '"', "«": '"', "»": '"', "‚": "'", "‘": "'", "’": "'", "–": "-", "—": "-", "•": "." };
  const isHand = () => state.font === HAND_ID && !!state.hand;
  function handGlyph(ch) {
    const g = state.hand && state.hand.glyphs;
    if (!g) return null;
    if (g[ch]) return g[ch];
    const alt = HAND_ALIAS[ch] || (ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase());
    return g[alt] || null;
  }
  const handAdvance = (ch) => (ch.trim() ? (handGlyph(ch) || { adv: HAND_MISSING }).adv : HAND_SPACE);

  function mulberry32(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const latin1 = {
    decode: (u8) => {
      let s = "";
      for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      return s;
    },
    encode: (s) => {
      const u8 = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
      return u8;
    },
  };

  const startsWithPdf = (u8) => u8.length > 5 && latin1.decode(u8.subarray(0, 5)) === "%PDF-";

  function readPdfPageSize(u8) {
    const head = latin1.decode(u8.subarray(0, Math.min(u8.length, 200000)));
    const m = head.match(/\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/);
    if (!m) return A4;
    const w = parseFloat(m[3]) - parseFloat(m[1]);
    const h = parseFloat(m[4]) - parseFloat(m[2]);
    return w > 0 && h > 0 ? [w, h] : A4;
  }

  function download(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  const safeName = (s) => (s || "Notiz").trim().replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80) || "Notiz";

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  }

  /* ---------- Protobuf (minimal) ---------- */

  const pb = {
    // Varint aus Number (bis 2^53) oder BigInt
    varint(n) {
      const out = [];
      if (typeof n === "bigint") {
        do { let b = Number(n & 0x7fn); n >>= 7n; if (n) b |= 0x80; out.push(b); } while (n);
      } else {
        do { let b = n % 128; n = Math.floor(n / 128); if (n) b |= 0x80; out.push(b); } while (n);
      }
      return Uint8Array.from(out);
    },
    concat(parts) {
      const len = parts.reduce((s, p) => s + p.length, 0);
      const out = new Uint8Array(len);
      let o = 0;
      for (const p of parts) { out.set(p, o); o += p.length; }
      return out;
    },
    v: (f, n) => pb.concat([pb.varint(f * 8), pb.varint(n)]),
    bytes: (f, b) => pb.concat([pb.varint(f * 8 + 2), pb.varint(b.length), b]),
    str: (f, s) => pb.bytes(f, new TextEncoder().encode(s)),
    f32(f, x) {
      const b = new Uint8Array(4);
      new DataView(b.buffer).setFloat32(0, x, true);
      return pb.concat([pb.varint(f * 8 + 5), b]);
    },
    // Liest Felder einer Nachricht: [{ f, wt, v }]; v ist BigInt (Varint) oder Uint8Array
    fields(b) {
      const out = [];
      let i = 0;
      const rv = () => {
        let r = 0n, s = 0n, c;
        do { c = b[i++]; r |= BigInt(c & 0x7f) << s; s += 7n; } while (c & 0x80);
        return r;
      };
      while (i < b.length) {
        const key = Number(rv());
        const f = key >> 3, wt = key & 7;
        let v;
        if (wt === 0) v = rv();
        else if (wt === 1) { v = b.subarray(i, i + 8); i += 8; }
        else if (wt === 5) { v = b.subarray(i, i + 4); i += 4; }
        else if (wt === 2) { const n = Number(rv()); v = b.subarray(i, i + n); i += n; }
        else throw new Error("wire type " + wt);
        if (!f || i > b.length) throw new Error("kein Protobuf");
        out.push({ f, wt, v });
      }
      return out;
    },
    // Datei aus Datensätzen mit Varint-Längenpräfix
    records(b) {
      const out = [];
      let i = 0;
      while (i < b.length) {
        let n = 0, s = 1, c;
        do { c = b[i++]; n += (c & 0x7f) * s; s *= 128; } while (c & 0x80);
        out.push(b.subarray(i, i + n)); i += n;
      }
      return out;
    },
  };

  /* ---------- Goodnotes-Striche ---------- */

  // LZ4-Block nur aus Literalen (gültig laut LZ4-Spezifikation) im Apple-Rahmen "bv41".
  function bv41(raw) {
    const n = raw.length;
    const head = [Math.min(n, 15) << 4];
    if (n >= 15) { let r = n - 15; while (r >= 255) { head.push(255); r -= 255; } head.push(r); }
    const blk = pb.concat([Uint8Array.from(head), raw]);
    const hdr = new Uint8Array(12);
    hdr.set(latin1.encode("bv41"));
    new DataView(hdr.buffer).setUint32(4, n, true);
    new DataView(hdr.buffer).setUint32(8, blk.length, true);
    return pb.concat([hdr, blk, latin1.encode("bv4$")]);
  }

  // Punktliste (Goodnotes-Einheiten) -> "tpl"-Block mit geraden quadratischen Segmenten.
  function strokeBlob(pts, width) {
    if (pts.length === 1) pts = [pts[0], pts[0]];
    const segs = pts.length - 1;
    const n = segs + 1;
    const schema = latin1.encode(TPL_SCHEMA + "\0");
    const dataLen = 2 + 4 + 4 + 2 * n + 4 + 8 + 4 + 16 * segs + 2 + 4;
    const total = 8 + schema.length + dataLen;
    const buf = new Uint8Array(total);
    const dv = new DataView(buf.buffer);
    buf.set(latin1.encode("tpl\0"));
    dv.setUint32(4, total, true);
    buf.set(schema, 8);
    let o = 8 + schema.length;
    dv.setUint16(o, 2, true); o += 2;
    dv.setFloat32(o, width, true); o += 4;
    dv.setUint32(o, n, true); o += 4;
    for (let i = 0; i < n; i++) { dv.setUint16(o, i === 0 ? 0 : 1, true); o += 2; }
    dv.setUint32(o, 1, true); o += 4;
    dv.setFloat32(o, pts[0][0], true); dv.setFloat32(o + 4, pts[0][1], true); o += 8;
    dv.setUint32(o, segs, true); o += 4;
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
      dv.setFloat32(o, (ax + bx) / 2, true); dv.setFloat32(o + 4, (ay + by) / 2, true);
      dv.setFloat32(o + 8, bx, true); dv.setFloat32(o + 12, by, true);
      o += 16;
    }
    dv.setUint16(o, 1, true); o += 2;
    dv.setUint32(o, 0, true);
    return buf;
  }

  const rand32 = () => crypto.getRandomValues(new Uint32Array(1))[0];

  function strokeRecords(stroke, author, seq, order) {
    const sid = newUuid();
    const clock = pb.concat([pb.v(1, 1), pb.v(2, rand32())]);
    const hdr = pb.concat([pb.str(1, sid), pb.bytes(2, clock), pb.v(8, author), pb.v(9, seq), pb.v(14, 5381), pb.v(16, 24)]);
    const color = pb.concat(stroke.rgba.map((c, i) => (c ? pb.f32(i + 1, c) : new Uint8Array(0))));
    const empty = new Uint8Array(0);
    const sortKey = pb.concat([order ? pb.v(1, order) : empty, pb.v(2, rand32())]);
    const body = pb.concat([
      pb.str(1, sid), pb.bytes(2, bv41(strokeBlob(stroke.pts, stroke.width))), pb.bytes(4, color),
      pb.bytes(6, empty), pb.bytes(7, pb.bytes(1, sortKey)), pb.bytes(9, empty),
      pb.bytes(15, clock), pb.bytes(20, empty), pb.v(21, 24),
    ]);
    const rec = pb.bytes(7, body);
    return pb.concat([pb.varint(hdr.length), hdr, pb.varint(rec.length), rec]);
  }

  // Geräte-/Autorenkennung aus dem Ereignisprotokoll der Vorlage (Feld 13 der Ereignisse).
  function authorOf(eventsBytes) {
    for (const r of pb.records(eventsBytes)) {
      for (const top of pb.fields(r)) {
        if (top.wt !== 2 || top.f < 10) continue;
        try {
          const hit = pb.fields(top.v).find((x) => x.f === 13 && x.wt === 0);
          if (hit) return hit.v;
        } catch (_) { /* kein verschachteltes Protobuf */ }
      }
    }
    throw new Error("Autorenkennung in der Vorlage nicht gefunden.");
  }

  /* ---------- Vorlagen ---------- */

  // Prüft eine .goodnotes-Datei und liefert die Infos, die der Export braucht.
  async function inspectTemplate(bytes, name) {
    const zip = await JSZip.loadAsync(bytes);
    const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
    if (!names.some((n) => n.endsWith(".pb"))) throw new Error("Keine Goodnotes-Datei: es fehlen die .pb-Indexdateien.");

    const pdfPaths = [];
    for (const n of names.filter((n) => n.startsWith("attachments/"))) {
      if (startsWithPdf(await zip.file(n).async("uint8array"))) pdfPaths.push(n);
    }
    if (pdfPaths.length === 0) throw new Error("In der Vorlage wurde keine PDF-Seitenanlage gefunden.");
    if (pdfPaths.length > 1) throw new Error(`Die Vorlage enthält ${pdfPaths.length} PDF-Anlagen. Bitte ein einseitiges Notizbuch verwenden.`);

    const notePaths = names.filter((n) => n.startsWith("notes/"));
    if (notePaths.length !== 1) throw new Error("Die Vorlage muss genau eine Seite haben.");
    const hasInk = (await zip.file(notePaths[0]).async("uint8array")).length > 0;
    const pdfBytes = await zip.file(pdfPaths[0]).async("uint8array");
    return { name, bytes, pdfPath: pdfPaths[0], notePath: notePaths[0], pageSize: readPdfPageSize(pdfBytes), hasInk };
  }

  async function builtinTemplate(paper) {
    if (!state.builtin[paper]) {
      const src = (window.GOODI_TEMPLATES || {})[paper];
      if (!src) throw new Error("Eingebaute Vorlage fehlt (templates.js nicht geladen).");
      state.builtin[paper] = await inspectTemplate(latin1.encode(atob(src.data)).buffer, src.name);
    }
    return state.builtin[paper];
  }

  const activeTemplate = () => state.custom ? Promise.resolve(state.custom) : builtinTemplate(state.paper);
  const pageSize = () => (state.custom ? state.custom.pageSize : A4);

  /* ---------- Messen ---------- */

  const widthCache = new Map();
  function charWidth(ctx, ch) {
    const key = ctx.font + "|" + ch;
    let w = widthCache.get(key);
    if (w === undefined) { w = ctx.measureText(ch).width; widthCache.set(key, w); }
    return w;
  }

  function fontSpec(px, bold) {
    if (state.font === HAND_ID) return `400 ${px}px "Caveat"`;
    const weight = bold ? ({ Caveat: 600, Kalam: 700 }[state.font] || 400) : 400;
    return `${weight} ${px}px "${state.font}"`;
  }

  /* ---------- Glyphen in Striche umwandeln (Skelettierung) ----------
     Goodnotes-Tinte besteht aus Linien mit einer Breite, nicht aus gefüllten Flächen. Damit die
     Handschrift-Schriften trotzdem als echte Tinte erscheinen, wird jedes Zeichen groß gerendert,
     mit dem Zhang-Suen-Verfahren auf seine Mittellinie ausgedünnt und als Linienzug nachgezeichnet.
     Die Strichbreite kommt aus der Distanztransformation (Abstand der Mittellinie zum Rand). */
  const SKEL_EM = 160;
  const skeletonCache = new Map();

  function glyphSkeleton(bold, ch) {
    if (isHand()) {
      const gl = handGlyph(ch);
      const w = HAND_W * (bold ? 1.35 : 1);
      return { strokes: gl ? gl.strokes.map((pts) => ({ pts, w })) : [] };
    }
    const spec = fontSpec(SKEL_EM, bold);
    const key = spec + "|" + ch;
    if (skeletonCache.has(key)) return skeletonCache.get(key);

    const pad = Math.round(SKEL_EM * 0.35);
    const c = document.createElement("canvas");
    let ctx = c.getContext("2d");
    ctx.font = spec;
    const W = Math.ceil(ctx.measureText(ch).width + 2 * pad), H = Math.ceil(SKEL_EM * 1.8);
    const baseY = Math.round(SKEL_EM * 1.25);
    c.width = W; c.height = H;
    ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.font = spec;
    ctx.fillStyle = "#000";
    ctx.fillText(ch, pad, baseY);
    const rgba = ctx.getImageData(0, 0, W, H).data;
    const img = new Uint8Array(W * H);
    for (let i = 0; i < img.length; i++) img[i] = rgba[i * 4 + 3] > 110 ? 1 : 0;

    // Distanztransformation (Chamfer 3-4); Werte /3 ergeben Pixel
    const dt = new Float32Array(W * H);
    for (let i = 0; i < dt.length; i++) dt[i] = img[i] ? 1e9 : 0;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (img[i]) dt[i] = Math.min(dt[i], dt[i - 1] + 3, dt[i - W] + 3, dt[i - W - 1] + 4, dt[i - W + 1] + 4);
    }
    for (let y = H - 2; y > 0; y--) for (let x = W - 2; x > 0; x--) {
      const i = y * W + x;
      if (img[i]) dt[i] = Math.min(dt[i], dt[i + 1] + 3, dt[i + W] + 3, dt[i + W + 1] + 4, dt[i + W - 1] + 4);
    }

    // Zhang-Suen-Ausdünnung
    const sk = img.slice();
    const del = [];
    for (let changed = true; changed;) {
      changed = false;
      for (let step = 0; step < 2; step++) {
        del.length = 0;
        for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
          const i = y * W + x;
          if (!sk[i]) continue;
          const p2 = sk[i - W], p3 = sk[i - W + 1], p4 = sk[i + 1], p5 = sk[i + W + 1];
          const p6 = sk[i + W], p7 = sk[i + W - 1], p8 = sk[i - 1], p9 = sk[i - W - 1];
          const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (b < 2 || b > 6) continue;
          const a = (!p2 && p3) + (!p3 && p4) + (!p4 && p5) + (!p5 && p6) + (!p6 && p7) + (!p7 && p8) + (!p8 && p9) + (!p9 && p2);
          if (a !== 1) continue;
          if (step === 0 ? (p2 && p4 && p6) || (p4 && p6 && p8) : (p2 && p4 && p8) || (p2 && p6 && p8)) continue;
          del.push(i);
        }
        for (const i of del) sk[i] = 0;
        if (del.length) changed = true;
      }
    }

    // Nachbarn; diagonale Verbindungen zählen nur, wenn kein gerader Umweg existiert
    const nb = (i) => {
      const out = [];
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) if (sk[i + dx + dy * W]) out.push(i + dx + dy * W);
      for (const [dx, dy] of [[1, -1], [1, 1], [-1, 1], [-1, -1]]) {
        if (sk[i + dx + dy * W] && !sk[i + dx] && !sk[i + dy * W]) out.push(i + dx + dy * W);
      }
      return out;
    };
    const pix = [];
    for (let i = 0; i < sk.length; i++) if (sk[i]) pix.push(i);
    const deg = new Map(pix.map((i) => [i, nb(i).length]));
    const seen = new Set();
    const ek = (a, b) => (a < b ? a * 1e6 + b : b * 1e6 + a);
    const walk = (start, next) => {
      const path = [start, next];
      seen.add(ek(start, next));
      let prev = start, cur = next;
      while (deg.get(cur) === 2) {
        const n = nb(cur).find((q) => q !== prev && !seen.has(ek(cur, q)));
        if (n === undefined) break;
        seen.add(ek(cur, n));
        path.push(n); prev = cur; cur = n;
      }
      return path;
    };
    let paths = [];
    for (const i of pix) {
      if (deg.get(i) === 0) { paths.push([i]); continue; }
      if (deg.get(i) === 2) continue;
      for (const n of nb(i)) if (!seen.has(ek(i, n))) paths.push(walk(i, n));
    }
    for (const i of pix) for (const n of nb(i)) if (!seen.has(ek(i, n))) paths.push(walk(i, n)); // Ringe

    // Kurze Äste (Artefakte an Ecken und Enden) entfernen
    const meanW = pix.length ? pix.reduce((s, i) => s + dt[i], 0) / pix.length / 3 : 1;
    if (paths.length > 1) {
      paths = paths.filter((pa) => {
        if (pa.length === 1) return true;
        const e1 = deg.get(pa[0]) === 1, e2 = deg.get(pa[pa.length - 1]) === 1;
        return !((e1 !== e2) && pa.length < meanW * 1.2);
      });
    }

    // Punkte in Geviert-Einheiten (Ursprung: Schreibposition auf der Grundlinie), vereinfachen, glätten
    const strokes = paths.map((pa) => {
      const w = 2 * pa.reduce((s, i) => s + dt[i], 0) / pa.length / 3 / SKEL_EM;
      let pts = pa.map((i) => [(i % W) - pad, Math.floor(i / W) - baseY]);
      pts = rdp(pts, 0.8);
      if (pts.length > 2) pts = chaikin(pts);
      return { pts: pts.map(([x, y]) => [x / SKEL_EM, y / SKEL_EM]), w };
    });
    const res = { strokes };
    skeletonCache.set(key, res);
    return res;
  }

  // Ramer-Douglas-Peucker-Vereinfachung
  function rdp(pts, eps) {
    if (pts.length < 3) return pts;
    const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
    if (Math.hypot(bx - ax, by - ay) < 1.5) {
      // Geschlossener Ring: am weitesten entfernten Punkt teilen, sonst fällt er zusammen
      let far = 1, best = 0;
      for (let i = 1; i < pts.length - 1; i++) {
        const d = Math.hypot(pts[i][0] - ax, pts[i][1] - ay);
        if (d > best) { best = d; far = i; }
      }
      return rdp(pts.slice(0, far + 1), eps).slice(0, -1).concat(rdp(pts.slice(far), eps));
    }
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let max = 0, idx = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / len;
      if (d > max) { max = d; idx = i; }
    }
    if (max <= eps) return [pts[0], pts[pts.length - 1]];
    return rdp(pts.slice(0, idx + 1), eps).slice(0, -1).concat(rdp(pts.slice(idx), eps));
  }

  // Chaikin-Glättung (ein Durchgang), Endpunkte bleiben stehen
  function chaikin(pts) {
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      out.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  // Messschnittstelle: setSize(px, bold) + width(text)
  function makeMeasurer() {
    const ctx = document.createElement("canvas").getContext("2d");
    let size = 1;
    return {
      setSize(px, bold) { size = px; ctx.font = fontSpec(px, bold); },
      width(s) {
        let w = 0;
        if (isHand()) { for (const ch of s) w += handAdvance(ch) * size; return w; }
        for (const ch of s) w += charWidth(ctx, ch);
        return w;
      },
    };
  }

  /* ---------- Layout ---------- */

  // Seitengeometrie in Pixeln: Linien-/Zeilenpositionen, Ränder, Schriftgröße.
  function geometry() {
    const [wPt, hPt] = pageSize();
    const k = PAGE_W / wPt; // px pro pt
    const H = Math.round(hPt * k);
    const p = PAPERS[state.paper];
    // Auf Blanko-Papier verändert die Größe den Zeilenabstand, sonst nur die Schrift.
    const spacing = (p.rows ? p.spacing : p.spacing * state.size) * k;
    const first = p.first * k;
    const sizeF = p.rows ? state.size : 1;
    const base = Math.round(spacing * p.font * sizeF);
    const slotY = (i) => first + i * spacing; // Oberkante der i-ten Linie
    const bottom = 30 * k;
    let slots = 0;
    while (slotY(p.startSlot + slots) <= H - bottom) slots++;
    const left = (p.cols ? p.cols + 2 * p.spacing : 40) * k;
    return {
      k, W: PAGE_W, H, p, spacing, base, left,
      maxW: PAGE_W - left - 30 * k,
      slots,
      baseline: (i) => slotY(p.startSlot + i) - 2 * k,
    };
  }

  /* Text in Zeilen umbrechen und auf Seiten verteilen. Jede Zeile belegt ein oder zwei
     Linien des Papiers (Überschriften auf engem Papier zwei). */
  function layout(m, text, g) {
    const headSlots = g.spacing < 20 * g.k ? 2 : 1;
    const out = []; // { kind, text, indent, size, bold, bullet, slots }
    for (const raw of text.replace(/\r/g, "").split("\n")) {
      let kind = "p", content = raw.trimEnd();
      if (/^#{1,3}\s+/.test(content)) { kind = "h"; content = content.replace(/^#{1,3}\s+/, ""); }
      else if (/^\s*[-*•]\s+/.test(content)) { kind = "li"; content = content.replace(/^\s*[-*•]\s+/, ""); }

      if (!content.trim()) { out.push({ kind: "blank", slots: 1 }); continue; }

      const size = kind === "h" ? g.base * (headSlots === 2 ? 1.7 : 1.3) : g.base;
      const indent = kind === "li" ? g.base * 1.1 : 0;
      const slots = kind === "h" ? headSlots : 1;
      m.setSize(size, kind === "h");

      const avail = g.maxW - indent;
      const words = content.split(/(\s+)/).filter(Boolean);
      let line = "", first = true;
      const flush = () => {
        out.push({ kind, text: line.trim(), indent, size, bold: kind === "h", bullet: kind === "li" && first, slots });
        first = false; line = "";
      };
      for (const word of words) {
        const candidate = line + word;
        if (m.width(candidate.trim()) <= avail || !line.trim()) {
          // Überlange Einzelwörter hart umbrechen
          if (!line.trim() && m.width(word) > avail) {
            let chunk = "";
            for (const ch of word) {
              if (m.width(chunk + ch) > avail) { line = chunk; flush(); chunk = ""; }
              chunk += ch;
            }
            line = chunk;
          } else {
            line = candidate;
          }
        } else {
          flush();
          line = word.trim() ? word : "";
        }
      }
      if (line.trim()) flush();
    }

    // Auf Seiten verteilen; jede Zeile merkt sich ihre (letzte) Linie als Grundlinie.
    const pages = [[]];
    let used = 0;
    for (const l of out) {
      if (used + l.slots > g.slots) { pages.push([]); used = 0; }
      if (l.kind === "blank" && used === 0 && pages.length > 1) continue;
      used += l.slots;
      pages[pages.length - 1].push({ ...l, slot: used - 1 });
    }
    return pages;
  }

  /* ---------- Zeichnen ---------- */

  function drawPaper(ctx, g) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, g.W, g.H);
    const p = g.p;
    if (!p.rows) return;
    const t = Math.max(1, LINE_PT * g.k);
    ctx.fillStyle = LINE_COLOR;
    for (let y = p.first * g.k; y < g.H; y += p.spacing * g.k) ctx.fillRect(0, y, g.W, t);
    if (p.cols) for (let x = p.cols * g.k; x < g.W; x += p.spacing * g.k) ctx.fillRect(x, 0, t, g.H);
  }

  // PDF-Modus: Umrissschrift Zeichen für Zeichen leicht variiert auf die Seite malen.
  function drawOutlineLine(ctx, m, l, x, y, rnd, g) {
    if (isHand()) {
      const strokes = [];
      inkLineStrokes(m, l, x, y, rnd, strokes, g);
      drawInkStrokes(ctx, strokes, g);
      return;
    }
    const j = state.jitter;
    ctx.font = fontSpec(l.size, l.bold);
    const drift = (rnd() - 0.5) * 6 * j;
    const total = m.width(l.text) || 1;
    let cx = x;
    for (const ch of l.text) {
      const w = charWidth(ctx, ch);
      if (ch.trim()) {
        const dy = (rnd() - 0.5) * 5 * j + drift * ((cx - x) / total);
        const rot = (rnd() - 0.5) * 0.09 * j;
        const sc = 1 + (rnd() - 0.5) * 0.06 * j;
        ctx.save();
        ctx.translate(cx, y + dy);
        ctx.rotate(rot);
        ctx.scale(sc, sc);
        ctx.globalAlpha = 0.93 + rnd() * 0.07;
        ctx.fillText(ch, 0, 0);
        // zweiter, leicht versetzter Zug mit geringer Deckkraft (Tinteneffekt)
        ctx.globalAlpha = 0.22;
        ctx.fillText(ch, 0.9, 0.5);
        ctx.restore();
      }
      cx += w + (rnd() - 0.5) * 1.6 * j;
    }
    if (l.bold) {
      ctx.save();
      ctx.lineWidth = Math.max(2, l.size * 0.05);
      ctx.lineCap = "round";
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo(x - 4, y + l.size * 0.14);
      ctx.quadraticCurveTo(x + total / 2, y + l.size * 0.14 + (rnd() - 0.5) * 10, x + total + 6, y + l.size * 0.1);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Tinten-Modus: Zeile als Liste von Strichen (Pixelkoordinaten) aufbauen – dieselbe
  // Variation wie im PDF-Modus, nur aus den skelettierten Zeichen statt aus fillText.
  function inkLineStrokes(m, l, x, y, rnd, out, g) {
    const j = state.jitter;
    const toGn = GN_SCALE / g.k; // px -> Goodnotes-Einheiten
    m.setSize(l.size, l.bold);
    const drift = (rnd() - 0.5) * 6 * j;
    const total = m.width(l.text) || 1;
    let pen = x;
    for (const ch of l.text) {
      const adv = m.width(ch);
      if (ch.trim()) {
        const dy = (rnd() - 0.5) * 5 * j + drift * ((pen - x) / total);
        const rot = (rnd() - 0.5) * 0.09 * j;
        const sc = (1 + (rnd() - 0.5) * 0.06 * j) * l.size;
        const cos = Math.cos(rot) * sc, sin = Math.sin(rot) * sc;
        let glyph = glyphSkeleton(l.bold, ch).strokes;
        if (isHand() && state.handVary > 0) glyph = varyGlyph(glyph, rnd);
        for (const st of glyph) {
          out.push({
            pts: st.pts.map(([gx, gy]) => [pen + gx * cos - gy * sin, y + dy + gx * sin + gy * cos]),
            width: st.w * sc * state.weight * toGn,
          });
        }
      }
      pen += adv + (rnd() - 0.5) * 1.6 * j;
    }
    if (l.bold) {
      // Überschrift von Hand unterstreichen
      const uy = y + l.size * 0.14;
      out.push({
        pts: [[x - 4, uy], [x + total / 2, uy + (rnd() - 0.5) * 5], [x + total + 6, uy - l.size * 0.04]],
        width: Math.max(2, l.size * 0.05) * state.weight * toGn,
      });
    }
  }

  /* Eigene Handschrift: Jedes Vorkommen eines Zeichens wird leicht verformt, damit nicht jedes
     „a“ gleich aussieht – sanfte Wellen über das Zeichen, kleine Verschiebung je Strich und eine
     etwas andere Breite. Werte in Geviert-Einheiten. */
  function varyGlyph(strokes, rnd) {
    const v = state.handVary;
    const a = 0.018 * v;
    const fx = 4 + rnd() * 6, fy = 4 + rnd() * 6, px = rnd() * 6.283, py = rnd() * 6.283;
    const sx = 1 + (rnd() - 0.5) * 0.1 * v, sy = 1 + (rnd() - 0.5) * 0.06 * v;
    const slant = (rnd() - 0.5) * 0.08 * v;
    return strokes.map((st) => {
      const ox = (rnd() - 0.5) * a, oy = (rnd() - 0.5) * a;
      return {
        ...st,
        pts: st.pts.map(([x, y]) => [
          x * sx - y * slant + ox + a * Math.sin(fy * y + px),
          y * sy + oy + a * Math.sin(fx * x + py),
        ]),
      };
    });
  }

  function drawInkStrokes(ctx, strokes, g) {
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle = state.ink;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const st of strokes) {
      const lw = (st.width / GN_SCALE) * g.k;
      if (st.pts.length === 1) {
        ctx.beginPath();
        ctx.arc(st.pts[0][0], st.pts[0][1], lw / 2, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(st.pts[0][0], st.pts[0][1]);
      for (let i = 1; i < st.pts.length; i++) ctx.lineTo(st.pts[i][0], st.pts[i][1]);
      ctx.stroke();
    }
    ctx.restore();
  }

  function renderPages(text) {
    const g = geometry();
    const m = makeMeasurer();
    const pages = layout(m, text, g);
    const ink = state.mode === "ink";
    let seed = 1;
    const inkPages = [];

    const canvases = pages.map((lines, pi) => {
      const c = document.createElement("canvas");
      c.width = g.W; c.height = g.H;
      const ctx = c.getContext("2d");
      drawPaper(ctx, g);
      ctx.textBaseline = "alphabetic";
      const strokes = [];
      for (const l of lines) {
        const rnd = mulberry32(seed++ * 7919 + pi);
        if (l.kind === "blank") continue;
        const x = g.left + l.indent + (rnd() - 0.5) * 6 * state.jitter;
        const y = g.baseline(l.slot);
        if (ink) {
          if (l.bullet) strokes.push({ pts: [[g.left + l.indent * 0.35, y - g.base * 0.22]], width: g.base * 0.16 * GN_SCALE / g.k });
          inkLineStrokes(m, l, x, y, rnd, strokes, g);
        } else {
          ctx.fillStyle = ctx.strokeStyle = state.ink;
          if (l.bullet) {
            ctx.beginPath();
            ctx.arc(g.left + l.indent * 0.35, y - g.base * 0.22, g.base * 0.08, 0, Math.PI * 2);
            ctx.fill();
          }
          drawOutlineLine(ctx, m, l, x, y, rnd, g);
        }
      }
      if (ink) {
        drawInkStrokes(ctx, strokes, g);
        inkPages.push(strokes);
      } else if (pages.length > 1) {
        ctx.fillStyle = state.ink;
        ctx.globalAlpha = 0.5;
        ctx.font = fontSpec(Math.round(g.base * 0.6), false);
        ctx.textAlign = "right";
        ctx.fillText(`${pi + 1}/${pages.length}`, g.W - 30 * g.k, g.H - 12 * g.k);
        ctx.globalAlpha = 1;
        ctx.textAlign = "left";
      }
      return c;
    });
    return { canvases, inkPages, k: g.k };
  }

  /* ---------- Export ---------- */

  const canvasToBlob = (c, type, q) => new Promise((res) => c.toBlob(res, type, q));

  function buildPdf(canvases) {
    const [w, h] = pageSize();
    const orientation = w > h ? "landscape" : "portrait";
    const pdf = new window.jspdf.jsPDF({ unit: "pt", format: [w, h], orientation, compress: true });
    canvases.forEach((c, i) => {
      if (i > 0) pdf.addPage([w, h], orientation);
      pdf.addImage(c.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, w, h, undefined, "FAST");
    });
    return new Uint8Array(pdf.output("arraybuffer"));
  }

  async function buildThumbnail(page, zip) {
    let tw = 320, th = Math.round(320 * page.height / page.width);
    const old = zip.file("thumbnail.jpg");
    if (old) {
      try {
        const bmp = await createImageBitmap(await old.async("blob"));
        tw = bmp.width; th = bmp.height; bmp.close();
      } catch (_) {}
    }
    const c = document.createElement("canvas");
    c.width = tw; c.height = th;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, tw, th);
    const s = Math.min(tw / page.width, th / page.height);
    const dw = page.width * s, dh = page.height * s;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(page, (tw - dw) / 2, (th - dh) / 2, dw, dh);
    return new Uint8Array(await (await canvasToBlob(c, "image/jpeg", 0.85)).arrayBuffer());
  }

  function newUuid() {
    return (crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    })).toUpperCase();
  }

  /* Neue IDs vergeben. Goodnotes leitet manche IDs voneinander ab (gleicher Anfang, nur die
     letzten Stellen unterscheiden sich, z. B. …4099 und …4098). Deshalb wird nur der vordere
     Teil ersetzt und die letzten vier Zeichen bleiben stehen, so bleibt diese Beziehung erhalten. */
  function makeRemapper() {
    const stems = new Map();
    return (s) => s.replace(UUID_RE, (u) => {
      if (KEEP_IDS.has(u)) return u;
      const stem = u.slice(0, -4);
      if (!stems.has(stem)) stems.set(stem, newUuid().slice(0, -4));
      return stems.get(stem) + u.slice(-4);
    });
  }

  // Striche einer Seite (Vorschau-Pixel) -> Datensätze für notes/<ID>.
  function inkNoteRecords(strokes, author, k) {
    const f = GN_SCALE / k; // px -> pt -> Goodnotes-Einheiten
    const rgba = [...hexToRgb(state.ink), 1];
    return pb.concat(strokes.map((st, i) => strokeRecords(
      { pts: st.pts.map(([x, y]) => [x * f, y * f]), width: st.width, rgba }, author, 1000 + i, i)));
  }

  // pages: Vorschau-Canvas; inkStrokes: Striche (nur Tinten-Modus, sonst null)
  async function buildGoodnotes(t, pages, inkStrokes) {
    const src = await JSZip.loadAsync(t.bytes); // frische Kopie, Vorlage bleibt unberührt
    const thumb = await buildThumbnail(pages[0], src);
    let pdfBytes = null, notes = null;
    if (inkStrokes) {
      const author = authorOf(await src.file("index.events.pb").async("uint8array"));
      const existing = await src.file(t.notePath).async("uint8array");
      notes = pb.concat([existing, inkNoteRecords(inkStrokes, author, lastK)]);
    } else {
      pdfBytes = buildPdf(pages);
    }
    const remap = makeRemapper();

    const out = new JSZip();
    for (const name of Object.keys(src.files).filter((n) => !src.files[n].dir)) {
      let data;
      if (name === t.pdfPath && pdfBytes) data = pdfBytes;
      else if (name === t.notePath && notes) data = notes;
      else if (name === "thumbnail.jpg") data = thumb;
      else data = await src.file(name).async("uint8array");

      if (name.endsWith(".pb") || name.startsWith("notes/") || name.startsWith("search/")) {
        data = latin1.encode(remap(latin1.decode(data)));
      }
      out.file(remap(name), data, { compression: "DEFLATE", compressionOptions: { level: 6 }, date: new Date(), createFolders: false });
    }
    return out.generateAsync({ type: "blob", mimeType: "application/octet-stream" });
  }

  // Gespeicherte Handschrift (ganzzahlig, 1/1000 Geviert) -> Laufzeitformat mit geglätteten Strichen
  function unpackHand(data) {
    const glyphs = {};
    for (const [ch, g] of Object.entries((data && data.glyphs) || {})) {
      glyphs[ch] = {
        adv: g.a / 1000,
        raw: g.s,
        strokes: g.s.map((flat) => {
          let pts = [];
          for (let i = 0; i + 1 < flat.length; i += 2) pts.push([flat[i] / 1000, flat[i + 1] / 1000]);
          if (pts.length > 2) pts = chaikin(chaikin(pts));
          return pts;
        }),
      };
    }
    return { glyphs };
  }

  const HAND_CHARS = [
    ..."abcdefghijklmnopqrstuvwxyzäöüß",
    ..."ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜ",
    ..."0123456789",
    ...".,:;!?-()\"'/+=&%",
  ];

  /* ---------- Schnittstelle für die Oberfläche ---------- */

  let lastK = 1; // Maßstab (px pro pt) der zuletzt gerenderten Vorschau; buildGoodnotes rechnet damit um

  return {
    state, PAPERS, HAND_ID, HAND_W, HAND_CHARS,
    isHand, fontSpec, pageSize, activeTemplate, inspectTemplate,
    /** Text setzen und alle Seiten rendern: { canvases, inkPages, k } */
    render(text) {
      const r = renderPages(text);
      lastK = r.k;
      return r;
    },
    buildGoodnotes, buildPdf,
    download, safeName, latin1, rdp, chaikin, unpackHand,
  };
}
