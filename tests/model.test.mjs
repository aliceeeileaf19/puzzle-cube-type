import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// No production test hooks: bootstrap the real public solver with no DOM hosts.
// The replay below tracks individual stickers, independently of cube-type's
// cubelet/matrix simulation. Recolouring or an illegal move must fail it.
let seed = 0x51c0ffee;
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
const math = Object.create(Math); math.random = random;
const window = {};
runInNewContext(readFileSync(new URL('../cube-type.js', import.meta.url), 'utf8'), {
  window, Math: math, matchMedia: () => ({ matches: true }),
  document: { readyState: 'complete', querySelectorAll: () => [], body: { classList: { contains: () => false } } },
  console,
}, { timeout: 30000 });
const api = window.CubeType;
const faces = { front: [0,0,1], back: [0,0,-1], left: [-1,0,0], right: [1,0,0], top: [0,-1,0], bottom: [0,1,0] };
function initialState() {
  const state = [];
  for (let x = -3; x <= 3; x++) for (let y = -3; y <= 3; y++) for (let z = -3; z <= 3; z++) {
    if (Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) !== 3) continue;
    const pos = [x,y,z], sk = {};
    for (const [name, normal] of Object.entries(faces)) if (normal.some((v,i) => v && pos[i] === v * 3)) sk[name] = ['top','right','back'].includes(name) ? 1 : 0;
    state.push({ pos, orient: [[1,0,0],[0,1,0],[0,0,1]], sk });
  }
  return state;
}
const rotate = ([x,y,z], axis, d) => axis === 'x' ? [x,-d*z,d*y] : axis === 'y' ? [d*z,y,-d*x] : [-d*y,d*x,z];
function replayState(state, moves) {
  for (const [axis, layer, direction] of moves) {
    assert.ok(['x','y','z'].includes(axis)); assert.ok(Number.isInteger(layer) && layer >= -3 && layer <= 3); assert.ok(direction === -1 || direction === 1);
    for (const c of state) if (c.pos['xyz'.indexOf(axis)] === layer) {
      c.pos = rotate(c.pos, axis, direction);
      const columns = [0,1,2].map(i => rotate(c.orient.map(row => row[i]), axis, direction));
      c.orient = [0,1,2].map(i => columns.map(col => col[i]));
    }
  }
}
function stickerReplay(state, moves) {
  const stickers = state.flatMap((c, i) => Object.entries(c.sk).map(([face,value]) => ({
    id: `${i}:${face}`, value, pos: [...c.pos], normal: c.orient.map(row => row.reduce((n,v,k) => n + v * faces[face][k], 0)),
  })));
  const before = stickers.map(s => [s.id,s.value]);
  for (const [axis,layer,direction] of moves) {
    assert.ok(['x','y','z'].includes(axis) && Number.isInteger(layer) && Math.abs(layer) <= 3 && Math.abs(direction) === 1, 'non-legal quarter turn');
    for (const sticker of stickers) if (sticker.pos['xyz'.indexOf(axis)] === layer) {
      sticker.pos = rotate(sticker.pos, axis, direction);
      sticker.normal = rotate(sticker.normal, axis, direction);
    }
  }
  assert.deepEqual(stickers.map(s => [s.id,s.value]), before, 'a sticker was recoloured or replaced');
  assert.equal(new Set(stickers.map(s => `${s.pos}/${s.normal}`)).size, 294, 'duplicate or missing sticker slots');
  const front = stickers.filter(s => s.normal[2] === 1 && s.pos[2] === 3).sort((a,b) => a.pos[1]-b.pos[1] || a.pos[0]-b.pos[0]);
  assert.equal(front.length,49);
  return front.map(s => s.value);
}
function check(state, target) {
  const before = structuredClone(state);
  const sequence = api.solve(state,target);
  assert.ok(Array.isArray(sequence), 'solver failed to find a sequence');
  assert.deepEqual(state,before,'solve mutated its input');
  assert.deepEqual(stickerReplay(state,sequence),target,'legal replay did not reach the requested bitmap');
  replayState(state,sequence);
  assert.deepEqual(Array.from(api.frontVals(state)),target,'public front-face reader disagrees with independent replay');
}
test('all 50 shipped glyphs are reachable from a solved cube through legal fixed-sticker turns', () => {
  assert.equal(Object.keys(api.GLYPHS).length,50);
  for (const [glyph,rows] of Object.entries(api.GLYPHS)) {
    const target = Array.from(rows.join(''), ch => ch === '#' ? 1 : 0);
    assert.equal(target.length,49,glyph);
    check(initialState(),target);
  }
});
test('26 sequential letters from a scrambled state and sparse/dense/degenerate bitmaps replay correctly', () => {
  const state = initialState();
  replayState(state,[['x',0,1],['y',2,-1],['z',-3,1],['x',-1,-1],['y',3,1]]);
  for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') check(state,Array.from(api.GLYPHS[ch].join(''), x => x === '#' ? 1 : 0));
  for (const density of [.2,.8]) for (let i=0;i<5;i++) check(state,Array.from({length:49},()=>random()<density?1:0));
  check(state,Array(49).fill(0)); check(state,Array(49).fill(1));
});
