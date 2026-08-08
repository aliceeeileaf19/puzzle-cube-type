/*!
 * puzzle-cube-type 0.2.0 — a 7x7 puzzle cube that turns itself into letters.
 * https://github.com/aliceeeileaf19/puzzle-cube-type
 * MIT License. Copyright (c) 2026 Alice I Leaf
 *
 * It is a real puzzle cube, by the rules:
 *   - Sticker colours are decided once (3 light faces, 3 dark) and NEVER change.
 *   - The only permitted operation is "pick an axis, pick a layer, turn +/-90".
 *   - Every letter is reached by a sequence of legal layer turns that carries
 *     light stickers onto the cells the glyph needs lit.
 *
 * What makes that tractable is one commutator identity:
 *
 *     [C_i , R_j]  =  C_i · R_j · C_i⁻¹ · R_j⁻¹
 *
 * where C_i turns the layer x=i (touching only column i of the front face) and
 * R_j turns the layer y=j (touching only row j). A front cell in neither the
 * column nor the row is untouched by both halves. A cell in the column but not
 * the row is carried out by C_i and carried back by C_i⁻¹, and vice versa.
 * So the whole sequence changes EXACTLY ONE front cell: the intersection (i,j).
 * That gives a tool for fixing cells one at a time without disturbing cells
 * already fixed — which is the entire solver.
 *
 * The 3-light/3-dark colouring is not arbitrary. Every piece-type orbit is
 * spread evenly over the six faces (orbit size = cells-per-face x 6), so
 * colouring whole faces gives every orbit exactly half light and half dark —
 * the maximum slack. See README for the per-orbit numbers.
 */
