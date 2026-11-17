/* Spiele – Vier gewinnt gegen den Computer. Die Regeln liegen in connect4.js (ohne Oberfläche, getestet). */
import { best, host, reduceMotion, segmented, bar, haptic } from "./common.js";
import * as C4 from "./connect4.js";

const root = (cls) => { const el = document.createElement("div"); el.className = cls; host.stage.append(el); return el; };
const digits = (e) => (/^[1-9]$/.test(e.key) ? Number(e.key) : null);

/* ---------- Vier gewinnt ---------- */

const C4_LEVELS = { leicht: { depth: 2, label: "Leicht" }, mittel: { depth: 4, label: "Mittel" }, schwer: { depth: 6, label: "Schwer" } };

export function makeConnect4() {
  let level = "mittel", board, over, thinking, win = null, lastDrop = null, aiTimer = 0;
  const wrap = root("c4");
  const levelBar = segmented(Object.entries(C4_LEVELS).map(([id, l]) => [id, l.label]), level, (id) => { level = id; restart(); }, "Stärke des Computers");
  const boardEl = document.createElement("div"); boardEl.className = "c4-board"; boardEl.setAttribute("role", "group"); boardEl.setAttribute("aria-label", "Vier gewinnt");
  wrap.append(bar(levelBar), boardEl);
  const key = () => "c4wins_" + level;
  const chips = () => host.chips([["Du", "gelb"], ["Computer", "rot"], ["Siege hier", best.get(key()) || 0]]);
  function render() {
    const winCells = new Set((win ? win.cells : []).map(([r, c]) => r + "," + c));
    boardEl.innerHTML = [...Array(C4.COLS).keys()].map((c) => `<button class="c4-col" type="button" data-c="${c}" aria-label="Spalte ${c + 1}${board[0][c] ? ", voll" : ""}" ${over || thinking || board[0][c] ? "disabled" : ""}>${
      [...Array(C4.ROWS).keys()].map((r) => { const v = board[r][c]; return `<span class="c4-disc${v ? " p" + v : ""}${winCells.has(r + "," + c) ? " is-win" : ""}${lastDrop && lastDrop[0] === r && lastDrop[1] === c && !reduceMotion() ? " is-drop" : ""}" style="--fall:${r + 1}"></span>`; }).join("")}</button>`).join("");
    chips();
  }
  function end(w) {
    over = true; win = w; render();
    if (!w) host.overlay("Unentschieden", "Das Brett ist voll.");
    else if (w.player === 1) { best.set(key(), (best.get(key()) || 0) + 1); render(); host.overlay("Du gewinnst!", "Vier in einer Reihe."); }
    else host.overlay("Der Computer gewinnt", "Probier es noch einmal.");
  }
  function play(col, player) {
    const r = C4.drop(board, col, player);
    if (!r) return false;
    board = r.board; lastDrop = [r.row, col];
    const w = C4.winner(board);
    if (w) { end(w); return true; }
    if (C4.isFull(board)) { end(null); return true; }
    return true;
  }
  function human(col) {
    if (over || thinking) return;
    if (!play(col, 1)) return;
    haptic(over ? [20, 40, 20] : 10);
    if (over) return;
    thinking = true; render();
    aiTimer = setTimeout(() => { thinking = false; play(C4.aiMove(board, 2, C4_LEVELS[level].depth), 2); if (!over) render(); }, 350);
  }
  function restart() { clearTimeout(aiTimer); host.clearOverlay(); board = C4.emptyBoard(); over = false; thinking = false; win = null; lastDrop = null; render(); }
  boardEl.addEventListener("click", (e) => { const b = e.target.closest("[data-c]"); if (b) human(Number(b.dataset.c)); });
  host.controls("");
  restart();
  return {
    restart, canPause: false,
    key(e) { const n = digits(e); if (n && n <= 7) { human(n - 1); return true; } return false; },
    destroy() { clearTimeout(aiTimer); wrap.remove(); },
  };
}
