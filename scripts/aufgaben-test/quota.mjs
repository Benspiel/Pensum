/* Tageszähler der Function „aufgaben“ für ein Konto lesen und setzen (Tabelle aufgaben_usage, per Appwrite-CLI).
 * Gedacht für Tests mit dem eigenen Konto: Der Zähler wird zurückgesetzt, damit mehr als 2 Testläufe pro Tag möglich sind,
 * und am Ende auf den ursprünglichen Wert zurückgestellt.
 *
 *   node scripts/aufgaben-test/quota.mjs get   <userId>
 *   node scripts/aufgaben-test/quota.mjs set   <userId> <runs>
 *   node scripts/aufgaben-test/quota.mjs loop  <userId> <sekunden>    setzt alle 2,5 s auf 0 (im Hintergrund starten) */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
const lib = createRequire(import.meta.url)("../../functions/aufgaben/lib.js");

const [cmd, userId, arg] = process.argv.slice(2);
if (!cmd || !userId) { console.error("Aufruf: quota.mjs get|set|loop <userId> [runs|sekunden]"); process.exit(1); }
const rowId = () => lib.usageId(userId, lib.berlinDay());
// Über bash starten, damit die Anführungszeichen in --data überall gleich ankommen (die Windows-Shell versteht einfache nicht)
const cli = (args) => execFileSync("bash", ["-c", `appwrite tablesdb ${args}`], { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
const base = (id) => `--database-id pensum --table-id aufgaben_usage --row-id ${id}`;

function get() { try { return JSON.parse(cli(`get-row ${base(rowId())} --json`)).runs ?? 0; } catch { return null; } } // null: noch keine Zeile heute
function set(n) { try { cli(`update-row ${base(rowId())} --data '{"runs":${Number(n)}}'`); return true; } catch { return false; } }

if (cmd === "get") console.log(get());
else if (cmd === "set") console.log(set(arg) ? "ok" : "keine Zeile (noch nicht benutzt)");
else if (cmd === "loop") {
  const until = Date.now() + Number(arg || 600) * 1000;
  while (Date.now() < until) { set(0); await new Promise((r) => setTimeout(r, 2500)); }
}
