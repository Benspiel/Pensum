/* Lokal gehostete, touchfähige Spiele aus GH Arcade (MIT). */
export const LOCAL_GAMES = [
  { id: 'chess', title: 'Schach', category: 'Schach', description: 'Gegen den Computer', preview: '/tools/spiele/chess/vorschau.png', url: '/tools/spiele/chess/index.html' },
  { id: 'golf', title: 'Neon Golf', category: 'Sport', description: 'Minigolf mit Hindernissen', color: 'blue' },
  { id: 'tanks', title: 'Neon Tanks', category: 'Action', description: 'Duell gegen den Computer', color: 'orange' },
  { id: 'bubbles', title: 'Neon Bubbles', category: 'Geschick', description: 'Zielen und Blasen platzen lassen', color: 'pink' },
  { id: 'match', title: 'Neon Match', category: 'Geschick', description: 'Kombiniere leuchtende Steine', color: 'violet' },
  { id: 'hop', title: 'Neon Hop', category: 'Action', description: 'Überquere Straße und Fluss', color: 'green' },
  { id: 'lander', title: 'Neon Lander', category: 'Geschick', description: 'Lande dein Raumschiff', color: 'coral' },
  { id: 'pinball', title: 'Neon Pinball', category: 'Action', description: 'Flipper mit leuchtenden Effekten', color: 'violet' },
  { id: 'crates', title: 'Neon Crates', category: 'Geschick', description: 'Kisten clever verschieben', color: 'blue' },
];
export const localUrl = game => game.url || `/tools/spiele/arcade/games/${game.id}/index.html`;
