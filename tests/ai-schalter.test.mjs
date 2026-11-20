/* Test: KI-Schalter (config.aiEnabled) – ausgeschaltete KI-Tools sind für niemanden offen. Start: npm test */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { config } from "../js/config.js";
import { tools, toolById } from "../js/tools.js";
import { isLocked } from "../js/lock.js";

const require = createRequire(import.meta.url);
const AI_TOOLS = ["mindmap", "kichat", "aufgaben", "abschreiben"];

test("Der KI-Schalter ist aus", () => {
  assert.equal(config.aiEnabled, false);
});

test("KI-Tools sind ausgeschaltet und für niemanden offen, auch nicht für Tester, Ki-Tester und Admin", () => {
  for (const id of AI_TOOLS) {
    const t = toolById(id);
    assert.ok(t && t.ai && t.off, `${id} ist als KI-Tool markiert und aus`);
    assert.equal(isLocked(t, { tester: true, kiTester: true, admin: true }), true, id);
    assert.equal(isLocked(t, true), true, id);
  }
});

test("Alle anderen Tools bleiben unverändert", () => {
  for (const t of tools.filter((x) => !AI_TOOLS.includes(x.id))) assert.ok(!t.off && !t.ai, t.id);
  assert.equal(isLocked(toolById("notenrechner"), false), false);
  assert.equal(isLocked(toolById("karteikarten"), false), false);
});

test("Die Seiten der KI-Tools laden ihr Modul nur über den Schalter", () => {
  for (const id of AI_TOOLS) {
    const html = readFileSync(new URL(`../tools/${id}/index.html`, import.meta.url), "utf8");
    assert.ok(html.includes('src="/js/ai-tool.js"') && html.includes(`data-ai-module="/tools/${id}/`), id);
    assert.ok(!new RegExp(`<script type="module" src="/tools/${id}/`).test(html), `${id} lädt sein Modul nicht direkt`);
  }
});

test("Die KI-Functions sind in Appwrite deaktiviert", () => {
  const cfg = JSON.parse(readFileSync(new URL("../appwrite.config.json", import.meta.url), "utf8"));
  for (const id of ["mindmap", "abschreiben", "aufgaben", "ki-chat"]) assert.equal(cfg.functions.find((f) => f.$id === id).enabled, false, id);
  assert.equal(cfg.functions.find((f) => f.$id === "lehrer-schmidt").enabled, true, "Videosuche ist keine KI");
});

test("Push: Mindmap-Erinnerung nur mit AI_ENABLED", () => {
  const { groupsFor } = require("../functions/push-daily/lib.js");
  const rows = [{ targetId: "d", cards: false, cardsHour: 8, mindmap: true, mindmapHour: 8 }];
  assert.equal(groupsFor(rows, 8).length, 0);
  assert.equal(groupsFor(rows, 8, { ai: true }).length, 1);
});
