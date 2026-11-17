
(function () {
'use strict';
var $ = function (id) { return document.getElementById(id); };
var boardEl = $('board'), squaresEl = $('squares'), piecesEl = $('pieces'), promoEl = $('promo'), arrowG = $('arrow-g');
var LEVEL_NAMES = { beginner: 'Beginner', improver: 'Improver', casual: 'Casual', club: 'Club', strong: 'Strong' };
var LEVEL_DESC = {
  beginner: 'Looks one move ahead and makes frequent mistakes.',
  improver: 'Sees simple tactics, but makes occasional mistakes.',
  casual: 'Thinks about half a second per move.',
  club: 'Thinks about 1.5 seconds per move.',
  strong: 'Thinks about 4 seconds per move.'
};

/* =====================================================================
   PIECE GRAPHICS — original Staunton-style SVG set, built into a sprite
   Shape list entries: 'f:<path>' filled outline, 'c:cx,cy,r' filled circle,
   'd:<path>' inner detail line, 'e:cx,cy,r' dot in outline colour.
   ===================================================================== */
var BASE = 'f:M10 40.5h25c.8 0 1.5-.7 1.5-1.5v-1.3c0-1.3-1.1-2.4-2.4-2.4H10.9c-1.3 0-2.4 1.1-2.4 2.4V39c0 .8.7 1.5 1.5 1.5z';
var SHAPES = {
  P: [
    'f:M15.6 35.6c0-4.2 2.4-8.6 5.2-11.4h3.4c2.8 2.8 5.2 7.2 5.2 11.4z',
    'f:M18 24.6h9c.8 0 1.5-.7 1.5-1.5s-.7-1.5-1.5-1.5h-9c-.8 0-1.5.7-1.5 1.5s.7 1.5 1.5 1.5z',
    'c:22.5,16.2,5.3',
    'f:M12.6 40.5h19.8c.8 0 1.5-.7 1.5-1.5v-1c0-1.3-1.1-2.4-2.4-2.4H13.5c-1.3 0-2.4 1.1-2.4 2.4v1c0 .8.7 1.5 1.5 1.5z'
  ],
  R: [
    'f:M14.6 35.6l1.4-16.4h13l1.4 16.4z',
    'f:M13.4 19.6h18.2l-1.6-3.2H15z',
    'f:M12.6 16.6V9.4h4.1v2.7h3.7V9.4h4.2v2.7h3.7V9.4h4.1v7.2z',
    'd:M16.4 23h12.2', 'd:M15.9 31.5h13.2',
    BASE
  ],
  N: [
    'f:M14.2 35.6c-.4-4.9 1.4-8.6 4.6-11.4 1.9-1.6 2.6-3.3 2.2-4.9-1.5 1.3-3.4 2-5.4 2.6-1.8.6-3.4 1.4-4.5.3-1-1-.8-2.6.3-3.8l6-6.6c.9-2.3 2.4-4 4.3-5l.8-3.2 2.4 2.9c6.4.8 10.8 5.6 11.6 13 .7 6.4-.2 11.3-.9 16.1z',
    'e:19.6,13.4,1.1',
    'd:M25.6 8.7c3.6 1.8 6.3 5.6 6.9 11',
    'd:M12.4 19.9l1.4-.6',
    BASE
  ],
  B: [
    'f:M15.4 35.6c1.3-3.1 3.2-5.6 4.2-8.6h5.8c1 3 2.9 5.5 4.2 8.6z',
    'f:M17.4 27.6h10.2c.8 0 1.4-.6 1.4-1.4s-.6-1.4-1.4-1.4H17.4c-.8 0-1.4.6-1.4 1.4s.6 1.4 1.4 1.4z',
    'f:M22.5 9.2c-4.6 3.5-7.1 8-7.1 11.5 0 3.1 2.6 4.6 7.1 4.6s7.1-1.5 7.1-4.6c0-3.5-2.5-8-7.1-11.5z',
    'c:22.5,7.3,2.1',
    'd:M24.8 13.8l-3.6 5.2',
    BASE
  ],
  Q: [
    'f:M15 35.6c.9-3.6 1.3-6.8 1.3-10.3h12.4c0 3.5.4 6.7 1.3 10.3z',
    'f:M15.6 24.4l-3.4-10.2 5.6 6.4.4-9.6 3.3 8.7 1-9.7 1 9.7 3.3-8.7.4 9.6 5.6-6.4-3.4 10.2z',
    'f:M15.3 26.6h14.4c.8 0 1.3-.6 1.3-1.3s-.5-1.3-1.3-1.3H15.3c-.8 0-1.3.6-1.3 1.3s.5 1.3 1.3 1.3z',
    'c:12,12.6,1.9', 'c:18,9.6,1.9', 'c:22.5,8.4,1.9', 'c:27,9.6,1.9', 'c:33,12.6,1.9',
    'd:M16.6 31.4h11.8',
    BASE
  ],
  K: [
    'f:M15.1 35.6c.9-3.6 1.4-7 1.6-10.4h11.6c.2 3.4.7 6.8 1.6 10.4z',
    'f:M15.6 25c-3-2.5-3.9-6.4-1.3-8.4 2.6-2 6.3-.6 8.2 2.6 1.9-3.2 5.6-4.6 8.2-2.6 2.6 2 1.7 5.9-1.3 8.4z',
    'f:M15.5 26.7h14c.8 0 1.3-.6 1.3-1.3s-.5-1.3-1.3-1.3h-14c-.8 0-1.3.6-1.3 1.3s.5 1.3 1.3 1.3z',
    'f:M21.4 5.6h2.2v2.7h2.7v2.2h-2.7v5.6h-2.2v-5.6h-2.7V8.3h2.7z',
    'd:M22.5 19.2v5', 'd:M16.8 31.4h11.4',
    BASE
  ]
};
var PIECE_COLORS = {
  w: { fill: '#f6f1e6', stroke: '#2b2622', detail: 'rgba(43,38,34,.45)' },
  b: { fill: '#2c2926', stroke: '#0f0e0d', detail: 'rgba(255,248,235,.38)' }
};
function shapeMarkup(list, c) {
  var out = '';
  list.forEach(function (s) {
    var k = s[0], v = s.slice(2);
    if (k === 'f') out += '<path d="' + v + '" fill="' + c.fill + '" stroke="' + c.stroke + '" stroke-width="1.5" stroke-linejoin="round"/>';
    else if (k === 'd') out += '<path d="' + v + '" fill="none" stroke="' + c.detail + '" stroke-width="1.2" stroke-linecap="round"/>';
    else {
      var a = v.split(',');
      if (k === 'c') out += '<circle cx="' + a[0] + '" cy="' + a[1] + '" r="' + a[2] + '" fill="' + c.fill + '" stroke="' + c.stroke + '" stroke-width="1.5"/>';
      else out += '<circle cx="' + a[0] + '" cy="' + a[1] + '" r="' + a[2] + '" fill="' + c.stroke + '"/>';
    }
  });
  return out;
}
function buildSprite() {
  var s = '<svg width="0" height="0" style="position:absolute"><defs>';
  ['w', 'b'].forEach(function (col) {
    Object.keys(SHAPES).forEach(function (t) {
      s += '<symbol id="' + col + t + '" viewBox="0 0 45 45">' + shapeMarkup(SHAPES[t], PIECE_COLORS[col]) + '</symbol>';
    });
  });
  $('sprite-host').innerHTML = s + '</defs></svg>';
}
function symbolId(p) { return ((p & 8) ? 'b' : 'w') + 'PNBRQK'[(p & 7) - 1]; }
function pieceSvg(p) { return '<svg viewBox="0 0 45 45" aria-hidden="true"><use href="#' + symbolId(p) + '"/></svg>'; }

/* =====================================================================
   AUDIO — WebAudio synthesis, no files
   ===================================================================== */
var actx = null, muted = false;
function audio() {
  if (!actx) {
    try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
  }
  if (actx.state === 'suspended') actx.resume();
  return actx;
}
function tone(c, freq, t, dur, type, gain) {
  var o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(c.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
function knock(c, t, dur, freq, gain) {
  var n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
  for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
  var src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.4;
  g.gain.value = gain;
  src.buffer = buf; src.connect(f); f.connect(g); g.connect(c.destination);
  src.start(t);
}
function playSound(kind) {
  if (muted) return;
  var c = audio(); if (!c) return;
  var t = c.currentTime + 0.01;
  if (kind === 'move') { knock(c, t, 0.06, 1500, 0.9); tone(c, 190, t, 0.08, 'sine', 0.22); }
  else if (kind === 'capture') { knock(c, t, 0.07, 2300, 1.1); tone(c, 150, t, 0.1, 'triangle', 0.28); knock(c, t + 0.05, 0.05, 1200, 0.6); }
  else if (kind === 'check') { knock(c, t, 0.05, 1500, 0.6); tone(c, 660, t, 0.14, 'sine', 0.16); tone(c, 880, t + 0.1, 0.2, 'sine', 0.14); }
  else if (kind === 'end') { [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) { tone(c, f, t + i * 0.11, 0.7, 'sine', 0.11); }); }
}

/* =====================================================================
   WORKER BOOTSTRAP (main-thread side) — Blob worker with a main-thread
   fallback if workers are unavailable (e.g. restricted file:// setups).
   ===================================================================== */
var worker = null, workerUrl = null, workerFailed = false, reqId = 0, pending = null, localSearcher = null;
function startWorker() {
  if (workerFailed) return;
  try {
    if (!workerUrl) {
      workerUrl = "worker.js";
    }
    worker = new Worker(workerUrl);
    worker.onmessage = function (e) { onEngineResult(e.data); };
    worker.onerror = function (e) {
      if (e && e.preventDefault) e.preventDefault();
      workerFailed = true; worker = null;
      if (pending && !pending.answered) runLocal(pending.req);
    };
  } catch (e) { workerFailed = true; worker = null; }
}
function runLocal(req) {
  setTimeout(function () {
    if (!pending || pending.id !== req.id) return;
    if (!localSearcher) localSearcher = new Searcher();
    var p = replayMoves(req.fen, req.moves);
    var r = engineThink(localSearcher, p, req.kind === 'hint' ? 'club' : req.level, true);
    onEngineResult({ id: req.id, move: r.move ? moveToUci(r.move) : null, book: !!r.book });
  }, 40);
}
function askEngine(kind, cb) {
  cancelEngine();
  var req = { id: ++reqId, kind: kind, fen: game.startFen, moves: game.moves.slice(), level: game.level };
  pending = { id: req.id, kind: kind, cb: cb, req: req, t0: Date.now(), answered: false };
  if (!worker) startWorker();
  if (worker) worker.postMessage(req); else runLocal(req);
}
function onEngineResult(d) {
  if (!pending || d.id !== pending.id) return;
  pending.answered = true;
  var p = pending, minWait = p.kind === 'move' ? (d.book ? 550 : 200) : 0;
  // never land a move while the pieces are still gliding (new game / back to live)
  var wait = Math.max(minWait - (Date.now() - p.t0), resetting ? resetEndsAt - Date.now() : 0);
  setTimeout(function () {
    if (pending !== p) return;
    pending = null;
    p.cb(d);
  }, Math.max(0, wait));
}
function cancelEngine() {
  if (!pending) return;
  if (!pending.answered && worker) { worker.terminate(); worker = null; } // stop an in-progress search
  pending = null;
}

/* =====================================================================
   GAME STATE
   ===================================================================== */
var game, pos, viewPly = null, viewCache = { ply: -1, pos: null }, flipped = false;
var selected = -1, selMoves = [], hint = 0, promoState = null, drag = null, resignArmed = null;

function newGame(humanColor, level) {
  return { startFen: START_FEN, moves: [], sans: [], humanColor: humanColor, level: level, result: null, reason: null };
}
function replayMoves(fen, moves) {
  var p = new Pos(fen);
  for (var i = 0; i < moves.length; i++) {
    var m = uciToMove(p, moves[i]);
    if (!m) throw new Error('Illegal move in history: ' + moves[i]);
    p.make(m);
  }
  return p;
}
function currentPly() { return viewPly === null ? game.moves.length : viewPly; }
function displayPos() {
  if (viewPly === null) return pos;
  if (viewCache.ply !== viewPly || viewCache.len !== game.moves.length) {
    viewCache = { ply: viewPly, len: game.moves.length, pos: replayMoves(game.startFen, game.moves.slice(0, viewPly)) };
  }
  return viewCache.pos;
}
function engineBusy() { return !!(pending && pending.kind === 'move'); }
function canInteract() {
  return !resetting && !game.result && viewPly === null && pos.side === game.humanColor && !engineBusy() && !promoState;
}

/* =====================================================================
   UI — board rendering
   ===================================================================== */
var sqEls = {}, pieceEls = {};
function sqToXY(sq) { var f = sq & 7, r = sq >> 4; return flipped ? [7 - f, r] : [f, 7 - r]; }
function xyToSq(c, r) { return flipped ? r * 16 + (7 - c) : (7 - r) * 16 + c; }

function buildSquares() {
  squaresEl.innerHTML = ''; sqEls = {};
  for (var row = 0; row < 8; row++) for (var col = 0; col < 8; col++) {
    var sq = xyToSq(col, row), el = document.createElement('div');
    el.className = 'sq ' + ((((sq >> 4) + (sq & 7)) & 1) ? 'l' : 'd');
    if (col === 0) { var rk = document.createElement('span'); rk.className = 'coord rk'; rk.textContent = (sq >> 4) + 1; el.appendChild(rk); }
    if (row === 7) { var fl = document.createElement('span'); fl.className = 'coord fl'; fl.textContent = FILES[sq & 7]; el.appendChild(fl); }
    squaresEl.appendChild(el); sqEls[sq] = el;
  }
}
function placeEl(el, sq) {
  var xy = sqToXY(sq);
  el.style.transform = 'translate(' + xy[0] * 100 + '%,' + xy[1] * 100 + '%)';
}
function makePieceEl(p, sq) {
  var el = document.createElement('div');
  el.className = 'pc'; el.dataset.p = p; el.innerHTML = pieceSvg(p);
  placeEl(el, sq); piecesEl.appendChild(el); pieceEls[sq] = el;
  return el;
}
// plan: {moves:[{from,to}], removed:[sq]} slides pieces; then reconcile with the displayed position.
function renderPieces(plan, slideMs) {
  var dp = displayPos(), sq, fadeAt = slideMs ? Math.round(slideMs * 0.7) : 0;
  if (plan) {
    plan.removed.forEach(function (s) {
      var el = pieceEls[s]; if (!el) return;
      delete pieceEls[s];
      // a captured piece fades as the capturing piece arrives
      setTimeout(function () { el.classList.add('gone'); }, fadeAt);
      setTimeout(function () { el.remove(); }, fadeAt + 180);
    });
    plan.moves.forEach(function (mv) {
      var el = pieceEls[mv.from]; if (!el) return;
      delete pieceEls[mv.from];
      if (pieceEls[mv.to]) pieceEls[mv.to].remove();
      pieceEls[mv.to] = el; placeEl(el, mv.to);
    });
  }
  Object.keys(pieceEls).forEach(function (k) {
    var s = +k, p = dp.b[s], el = pieceEls[s];
    if (!p) { el.remove(); delete pieceEls[s]; }
    else if (+el.dataset.p !== p) { el.dataset.p = p; el.innerHTML = pieceSvg(p); }
  });
  for (sq = 0; sq < 120; sq++) {
    if (sq & 0x88) { sq += 7; continue; }
    if (dp.b[sq] && !pieceEls[sq]) makePieceEl(dp.b[sq], sq);
  }
}
function rebuildPieces() {
  boardEl.classList.add('instant');
  piecesEl.innerHTML = ''; pieceEls = {};
  renderPieces(null);
  void boardEl.offsetWidth;
  boardEl.classList.remove('instant');
}
function planFor(p, m) {
  var from = mFrom(m), to = mTo(m), fl = mFlags(m), plan = { moves: [{ from: from, to: to }], removed: [] };
  if (fl & F_EP) plan.removed.push(p.side ? to + 16 : to - 16);
  else if (fl & F_CAP) plan.removed.push(to);
  if (fl & F_CASTLE) { var rr = castleRook(to); plan.moves.push({ from: rr[0], to: rr[1] }); }
  return plan;
}
function renderHighlights() {
  var dp = displayPos(), ply = currentPly(), lm = ply > 0 ? game.moves[ply - 1] : null;
  var lmFrom = lm ? sqFromName(lm.slice(0, 2)) : -1, lmTo = lm ? sqFromName(lm.slice(2, 4)) : -1;
  var checkSq = dp.inCheck() ? dp.kings[dp.side >> 3] : -1;
  var tg = {};
  selMoves.forEach(function (m) { tg[mTo(m)] = (mFlags(m) & F_CAP) ? 2 : 1; });
  Object.keys(sqEls).forEach(function (k) {
    var s = +k, cl = sqEls[s].classList;
    cl.toggle('last', s === lmFrom || s === lmTo);
    cl.toggle('sel', s === selected);
    cl.toggle('check', s === checkSq);
    cl.toggle('tgt', !!tg[s]);
    cl.toggle('cap', tg[s] === 2);
  });
}
function renderArrow() {
  arrowG.innerHTML = '';
  if (!hint || viewPly !== null) return;
  var a = sqToXY(mFrom(hint)), b = sqToXY(mTo(hint));
  var x1 = a[0] * 100 + 50, y1 = a[1] * 100 + 50, x2 = b[0] * 100 + 50, y2 = b[1] * 100 + 50;
  var dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy);
  x2 -= dx / len * 34; y2 -= dy / len * 34;
  arrowG.innerHTML = '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 +
    '" stroke="#d2a04a" stroke-width="16" stroke-linecap="round" opacity=".85" marker-end="url(#arrow-head)"/>';
}

/* ---- Player cards ---- */
var START_COUNT = [0, 8, 2, 2, 2, 1, 1], PVAL = [0, 1, 3, 3, 5, 9, 0];
function materialInfo(dp) {
  var cnt = [[0,0,0,0,0,0,0], [0,0,0,0,0,0,0]], sq;
  for (sq = 0; sq < 120; sq++) {
    if (sq & 0x88) { sq += 7; continue; }
    var p = dp.b[sq]; if (p) cnt[p >> 3][p & 7]++;
  }
  var res = [];
  for (var c = 0; c < 2; c++) {
    var lost = [], promos = 0, mat = 0, t;
    for (t = 2; t <= 5; t++) promos += Math.max(0, cnt[c][t] - START_COUNT[t]);
    for (t = 1; t <= 5; t++) {
      var missing = t === PAWN ? Math.max(0, 8 - cnt[c][t] - promos) : Math.max(0, START_COUNT[t] - cnt[c][t]);
      lost.push(missing); mat += cnt[c][t] * PVAL[t];
    }
    res.push({ lost: lost, mat: mat });
  }
  return res; // res[0] white, res[1] black
}
function renderCard(el, color, info) {
  var human = color === game.humanColor, opp = info[color ? 0 : 1], mine = info[color ? 1 : 0];
  var caps = '', oppColor = color ? 0 : 8;
  for (var t = 5; t >= 1; t--) {
    var n = opp.lost[t - 1];
    if (!n) continue;
    for (var i = 0; i < n; i++) caps += pieceSvg(t | oppColor);
    caps += '<span class="gap"></span>';
  }
  var diff = mine.mat - opp.mat;
  var thinking = !human && engineBusy();
  el.innerHTML =
    '<div class="card-row"><span class="chip ' + (color ? 'b' : 'w') + '"></span>' +
    '<span class="name">' + (human ? 'You' : 'Computer') + '</span>' +
    '<span class="sub">' + (human ? (color ? 'Black' : 'White') : LEVEL_NAMES[game.level]) + '</span>' +
    (thinking ? '<span class="think">Thinking<i></i><i></i><i></i></span>' : '') + '</div>' +
    '<div class="caps"><span class="cap-list">' + caps + '</span>' + (diff > 0 ? '<span class="adv">+' + diff + '</span>' : '') + '</div>';
}
function renderCards() {
  var info = materialInfo(displayPos());
  renderCard($('card-top'), flipped ? 0 : 8, info);
  renderCard($('card-bottom'), flipped ? 8 : 0, info);
}

/* ---- Move list, status, controls ---- */
function renderMoves() {
  var el = $('moves'), cur = currentPly(), html = '';
  if (!game.sans.length) html = '<div class="empty">No moves yet.</div>';
  for (var i = 0; i < game.sans.length; i += 2) {
    html += '<div class="no">' + (i / 2 + 1) + '.</div>';
    html += '<button type="button" class="mv' + (cur === i + 1 ? ' cur' : '') + '" data-ply="' + (i + 1) + '">' + game.sans[i] + '</button>';
    html += i + 1 < game.sans.length
      ? '<button type="button" class="mv' + (cur === i + 2 ? ' cur' : '') + '" data-ply="' + (i + 2) + '">' + game.sans[i + 1] + '</button>'
      : '<span></span>';
  }
  var keep = el.scrollTop;                    // rebuilding the list must not move the scroll position
  el.innerHTML = html;
  el.scrollTop = keep;
  $('live-btn').classList.toggle('hidden', viewPly === null);
  var c = el.querySelector('.mv.cur');
  if (viewPly === null) el.scrollTop = el.scrollHeight;
  else if (c) {
    // measure against the list itself (offsetTop is relative to a different element in the stacked phone layout)
    var lr = el.getBoundingClientRect(), cr = c.getBoundingClientRect();
    if (cr.top < lr.top || cr.bottom > lr.bottom) el.scrollTop += (cr.top - lr.top) - (el.clientHeight - cr.height) / 2;
  }
}
var REASONS = {
  checkmate: 'Checkmate', stalemate: 'Stalemate', repetition: 'Threefold repetition',
  fifty: '50-move rule', insufficient: 'Insufficient material', resign: 'Resignation'
};
function resultHeadline() {
  if (game.result === '1/2-1/2') return 'Draw';
  var whiteWon = game.result === '1-0';
  return (whiteWon === (game.humanColor === 0)) ? 'You win' : 'Computer wins';
}
function renderStatus() {
  var s;
  if (viewPly === 0) s = 'Reviewing the starting position';
  else if (viewPly !== null) s = 'Reviewing after <strong>' + Math.ceil(viewPly / 2) + (viewPly % 2 ? '. ' : '… ') + game.sans[viewPly - 1] + '</strong>';
  else {
    if (game.result) s = '<strong>' + resultHeadline() + '</strong> · ' + REASONS[game.reason];
    else if (engineBusy()) s = 'Computer is thinking…';
    else if (pending && pending.kind === 'hint') s = 'Looking for a good move…';
    else if (pos.side === game.humanColor) s = pos.inCheck() ? '<strong>Check</strong> · your move' : 'Your move';
    else s = 'Computer to move';
  }
  $('status').innerHTML = s;
}
function hasHumanMove() {
  for (var i = 0; i < game.moves.length; i++) if (((i & 1) ? 8 : 0) === game.humanColor) return true;
  return false;
}
function renderControls() {
  $('btn-undo').disabled = !hasHumanMove() || !!promoState;
  $('btn-hint').disabled = !canInteract() || !!(pending && pending.kind === 'hint');
  $('btn-resign').disabled = !!game.result;
  $('btn-sound').textContent = muted ? 'Sound off' : 'Sound on';
  $('btn-sound').setAttribute('aria-pressed', String(!muted));
  if (resignArmed && game.result) disarmResign();
}
function renderAll() {
  renderHighlights(); renderPieces(null); renderArrow(); renderCards(); renderMoves(); renderStatus(); renderControls();
}

/* =====================================================================
   UI — making moves
   ===================================================================== */
var COMPUTER_SLIDE_MS = 450, slowTimer = 0;
function commitMove(m) {
  if (pending && pending.kind === 'hint') cancelEngine();
  var plan = viewPly === null ? planFor(pos, m) : null;
  var byComputer = pos.side !== game.humanColor, slideMs = byComputer && plan ? COMPUTER_SLIDE_MS : 0;
  clearTimeout(slowTimer);
  boardEl.classList.toggle('slow', !!slideMs);
  if (slideMs) slowTimer = setTimeout(function () { boardEl.classList.remove('slow'); }, slideMs + 50);
  var san = pos.san(m), isCap = !!(mFlags(m) & F_CAP);
  pos.make(m);
  game.moves.push(moveToUci(m)); game.sans.push(san);
  hint = 0; selected = -1; selMoves = [];
  var st = pos.status();
  if (st.over) { game.result = st.result; game.reason = st.reason; }
  if (plan) renderPieces(plan, slideMs);
  renderAll();
  var soundAt = slideMs ? Math.round(slideMs * 0.85) : 0, check = pos.inCheck();   // sound when the piece lands
  setTimeout(function () {
    if (st.over) { playSound(isCap ? 'capture' : 'move'); setTimeout(function () { playSound('end'); }, 160); }
    else playSound(check ? 'check' : (isCap ? 'capture' : 'move'));
  }, soundAt);
  save();
  if (st.over) setTimeout(showOver, 500 + slideMs);
  else maybeEngineMove();
}
function maybeEngineMove() {
  if (game.result || pos.side === game.humanColor) return;
  askEngine('move', function (d) {
    var m = d.move ? uciToMove(pos, d.move) : 0;
    if (!m) { var l = pos.legal(); if (!l.length) return; m = l[0]; }
    commitMove(m);
  });
  renderAll();
}
function select(sq) {
  selected = sq;
  selMoves = pos.legal().filter(function (m) { return mFrom(m) === sq; });
  renderHighlights();
}
function deselect() { selected = -1; selMoves = []; renderHighlights(); }
function tryMove(from, to) {
  var c = selMoves.filter(function (m) { return mFrom(m) === from && mTo(m) === to; });
  if (!c.length) return false;
  if (c.length > 1) showPromo(to, c); else commitMove(c[0]);
  return true;
}

/* ---- Promotion picker ---- */
function showPromo(to, cands) {
  promoState = { cands: cands };
  var xy = sqToXY(to), html = '', order = [QUEEN, ROOK, BISHOP, KNIGHT];
  order.forEach(function (t, i) {
    var row = xy[1] === 0 ? i : 7 - i;
    html += '<button type="button" class="promo-opt" data-t="' + t + '" style="left:' + xy[0] * 12.5 + '%;top:' + row * 12.5 +
      '%" aria-label="Promote to ' + ['', '', 'knight', 'bishop', 'rook', 'queen'][t] + '">' + pieceSvg(t | game.humanColor) + '</button>';
  });
  promoEl.innerHTML = html;
  promoEl.classList.remove('hidden');
  renderControls();
  var first = promoEl.querySelector('.promo-opt'); if (first) first.focus();
}
function closePromo() { promoState = null; promoEl.classList.add('hidden'); promoEl.innerHTML = ''; }
promoEl.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
promoEl.addEventListener('click', function (e) {
  var b = e.target.closest('.promo-opt'), st = promoState;
  closePromo();
  if (b && st) {
    var t = +b.dataset.t, m = st.cands.filter(function (x) { return mPromo(x) === t; })[0];
    if (m) { commitMove(m); return; }
  }
  deselect(); renderControls();
});

/* ---- Pointer input: click-to-move and drag-and-drop ---- */
function eventSq(e) {
  var r = boardEl.getBoundingClientRect();
  var c = Math.floor((e.clientX - r.left) / r.width * 8), w = Math.floor((e.clientY - r.top) / r.height * 8);
  if (c < 0 || c > 7 || w < 0 || w > 7) return -1;
  return xyToSq(c, w);
}
function moveDragEl(e) {
  var r = boardEl.getBoundingClientRect(), s = r.width / 8;
  drag.el.style.transform = 'translate(' + (e.clientX - r.left - s / 2) + 'px,' + (e.clientY - r.top - s / 2) + 'px)';
}
boardEl.addEventListener('pointerdown', function (e) {
  if (e.button !== 0 || promoState) return;
  audio();
  var sq = eventSq(e);
  if (sq < 0 || !canInteract()) return;
  if (selected >= 0 && selMoves.some(function (m) { return mTo(m) === sq; })) { tryMove(selected, sq); return; }
  var p = pos.b[sq];
  if (p && (p & 8) === game.humanColor) {
    var was = selected === sq;
    select(sq);
    drag = { sq: sq, el: pieceEls[sq], x0: e.clientX, y0: e.clientY, active: false, was: was };
    try { boardEl.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
    return;
  }
  deselect();
});
boardEl.addEventListener('pointermove', function (e) {
  if (!drag || !drag.el) return;
  if (!drag.active) {
    var dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (dx * dx + dy * dy < 25) return;
    drag.active = true; drag.el.classList.add('dragging');
  }
  moveDragEl(e);
});
function endDrag(e, cancelled) {
  if (!drag) return;
  var d = drag; drag = null;
  if (d.active && d.el) {
    d.el.classList.remove('dragging');
    var sq = cancelled ? -1 : eventSq(e);
    placeEl(d.el, d.sq);   // snap back; a legal drop then slides it the short way to the target
    if (sq >= 0 && sq !== d.sq) {
      if (!tryMove(d.sq, sq)) deselect();
    }
  } else if (d.was && !cancelled) deselect();
}
boardEl.addEventListener('pointerup', function (e) { endDrag(e, false); });
boardEl.addEventListener('pointercancel', function (e) { endDrag(e, true); });

/* =====================================================================
   UI — controls, dialogs
   ===================================================================== */
function toast(msg) {
  var t = $('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(function () { t.classList.remove('show'); }, 1600);
}
function copyText(text, label) {
  function fallback() {
    var ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
    ta.remove();
    toast(ok ? label + ' copied' : 'Copy failed');
  }
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast(label + ' copied'); }, fallback);
  else fallback();
}
function pgnText() {
  var d = new Date(), pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var comp = 'Computer (' + LEVEL_NAMES[game.level] + ')', res = game.result || '*';
  var head = '[Event "Casual game"]\n[Site "Local"]\n[Date "' + d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate()) + '"]\n' +
    '[Round "-"]\n[White "' + (game.humanColor === 0 ? 'You' : comp) + '"]\n[Black "' + (game.humanColor === 8 ? 'You' : comp) + '"]\n' +
    '[Result "' + res + '"]\n';
  if (game.reason) head += '[Termination "' + (game.reason === 'resign' ? 'Resignation' : REASONS[game.reason]) + '"]\n';
  var toks = [];
  game.sans.forEach(function (s, i) { toks.push(i % 2 === 0 ? (i / 2 + 1) + '. ' + s : s); });
  toks.push(res);
  var lines = [], line = '';
  toks.forEach(function (t) { if (line && (line + ' ' + t).length > 80) { lines.push(line); line = t; } else line = line ? line + ' ' + t : t; });
  if (line) lines.push(line);
  return head + '\n' + lines.join('\n') + '\n';
}

function undo() {
  if (!hasHumanMove()) return;
  cancelEngine(); closePromo(); hideOver(); disarmResign();
  game.result = null; game.reason = null;
  while (game.moves.length) {
    var mover = ((game.moves.length - 1) & 1) ? 8 : 0;
    game.moves.pop(); game.sans.pop();
    if (mover === game.humanColor) break;
  }
  pos = replayMoves(game.startFen, game.moves);
  viewPly = null; hint = 0; selected = -1; selMoves = [];
  renderAll(); save();
  maybeEngineMove();
}
function disarmResign() {
  resignArmed = null; clearTimeout(disarmResign.timer);
  var b = $('btn-resign'); b.textContent = 'Resign'; b.classList.remove('danger');
}
function resign() {
  if (game.result) return;
  if (!resignArmed) {
    resignArmed = true;
    var b = $('btn-resign'); b.textContent = 'Confirm'; b.classList.add('danger');
    disarmResign.timer = setTimeout(disarmResign, 3000);
    return;
  }
  disarmResign(); cancelEngine(); closePromo();
  game.result = game.humanColor === 0 ? '0-1' : '1-0'; game.reason = 'resign';
  hint = 0; selected = -1; selMoves = [];
  renderAll(); save(); playSound('end');
  showOver();
}
function showOver() {
  if (!game.result) return;
  $('over-score').textContent = game.result.replace('1/2-1/2', '½–½').replace('-', '–');
  $('over-title').textContent = resultHeadline();
  var r = game.reason;
  $('over-reason').textContent = r === 'resign' ? 'You resigned.' : (r === 'checkmate' ? 'By checkmate.' : REASONS[r] + '.');
  $('modal-over').classList.remove('hidden');
  $('over-new').focus();
}
function hideOver() { $('modal-over').classList.add('hidden'); }

var dlg = { color: 'w', level: 'casual' };
function syncSeg(id, v) {
  Array.prototype.forEach.call($(id).querySelectorAll('button'), function (b) {
    b.classList.toggle('on', b.dataset.v === v); b.setAttribute('aria-pressed', String(b.dataset.v === v));
  });
}
function openNewDialog() {
  hideOver();
  dlg.level = game.level;
  syncSeg('seg-color', dlg.color); syncSeg('seg-level', dlg.level);
  $('level-desc').textContent = LEVEL_DESC[dlg.level];
  $('modal-new').classList.remove('hidden');
  $('new-start').focus();
}
function closeNewDialog() { $('modal-new').classList.add('hidden'); }
$('seg-color').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { dlg.color = b.dataset.v; syncSeg('seg-color', dlg.color); } });
$('seg-level').addEventListener('click', function (e) {
  var b = e.target.closest('button'); if (!b) return;
  dlg.level = b.dataset.v; syncSeg('seg-level', dlg.level); $('level-desc').textContent = LEVEL_DESC[dlg.level];
});
var RESET_MS = 2000, resetting = false, resetTimer = 0, resetEndsAt = 0;
// Animate every piece from where it stands now to its square in the position shown next
// (the new starting position, or the live position when leaving review).
// Each target square takes the nearest unused piece of the same kind; pieces left over fade out,
// and squares with no matching piece (captured pieces) get a piece that fades back in.
function animateReset(onDone, ms) {
  ms = ms || RESET_MS;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var cur = [], targets = [], pairs = [], sq;
  Object.keys(pieceEls).forEach(function (k) {
    var el = pieceEls[k];
    if (el.classList.contains('gone')) return;
    var xy = sqToXY(+k); cur.push({ el: el, p: +el.dataset.p, x: xy[0], y: xy[1], used: false });
  });
  return function afterOrientation() {
    for (sq = 0; sq < 120; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      var tp = displayPos().b[sq];
      if (tp) { var t = sqToXY(sq); targets.push({ sq: sq, p: tp, x: t[0], y: t[1], el: null }); }
    }
    if (reduce || !cur.length) { rebuildPieces(); return false; }
    targets.forEach(function (t, ti) {
      cur.forEach(function (c, ci) { if (c.p === t.p) pairs.push({ ti: ti, ci: ci, d: Math.hypot(c.x - t.x, c.y - t.y) }); });
    });
    pairs.sort(function (a, b) { return a.d - b.d; });
    pairs.forEach(function (pr) {
      var t = targets[pr.ti], c = cur[pr.ci];
      if (!t.el && !c.used) { t.el = c.el; c.used = true; }
    });
    clearTimeout(resetTimer);
    boardEl.classList.remove('slow', 'instant');
    boardEl.style.setProperty('--glide', ms + 'ms');
    boardEl.classList.add('reset');
    var map = {};
    cur.forEach(function (c) {
      if (c.used) return;
      c.el.classList.add('gone');
      setTimeout(function () { c.el.remove(); }, ms * 0.25 + 100);
    });
    targets.forEach(function (t) {
      if (!t.el) { t.el = makePieceEl(t.p, t.sq); t.el.classList.add('gone'); }
      map[t.sq] = t.el;
    });
    pieceEls = map;
    void boardEl.offsetWidth;                 // commit start state before transitions begin
    targets.forEach(function (t) { t.el.classList.remove('gone'); placeEl(t.el, t.sq); });
    resetting = true; resetEndsAt = Date.now() + ms + 50;
    resetTimer = setTimeout(function () {
      resetting = false; boardEl.classList.remove('reset'); renderAll(); if (onDone) onDone();
    }, ms + 50);
    return true;
  };
}
function startGame(colorChoice, level) {
  cancelEngine(); closePromo(); hideOver(); disarmResign();
  var finishReset = animateReset(maybeEngineMove);   // remembers where the pieces are now
  var c = colorChoice === 'r' ? (Math.random() < 0.5 ? 0 : 8) : (colorChoice === 'b' ? 8 : 0);
  game = newGame(c, level); pos = new Pos();
  viewPly = null; hint = 0; selected = -1; selMoves = [];
  flipped = c === 8;
  buildSquares();
  var animating = finishReset();
  renderAll(); save();
  if (!animating) maybeEngineMove();          // otherwise the computer starts once the pieces have landed
}
$('new-start').addEventListener('click', function () { audio(); closeNewDialog(); startGame(dlg.color, dlg.level); });
$('new-cancel').addEventListener('click', closeNewDialog);
$('over-new').addEventListener('click', openNewDialog);
$('over-close').addEventListener('click', hideOver);
function openHelp() { $('modal-help').classList.remove('hidden'); $('help-close').focus(); }
function closeHelp() { $('modal-help').classList.add('hidden'); }
$('btn-help').addEventListener('click', openHelp);
$('help-close').addEventListener('click', closeHelp);
[$('modal-new'), $('modal-over'), $('modal-help')].forEach(function (m) {
  m.addEventListener('click', function (e) { if (e.target === m) m.classList.add('hidden'); });
});
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Escape') return;
  if (promoState) { closePromo(); deselect(); renderControls(); }
  closeNewDialog(); hideOver(); closeHelp();
});

