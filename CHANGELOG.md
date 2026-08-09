# Changelog

## 0.2.0 — 2026-08-08

Shorter solutions, and the demo assets.

- **Move count down ~25%.** Greedy descent alone is deterministic, so restarts
  explored nothing. Randomised tie-breaks, up to three distance-neutral plateau
  moves, and sequence cancellation (same-axis turns commute, so quarter turns
  per layer reduce mod 4), keeping the shortest of ten attempts. Over 78
  (state, letter) pairs: mean 37 → 28, median 41 → 28, worst 77 → 57. The one
  failure the deterministic solver hit is gone. Solve time rises to ~320 ms,
  paid while the cube is holding still.
- Single-cell tools are now tried shortest-first (4 moves before 6).
- `docs/demo.mp4` (36 s) and `docs/demo.gif` (first 17 s): a recording of the
  demo page itself — both cubes turning through `ALICEILEAF` and `WILLIAM`,
  labels and reset buttons and all — with an orbit in the middle where both stop
  and the camera swings round the other faces. Rendered offline frame by frame
  against the released `cube-type.js`, with `setTimeout` stubbed so the component
  builds but never schedules, leaving each pose under the renderer's control. A
  browser tab that is not frontmost never paints, so screen capture would only
  yield stutter.
- `docs/alphabet.png` with `docs/alphabet.html` that generates it, reading the
  glyph table out of `cube-type.js` so it cannot drift from the shipped font.
- README: the new numbers, both demo assets, and an explicit note that this is
  the shortest sequence *found*, not a proven minimum.

## 0.1.0 — 2026-08-08

First release.

- 7×7 puzzle cube rendered with CSS 3D transforms; no dependencies.
- Sticker colours fixed at build time (3 light faces, 3 dark) and never
  changed. Letters are reached by legal layer turns only.
- Solver built on the `[C_i, R_j]` commutator, which changes exactly one front
  cell. Greedy descent, then per-cell repair, then front-preserving shuffles.
  4–12 ms per letter, 28 moves on average.
- Complete 7×7 pixel alphabet, A–Z.
- Drag to orbit, click to advance, reset button, `Space` / `R` shortcuts.
- Pauses when scrolled out of view; respects `prefers-reduced-motion`.
- Runtime self-check compares the front face to the target after every letter.