(() => {
  'use strict';

  const VERSION = '0.2.0';

  const N = 7;              /* cube order. 5 or 9 also work; supply matching GLYPHS. */
  const R = (N - 1) / 2;    /* coordinates run -R..R */

  /* Which three faces are light. Any three give every orbit a half/half split,
     so this choice is purely cosmetic. 'front' is deliberately dark: a reset
     cube is a clean dark grid that letters get written onto in light pixels,
     while the top and right faces the default camera sees are light, which is
     what gives the cube its solidity. */
  const LIGHT_FACES = ['top', 'right', 'back'];

  /* ── Rhythm ───────────────────────────────────────────────────────────
     A letter takes however many turns the solver needs (0 to ~85), so the
     pacing is: hammer through the early turns like a speedcuber, then slow
     down hard over the last three so the glyph resolves as it settles. */
  const FAST      = 78;
  const FAST_GAP  = 6;
  const TAIL      = [200, 300, 440];
  const TAIL_GAP  = 46;
  const HOLD      = 700;
  const MIN_MOVES = 8;   /* pad short solves with front-preserving turns */

  const EASE_FLICK  = 'cubic-bezier(.3,.86,.26,1)';
  const EASE_SETTLE = 'cubic-bezier(.22,1.2,.3,1)';

  /* Shortening the solution. Greedy descent on its own is deterministic, so
     re-running it explores nothing. Randomising the tie-breaks and allowing a
     few distance-neutral moves is what makes restarts pay off; together with
     sequence cancellation this takes ~22% off the move count. */
  const RESTARTS = 10;   /* keep the shortest of N randomised attempts */
  const PLATEAU  = 3;    /* distance-neutral moves allowed, to escape a local minimum */

  const DRAG_SENS  = 0.42;
  const DRAG_SLOP  = 6;
  const TILT_LIMIT = 78;

  /* ── 7x7 pixel alphabet ─────────────────────────────────────────────── */
  const GLYPHS = {
    A: ['..###..','.#...#.','#.....#','#.....#','#######','#.....#','#.....#'],
    B: ['######.','#.....#','#.....#','######.','#.....#','#.....#','######.'],
    C: ['.#####.','#.....#','#......','#......','#......','#.....#','.#####.'],
    D: ['#####..','#....#.','#.....#','#.....#','#.....#','#....#.','#####..'],
    E: ['#######','#......','#......','#####..','#......','#......','#######'],
    F: ['#######','#......','#......','#####..','#......','#......','#......'],
    G: ['.#####.','#.....#','#......','#..####','#.....#','#.....#','.#####.'],
    H: ['#.....#','#.....#','#.....#','#######','#.....#','#.....#','#.....#'],
    I: ['#######','...#...','...#...','...#...','...#...','...#...','#######'],
    J: ['..#####','.....#.','.....#.','.....#.','.....#.','#....#.','.####..'],
    K: ['#.....#','#....#.','#...#..','####...','#...#..','#....#.','#.....#'],
    L: ['#......','#......','#......','#......','#......','#......','#######'],
    M: ['#.....#','##...##','#.#.#.#','#..#..#','#.....#','#.....#','#.....#'],
    N: ['#.....#','##....#','#.#...#','#..#..#','#...#.#','#....##','#.....#'],
    O: ['.#####.','#.....#','#.....#','#.....#','#.....#','#.....#','.#####.'],
    P: ['######.','#.....#','#.....#','######.','#......','#......','#......'],
    Q: ['.#####.','#.....#','#.....#','#.....#','#.....#','.#####.','....###'],
    R: ['######.','#.....#','#.....#','######.','#...#..','#....#.','#.....#'],
    S: ['.#####.','#.....#','#......','.#####.','......#','#.....#','.#####.'],
    T: ['#######','...#...','...#...','...#...','...#...','...#...','...#...'],
    U: ['#.....#','#.....#','#.....#','#.....#','#.....#','#.....#','.#####.'],
    V: ['#.....#','#.....#','#.....#','.#...#.','.#...#.','..#.#..','...#...'],
    W: ['#.....#','#.....#','#.....#','#..#..#','#.#.#.#','##...##','#.....#'],
    X: ['#.....#','.#...#.','..#.#..','...#...','..#.#..','.#...#.','#.....#'],
    Y: ['#.....#','.#...#.','..#.#..','...#...','...#...','...#...','...#...'],
    Z: ['#######','.....#.','....#..','...#...','..#....','.#.....','#######'],
  };
  /* A glyph as 49 bits, row-major. Any 49-bit array is a valid target. */
  function bitsOf(ch){
    const g = GLYPHS[ch], out = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++)
      out.push(g && g[r] && g[r][c] === '#' ? 1 : 0);
    return out;
  }

  const HALF    = 'calc(var(--ct-s) / 2)';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rnd   = (a, z) => a + Math.random() * (z - a);
  const pick  = arr => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  /* ══ Cube algebra ══════════════════════════════════════════════════════
     Axes: x right, y DOWN, z toward the viewer (CSS convention).
     A layer turn maps every cubelet in that layer by pos = M·pos,
     orient = M·orient. All matrices are integer 90 degree rotations, so
     coordinates stay exact no matter how many thousand turns are applied. */
  const ROT = {
    x: d => [[1,0,0],[0,0,-d],[0,d,0]],
    y: d => [[0,0,d],[0,1,0],[-d,0,0]],
    z: d => [[0,-d,0],[d,0,0],[0,0,1]],
  };
  const AXIS_INDEX = { x:0, y:1, z:2 };

  const matvec = (M, v) => [
    M[0][0]*v[0] + M[0][1]*v[1] + M[0][2]*v[2],
    M[1][0]*v[0] + M[1][1]*v[1] + M[1][2]*v[2],
    M[2][0]*v[0] + M[2][1]*v[1] + M[2][2]*v[2],
  ];
  const matmul = (A, B) => [0,1,2].map(r => [0,1,2].map(c =>
    A[r][0]*B[0][c] + A[r][1]*B[1][c] + A[r][2]*B[2][c]));

  /* CSS matrix3d is column-major: each group of four is one column. */
  const css3d = M => `matrix3d(${M[0][0]},${M[1][0]},${M[2][0]},0,` +
                             `${M[0][1]},${M[1][1]},${M[2][1]},0,` +
                             `${M[0][2]},${M[1][2]},${M[2][2]},0,0,0,0,1)`;

  /* Per face: placement on a cubelet, outward normal, which cubelets carry it,
     and (for the front face) which [column,row] a sticker occupies. */
  const FACES = {
    front : { tf:`translateZ(${HALF})`,                 n:[0, 0, 1], on:(x,y,z)=>z ===  R },
    back  : { tf:`rotateY(180deg) translateZ(${HALF})`, n:[0, 0,-1], on:(x,y,z)=>z === -R },
    right : { tf:`rotateY(90deg) translateZ(${HALF})`,  n:[1, 0, 0], on:(x,y,z)=>x ===  R },
    left  : { tf:`rotateY(-90deg) translateZ(${HALF})`, n:[-1,0, 0], on:(x,y,z)=>x === -R },
    top   : { tf:`rotateX(90deg) translateZ(${HALF})`,  n:[0,-1, 0], on:(x,y,z)=>y === -R },
    bottom: { tf:`rotateX(-90deg) translateZ(${HALF})`, n:[0, 1, 0], on:(x,y,z)=>y ===  R },
  };
  const FACE_NAMES  = Object.keys(FACES);
  const SHADE_CLASS = ['cube-type__px--up','cube-type__px--fb',
                       'cube-type__px--side','cube-type__px--down'];

  /* Surface cubelets only. The inner (N-2)^3 block is never visible, and no
     inward-facing stickers are built either: during a turn you look through
     the gap into black, which is the same as the background and reads exactly
     like the inside of a puzzle. 218 cubelets, 294 stickers for N=7. */
  const SURFACE = [];
  for (let x = -R; x <= R; x++)
  for (let y = -R; y <= R; y++)
  for (let z = -R; z <= R; z++) {
    if (Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) !== R) continue;
    SURFACE.push({ pos:[x,y,z], names: FACE_NAMES.filter(nm => FACES[nm].on(x,y,z)) });
  }

  /* ══ Plain-data model, used by the solver (no DOM) ═════════════════════ */
  const IDENT = () => [[1,0,0],[0,1,0],[0,0,1]];

  /* value(faceName, pos) decides what each sticker carries: a unique id when
     probing for tools, a colour bit (1 = light) when solving. */
  function newState(value){
    return SURFACE.map(s => {
      const sk = {};
      s.names.forEach(nm => sk[nm] = value(nm, s.pos));
      return { pos: s.pos.slice(), orient: IDENT(), sk };
    });
  }
  function simMove(st, mv){
    const M = ROT[mv[0]](mv[2]), ai = AXIS_INDEX[mv[0]];
    for (const c of st) if (c.pos[ai] === mv[1]) {
      c.pos = matvec(M, c.pos); c.orient = matmul(M, c.orient);
    }
  }
  const simSeq = (st, seq) => { for (const mv of seq) simMove(st, mv); };
  const cloneState = st => st.map(c => ({ pos:c.pos.slice(),
                                          orient:c.orient.map(r=>r.slice()), sk:c.sk }));

  /* What each of the 49 front cells currently holds. A sticker is on the front
     face when its normal, rotated by the cubelet's orientation, points at +Z. */
  function frontVals(st){
    const out = new Array(N*N).fill(-1);
    for (const c of st) {
      if (c.pos[2] !== R) continue;
      for (const nm in c.sk) if (matvec(c.orient, FACES[nm].n)[2] === 1) {
        out[(c.pos[1]+R)*N + (c.pos[0]+R)] = c.sk[nm]; break;
      }
    }
    return out;
  }
  const hamming = (a, b) => {
    let n = 0; for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) n++; return n;
  };

  /* Every legal single move: 3 axes x N layers x 2 directions. */
  const ALL_MOVES = [];
  for (const ax of ['x','y','z']) for (let l = -R; l <= R; l++) for (const d of [1,-1])
    ALL_MOVES.push([ax, l, d]);
  /* Moves that provably cannot touch the front face: z layers except z=R. */
  const SAFE_MOVES = [];
  for (let l = -R; l < R; l++) for (const d of [1,-1]) SAFE_MOVES.push(['z', l, d]);

  const invSeq = seq => seq.slice().reverse().map(m => [m[0], m[1], -m[2]]);
  const comm = (A, B) => [...A, ...B, ...invSeq(A), ...invSeq(B)];

  /* ── Tool table: sequences that change exactly one front cell ──────────
     Candidates are commutators in several forms. Whether a sequence changes
     only one cell is a property of the PERMUTATION, independent of where the
     stickers happen to be, so probing once with unique ids settles it forever.
     Costs ~150ms at init and yields ~1200 tools of 4 or 6 moves each. */
  let TOOLS = null;
  function buildTools(){
    let uid = 0;
    const probe = () => { uid = 0; return newState(() => uid++); };
    const base = frontVals(probe());
    const rep = (s, n) => { const o = []; for (let k = 0; k < n; k++) o.push(...s); return o; };
    TOOLS = [];
    for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
      const k = (j+R)*N + (i+R);
      const As = [[['x',i,1]], [['x',i,-1]], rep([['x',i,1]],2)];
      const Bs = [[['y',j,1]], [['y',j,-1]], rep([['y',j,1]],2)];
      const cand = [];
      for (const A of As) for (const B of Bs) { cand.push(comm(A,B)); cand.push(comm(B,A)); }
      /* Conjugating by a z layer yields further distinct 3-cycles, which means
         more fallback options when one cycle happens to be monochrome. */
      for (let zl = -R; zl < R; zl++) for (const zd of [1,-1]) {
        const P = [['z', zl, zd]];
        cand.push([...P, ...comm([['x',i,1]],  [['y',j,1]]), ...invSeq(P)]);
        cand.push([...P, ...comm([['x',i,-1]], [['y',j,1]]), ...invSeq(P)]);
      }
      const keep = [];
      for (const t of cand) {
        const st = probe(); simSeq(st, t);
        const f = frontVals(st);
        let n = 0, at = -1;
        for (let q = 0; q < N*N; q++) if (f[q] !== base[q]) { n++; at = q; }
        if (n === 1 && at === k) keep.push(t);
      }
      /* Shortest first, so a cell is fixed with 4 moves rather than 6 when both
         are available. */
      TOOLS[k] = keep.sort((a, b) => a.length - b.length);
    }
  }

  /* ── One solving attempt ───────────────────────────────────────────────
     Phase A: descend on single moves. One move rewrites a whole row or column
              (7 cells at once), so this closes most of the distance. Among
              equally good moves the choice is random, and up to PLATEAU
              distance-neutral moves are allowed, so restarts explore.
     Phase B: fix the remaining cells one at a time with the single-cell tools,
              which cannot disturb cells already correct.
     If every 3-cycle available to a cell is the wrong colour, shuffle the
     off-face sticker pool with a front-preserving turn and try again. */
  function solveAttempt(state, target, plateau){
    const st = cloneState(state);
    const seq = [];
    const bits = () => frontVals(st);

    let stall = 0;
    for (let g = 0; g < 120; g++) {
      const d0 = hamming(bits(), target);
      if (d0 === 0) return seq;
      let bd = Infinity, tied = [], level = [];
      for (const m of ALL_MOVES) {
        const t = cloneState(st); simMove(t, m);
        const d = hamming(frontVals(t), target);
        if (d < bd) { bd = d; tied = [m]; } else if (d === bd) tied.push(m);
        if (d === d0) level.push(m);
      }
      if (bd < d0) { const m = pick(tied); simMove(st, m); seq.push(m); stall = 0; }
      else if (plateau && level.length && stall < plateau) {
        const m = pick(level); simMove(st, m); seq.push(m); stall++;
      } else break;
    }

    for (let pass = 0; pass < 40; pass++) {
      let allOk = true;
      for (let k = 0; k < N*N; k++) {
        if (bits()[k] === target[k]) continue;
        allOk = false;
        let done = false;
        for (const t of TOOLS[k]) {
          const c = cloneState(st); simSeq(c, t);
          if (frontVals(c)[k] === target[k]) { simSeq(st, t); seq.push(...t); done = true; break; }
        }
        if (!done) { const s = pick(SAFE_MOVES); simMove(st, s); seq.push(s); }
      }
      if (allOk) break;
    }
    return hamming(bits(), target) === 0 ? seq : null;
  }

  /* ── Sequence cancellation ─────────────────────────────────────────────
     Turns about the same axis commute, whatever layers they act on, so within
     any maximal run of consecutive same-axis moves the order is free. Group
     such a run by layer and reduce each layer's quarter turns mod 4: 0
     disappears, 1 or 3 collapses to a single move, 2 stays as two. Provably
     sound; the result is verified against the target regardless. */
  function cancel(seq){
    let cur = seq, changed = true;
    while (changed) {
      changed = false;
      const out = [];
      let i = 0;
      while (i < cur.length) {
        const ax = cur[i][0];
        let j = i;
        while (j < cur.length && cur[j][0] === ax) j++;
        const byLayer = new Map();
        for (let k = i; k < j; k++) byLayer.set(cur[k][1], (byLayer.get(cur[k][1]) || 0) + cur[k][2]);
        const merged = [];
        for (const [l, sum] of byLayer) {
          const q = ((sum % 4) + 4) % 4;
          if (q === 1) merged.push([ax, l, 1]);
          else if (q === 3) merged.push([ax, l, -1]);
          else if (q === 2) { merged.push([ax, l, 1]); merged.push([ax, l, 1]); }
        }
        if (merged.length < j - i) changed = true;
        out.push(...merged);
        i = j;
      }
      cur = out;
    }
    return cur;
  }

  /* ── Solver: shortest of RESTARTS attempts ─────────────────────────────
     Provable minimality is out of reach on a 7x7 — the state space is
     astronomical and this is a pattern-reachability problem, not a solve. This
     is simply the shortest sequence found. Returns null only if every attempt
     fails, which was never observed. */
  function solve(state, target){
    let best = null;
    for (let r = 0; r < RESTARTS; r++) {
      let s = solveAttempt(state, target, PLATEAU);
      if (!s) continue;
      s = cancel(s);
      const chk = cloneState(state); simSeq(chk, s);
      if (hamming(frontVals(chk), target) !== 0) continue;   /* cancellation broke it */
      if (!best || s.length < best.length) best = s;
    }
    return best || solveAttempt(state, target, 0);
  }

  /* ══ Build one cube (DOM) ══════════════════════════════════════════════ */
  function build(root, showLabel){
    const word = [...(root.dataset.word || '').toUpperCase()].filter(c => GLYPHS[c]);
    if (!word.length) return null;

    const scene = document.createElement('div');
    scene.className = 'cube-type__scene';
    const cube = document.createElement('div');
    cube.className = 'cube-type__cube';
    const turn = document.createElement('div');
    turn.className = 'cube-type__turn';
    cube.appendChild(turn);
    scene.appendChild(cube);

    const cubelets = SURFACE.map(s => {
      const el = document.createElement('div');
      el.className = 'cube-type__cubelet';
      const sk = {};
      s.names.forEach(nm => {
        const px = document.createElement('div');
        px.className = 'cube-type__px';
        px.style.transform = FACES[nm].tf;
        const lit = LIGHT_FACES.includes(nm) ? 1 : 0;   /* decided once, forever */
        if (lit) px.classList.add('cube-type__px--lit');
        el.appendChild(px);
        sk[nm] = { px, lit };
      });
      /* `home` is the birth position; reset sends every cubelet back to it. */
      const c = { el, sk, pos: s.pos.slice(), orient: IDENT(), home: s.pos.slice() };
      el.style.transform = cubeletTf(c);
      cube.appendChild(el);
      return c;
    });

    root.appendChild(scene);
    scene.setAttribute('role', 'img');
    scene.setAttribute('aria-label', word.join(''));

    const host = root.closest('.cube-type');
    const meta = document.createElement('div');
    meta.className = 'cube-type__meta';

    let label = null;
    if (showLabel) {
      label = document.createElement('div');
      label.className = 'cube-type__label';
      label.setAttribute('aria-hidden', 'true');
      meta.appendChild(label);
    }
    let resetBtn = null;
    if (!host || host.dataset.reset !== 'off') {
      resetBtn = document.createElement('button');
      resetBtn.type = 'button';
      resetBtn.className = 'cube-type__reset';
      resetBtn.textContent = 'Reset';
      meta.appendChild(resetBtn);
    }
    if (meta.childElementCount) root.appendChild(meta);

    /* i starts on the last letter so the first transition targets word[0].
       Until `started`, nothing is highlighted: the front face is still a
       solved single-colour face, not a glyph. */
    const b = { word, scene, cube, turn, cubelets, label,
                i: word.length - 1, started: false,
                steps: 0, timers: [], idle: true, visible: true,
                rx: -15, ry: -19 };
    if (resetBtn) resetBtn.addEventListener('click', () => reset(b));
    applyOrbit(b);
    reshade(b);
    paintLabel(b);
    return b;
  }

  const cubeletTf = c =>
    `translate3d(calc(var(--ct-s) * ${c.pos[0]}), calc(var(--ct-s) * ${c.pos[1]}), ` +
    `calc(var(--ct-s) * ${c.pos[2]})) ${css3d(c.orient)}`;

  const applyOrbit = b => {
    b.cube.style.transform = `rotateX(${b.rx.toFixed(2)}deg) rotateY(${b.ry.toFixed(2)}deg)`;
  };

  /* Snapshot the live cube as plain data for the solver. */
  const stateOf = b => b.cubelets.map(c => {
    const sk = {}; for (const nm in c.sk) sk[nm] = c.sk[nm].lit;
    return { pos: c.pos.slice(), orient: c.orient.map(r => r.slice()), sk };
  });

  function reshade(b){
    for (const c of b.cubelets) for (const nm in c.sk) {
      const nv = matvec(c.orient, FACES[nm].n);
      const cls = nv[1] === -1 ? SHADE_CLASS[0]
                : nv[1] ===  1 ? SHADE_CLASS[3]
                : nv[2] !==  0 ? SHADE_CLASS[1]
                :                SHADE_CLASS[2];
      const px = c.sk[nm].px;
      for (const k of SHADE_CLASS) if (k !== cls) px.classList.remove(k);
      px.classList.add(cls);
    }
  }

  function paintLabel(b){
    if (!b.label) return;
    b.label.innerHTML = b.word.map((c, k) => (b.started && k === b.i) ? `<b>${c}</b>` : c).join('')
      + (b.started ? `　<i>${b.steps} moves</i>` : '');
  }

  function after(b, ms, fn){ b.timers.push(setTimeout(fn, ms)); }
  function clearTimers(b){ b.timers.forEach(clearTimeout); b.timers = []; }

  /* ── One layer turn: animate, then bake the result into the model ────── */
  function spin(b, mv, ms, ease, done){
    const ai = AXIS_INDEX[mv[0]];
    const moving = b.cubelets.filter(c => c.pos[ai] === mv[1]);

    b.turn.style.transition = 'none';
    b.turn.style.transform  = 'none';
    /* Empty the group first. If a previous turn was interrupted, leftovers in
       here would ride along with this turn without being accounted for, and
       the model would silently diverge from what is on screen. */
    while (b.turn.firstChild) b.cube.appendChild(b.turn.firstChild);
    for (const c of moving) b.turn.appendChild(c.el);
    void b.turn.offsetWidth;   /* force reflow, else the reset above merges
                                  into the transition below as one animation */

    b.turn.style.transition = `transform ${ms}ms ${ease}`;
    b.turn.style.transform  = `rotate${mv[0].toUpperCase()}(${mv[2] * 90}deg)`;

    after(b, ms + 12, () => {
      const M = ROT[mv[0]](mv[2]);
      for (const c of moving) {
        c.pos    = matvec(M, c.pos);
        c.orient = matmul(M, c.orient);
        c.el.style.transform = cubeletTf(c);
        b.cube.appendChild(c.el);
      }
      b.turn.style.transition = 'none';
      b.turn.style.transform  = 'none';
      reshade(b);
      done();
    });
  }

  /* Play a whole sequence: hammer, then decelerate over the last three. */
  function play(b, seq, done){
    let n = 0;
    const run = () => {
      if (n >= seq.length) { done(); return; }
      const left = seq.length - n;
      const tail = left <= TAIL.length;
      const ms   = tail ? TAIL[TAIL.length - left] : FAST;
      spin(b, seq[n], ms, left === 1 ? EASE_SETTLE : EASE_FLICK, () => {
        n++; after(b, tail ? TAIL_GAP : FAST_GAP, run);
      });
    };
    run();
  }

  /* ── Advance to the next letter ────────────────────────────────────────
     A repeated letter solves in 0 moves, because a real cube genuinely does
     not need to move. Short solves get padded with front-preserving turns and
     re-solved, so the cube is visibly working without affecting the glyph. */
  function step(b){
    /* The single concurrency gate. Without it the initial timer and the
       IntersectionObserver each start a run and interrupt each other. */
    if (!b.idle) return;
    b.idle = false;
    clearTimers(b);

    const target = bitsOf(b.word[(b.i + 1) % b.word.length]);
    let seq = solve(stateOf(b), target);

    if (seq && seq.length < MIN_MOVES) {
      const pad = [];
      for (let k = seq.length; k < MIN_MOVES; k++) pad.push(pick(SAFE_MOVES));
      const padded = cloneState(stateOf(b)); simSeq(padded, pad);
      const rest = solve(padded, target);
      if (rest) seq = [...pad, ...rest];
    }
    if (!seq) { b.idle = true; return; }

    play(b, seq, () => {
      b.i = (b.i + 1) % b.word.length;
      b.started = true;
      b.steps = seq.length;
      /* Self-check: the front face must equal the target cell for cell. This
         is the correctness guarantee of the whole component; it stays in as a
         permanent tripwire and only speaks up when something is wrong. */
      const bad = hamming(frontVals(stateOf(b)), target);
      if (bad) console.warn(`[cube-type] ${b.word.join('')} -> ${b.word[b.i]}: `
        + `${bad} of ${N*N} front cells wrong (${seq.length} moves)`);
      paintLabel(b);
      b.idle = true;
      if (b.visible && !paused && !reduced) after(b, HOLD + rnd(-120, 260), () => step(b));
    });
  }

  /* ── Reset to a solved cube ───────────────────────────────────────────
     Timers and the turn group must be cleared first, or a turn that has not
     been baked yet lands after the reset and corrupts the state. */
  function reset(b){
    clearTimers(b);
    b.turn.style.transition = 'none';
    b.turn.style.transform  = 'none';
    while (b.turn.firstChild) b.cube.appendChild(b.turn.firstChild);

    for (const c of b.cubelets) {
      c.pos = c.home.slice();
      c.orient = IDENT();
      c.el.style.transform = cubeletTf(c);
    }
    b.i = b.word.length - 1;
    b.started = false;
    b.steps = 0;
    b.rx = -15; b.ry = -19;
    applyOrbit(b);
    reshade(b);
    paintLabel(b);
    b.idle = true;
    if (b.visible && !paused && !reduced) after(b, 900, () => step(b));
  }

  /* ── Drag to orbit ────────────────────────────────────────────────────
     Orientation lives on .cube-type__cube and layer turns on the __turn group
     inside it, so the two never fight and you can drag mid-turn.
     Touch is left alone so the component never hijacks page scrolling. */
  function wireOrbit(b){
    let drag = null;
    b.scene.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch') return;
      drag = { id:e.pointerId, x:e.clientX, y:e.clientY, rx:b.rx, ry:b.ry, moved:0 };
      b.scene.setPointerCapture(e.pointerId);
      b.scene.classList.add('cube-type__scene--dragging');
      e.preventDefault();
    });
    b.scene.addEventListener('pointermove', e => {
      if (!drag || drag.id !== e.pointerId) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
      b.ry = drag.ry + dx * DRAG_SENS;
      b.rx = clamp(drag.rx - dy * DRAG_SENS, -TILT_LIMIT, TILT_LIMIT);
      applyOrbit(b);
    });
    const end = e => {
      if (!drag || drag.id !== e.pointerId) return;
      const tap = drag.moved < DRAG_SLOP;
      drag = null;
      b.scene.classList.remove('cube-type__scene--dragging');
      if (tap && b.idle) step(b);
    };
    b.scene.addEventListener('pointerup', end);
    b.scene.addEventListener('pointercancel', end);
    b.scene.addEventListener('click', e => {
      if (e.detail !== 0) return;      /* only synthetic clicks, i.e. touch */
      if (b.idle) step(b);
    });
  }

  /* ── Boot ─────────────────────────────────────────────────────────── */
  let paused = false;
  const blocks = [];

  function init(){
    buildTools();

    document.querySelectorAll('.cube-type').forEach(host => {
      const showLabel = host.dataset.labels !== 'off';
      host.querySelectorAll('.cube-type__block').forEach(root => {
        const b = build(root, showLabel);
        if (b) blocks.push(b);
      });
    });

    blocks.forEach((b, k) => {
      wireOrbit(b);
      if (!reduced) after(b, 700 + k * 1400, () => step(b));
    });

    /* Stop when scrolled out of view. The decision is only ever taken at the
       boundary between letters; a turn in progress is never interrupted,
       because that would leave a layer half-turned and the model stale. */
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(entries => {
        for (const e of entries) {
          const b = blocks.find(x => x.scene === e.target);
          if (!b) continue;
          b.visible = e.isIntersecting;
          if (b.visible && b.idle && !paused && !reduced) after(b, rnd(150, 550), () => step(b));
        }
      }, { rootMargin: '120px' });
      blocks.forEach(b => io.observe(b.scene));
    }

    /* Keyboard shortcuts belong to the standalone demo only, so an embedded
       component never steals keys from the host page. */
    if (document.body.classList.contains('cube-standalone')) {
      addEventListener('keydown', e => {
        if (e.code === 'KeyR') { blocks.forEach(reset); return; }
        if (e.code !== 'Space') return;
        e.preventDefault();
        paused = !paused;
        if (!paused) blocks.forEach((b, k) => after(b, 200 + k * 450, () => step(b)));
      });
    }
  }

  /* Public surface. `solve` and `frontVals` are what you need to verify the
     claim yourself; see README. */
  window.CubeType = {
    version: VERSION, N, LIGHT_FACES, GLYPHS,
    blocks, reset, solve, stateOf, frontVals, bitsOf, hamming,
    turnBusy: b => b.turn.childElementCount,
  };

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', init);
  else init();
})();
