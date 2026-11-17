/* Aufgaben – Datei-Upload.
 * Nachbau von „File Upload“ (Kokonut UI, MIT): eine Ablagefläche zum Klicken, Ziehen oder Einfügen (Strg+V) und darunter
 * eine Dateizeile mit Vorschaubild, Fortschrittsbalken, Fehlermeldung mit „Nochmal“ und Entfernen-Knopf.
 * Hier gibt es immer nur ein Blatt: eine neue Datei ersetzt die alte. „Hochladen“ heißt in dieser App: das Blatt im
 * Browser vorbereiten (verkleinern, PDF-Seite rendern). Nichts wird an einen Server gesendet. */

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const bytes = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1).replace(".", ",")} MB`);
const isPdf = (f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name || "");
const isImage = (f) => /^image\//.test(f.type || "");

const ICON_UP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5"/><path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"/></svg>';
const ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
const ICON_RETRY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>';
const ICON_OK = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.5 8.5 6.5 11.5 12.5 4.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/**
 * @param {HTMLElement} root
 * @param {object} opts
 * @param {string} [opts.accept]            Wert für das Dateifeld, z. B. "image/*,application/pdf,.pdf"
 * @param {number} [opts.maxBytes]          größte erlaubte Dateigröße
 * @param {(file: File, h: { onProgress: (percent: number) => void, signal: AbortSignal }) => Promise<void>} opts.onFile
 *        bereitet die Datei vor; bei einem Fehler mit verständlicher Meldung ablehnen (Error.message wird angezeigt)
 * @param {(file: File) => void} [opts.onRemove]  Zeile wurde entfernt (auch beim Ersetzen durch eine neue Datei)
 */
export function createFileUpload(root, { accept = "image/*,application/pdf,.pdf", maxBytes = 25 * 1048576, onFile, onRemove = () => {} }) {
  root.classList.add("fu");
  root.innerHTML =
    `<button type="button" class="fu-zone"><span class="fu-zone-ico">${ICON_UP}</span>` +
    `<span class="fu-zone-text"><span class="fu-zone-title"></span><span class="fu-zone-hint"></span></span></button>` +
    `<ul class="fu-list" aria-live="polite"></ul>` +
    `<input type="file" class="sr-only" tabindex="-1" aria-hidden="true" accept="${esc(accept)}">`;
  const zone = root.querySelector(".fu-zone"), title = root.querySelector(".fu-zone-title"), hint = root.querySelector(".fu-zone-hint");
  const list = root.querySelector(".fu-list"), input = root.querySelector("input");

  let item = null, disabled = false, dragDepth = 0;

  const paintZone = () => {
    title.textContent = item ? "Anderes Blatt wählen oder hierher ziehen" : "Blatt hierher ziehen oder auswählen";
    hint.textContent = `Bild oder PDF · bis ${bytes(maxBytes)} · auch mit Strg+V einfügen`;
    zone.disabled = disabled;
    root.classList.toggle("is-disabled", disabled);
    root.classList.toggle("has-file", !!item);
  };

  const statusText = (it) => (it.status === "uploading" ? `Wird vorbereitet · ${Math.round(it.progress)} %` : it.status === "done" ? `Bereit · ${bytes(it.file.size)}` : it.error || "Das hat nicht geklappt.");

  function paintRow() {
    if (!item) { list.replaceChildren(); return; }
    let li = list.firstElementChild;
    if (!li || li.dataset.id !== item.id) {
      li = document.createElement("li");
      li.className = "fu-row";
      li.dataset.id = item.id;
      const thumb = isImage(item.file) ? `<span class="fu-thumb" style="background-image:url('${item.thumb}')"></span>` : `<span class="fu-thumb fu-ext">${isPdf(item.file) ? "PDF" : "DATEI"}</span>`;
      li.innerHTML =
        `${thumb}<div class="fu-info"><p class="fu-name"></p><p class="fu-status"></p></div>` +
        `<div class="fu-actions"><span class="fu-ok" hidden>${ICON_OK}</span><button type="button" class="fu-btn fu-retry" hidden aria-label="Nochmal versuchen">${ICON_RETRY}<span>Nochmal</span></button>` +
        `<button type="button" class="fu-btn fu-remove" aria-label="Datei entfernen">${ICON_X}</button></div>` +
        `<div class="fu-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"><span class="fu-bar-fill"></span></div>`;
      li.querySelector(".fu-name").textContent = item.file.name || "Foto";
      li.querySelector(".fu-retry").addEventListener("click", () => run(item));
      li.querySelector(".fu-remove").addEventListener("click", remove);
      list.replaceChildren(li);
    }
    li.dataset.status = item.status;
    const st = li.querySelector(".fu-status");
    st.textContent = statusText(item);
    st.classList.toggle("is-error", item.status === "error");
    li.querySelector(".fu-ok").hidden = item.status !== "done";
    li.querySelector(".fu-retry").hidden = item.status !== "error" || !item.retry;
    li.querySelector(".fu-bar").hidden = item.status === "error";
    li.querySelector(".fu-bar").setAttribute("aria-valuenow", String(Math.round(item.progress)));
    li.querySelector(".fu-bar-fill").style.transform = `scaleX(${Math.min(1, item.progress / 100)})`;
  }

  function drop() {
    if (!item) return;
    item.ctrl && item.ctrl.abort();
    clearInterval(item.creep);
    if (item.thumb) URL.revokeObjectURL(item.thumb);
    const f = item.file;
    item = null;
    onRemove(f);
  }
  function remove() { drop(); paintRow(); paintZone(); }

  async function run(it) {
    it.status = "uploading"; it.error = ""; it.progress = 0;
    it.ctrl = new AbortController();
    clearInterval(it.creep);
    // Die Vorbereitung meldet nur grobe Schritte; dazwischen kriecht der Balken langsam Richtung 90 %, damit man sieht, dass etwas läuft
    it.creep = setInterval(() => { if (item === it && it.status === "uploading" && it.progress < 90) { it.progress += (90 - it.progress) * 0.08; paintRow(); } }, 200);
    paintRow();
    const signal = it.ctrl.signal;
    try {
      await onFile(it.file, { signal, onProgress: (p) => { if (item === it && p > it.progress) { it.progress = Math.min(100, p); paintRow(); } } });
      if (item !== it) return;
      it.status = "done"; it.progress = 100;
    } catch (e) {
      if (item !== it || signal.aborted) return;
      it.status = "error"; it.retry = true; it.error = (e && e.message) || "Das hat nicht geklappt.";
    } finally {
      clearInterval(it.creep);
    }
    paintRow();
  }

  /** Neue Datei: ersetzt das bisherige Blatt. */
  function add(file) {
    if (!file || disabled) return;
    drop();
    item = { id: Math.random().toString(36).slice(2), file, status: "uploading", progress: 0, error: "", retry: false, thumb: isImage(file) ? URL.createObjectURL(file) : "" };
    paintZone();
    if (!isPdf(file) && !isImage(file)) {
      item.status = "error"; item.error = "Das ist weder Bild noch PDF. Mach ein Foto oder einen Screenshot vom Blatt oder wähle ein PDF.";
    } else if (file.size > maxBytes) {
      item.status = "error"; item.error = `Die Datei ist zu groß (${bytes(file.size)}). Erlaubt sind bis zu ${bytes(maxBytes)}.`;
    } else { run(item); return; }
    paintRow();
  }

  zone.addEventListener("click", () => input.click());
  input.addEventListener("change", () => { add(input.files[0]); input.value = ""; });

  const hasFiles = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes("Files");
  zone.addEventListener("dragenter", (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; root.classList.add("is-drag"); });
  zone.addEventListener("dragover", (e) => { if (hasFiles(e)) e.preventDefault(); });
  zone.addEventListener("dragleave", () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) root.classList.remove("is-drag"); });
  zone.addEventListener("drop", (e) => { e.preventDefault(); dragDepth = 0; root.classList.remove("is-drag"); add(e.dataTransfer && e.dataTransfer.files[0]); });
  // Einfügen mit Strg+V (Screenshot oder kopierte Datei), solange die Fläche sichtbar ist
  document.addEventListener("paste", (e) => {
    if (disabled || !root.offsetParent || (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))) return;
    const f = e.clipboardData && [...(e.clipboardData.files || [])][0];
    if (f) { e.preventDefault(); add(f); }
  });

  paintZone();
  return {
    add,
    clear: remove,
    setDisabled(d) { disabled = !!d; paintZone(); },
    /** Die aktuell gewählte Datei (oder null). */
    get file() { return item && item.file; },
  };
}
