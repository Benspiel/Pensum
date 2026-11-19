/* Karteikarten mit KI (nur Team „ki-tester“): Karten aus Thema, Text, Foto (z. B. Vokabelseite) oder PDF erstellen lassen.
 * Die Function ki-chat (Aktion „cards“) prüft das Team und die E-Mail-Bestätigung selbst und speichert nichts. */
import { client, authMessage } from "/js/auth.js";
import { Functions, ExecutionMethod } from "/vendor/appwrite.js";
import { config } from "/js/config.js";
import { fitSize, MAX_BASE64, QUALITIES } from "/tools/abschreiben/core.js";

export const MAX_FILE = 12 * 1024 * 1024; // Foto vom Handy, wird vor dem Senden verkleinert
export const MAX_PDF = 2.5 * 1024 * 1024; // PDFs gehen unverändert hin
export const COUNTS = [10, 15, 20, 30, 40, 60];

/** Fragt die KI. Wirft Error mit einer Meldung, die man anzeigen darf. */
export async function generateCards({ text, image, count }) {
  let ex;
  try {
    ex = await new Functions(client).createExecution({
      functionId: config.functions.kiChat,
      body: JSON.stringify({ action: "cards", text, image, count }),
      async: false,
      method: ExecutionMethod.POST,
    });
  } catch (e) {
    if (e && e.code === 404) throw new Error("Der KI-Dienst ist noch nicht eingerichtet.");
    throw new Error(authMessage(e));
  }
  let data = null;
  try { data = JSON.parse(ex.responseBody); } catch (_) { /* kein JSON */ }
  if (!data || !data.ok) throw new Error((data && data.error) || "Die KI antwortet gerade nicht. Versuch es später noch einmal.");
  return data.cards || [];
}

const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(",")[1] || "");
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});
const toBlob = (canvas, q) => new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", q));
const loadImage = (file) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode")); };
  img.src = url;
});

/** Datei → { base64, name, pdf }. Bilder werden verkleinert (Kameradrehung wird übernommen), PDFs unverändert gesendet. */
export async function prepareFile(file) {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (isPdf) {
    if (file.size > MAX_PDF) throw new Error("Das PDF ist zu groß (höchstens ca. 2,5 MB).");
    return { base64: await blobToBase64(file), name: file.name, pdf: true };
  }
  if (!/^image\//.test(file.type)) throw new Error("Nimm ein Foto (JPEG, PNG, WebP) oder ein PDF.");
  if (file.size > MAX_FILE) throw new Error("Das Bild ist zu groß. Wähle ein kleineres Bild.");
  let source;
  try { source = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch (_) { try { source = await loadImage(file); } catch (__) { throw new Error("Dieses Bild kann der Browser nicht öffnen."); } }
  const { width, height } = fitSize(source.width || source.naturalWidth, source.height || source.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  if (source.close) source.close();
  for (const q of QUALITIES) {
    const blob = await toBlob(canvas, q);
    if (!blob) break;
    const base64 = await blobToBase64(blob);
    if (base64.length <= MAX_BASE64) return { base64, name: file.name, pdf: false };
  }
  throw new Error("Das Bild ist zu groß. Wähle ein kleineres Bild.");
}