$('btn-new').addEventListener('click', openNewDialog);
$('btn-undo').addEventListener('click', undo);
$('btn-flip').addEventListener('click', function () {
  flipped = !flipped; buildSquares(); rebuildPieces(); renderAll(); save();
});
$('btn-hint').addEventListener('click', function () {
  if (!canInteract()) return;
  askEngine('hint', function (d) {
    var m = d.move ? uciToMove(pos, d.move) : 0;
    hint = m || 0; renderAll();
  });
  renderAll();
});
$('btn-resign').addEventListener('click', resign);
$('btn-fen').addEventListener('click', function () { copyText(displayPos().fen(), 'FEN'); });
$('btn-pgn').addEventListener('click', function () { copyText(pgnText(), 'PGN'); });
$('btn-sound').addEventListener('click', function () { muted = !muted; if (!muted) { audio(); playSound('move'); } renderControls(); save(); });
$('moves').addEventListener('click', function (e) {
  var b = e.target.closest('.mv'); if (!b) return;
  var ply = +b.dataset.ply;
  if (ply === game.moves.length) { goLive(); return; }
  if (ply === viewPly) return;
  if (promoState) closePromo();
  // glide length grows with the distance jumped: a single move ~0.4 s, ten or more moves 2 s
  var finish = animateReset(null, Math.min(RESET_MS, 250 + 175 * Math.abs(ply - currentPly())));
  viewPly = ply;
  selected = -1; selMoves = [];
  finish();
  renderAll();
});
// Leaving review: pieces glide from the reviewed position to the live one.
function goLive() {
  if (viewPly === null) return;
  var finish = animateReset(null);
  viewPly = null; selected = -1; selMoves = [];
  finish();
  renderAll();
}
$('live-btn').addEventListener('click', goLive);

