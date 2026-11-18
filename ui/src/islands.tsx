/* React-Inseln für Pensum (KokonutUI). Die Seiten bleiben reines HTML/JS und laden diese Datei erst bei Bedarf:
 *   const ui = await import("/vendor/ui/islands.js");
 *   const tabs = ui.mountTabs(element, { items, value, label, onChange });  tabs.update({ ... });
 *   const hold = ui.mountHold(element, { label, onComplete });
 *   const wait = ui.mountLoading(element, { steps });  wait.update({ steps });   // Schritte der KI beim Warten
 *   const drop = ui.mountDropzone(element, { onFile, resetKey });  drop.update({ ... });   // Ablagefläche beim Hereinziehen einer Datei
 *   ui.showToast(task, options);  ui.dismissToast(id);   // Promise Toast (Details: js/promise-toast.js)
 *   const file = ui.mountAttachment(element, { file, status, pagesRead });  file.update({ ... });   // PDF-Karte
 * Gebaut wird mit `npm run build` im Ordner ui/ (Ausgabe: vendor/ui/islands.js und islands.css). */
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import SmoothTab, { type SwipeTabItem } from "@/components/kokonutui/smooth-tab";
import HoldButton from "@/components/kokonutui/hold-button";
import AILoadingState, { type AgentStep } from "@/components/kokonutui/ai-loading";
import { Toaster, usePromiseToast, type PromiseToaster, type ToastOptions, type ToastTask } from "@/components/kokonutui/promise-toast";
import FileUpload from "@/components/kokonutui/file-upload";
import AIAttachment, { type AIAttachmentProps } from "@/components/kokonutui/ai-attachment";
import "./styles.css";

export interface TabsProps {
  items: { id: string; title: string }[];
  value: string;
  label?: string;
  onChange: (id: string) => void;
}

/** Tab-Leiste mit gleitender Anzeige. Die Inhalte zeichnet die Seite selbst. */
export function mountTabs(host: HTMLElement, props: TabsProps) {
  host.classList.add("ui-island");
  const root = createRoot(host);
  const render = (p: TabsProps) =>
    root.render(<SmoothTab bar items={p.items as SwipeTabItem[]} label={p.label ?? "Bereiche"} onChange={p.onChange} value={p.value} />);
  render(props);
  return { update: render, destroy: () => root.unmount() };
}

export interface HoldProps {
  label: string;
  holdingLabel?: string;
  completeLabel?: string;
  onComplete: () => void;
}

/** Button zum Gedrückthalten, z. B. zum Löschen. */
export function mountHold(host: HTMLElement, props: HoldProps) {
  host.classList.add("ui-island");
  const root = createRoot(host);
  root.render(
    <HoldButton
      className="h-12 w-full text-base"
      completeLabel={props.completeLabel ?? "Gelöscht"}
      holdingLabel={props.holdingLabel ?? "Weiter halten …"}
      onHoldComplete={props.onComplete}
      resetAfter={0}
      type="button"
      variant="grey"
    >
      {props.label}
    </HoldButton>,
  );
  return { destroy: () => root.unmount() };
}

/** Schrittliste mit Wellen-Text, Zeit und Protokollzeilen, solange die KI arbeitet. */
export function mountLoading(host: HTMLElement, props: { steps: AgentStep[] }) {
  host.classList.add("ui-island");
  const root = createRoot(host);
  const render = (p: { steps: AgentStep[] }) => root.render(<AILoadingState className="justify-start" collapseWhenDone={false} steps={p.steps} />);
  render(props);
  return { update: render, destroy: () => root.unmount() };
}

/** Karte für eine hochgeladene PDF-Datei: wird Seite für Seite gelesen. */
export function mountAttachment(host: HTMLElement, props: AIAttachmentProps) {
  host.classList.add("ui-island");
  const root = createRoot(host);
  const render = (p: AIAttachmentProps) => root.render(<AIAttachment chipOnly className="max-w-full" {...p} />);
  render(props);
  return { update: render, destroy: () => root.unmount() };
}

/* Promise Toast: ein Toaster für die ganze Seite, unten rechts. Er wird beim ersten Toast angelegt. */
let toaster: PromiseToaster | null = null;

function ToastHost() {
  const t = usePromiseToast();
  toaster = t;
  return <Toaster toaster={t} />;
}

/** Zeigt einen Toast zur Aufgabe (eine Funktion, damit „Nochmal“ sie neu starten kann). Gibt die Toast-ID zurück. */
export function showToast<T>(task: ToastTask<T>, options: ToastOptions<T>): number {
  if (!toaster) {
    const host = document.createElement("div");
    host.className = "ui-island pointer-events-none fixed right-4 bottom-4 z-[2147483000] w-[min(24rem,calc(100vw-2rem))] max-sm:right-2 max-sm:bottom-2";
    document.body.append(host);
    flushSync(() => createRoot(host).render(<ToastHost />));
  }
  return (toaster as PromiseToaster).show(task, options);
}

export function dismissToast(id: number) {
  toaster?.dismiss(id);
}

export interface DropzoneProps {
  /** Die abgelegte (oder gewählte) Datei. Prüfen und anzeigen macht die Seite. */
  onFile: (file: File) => void;
  /** Ändert man den Wert, beginnt die Fläche leer (die Liste der letzten Datei verschwindet). */
  resetKey: number;
}

const DROP_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf", ".pdf"];

/** Ablagefläche („File Upload“): wacht auf, sobald man eine Datei über das Fenster zieht. */
export function mountDropzone(host: HTMLElement, props: DropzoneProps) {
  host.classList.add("ui-island");
  const root = createRoot(host);
  const render = (p: DropzoneProps) =>
    root.render(
      <FileUpload
        acceptedFileTypes={DROP_TYPES}
        className="max-w-none shadow-xl"
        key={p.resetKey}
        maxFileSize={25 * 1024 * 1024}
        maxFiles={1}
        multiple={false}
        onUpload={async (file) => p.onFile(file)}
        uploadDelay={0}
      />,
    );
  render(props);
  return { update: render, destroy: () => root.unmount() };
}
