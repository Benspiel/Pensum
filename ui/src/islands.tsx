/* React-Inseln für Pensum (KokonutUI). Die Seiten bleiben reines HTML/JS und laden diese Datei erst bei Bedarf:
 *   const ui = await import("/vendor/ui/islands.js");
 *   const tabs = ui.mountTabs(element, { items, value, label, onChange });  tabs.update({ ... });
 *   const hold = ui.mountHold(element, { label, onComplete });
 * Gebaut wird mit `npm run build` im Ordner ui/ (Ausgabe: vendor/ui/islands.js und islands.css). */
import { createRoot } from "react-dom/client";
import SmoothTab, { type SwipeTabItem } from "@/components/kokonutui/smooth-tab";
import HoldButton from "@/components/kokonutui/hold-button";
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
