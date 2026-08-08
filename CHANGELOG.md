# Changelog

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
