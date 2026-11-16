import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { cleanTopic, mapResults, searchUrl, createCache } = createRequire(import.meta.url)("../functions/lehrer-schmidt/lib.js");

test("cleanTopic säubert und kürzt", () => {
  assert.equal(cleanTopic("  Satz   des\nPythagoras \u0007"), "Satz des Pythagoras");
  assert.equal(cleanTopic(null), "");
  assert.equal(cleanTopic("x".repeat(500)).length, 100);
});

test("mapResults: nur gültige Video-IDs, Entities decodiert", () => {
  const out = mapResults({ items: [
    { id: { videoId: "abcdefghijk" }, snippet: { title: "Mathe &amp; mehr &#39;Test&#39;", channelTitle: "Lehrer Schmidt", publishedAt: "2020-01-02T03:04:05Z" } },
    { id: { videoId: "kurz" }, snippet: { title: "x" } },
    { id: { channelId: "UC1" }, snippet: {} },
    null,
  ] });
  assert.equal(out.length, 1);
  assert.equal(out[0].title, "Mathe & mehr 'Test'");
  assert.equal(out[0].published, "2020-01-02");
  assert.deepEqual(mapResults(null), []);
});

test("searchUrl enthält Kanal, Thema und Sicherheitsfilter", () => {
  const u = new URL(searchUrl({ topic: "Brüche", channelId: "UC123", key: "K" }));
  assert.equal(u.searchParams.get("channelId"), "UC123");
  assert.equal(u.searchParams.get("q"), "Brüche");
  assert.equal(u.searchParams.get("safeSearch"), "strict");
  assert.equal(u.searchParams.get("videoEmbeddable"), "true");
});

test("Cache läuft ab", () => {
  let t = 0;
  const c = createCache(1000, 2, () => t);
  c.set("a", 1);
  assert.equal(c.get("a"), 1);
  t = 1001;
  assert.equal(c.get("a"), undefined);
});