/* =====================================================================
   PERSISTENCE — localStorage (every access wrapped in try/catch)
   ===================================================================== */
var STORE_KEY = 'chess-vs-computer.v1';
function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      moves: game.moves, humanColor: game.humanColor, level: game.level,
      result: game.result, reason: game.reason, flipped: flipped, muted: muted
    }));
  } catch (e) {}
}
function load() {
  try {
    var s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (!s || !Array.isArray(s.moves)) return false;
    muted = !!s.muted;
    var g = newGame(s.humanColor === 8 ? 8 : 0, LEVEL_NAMES[s.level] ? s.level : 'casual');
    var p = new Pos();
    for (var i = 0; i < s.moves.length; i++) {
      var m = uciToMove(p, String(s.moves[i]));
      if (!m) return false;
      g.sans.push(p.san(m)); g.moves.push(moveToUci(m)); p.make(m);
    }
    if (s.result && REASONS[s.reason]) { g.result = s.result; g.reason = s.reason; }
    else { var st = p.status(); if (st.over) { g.result = st.result; g.reason = st.reason; } }
    game = g; pos = p; flipped = !!s.flipped;
    return true;
  } catch (e) { return false; }
}

/* ---- Boot ---- */
buildSprite();
if (!load()) { game = newGame(0, 'casual'); pos = new Pos(); flipped = false; }
buildSquares(); rebuildPieces(); renderAll();
maybeEngineMove();
})();
