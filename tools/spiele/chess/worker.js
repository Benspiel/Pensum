(function(){

/* =====================================================================
   RULES — board representation, move generation, FEN, SAN, game status
   0x88 board: square = rank*16 + file (a1 = 0, h8 = 119).
   Pieces: type 1..6 (P N B R Q K), +8 for black. Side: 0 white, 8 black.
   ===================================================================== */
var PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6, WHITE = 0, BLACK = 8;
var N_OFF = [33, 31, 18, 14, -33, -31, -18, -14];
var K_OFF = [1, -1, 16, -16, 17, 15, -17, -15];
var B_OFF = [17, 15, -17, -15];
var R_OFF = [1, -1, 16, -16];
var F_CAP = 1, F_EP = 2, F_CASTLE = 4, F_DOUBLE = 8, F_PROMO = 16;
var FILES = 'abcdefgh', PIECE_CH = ' pnbrqk';
var START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// Move encoding: from | to<<7 | promoType<<14 | flags<<17
function mk(from, to, promo, fl) { return from | (to << 7) | (promo << 14) | (fl << 17); }
function mFrom(m) { return m & 127; }
function mTo(m) { return (m >> 7) & 127; }
function mPromo(m) { return (m >> 14) & 7; }
function mFlags(m) { return (m >> 17) & 31; }
function sqName(s) { return FILES[s & 7] + ((s >> 4) + 1); }
function sqFromName(n) { return (n.charCodeAt(1) - 49) * 16 + (n.charCodeAt(0) - 97); }

// Castling-rights mask per square (1=K, 2=Q, 4=k, 8=q)
var CR = new Int8Array(128).fill(15);
CR[0] = 13; CR[7] = 14; CR[4] = 12; CR[112] = 7; CR[119] = 11; CR[116] = 3;

function castleRook(kingTo) {
  if (kingTo === 6) return [7, 5];
  if (kingTo === 2) return [0, 3];
  if (kingTo === 118) return [119, 117];
  return [112, 115];
}

// Zobrist keys (two 32-bit halves), deterministic xorshift so all threads agree
var Z_LO = new Int32Array(15 * 128), Z_HI = new Int32Array(15 * 128);
var ZC_LO = new Int32Array(16), ZC_HI = new Int32Array(16);
var ZEP_LO = new Int32Array(128), ZEP_HI = new Int32Array(128);
var ZS_LO = 0, ZS_HI = 0;
(function () {
  var s = 0x2545F491;
  function r() { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return s | 0; }
  var i;
  for (i = 0; i < Z_LO.length; i++) { Z_LO[i] = r(); Z_HI[i] = r(); }
  for (i = 0; i < 16; i++) { ZC_LO[i] = r(); ZC_HI[i] = r(); }
  for (i = 0; i < 128; i++) { ZEP_LO[i] = r(); ZEP_HI[i] = r(); }
  ZS_LO = r(); ZS_HI = r();
})();

function Pos(fen) {
  this.b = new Int8Array(128);
  this.side = 0; this.castle = 0; this.ep = -1; this.half = 0; this.full = 1;
  this.kings = [4, 116]; this.hlo = 0; this.hhi = 0;
  this.stack = []; this.hist = [];
  this.setFEN(fen || START_FEN);
}

Pos.prototype.epCapturable = function (ep, side) {
  // can a pawn of `side` capture onto ep square?
  var b = this.b, p = PAWN | side, t;
  if (side === 0) { t = ep - 15; if (!(t & 0x88) && b[t] === p) return true; t = ep - 17; if (!(t & 0x88) && b[t] === p) return true; }
  else { t = ep + 15; if (!(t & 0x88) && b[t] === p) return true; t = ep + 17; if (!(t & 0x88) && b[t] === p) return true; }
  return false;
};

Pos.prototype.setFEN = function (fen) {
  var parts = String(fen).trim().split(/\s+/);
  if (parts.length < 4) throw new Error('Bad FEN');
  var b = this.b; b.fill(0);
  var rows = parts[0].split('/');
  if (rows.length !== 8) throw new Error('Bad FEN');
  var wk = 0, bk = 0;
  for (var r = 0; r < 8; r++) {
    var rank = 7 - r, f = 0, row = rows[r];
    for (var i = 0; i < row.length; i++) {
      var c = row[i];
      if (c >= '1' && c <= '8') { f += +c; continue; }
      var t = PIECE_CH.indexOf(c.toLowerCase());
      if (t < 1 || f > 7) throw new Error('Bad FEN');
      var p = t | (c === c.toLowerCase() ? 8 : 0), sq = rank * 16 + f;
      b[sq] = p;
      if (p === KING) { this.kings[0] = sq; wk++; }
      if (p === (KING | 8)) { this.kings[1] = sq; bk++; }
      f++;
    }
    if (f !== 8) throw new Error('Bad FEN');
  }
  if (wk !== 1 || bk !== 1) throw new Error('Bad FEN: kings');
  this.side = parts[1] === 'b' ? 8 : 0;
  var cs = parts[2], cr = 0;
  if (cs.indexOf('K') >= 0) cr |= 1;
  if (cs.indexOf('Q') >= 0) cr |= 2;
  if (cs.indexOf('k') >= 0) cr |= 4;
  if (cs.indexOf('q') >= 0) cr |= 8;
  if (b[4] !== KING) cr &= ~3;
  if (b[7] !== ROOK) cr &= ~1;
  if (b[0] !== ROOK) cr &= ~2;
  if (b[116] !== (KING | 8)) cr &= ~12;
  if (b[119] !== (ROOK | 8)) cr &= ~4;
  if (b[112] !== (ROOK | 8)) cr &= ~8;
  this.castle = cr;
  this.ep = -1;
  if (parts[3] !== '-' && /^[a-h][36]$/.test(parts[3])) {
    var e = sqFromName(parts[3]);
    if (this.epCapturable(e, this.side)) this.ep = e;
  }
  this.half = parseInt(parts[4] || '0', 10) || 0;
  this.full = parseInt(parts[5] || '1', 10) || 1;
  this.stack = [];
  this.computeHash();
  this.hist = [this.hlo];
  if (this.attacked(this.kings[(this.side ^ 8) >> 3], this.side)) throw new Error('Bad FEN: side not to move is in check');
};

Pos.prototype.computeHash = function () {
  var lo = 0, hi = 0, b = this.b;
  for (var sq = 0; sq < 120; sq++) {
    if (sq & 0x88) { sq += 7; continue; }
    if (b[sq]) { var k = b[sq] * 128 + sq; lo ^= Z_LO[k]; hi ^= Z_HI[k]; }
  }
  lo ^= ZC_LO[this.castle]; hi ^= ZC_HI[this.castle];
  if (this.ep >= 0) { lo ^= ZEP_LO[this.ep]; hi ^= ZEP_HI[this.ep]; }
  if (this.side) { lo ^= ZS_LO; hi ^= ZS_HI; }
  this.hlo = lo; this.hhi = hi;
};

Pos.prototype.fen = function () {
  var s = '', b = this.b;
  for (var r = 7; r >= 0; r--) {
    var e = 0;
    for (var f = 0; f < 8; f++) {
      var p = b[r * 16 + f];
      if (!p) { e++; continue; }
      if (e) { s += e; e = 0; }
      var c = PIECE_CH[p & 7];
      s += (p & 8) ? c : c.toUpperCase();
    }
    if (e) s += e;
    if (r) s += '/';
  }
  var c2 = '';
  if (this.castle & 1) c2 += 'K';
  if (this.castle & 2) c2 += 'Q';
  if (this.castle & 4) c2 += 'k';
  if (this.castle & 8) c2 += 'q';
  return s + ' ' + (this.side ? 'b' : 'w') + ' ' + (c2 || '-') + ' ' +
    (this.ep >= 0 ? sqName(this.ep) : '-') + ' ' + this.half + ' ' + this.full;
};

Pos.prototype.attacked = function (sq, by) {
  var b = this.b, i, t, d, q;
  if (by === 0) {
    t = sq - 15; if (!(t & 0x88) && b[t] === PAWN) return true;
    t = sq - 17; if (!(t & 0x88) && b[t] === PAWN) return true;
  } else {
    t = sq + 15; if (!(t & 0x88) && b[t] === (PAWN | 8)) return true;
    t = sq + 17; if (!(t & 0x88) && b[t] === (PAWN | 8)) return true;
  }
  var kn = KNIGHT | by, kg = KING | by, rk = ROOK | by, bs = BISHOP | by, qn = QUEEN | by;
  for (i = 0; i < 8; i++) {
    t = sq + N_OFF[i]; if (!(t & 0x88) && b[t] === kn) return true;
    t = sq + K_OFF[i]; if (!(t & 0x88) && b[t] === kg) return true;
  }
  for (i = 0; i < 4; i++) {
    d = R_OFF[i]; t = sq + d;
    while (!(t & 0x88)) { q = b[t]; if (q) { if (q === rk || q === qn) return true; break; } t += d; }
    d = B_OFF[i]; t = sq + d;
    while (!(t & 0x88)) { q = b[t]; if (q) { if (q === bs || q === qn) return true; break; } t += d; }
  }
  return false;
};

Pos.prototype.inCheck = function () { return this.attacked(this.kings[this.side >> 3], this.side ^ 8); };

// Pseudo-legal moves. caps=true: captures and queen promotions only (quiescence).
Pos.prototype.gen = function (caps) {
  var b = this.b, us = this.side, them = us ^ 8, out = [], sq, p, t, to, i, d, q, offs;
  var dir = us ? -16 : 16, startR = us ? 6 : 1, promR = us ? 1 : 6;
  for (sq = 0; sq < 120; sq++) {
    if (sq & 0x88) { sq += 7; continue; }
    p = b[sq];
    if (!p || (p & 8) !== us) continue;
    t = p & 7;
    if (t === PAWN) {
      var r = sq >> 4;
      to = sq + dir;
      if (!b[to]) {
        if (r === promR) {
          out.push(mk(sq, to, QUEEN, F_PROMO));
          if (!caps) out.push(mk(sq, to, ROOK, F_PROMO), mk(sq, to, BISHOP, F_PROMO), mk(sq, to, KNIGHT, F_PROMO));
        } else if (!caps) {
          out.push(mk(sq, to, 0, 0));
          if (r === startR && !b[to + dir]) out.push(mk(sq, to + dir, 0, F_DOUBLE));
        }
      }
      for (i = -1; i <= 1; i += 2) {
        to = sq + dir + i;
        if (to & 0x88) continue;
        q = b[to];
        if (q && (q & 8) === them) {
          if (r === promR) {
            out.push(mk(sq, to, QUEEN, F_PROMO | F_CAP));
            if (!caps) out.push(mk(sq, to, ROOK, F_PROMO | F_CAP), mk(sq, to, BISHOP, F_PROMO | F_CAP), mk(sq, to, KNIGHT, F_PROMO | F_CAP));
          } else out.push(mk(sq, to, 0, F_CAP));
        } else if (to === this.ep) out.push(mk(sq, to, 0, F_CAP | F_EP));
      }
    } else if (t === KNIGHT || t === KING) {
      offs = t === KNIGHT ? N_OFF : K_OFF;
      for (i = 0; i < 8; i++) {
        to = sq + offs[i];
        if (to & 0x88) continue;
        q = b[to];
        if (!q) { if (!caps) out.push(mk(sq, to, 0, 0)); }
        else if ((q & 8) === them) out.push(mk(sq, to, 0, F_CAP));
      }
      if (t === KING && !caps && this.castle) {
        if (us === 0 && sq === 4) {
          if ((this.castle & 1) && !b[5] && !b[6] && b[7] === ROOK &&
              !this.attacked(4, 8) && !this.attacked(5, 8) && !this.attacked(6, 8)) out.push(mk(4, 6, 0, F_CASTLE));
          if ((this.castle & 2) && !b[3] && !b[2] && !b[1] && b[0] === ROOK &&
              !this.attacked(4, 8) && !this.attacked(3, 8) && !this.attacked(2, 8)) out.push(mk(4, 2, 0, F_CASTLE));
        } else if (us === 8 && sq === 116) {
          if ((this.castle & 4) && !b[117] && !b[118] && b[119] === (ROOK | 8) &&
              !this.attacked(116, 0) && !this.attacked(117, 0) && !this.attacked(118, 0)) out.push(mk(116, 118, 0, F_CASTLE));
          if ((this.castle & 8) && !b[115] && !b[114] && !b[113] && b[112] === (ROOK | 8) &&
              !this.attacked(116, 0) && !this.attacked(115, 0) && !this.attacked(114, 0)) out.push(mk(116, 114, 0, F_CASTLE));
        }
      }
    } else {
      offs = t === BISHOP ? B_OFF : (t === ROOK ? R_OFF : K_OFF);
      for (i = 0; i < offs.length; i++) {
        d = offs[i]; to = sq + d;
        while (!(to & 0x88)) {
          q = b[to];
          if (!q) { if (!caps) out.push(mk(sq, to, 0, 0)); }
          else { if ((q & 8) === them) out.push(mk(sq, to, 0, F_CAP)); break; }
          to += d;
        }
      }
    }
  }
  return out;
};

Pos.prototype.make = function (m) {
  var b = this.b, from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7, fl = (m >> 17) & 31;
  var p = b[from], us = this.side, cap = b[to], k;
  var u = { m: m, cap: cap, castle: this.castle, ep: this.ep, half: this.half, full: this.full, hlo: this.hlo, hhi: this.hhi };
  this.stack.push(u);
  var lo = this.hlo, hi = this.hhi;
  if (this.ep >= 0) { lo ^= ZEP_LO[this.ep]; hi ^= ZEP_HI[this.ep]; }
  lo ^= ZC_LO[this.castle]; hi ^= ZC_HI[this.castle];
  if (fl & F_EP) {
    var cs = us ? to + 16 : to - 16;
    cap = b[cs]; u.cap = cap; b[cs] = 0;
    k = cap * 128 + cs; lo ^= Z_LO[k]; hi ^= Z_HI[k];
  } else if (cap) { k = cap * 128 + to; lo ^= Z_LO[k]; hi ^= Z_HI[k]; }
  k = p * 128 + from; lo ^= Z_LO[k]; hi ^= Z_HI[k];
  b[from] = 0;
  var np = promo ? (promo | us) : p;
  b[to] = np; k = np * 128 + to; lo ^= Z_LO[k]; hi ^= Z_HI[k];
  if (fl & F_CASTLE) {
    var rr = castleRook(to), rp = b[rr[0]];
    b[rr[0]] = 0; b[rr[1]] = rp;
    k = rp * 128 + rr[0]; lo ^= Z_LO[k]; hi ^= Z_HI[k];
    k = rp * 128 + rr[1]; lo ^= Z_LO[k]; hi ^= Z_HI[k];
  }
  if ((p & 7) === KING) this.kings[us >> 3] = to;
  this.castle &= CR[from] & CR[to];
  lo ^= ZC_LO[this.castle]; hi ^= ZC_HI[this.castle];
  var nep = -1;
  if (fl & F_DOUBLE) {
    var e = (from + to) >> 1;
    if (this.epCapturable(e, us ^ 8)) nep = e;
  }
  this.ep = nep;
  if (nep >= 0) { lo ^= ZEP_LO[nep]; hi ^= ZEP_HI[nep]; }
  this.half = (cap || (p & 7) === PAWN) ? 0 : this.half + 1;
  if (us) this.full++;
  this.side = us ^ 8;
  lo ^= ZS_LO; hi ^= ZS_HI;
  this.hlo = lo; this.hhi = hi;
  this.hist.push(lo);
};

Pos.prototype.unmake = function () {
  var u = this.stack.pop(), m = u.m, b = this.b;
  var from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7, fl = (m >> 17) & 31;
  this.side ^= 8;
  var us = this.side, p = promo ? (PAWN | us) : b[to];
  b[from] = p;
  if (fl & F_EP) { b[to] = 0; b[us ? to + 16 : to - 16] = u.cap; }
  else b[to] = u.cap;
  if (fl & F_CASTLE) { var rr = castleRook(to); b[rr[0]] = b[rr[1]]; b[rr[1]] = 0; }
  if ((p & 7) === KING) this.kings[us >> 3] = from;
  this.castle = u.castle; this.ep = u.ep; this.half = u.half; this.full = u.full;
  this.hlo = u.hlo; this.hhi = u.hhi;
  this.hist.pop();
};

Pos.prototype.legal = function () {
  var ms = this.gen(false), out = [], us = this.side;
  for (var i = 0; i < ms.length; i++) {
    this.make(ms[i]);
    if (!this.attacked(this.kings[us >> 3], this.side)) out.push(ms[i]);
    this.unmake();
  }
  return out;
};

function perft(pos, depth) {
  if (depth === 0) return 1;
  var ms = pos.gen(false), n = 0, us = pos.side;
  for (var i = 0; i < ms.length; i++) {
    pos.make(ms[i]);
    if (!pos.attacked(pos.kings[us >> 3], pos.side)) n += depth === 1 ? 1 : perft(pos, depth - 1);
    pos.unmake();
  }
  return n;
}

Pos.prototype.repCount = function () {
  var h = this.hist, n = h.length - 1, c = 0, lim = Math.max(0, n - this.half);
  for (var i = n; i >= lim; i -= 2) if (h[i] === h[n]) c++;
  return c;
};

Pos.prototype.insufficient = function () {
  var b = this.b, knights = 0, bishops = 0, col = -1, mixed = false;
  for (var sq = 0; sq < 120; sq++) {
    if (sq & 0x88) { sq += 7; continue; }
    var p = b[sq]; if (!p) continue;
    var t = p & 7;
    if (t === KING) continue;
    if (t === PAWN || t === ROOK || t === QUEEN) return false;
    if (t === KNIGHT) knights++;
    else { bishops++; var c = ((sq >> 4) + (sq & 7)) & 1; if (col < 0) col = c; else if (col !== c) mixed = true; }
  }
  if (knights + bishops <= 1) return true;
  if (knights === 0 && !mixed) return true;
  return false;
};

// {over, result: '1-0'|'0-1'|'1/2-1/2', reason}
Pos.prototype.status = function () {
  var ms = this.legal();
  if (!ms.length) {
    if (this.inCheck()) return { over: true, result: this.side ? '1-0' : '0-1', reason: 'checkmate' };
    return { over: true, result: '1/2-1/2', reason: 'stalemate' };
  }
  if (this.half >= 100) return { over: true, result: '1/2-1/2', reason: 'fifty' };
  if (this.repCount() >= 3) return { over: true, result: '1/2-1/2', reason: 'repetition' };
  if (this.insufficient()) return { over: true, result: '1/2-1/2', reason: 'insufficient' };
  return { over: false };
};

Pos.prototype.san = function (m, legalList) {
  var ms = legalList || this.legal();
  var from = mFrom(m), to = mTo(m), fl = mFlags(m), p = this.b[from], t = p & 7, s;
  if (fl & F_CASTLE) s = (to & 7) === 6 ? 'O-O' : 'O-O-O';
  else if (t === PAWN) {
    s = (fl & F_CAP) ? FILES[from & 7] + 'x' : '';
    s += sqName(to);
    if (fl & F_PROMO) s += '=' + 'NBRQ'[mPromo(m) - 2];
  } else {
    s = PIECE_CH[t].toUpperCase();
    var amb = false, sameFile = false, sameRank = false;
    for (var i = 0; i < ms.length; i++) {
      var o = ms[i], of = mFrom(o);
      if (of !== from && mTo(o) === to && (this.b[of] & 7) === t) {
        amb = true;
        if ((of & 7) === (from & 7)) sameFile = true;
        if ((of >> 4) === (from >> 4)) sameRank = true;
      }
    }
    if (amb) {
      if (!sameFile) s += FILES[from & 7];
      else if (!sameRank) s += (from >> 4) + 1;
      else s += sqName(from);
    }
    if (fl & F_CAP) s += 'x';
    s += sqName(to);
  }
  this.make(m);
  if (this.inCheck()) s += this.legal().length ? '+' : '#';
  this.unmake();
  return s;
};

Pos.prototype.parseSan = function (str) {
  var s = String(str).replace(/[+#?!]+$/, '').replace(/0/g, 'O');
  var l = this.legal();
  for (var i = 0; i < l.length; i++) if (this.san(l[i], l).replace(/[+#]$/, '') === s) return l[i];
  return 0;
};

function moveToUci(m) { return sqName(mFrom(m)) + sqName(mTo(m)) + (mPromo(m) ? 'nbrq'[mPromo(m) - 2] : ''); }
function uciToMove(pos, u) {
  var l = pos.legal();
  for (var i = 0; i < l.length; i++) if (moveToUci(l[i]) === u) return l[i];
  return 0;
}

/* =====================================================================
   ENGINE — evaluation, search, opening book
   ===================================================================== */
var MATE = 30000, INF = 32000;
var VAL_MG = [0, 100, 320, 330, 500, 950, 0], VAL_EG = [0, 120, 300, 315, 530, 950, 0];
var PHASE_W = [0, 0, 1, 1, 2, 4, 0];

// Piece-square tables, written from White's view with rank 8 first.
var PST_SRC = {
  P: [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5,
      0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
  PE: [0,0,0,0,0,0,0,0, 30,30,30,30,30,30,30,30, 20,20,20,20,20,20,20,20, 10,10,10,10,10,10,10,10,
      5,5,5,5,5,5,5,5, 0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0],
  N: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30,
      -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
  B: [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10,
      -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
  R: [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5,
      -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
  Q: [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5,
      0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
  KM: [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30,
      -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20],
  KE: [-50,-40,-30,-20,-20,-30,-40,-50, -30,-20,-10,0,0,-10,-20,-30, -30,-10,20,30,30,20,-10,-30, -30,-10,30,40,40,30,-10,-30,
      -30,-10,30,40,40,30,-10,-30, -30,-10,20,30,30,20,-10,-30, -30,-30,0,0,0,0,-30,-30, -50,-30,-30,-30,-30,-30,-30,-50]
};
// PST_MG/EG[piece*128+sq] include material; always from the piece owner's view (positive = good for owner).
var PST_MG = new Int16Array(16 * 128), PST_EG = new Int16Array(16 * 128);
(function () {
  var mg = [null, PST_SRC.P, PST_SRC.N, PST_SRC.B, PST_SRC.R, PST_SRC.Q, PST_SRC.KM];
  var eg = [null, PST_SRC.PE, PST_SRC.N, PST_SRC.B, PST_SRC.R, PST_SRC.Q, PST_SRC.KE];
  for (var t = 1; t <= 6; t++) for (var r = 0; r < 8; r++) for (var f = 0; f < 8; f++) {
    var sq = r * 16 + f, wi = (7 - r) * 8 + f, bi = r * 8 + f;
    PST_MG[t * 128 + sq] = VAL_MG[t] + mg[t][wi]; PST_EG[t * 128 + sq] = VAL_EG[t] + eg[t][wi];
    PST_MG[(t | 8) * 128 + sq] = VAL_MG[t] + mg[t][bi]; PST_EG[(t | 8) * 128 + sq] = VAL_EG[t] + eg[t][bi];
  }
})();
var PASSED_MG = [0, 5, 10, 15, 25, 40, 60, 0], PASSED_EG = [0, 10, 20, 35, 60, 90, 130, 0];
var MOB_MG = [0, 0, 4, 4, 2, 1, 0], MOB_EG = [0, 0, 4, 5, 4, 2, 0];
var NPM_V = [0, 0, 325, 325, 500, 975, 0];   // non-pawn material, used by the endgame rules
var KS_W = [0, 0, 2, 2, 3, 5, 0];            // king-attack weight per piece attacking the king zone
var KS_TABLE = new Int16Array(100);          // attack units -> middlegame penalty (grows quadratically)
(function () { for (var i = 0; i < 100; i++) KS_TABLE[i] = Math.min(400, Math.round(i * i * 0.7)); })();
var EV_ZONE = [new Int32Array(128), new Int32Array(128)], EV_STAMP = 0;

function dist(a, b) { return Math.max(Math.abs((a & 7) - (b & 7)), Math.abs((a >> 4) - (b >> 4))); }
function manhattan(a, b) { return Math.abs((a & 7) - (b & 7)) + Math.abs((a >> 4) - (b >> 4)); }
function centerDist(sq) { var f = sq & 7, r = sq >> 4; return Math.max(3 - f, f - 4) + Math.max(3 - r, r - 4); }
function sqColor(sq) { return ((sq >> 4) + (sq & 7)) & 1; }

// King zone: the king's square, its neighbours, and three squares two ranks ahead.
function markZone(k, c, stamp) {
  var z = EV_ZONE[c], fwd = c ? -16 : 16, i, t;
  z[k] = stamp;
  for (i = 0; i < 8; i++) { t = k + K_OFF[i]; if (!(t & 0x88)) z[t] = stamp; }
  for (i = -1; i <= 1; i++) { t = k + 2 * fwd + i; if (!(t & 0x88)) z[t] = stamp; }
}

/* ---------- KPK bitbase: exact result for king + pawn vs king ----------
   Built once by retrograde iteration (196,608 positions). Normalised so the
   pawn is White's and on files a-d; squares 0..63 with a1 = 0.            */
var KPK = null, KPK_K = [];
(function () {
  for (var s = 0; s < 64; s++) {
    var l = [];
    for (var df = -1; df <= 1; df++) for (var dr = -1; dr <= 1; dr++) {
      if (!df && !dr) continue;
      var f = (s & 7) + df, r = (s >> 3) + dr;
      if (f >= 0 && f < 8 && r >= 0 && r < 8) l.push(r * 8 + f);
    }
    KPK_K.push(l);
  }
})();
function d64(a, b) { return Math.max(Math.abs((a & 7) - (b & 7)), Math.abs((a >> 3) - (b >> 3))); }
function kpkIdx(wk, bk, stm, psq) { return ((((psq >> 3) - 1) * 4 + (psq & 7)) * 4096 + wk * 64 + bk) * 2 + stm; }
function buildKPK() {
  var INV = 0, UNK = 1, DRAW = 2, WIN = 4;
  var res = new Uint8Array(24 * 4096 * 2), psq, wk, bk, stm, idx, i, n;
  function pAtt(psq, sq) { return sq === psq + 9 || ((psq & 7) > 0 && sq === psq + 7); }
  for (psq = 8; psq < 56; psq++) {
    if ((psq & 7) > 3) continue;
    for (wk = 0; wk < 64; wk++) for (bk = 0; bk < 64; bk++) for (stm = 0; stm < 2; stm++) {
      idx = kpkIdx(wk, bk, stm, psq);
      var r = UNK;
      if (wk === bk || wk === psq || bk === psq || d64(wk, bk) <= 1) r = INV;
      else if (stm === 0 && pAtt(psq, bk)) r = INV;                       // Black in check with White to move
      else if (stm === 0 && (psq >> 3) === 6 && wk !== psq + 8 && bk !== psq + 8 &&
               (d64(bk, psq + 8) > 1 || d64(wk, psq + 8) === 1)) r = WIN;  // promotes safely
      else if (stm === 1) {
        var moves = false, nb = KPK_K[bk];
        for (i = 0; i < nb.length; i++) { n = nb[i]; if (d64(n, wk) > 1 && !pAtt(psq, n)) { moves = true; break; } }
        if (!moves) r = DRAW;                                              // stalemate
        else if (d64(bk, psq) === 1 && d64(wk, psq) > 1) r = DRAW;         // pawn falls
      }
      res[idx] = r;
    }
  }
  var changed = true;
  while (changed) {
    changed = false;
    for (psq = 8; psq < 56; psq++) {
      if ((psq & 7) > 3) continue;
      for (wk = 0; wk < 64; wk++) for (bk = 0; bk < 64; bk++) for (stm = 0; stm < 2; stm++) {
        idx = kpkIdx(wk, bk, stm, psq);
        if (res[idx] !== UNK) continue;
        var acc = 0, nbs;
        if (stm === 0) {
          nbs = KPK_K[wk];
          for (i = 0; i < nbs.length; i++) acc |= res[kpkIdx(nbs[i], bk, 1, psq)];
          if ((psq >> 3) < 6 && psq + 8 !== wk && psq + 8 !== bk) {
            acc |= res[kpkIdx(wk, bk, 1, psq + 8)];
            if ((psq >> 3) === 1 && psq + 16 !== wk && psq + 16 !== bk) acc |= res[kpkIdx(wk, bk, 1, psq + 16)];
          }
          n = (acc & WIN) ? WIN : (acc & UNK) ? UNK : DRAW;
        } else {
          nbs = KPK_K[bk];
          for (i = 0; i < nbs.length; i++) acc |= res[kpkIdx(wk, nbs[i], 0, psq)];
          n = (acc & DRAW) ? DRAW : (acc & UNK) ? UNK : WIN;
        }
        if (n !== UNK) { res[idx] = n; changed = true; }
      }
    }
  }
  return res;
}
// Score (White's view) for a position with exactly one pawn and no other pieces.
function kpkScore(pos, strong, psq0) {
  if (!KPK) KPK = buildKPK();
  var mirror = (psq0 & 7) > 3;
  function n(sq) { var f = sq & 7, r = sq >> 4; if (strong) r = 7 - r; if (mirror) f = 7 - f; return r * 8 + f; }
  var P = n(psq0), stm = pos.side === (strong ? 8 : 0) ? 0 : 1;
  if (KPK[kpkIdx(n(pos.kings[strong]), n(pos.kings[strong ^ 1]), stm, P)] !== 4) return 0;
  var v = 800 + (P >> 3) * 15;
  return strong ? -v : v;
}

var EVB = {
  mg: new Int32Array(2), eg: new Int32Array(2), npm: new Int32Array(2), bcol: new Int8Array(2),
  kUnits: new Int32Array(2), kAtt: new Int32Array(2), wMin: new Int8Array(8), bMax: new Int8Array(8),
  pf: [new Int8Array(8), new Int8Array(8)], cnt: [new Int8Array(7), new Int8Array(7)],
  pawns: [[], []], rooks: [[], []], passers: [[], []]
};
// Static evaluation in centipawns from the side to move's perspective.
function evaluate(pos) {
  var b = pos.b, sq, p, t, s, c, i, d, to, mob, att, z;
  // scratch buffers are reused across calls (evaluate is never re-entered)
  var mg = EVB.mg, eg = EVB.eg, phase = 0, pf = EVB.pf, wMin = EVB.wMin, bMax = EVB.bMax;  // wMin/bMax: rearmost pawn per file
  var pawns = EVB.pawns, rooks = EVB.rooks, passers = EVB.passers, cnt = EVB.cnt, npm = EVB.npm, bcol = EVB.bcol;
  var kUnits = EVB.kUnits, kAtt = EVB.kAtt;  // attacks on side c's king zone
  mg[0] = mg[1] = eg[0] = eg[1] = npm[0] = npm[1] = kUnits[0] = kUnits[1] = kAtt[0] = kAtt[1] = 0;
  bcol[0] = bcol[1] = -1; wMin.fill(8); bMax.fill(-1);
  for (c = 0; c < 2; c++) { pf[c].fill(0); cnt[c].fill(0); pawns[c].length = 0; rooks[c].length = 0; passers[c].length = 0; }
  var k0 = pos.kings[0], k1 = pos.kings[1], stamp = ++EV_STAMP;
  markZone(k0, 0, stamp); markZone(k1, 1, stamp);

  for (sq = 0; sq < 120; sq++) {
    if (sq & 0x88) { sq += 7; continue; }
    p = b[sq]; if (!p) continue;
    t = p & 7; s = p & 8; c = s >> 3; i = p * 128 + sq;
    mg[c] += PST_MG[i]; eg[c] += PST_EG[i];
    phase += PHASE_W[t]; cnt[c][t]++; npm[c] += NPM_V[t];
    if (t === PAWN) {
      var f = sq & 7, r = sq >> 4;
      pf[c][f]++; pawns[c].push(sq);
      if (c) { if (r > bMax[f]) bMax[f] = r; } else if (r < wMin[f]) wMin[f] = r;
    } else if (t !== KING) {
      if (t === BISHOP) bcol[c] = sqColor(sq);
      else if (t === ROOK) rooks[c].push(sq);
      mob = 0; att = 0; z = EV_ZONE[c ^ 1];
      if (t === KNIGHT) {
        for (i = 0; i < 8; i++) {
          to = sq + N_OFF[i];
          if (to & 0x88) continue;
          if (!b[to] || (b[to] & 8) !== s) mob++;
          if (z[to] === stamp) att++;
        }
      } else {
        var offs = t === BISHOP ? B_OFF : (t === ROOK ? R_OFF : K_OFF);
        for (i = 0; i < offs.length; i++) {
          d = offs[i]; to = sq + d;
          while (!(to & 0x88)) {
            if (z[to] === stamp) att++;
            if (b[to]) { if ((b[to] & 8) !== s) mob++; break; }
            mob++; to += d;
          }
        }
      }
      mg[c] += mob * MOB_MG[t]; eg[c] += mob * MOB_EG[t];
      if (att) { kAtt[c ^ 1]++; kUnits[c ^ 1] += KS_W[t] + att; }
    }
  }

  // Pawn structure: doubled, isolated, passed (+ king proximity, unstoppable runners)
  for (f = 0; f < 8; f++) for (c = 0; c < 2; c++) {
    var n = pf[c][f];
    if (!n) continue;
    if (n > 1) { mg[c] -= 10 * (n - 1); eg[c] -= 20 * (n - 1); }
    if (!(f > 0 && pf[c][f - 1]) && !(f < 7 && pf[c][f + 1])) { mg[c] -= 12 * n; eg[c] -= 15 * n; }
  }
  for (c = 0; c < 2; c++) {
    var own = pos.kings[c], opp = pos.kings[c ^ 1], up = c ? -16 : 16;
    for (i = 0; i < pawns[c].length; i++) {
      sq = pawns[c][i];
      var pfile = sq & 7, prank = sq >> 4, rel = c ? 7 - prank : prank, passed = true;
      for (var ff = Math.max(0, pfile - 1); ff <= Math.min(7, pfile + 1); ff++) {
        if (c === 0 ? bMax[ff] > prank : (wMin[ff] < prank)) { passed = false; break; }
      }
      if (!passed) continue;
      passers[c].push(sq);
      mg[c] += PASSED_MG[rel]; eg[c] += PASSED_EG[rel];
      if (rel >= 3) {
        var front = sq + up;
        eg[c] += (dist(opp, front) * 5 - dist(own, front) * 2) * (rel - 2);
      }
      if (npm[c ^ 1] === 0) {
        // Rule of the square: the defending king cannot catch the pawn.
        var promo = c ? pfile : 112 + pfile, pd = 7 - rel, blocked = false;
        if (rel === 1) pd--;
        for (to = sq + up; to !== promo + up; to += up) if (b[to]) { blocked = true; break; }
        var kd = dist(opp, promo) - (pos.side === (c ? 0 : 8) ? 1 : 0);
        if (!blocked && kd > pd) eg[c] += 500 + rel * 10;
      }
    }
  }

  // Rooks: open / half-open files, 7th rank, behind passed pawns
  for (c = 0; c < 2; c++) {
    for (i = 0; i < rooks[c].length; i++) {
      sq = rooks[c][i];
      var rf = sq & 7, rr = sq >> 4, rrel = c ? 7 - rr : rr;
      if (!pf[c][rf]) { if (!pf[c ^ 1][rf]) { mg[c] += 25; eg[c] += 10; } else { mg[c] += 12; eg[c] += 6; } }
      if (rrel === 6) {
        var ekRel = c ? 7 - (k0 >> 4) : (k1 >> 4), pawnsOn7 = false;
        for (var j = 0; j < pawns[c ^ 1].length; j++) if ((pawns[c ^ 1][j] >> 4) === rr) { pawnsOn7 = true; break; }
        if (ekRel === 7 || pawnsOn7) { mg[c] += 20; eg[c] += 30; }
      }
      for (var pc = 0; pc < 2; pc++) for (j = 0; j < passers[pc].length; j++) {
        var ps = passers[pc][j];
        if ((ps & 7) !== rf) continue;
        var behind = pc === 0 ? rr < (ps >> 4) : rr > (ps >> 4);
        if (behind) eg[c] += pc === c ? 20 : 15;
      }
    }
  }

  // King safety (middlegame): pawn shield, open files near the king, pieces attacking the king zone
  for (c = 0; c < 2; c++) {
    var k = pos.kings[c], kf = k & 7, krel = c ? 7 - (k >> 4) : (k >> 4), shield = 0;
    if (krel <= 1 && (kf <= 2 || kf >= 5)) {      // castled / flank king
      for (ff = Math.max(0, kf - 1); ff <= Math.min(7, kf + 1); ff++) {
        var prel = c ? 7 - bMax[ff] : wMin[ff];
        if (prel === krel + 1) { /* intact */ }
        else if (prel === krel + 2) shield -= 10;
        else shield -= 22;
        if (!pf[c][ff]) shield -= pf[c ^ 1][ff] ? 8 : 15;
      }
    }
    mg[c] += shield;
    if (kAtt[c] >= 2) {
      var units = kUnits[c] + (shield <= -40 ? 3 : 0), pen = KS_TABLE[Math.min(99, units)];
      if (!cnt[c ^ 1][QUEEN]) pen >>= 1;
      mg[c] -= pen;
    }
  }

  for (c = 0; c < 2; c++) if (cnt[c][BISHOP] >= 2) { mg[c] += 30; eg[c] += 45; }
  if (phase > 24) phase = 24;
  var score = ((((mg[0] - mg[1]) * phase) + ((eg[0] - eg[1]) * (24 - phase))) / 24) | 0;
  if (npm[0] + npm[1] <= 2000) score = endgameAdjust(pos, score, cnt, npm, pawns, bcol);
  return pos.side ? -score : score;
}

/* ---------- Endgame knowledge: exact KPK, drawish scaling, mop-up ---------- */
function endgameAdjust(pos, score, cnt, npm, pawns, bcol) {
  var np0 = cnt[0][PAWN], np1 = cnt[1][PAWN];
  if (npm[0] + npm[1] === 0 && np0 + np1 === 1) return kpkScore(pos, np0 ? 0 : 1, np0 ? pawns[0][0] : pawns[1][0]);
  if (!score) return 0;
  var strong = score > 0 ? 0 : 1, weak = strong ^ 1;
  var sP = cnt[strong][PAWN], wP = cnt[weak][PAWN], sK = pos.kings[strong], wK = pos.kings[weak], scale = 64;

  if (sP === 0) {
    if (npm[strong] <= 325) scale = 0;                                      // a lone minor cannot win
    else if (npm[strong] - npm[weak] <= 325) scale = 8;                    // e.g. KR v KB, KRB v KR
    else if (cnt[strong][KNIGHT] === 2 && npm[strong] === 650) scale = wP ? 16 : 0;  // KNN
  }
  // Rook pawn(s) with the wrong bishop or no pieces, defending king on the queening corner
  if (sP && npm[weak] === 0 && wP === 0 && (npm[strong] === 0 || (npm[strong] === 325 && cnt[strong][BISHOP] === 1))) {
    var pfile = pawns[strong][0] & 7, same = pfile === 0 || pfile === 7;
    for (var i = 1; i < pawns[strong].length && same; i++) if ((pawns[strong][i] & 7) !== pfile) same = false;
    if (same) {
      var promo = strong ? pfile : 112 + pfile;
      var rightBishop = npm[strong] === 325 && bcol[strong] === sqColor(promo);
      if (!rightBishop && dist(wK, promo) <= 1) scale = 0;
    }
  }
  // Opposite-coloured bishops
  if (cnt[0][BISHOP] === 1 && cnt[1][BISHOP] === 1 && bcol[0] !== bcol[1]) {
    if (npm[0] === 325 && npm[1] === 325) scale = Math.min(scale, Math.abs(np0 - np1) <= 1 ? 16 : 32);
    else scale = Math.min(scale, 48);
  }
  // Single-rook endings with at most one extra pawn are drawish
  if (npm[0] === 500 && npm[1] === 500 && cnt[0][ROOK] === 1 && cnt[1][ROOK] === 1 && Math.abs(np0 - np1) <= 1) scale = Math.min(scale, 44);

  score = (score * scale / 64) | 0;
  // Mop-up: with decisive material and no defending pawns, drive the king to the edge
  if (scale && wP === 0 && npm[strong] >= 500 && npm[strong] - npm[weak] >= 400) {
    var bonus = 10 * centerDist(wK) + 4 * (14 - manhattan(sK, wK));
    if (sP === 0 && npm[strong] === 650 && cnt[strong][BISHOP] === 1 && cnt[strong][KNIGHT] === 1) {
      var c1 = bcol[strong] === sqColor(0) ? 0 : 7, c2 = c1 === 0 ? 119 : 112;   // corners of the bishop's colour
      bonus += 20 * (7 - Math.min(dist(wK, c1), dist(wK, c2)));
    }
    score += strong ? -bonus : bonus;
  }
  return score;
}

/* ---------- Static exchange evaluation ----------
   Net material gain of the capture sequence on the target square, both sides
   always recapturing with their least valuable attacker (x-rays included).  */
var SEE_V = [0, 100, 325, 325, 500, 975, 20000];
var SEE_GAIN = new Int32Array(40), SEE_SQ = new Int32Array(40), SEE_PC = new Int32Array(40);
function lva(b, sq, s) {
  var t, i, d, q, qt, best = -1, bt = 7;
  if (s === 0) {
    t = sq - 15; if (!(t & 0x88) && b[t] === PAWN) return t;
    t = sq - 17; if (!(t & 0x88) && b[t] === PAWN) return t;
  } else {
    t = sq + 15; if (!(t & 0x88) && b[t] === (PAWN | 8)) return t;
    t = sq + 17; if (!(t & 0x88) && b[t] === (PAWN | 8)) return t;
  }
  var kn = KNIGHT | s;
  for (i = 0; i < 8; i++) { t = sq + N_OFF[i]; if (!(t & 0x88) && b[t] === kn) return t; }
  for (i = 0; i < 4; i++) {
    d = B_OFF[i]; t = sq + d;
    while (!(t & 0x88)) {
      q = b[t];
      if (q) { qt = q & 7; if ((q & 8) === s && (qt === BISHOP || qt === QUEEN) && qt < bt) { bt = qt; best = t; } break; }
      t += d;
    }
  }
  if (bt === BISHOP) return best;
  for (i = 0; i < 4; i++) {
    d = R_OFF[i]; t = sq + d;
    while (!(t & 0x88)) {
      q = b[t];
      if (q) { qt = q & 7; if ((q & 8) === s && (qt === ROOK || qt === QUEEN) && qt < bt) { bt = qt; best = t; } break; }
      t += d;
    }
  }
  if (best >= 0) return best;
  var kg = KING | s;
  for (i = 0; i < 8; i++) { t = sq + K_OFF[i]; if (!(t & 0x88) && b[t] === kg) return t; }
  return -1;
}
function see(pos, m) {
  var b = pos.b, from = m & 127, to = (m >> 7) & 127, fl = (m >> 17) & 31, nr = 0, d = 0;
  var gain = SEE_GAIN, attVal = SEE_V[b[from] & 7];
  gain[0] = (fl & F_EP) ? 100 : SEE_V[b[to] & 7];
  if (fl & F_PROMO) { gain[0] += SEE_V[QUEEN] - 100; attVal = SEE_V[QUEEN]; }
  SEE_SQ[nr] = from; SEE_PC[nr++] = b[from]; b[from] = 0;
  if (fl & F_EP) { var cs = pos.side ? to + 16 : to - 16; SEE_SQ[nr] = cs; SEE_PC[nr++] = b[cs]; b[cs] = 0; }
  var side = pos.side ^ 8;
  while (d < 38) {
    d++;
    gain[d] = attVal - gain[d - 1];
    if (Math.max(-gain[d - 1], gain[d]) < 0) break;
    var a = lva(b, to, side);
    if (a < 0) break;
    var at = b[a] & 7;
    if (at === KING && lva(b, to, side ^ 8) >= 0) break;   // king may not capture into an attack
    SEE_SQ[nr] = a; SEE_PC[nr++] = b[a]; b[a] = 0;
    attVal = SEE_V[at];
    side ^= 8;
  }
  while (--d) gain[d - 1] = -Math.max(-gain[d - 1], gain[d]);
  while (nr--) b[SEE_SQ[nr]] = SEE_PC[nr];
  return gain[0];
}

// Null move helpers (search only)
Pos.prototype.makeNull = function () {
  this.stack.push({ m: 0, ep: this.ep, half: this.half, hlo: this.hlo, hhi: this.hhi });
  var lo = this.hlo ^ ZS_LO, hi = this.hhi ^ ZS_HI;
  if (this.ep >= 0) { lo ^= ZEP_LO[this.ep]; hi ^= ZEP_HI[this.ep]; }
  this.ep = -1; this.half = 0; this.side ^= 8; this.hlo = lo; this.hhi = hi;
  this.hist.push(lo);
};
Pos.prototype.unmakeNull = function () {
  var u = this.stack.pop();
  this.side ^= 8; this.ep = u.ep; this.half = u.half; this.hlo = u.hlo; this.hhi = u.hhi;
  this.hist.pop();
};

/* ---------- Search: negamax + alpha-beta, PVS, iterative deepening, quiescence,
   MVV-LVA, killers, history, null move, LMR, Zobrist transposition table ---------- */
var TT_EXACT = 1, TT_LOWER = 2, TT_UPPER = 3;
function Searcher() {
  var n = 1 << 20;
  this.mask = n - 1;
  this.tLo = new Int32Array(n); this.tHi = new Int32Array(n); this.tMove = new Int32Array(n);
  this.tScore = new Int16Array(n); this.tDepth = new Int8Array(n); this.tFlag = new Int8Array(n);
  this.killers = new Int32Array(256);
  this.history = new Int32Array(16 * 128);
  this.nodes = 0; this.stop = false; this.deadline = 0; this.noise = 0; this.useTT = true;
}
Searcher.prototype.clearTT = function () { this.tFlag.fill(0); };

Searcher.prototype.evalNoisy = function (pos) {
  var e = evaluate(pos);
  if (this.noise) e += ((Math.random() * 2 - 1) * this.noise) | 0;
  return e;
};

Searcher.prototype.scoreMoves = function (pos, ms, ttMove, ply) {
  var b = pos.b, sc = new Array(ms.length), k1 = this.killers[ply * 2], k2 = this.killers[ply * 2 + 1];
  for (var i = 0; i < ms.length; i++) {
    var m = ms[i], fl = (m >> 17) & 31;
    if (m === ttMove) sc[i] = 2000000;
    else if (fl & F_CAP) {
      var victim = (fl & F_EP) ? PAWN : (b[(m >> 7) & 127] & 7), attacker = b[m & 127] & 7;
      var mvv = victim * 100 - attacker + ((fl & F_PROMO) ? (m >> 14 & 7) * 10 : 0);
      // Captures that lose material by SEE are tried after the quiet moves.
      if (SEE_V[victim] < SEE_V[attacker] && !(fl & F_PROMO) && see(pos, m) < 0) sc[i] = -200000 + mvv;
      else sc[i] = 1000000 + mvv;
    } else if (fl & F_PROMO) sc[i] = (((m >> 14) & 7) === QUEEN) ? 950000 : -1000;
    else if (m === k1) sc[i] = 900000;
    else if (m === k2) sc[i] = 800000;
    else sc[i] = this.history[b[m & 127] * 128 + ((m >> 7) & 127)];
  }
  return sc;
};

function pickNext(ms, sc, i) {
  var best = i;
  for (var j = i + 1; j < ms.length; j++) if (sc[j] > sc[best]) best = j;
  if (best !== i) {
    var t = ms[i]; ms[i] = ms[best]; ms[best] = t;
    var u = sc[i]; sc[i] = sc[best]; sc[best] = u;
  }
  return ms[i];
}

Searcher.prototype.checkTime = function () {
  if ((++this.nodes & 2047) === 0 && Date.now() > this.deadline) this.stop = true;
  return this.stop;
};

Searcher.prototype.qsearch = function (pos, alpha, beta, ply) {
  if (this.checkTime()) return 0;
  var inCheck = pos.inCheck(), stand = 0, best, ms;
  if (ply >= 120) return this.evalNoisy(pos);
  if (!inCheck) {
    stand = this.evalNoisy(pos);
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    best = stand;
    ms = pos.gen(true);
  } else {
    best = -MATE + ply;
    ms = pos.gen(false);
  }
  var sc = this.scoreMoves(pos, ms, 0, Math.min(ply, 127)), legal = 0, us = pos.side;
  for (var i = 0; i < ms.length; i++) {
    var m = pickNext(ms, sc, i), fl = (m >> 17) & 31;
    if (!inCheck && !(fl & F_PROMO)) {
      if (sc[i] < 0) break;                                // remaining captures all lose material (SEE < 0)
      var victim = (fl & F_EP) ? PAWN : (pos.b[(m >> 7) & 127] & 7);
      if (stand + VAL_EG[victim] + 200 < alpha) continue; // delta pruning
    }
    pos.make(m);
    if (pos.attacked(pos.kings[us >> 3], pos.side)) { pos.unmake(); continue; }
    legal++;
    var s = -this.qsearch(pos, -beta, -alpha, ply + 1);
    pos.unmake();
    if (this.stop) return 0;
    if (s > best) {
      best = s;
      if (s > alpha) { alpha = s; if (s >= beta) return s; }
    }
  }
  if (inCheck && legal === 0) return -MATE + ply;
  return best;
};

function hasNonPawn(pos, side) {
  var b = pos.b;
  for (var sq = 0; sq < 120; sq++) {
    if (sq & 0x88) { sq += 7; continue; }
    var p = b[sq];
    if (p && (p & 8) === side && (p & 7) !== PAWN && (p & 7) !== KING) return true;
  }
  return false;
}

Searcher.prototype.negamax = function (pos, depth, alpha, beta, ply, allowNull) {
  if (this.checkTime()) return 0;
  var inCheck = pos.inCheck();
  if (ply > 0) {
    if (pos.half >= 100 || pos.repCount() >= 2) return 0;
    if (ply >= 100) return this.evalNoisy(pos);
    // mate distance pruning
    var ma = -MATE + ply, mb = MATE - ply - 1;
    if (ma > alpha) alpha = ma;
    if (mb < beta) beta = mb;
    if (alpha >= beta) return alpha;
  }
  if (inCheck) depth++;
  if (depth <= 0) return this.qsearch(pos, alpha, beta, ply);

  var idx = pos.hlo & this.mask, ttMove = 0, isPV = beta - alpha > 1;
  if (this.useTT && this.tFlag[idx] && this.tLo[idx] === pos.hlo && this.tHi[idx] === pos.hhi) {
    ttMove = this.tMove[idx];
    if (ply > 0 && !isPV && this.tDepth[idx] >= depth) {
      var ts = this.tScore[idx], tf = this.tFlag[idx];
      if (ts > MATE - 200) ts -= ply; else if (ts < -MATE + 200) ts += ply;
      if (tf === TT_EXACT || (tf === TT_LOWER && ts >= beta) || (tf === TT_UPPER && ts <= alpha)) return ts;
    }
  }

  // null move pruning
  if (allowNull && !isPV && !inCheck && depth >= 3 && ply > 0 && Math.abs(beta) < MATE - 200 && hasNonPawn(pos, pos.side) &&
      this.evalNoisy(pos) >= beta) {
    pos.makeNull();
    var ns = -this.negamax(pos, depth - 3, -beta, -beta + 1, ply + 1, false);
    pos.unmakeNull();
    if (this.stop) return 0;
    if (ns >= beta) return beta;
  }

  var ms = pos.gen(false), sc = this.scoreMoves(pos, ms, ttMove, ply);
  var origAlpha = alpha, best = -INF, bestMove = 0, legal = 0, us = pos.side;
  for (var i = 0; i < ms.length; i++) {
    var m = pickNext(ms, sc, i), fl = (m >> 17) & 31;
    pos.make(m);
    if (pos.attacked(pos.kings[us >> 3], pos.side)) { pos.unmake(); continue; }
    legal++;
    var s, quiet = !(fl & (F_CAP | F_PROMO));
    if (legal === 1) s = -this.negamax(pos, depth - 1, -beta, -alpha, ply + 1, true);
    else {
      var red = (depth >= 3 && legal > 4 && quiet && !inCheck && sc[i] < 800000 && !pos.inCheck()) ? 1 : 0;
      s = -this.negamax(pos, depth - 1 - red, -alpha - 1, -alpha, ply + 1, true);
      if (s > alpha && !this.stop) s = -this.negamax(pos, depth - 1, -beta, -alpha, ply + 1, true);
    }
    pos.unmake();
    if (this.stop) return 0;
    if (s > best) {
      best = s; bestMove = m;
      if (ply === 0) { this.rootMove = m; this.rootScore = s; }
      if (s > alpha) {
        alpha = s;
        if (s >= beta) {
          if (quiet) {
            if (this.killers[ply * 2] !== m) { this.killers[ply * 2 + 1] = this.killers[ply * 2]; this.killers[ply * 2] = m; }
            this.history[pos.b[m & 127] * 128 + ((m >> 7) & 127)] += depth * depth;
          }
          break;
        }
      }
    }
  }
  if (legal === 0) return inCheck ? -MATE + ply : 0;
  if (this.useTT) {
    var st = best;
    if (st > MATE - 200) st += ply; else if (st < -MATE + 200) st -= ply;
    this.tLo[idx] = pos.hlo; this.tHi[idx] = pos.hhi; this.tMove[idx] = bestMove;
    this.tScore[idx] = st; this.tDepth[idx] = depth > 127 ? 127 : depth;
    this.tFlag[idx] = best <= origAlpha ? TT_UPPER : (best >= beta ? TT_LOWER : TT_EXACT);
  }
  return best;
};

// opts: {time ms, depth max, noise cp}. Returns {move, score, depth, nodes}.
Searcher.prototype.search = function (pos, opts) {
  opts = opts || {};
  var t0 = Date.now(), time = opts.time || 1000, maxDepth = opts.depth || 64;
  this.deadline = t0 + time; this.stop = false; this.nodes = 0;
  this.noise = opts.noise || 0; this.useTT = !this.noise;
  this.killers.fill(0);
  for (var h = 0; h < this.history.length; h++) this.history[h] >>= 2;
  var legal = pos.legal();
  if (!legal.length) return { move: 0, score: pos.inCheck() ? -MATE : 0, depth: 0, nodes: 0 };
  var bestMove = legal[0], bestScore = 0, done = 0;
  for (var d = 1; d <= maxDepth; d++) {
    this.rootMove = 0; this.rootScore = -INF;
    var s = this.negamax(pos, d, -INF, INF, 0, false);
    if (this.stop) {
      // a root move that completed a full search and improved on alpha is trustworthy
      if (this.rootMove && this.rootScore > bestScore) { bestMove = this.rootMove; bestScore = this.rootScore; }
      break;
    }
    bestMove = this.rootMove || bestMove; bestScore = s; done = d;
    if (Math.abs(s) > MATE - 200 && MATE - Math.abs(s) <= d) break; // forced mate found
    if (legal.length === 1) break;
    if (Date.now() - t0 > time * 0.55) break; // next iteration would not finish
  }
  this.noise = 0;
  return { move: bestMove, score: bestScore, depth: done, nodes: this.nodes };
};

/* ---------- Opening book (~20 common lines, SAN) ---------- */
var BOOK_LINES = [
  'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7',          // Ruy Lopez
  'e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4 Nd6',         // Berlin
  'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6',            // Italian
  'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6',      // Scotch
  'e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4 d4 d5',          // Petrov
  'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6',          // Sicilian Najdorf
  'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5',         // Sicilian Sveshnikov
  'e4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7 d3 d6',             // Closed Sicilian
  'e4 e6 d4 d5 Nc3 Nf6 Bg5 Be7 e5 Nfd7',           // French
  'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6',         // Caro-Kann
  'e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3 c6',         // Scandinavian
  'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O',            // Queen's Gambit Declined
  'd4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5',           // Slav
  'd4 d5 c4 dxc4 Nf3 Nf6 e3 e6 Bxc4 c5',           // Queen's Gambit Accepted
  'd4 d5 Bf4 Nf6 e3 c5 c3 Nc6 Nd2 e6',             // London
  'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O',            // King's Indian
  'd4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Bd3 d5',            // Nimzo-Indian
  'd4 Nf6 c4 e6 Nf3 b6 g3 Bb7 Bg2 Be7',            // Queen's Indian
  'd4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5 e4 Nxc3 bxc3 Bg7', // Grünfeld
  'c4 e5 Nc3 Nf6 Nf3 Nc6 g3 d5 cxd5 Nxd5',         // English
  'c4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7 Nf3 Nf6',           // Symmetrical English
  'Nf3 d5 g3 Nf6 Bg2 e6 O-O Be7 d3 O-O'            // Réti
];
var BOOK = null;
function bookKey(pos) { return pos.fen().split(' ').slice(0, 4).join(' '); }
function buildBook() {
  if (BOOK) return BOOK;
  BOOK = {};
  for (var i = 0; i < BOOK_LINES.length; i++) {
    var p = new Pos(), sans = BOOK_LINES[i].split(' ');
    for (var j = 0; j < sans.length; j++) {
      var m = p.parseSan(sans[j]);
      if (!m) break;
      var k = bookKey(p), u = moveToUci(m);
      if (!BOOK[k]) BOOK[k] = {};
      BOOK[k][u] = (BOOK[k][u] || 0) + 1;
      p.make(m);
    }
  }
  return BOOK;
}
function bookMove(pos) {
  var e = buildBook()[bookKey(pos)];
  if (!e) return 0;
  var keys = Object.keys(e), total = 0, i;
  for (i = 0; i < keys.length; i++) total += e[keys[i]];
  var r = Math.random() * total;
  for (i = 0; i < keys.length; i++) { r -= e[keys[i]]; if (r < 0) return uciToMove(pos, keys[i]); }
  return uciToMove(pos, keys[0]);
}

/* ---------- Difficulty levels ---------- */
var LEVELS = {
  beginner: { time: 400, depth: 1, noise: 150, blunder: 0.3, blunderMargin: 350 },
  improver: { time: 400, depth: 3, noise: 50, blunder: 0.12, blunderMargin: 200 },
  casual:   { time: 500 },
  club:     { time: 1500 },
  strong:   { time: 4000 }
};
function engineThink(s, pos, level, useBook) {
  if (useBook !== false) {
    var bm = bookMove(pos);
    if (bm) return { move: bm, score: 0, depth: 0, nodes: 0, book: true };
  }
  var L = LEVELS[level] || LEVELS.club;
  var r = s.search(pos, { time: L.time, depth: L.depth || 64, noise: L.noise || 0 });
  if (L.blunder && r.move && Math.random() < L.blunder) {
    // Occasionally play a weaker (but not suicidal) alternative.
    var legal = pos.legal(), scored = [], best = -INF;
    s.deadline = Date.now() + 1000; s.stop = false; s.noise = 0;
    for (var i = 0; i < legal.length; i++) {
      pos.make(legal[i]);
      var v = -s.qsearch(pos, -INF, INF, 1);
      pos.unmake();
      scored.push([legal[i], v]); if (v > best) best = v;
    }
    var alts = scored.filter(function (x) { return x[0] !== r.move && x[1] >= best - L.blunderMargin; });
    if (alts.length) r.move = alts[(Math.random() * alts.length) | 0][0];
  }
  r.book = false;
  return r;
}


/* =====================================================================
   WORKER BOOTSTRAP — runs inside the Web Worker. The UI concatenates the
   engine-src script with this text into a Blob and wraps both in one
   function scope (faster local lookups than worker globals).
   Request:  {id, kind: 'move'|'hint', fen, moves: [uci...], level}
   Response: {id, move: uci|null, book, depth, score}
   ===================================================================== */
var S = new Searcher();
self.onmessage = function (e) {
  var d = e.data, p = new Pos(d.fen);
  for (var i = 0; i < d.moves.length; i++) {
    var m = uciToMove(p, d.moves[i]);
    if (!m) break;
    p.make(m);
  }
  var r = engineThink(S, p, d.kind === 'hint' ? 'club' : d.level, true);
  self.postMessage({ id: d.id, move: r.move ? moveToUci(r.move) : null, book: !!r.book, depth: r.depth, score: r.score });
};

})();