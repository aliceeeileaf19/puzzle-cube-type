# Changelog

## 0.4.0 — 2026-08-09

Themeable colours.

- Every colour now comes from a custom property. A theme is two values —
  `--ct-off` for the unlit sticker and `--ct-on` for the lit one — plus
  `--ct-ink` for the label. The eight face colours are derived from those with
  `color-mix()` so a two-value theme still gets a cube with volume.
- Variables renamed from `--ct-dark`/`--ct-light` to `--ct-off`/`--ct-on`. The old
  pair was a contradiction for light themes, where the "light" sticker holds a
  dark ink colour.
- The default theme is unchanged on 7 of 8 faces, byte for byte. The eighth, the
  lit top face, moves from `#ffffff` to `#f7f7f7`: the old value was not a
  proportional lift of `#f4f4f4`, it was simply white, and keeping it literal
  would wash the top face out of any coloured theme.
- `docs/themes.png` and the `docs/themes.html` that generates it: default, paper,
  amber and the palette this component is embedded in.
- A light `--ct-off` also needs the four `--ct-off-*` ramp values, since a pale
  colour cannot be lifted further. Documented with a copy-paste block.

## 0.3.0 — 2026-08-09

Digits and punctuation.

- 24 new glyphs: `0`–`9` and `! " # ' ( ) + , - . / : = ?`, taking the set to 50.
  All 50 verified solvable from three different cube states — 150 combinations,
  0 failures, 30.4 moves on average.
- Several needed deliberate distinguishing at 7×7: `0` slashed and `1` serifed so
  they do not collapse into `O` and `I`, `8` narrow so it does not read as `B`,
  `3` with no left stem so it does not read as `S`. Checked by measuring all 1225
  glyph pairs rather than by eye; the closest new pair (`.` / `,`, 3 cells of 49)
  matches the closest pair the alphabet already had (`C` / `O`, `P` / `R`).
- Space, `&` and `@` were designed and then dropped rather than shipped
  half-legible. Reasons are in the README.
- `data-restarts` on the host trades move count for a shorter main-thread block:
  four restarts costs 21.3 moves on average with a 90 ms worst case, ten costs
  20.7 with 251 ms.
- `setPointerCapture` no longer throws out of `pointerdown` for synthetic pointer
  events, which was skipping the `preventDefault` after it.

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
