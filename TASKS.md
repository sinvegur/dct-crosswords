# Cursor Tasks

Task queue for handing work from Claude (planning/review) to Cursor (implementation) on dct-crosswords.

## Protocol

- **Cursor**: when told "new task for you, check TASKS.md", find the topmost entry marked `[TODO]`. Implement only that task — don't start a second `[TODO]` in the same pass. When finished, change its status to `[READY FOR REVIEW]` and add a short "Implementation notes" line under it if anything deviated from the instructions.
- **Claude**: reviews `[READY FOR REVIEW]` entries against the actual diff. Marks `[DONE]`, **commits immediately** (one task = one commit, task ID in the subject line), and deletes the entry (git history keeps the record — no need to accumulate finished tasks here). Or marks `[CHANGES REQUESTED]` and appends specific notes for Cursor to address, leaving status as `[CHANGES REQUESTED]` until fixed.
- IDs are sequential (T001, T002, ...) and never reused, even if a task is deleted.
- Only one task should be active (`[TODO]` at the top) at a time, to keep diffs small and reviewable.
- **Only make the changes the task explicitly describes.** If you notice something else worth fixing while working, do NOT implement it — note it in "Implementation notes" as a suggestion and let Claude turn it into its own task. This has been raised twice already (T001 favicon/port, T002 layout rework) — a third occurrence means diffs will be rejected without detailed review.

---

## T057 — [READY FOR REVIEW] Accept plain ASCII letters as matches for Turkish ones

**Popçular. cannot currently be finished on a desktop, and it is the first real puzzle DCT expects someone to solve in this app. It has to work on any keyboard, without the solver doing anything special.**

DCT builds on a Turkish keyboard, so his grids contain `İ Ç Ö Ş Ü` — Popçular. has 12 `İ` plus 10 others, 22 of its 178 letters. A solver on an English keyboard cannot produce any of those characters, and the on-screen panel that can is mobile-only (`isMobile && !solved`, around line 1231). Cells are compared with `===`, so those 22 cells are unfillable on desktop and a chore on mobile.

Older puzzles have the mirror problem: they contain plain `I` in words really spelled with `İ`, so a solver who does enter `İ` is told they are wrong.

Fix the comparison, not the input. The plain ASCII letter and its Turkish counterpart should satisfy each other in both directions.

### What to change — `src/crossword/CrosswordPlayer.tsx` only

1. Add a helper next to the existing `normalizeLetter` (around line 40):

```ts
// Solvers reach the grid from whatever keyboard they happen to have, and an
// English one cannot produce İ Ç Ğ Ö Ş Ü at all. A Turkish letter and its
// plain ASCII counterpart therefore have to satisfy each other when checking
// an answer - in both directions, since older puzzles were built with plain I
// where Turkish spelling wants İ. This is a comparison rule only: what the
// solver typed is still what gets displayed while solving.
const LETTER_FOLD: Record<string, string> = {
  İ: 'I', ı: 'I', i: 'I',
  Ç: 'C', ç: 'C',
  Ğ: 'G', ğ: 'G',
  Ö: 'O', ö: 'O',
  Ş: 'S', ş: 'S',
  Ü: 'U', ü: 'U',
};

function foldLetter(ch: string) {
  return LETTER_FOLD[ch] ?? ch;
}
```

2. `checkSolved` (around line 443): compare folded values.

```ts
if (foldLetter(nextFilled[i]) !== foldLetter(solutionChars[i])) return false;
```

3. `runCheck` (around line 775): the same fold on the `letter === solutionChars[i]` test that decides `nextLocked` vs `nextWrong`.

4. **On solve, snap the grid to the puzzle's own spelling.** Once a puzzle is complete, show `POPÇULAR`, not `POPCULAR` — the finished grid is the thing DCT sees, and it should read as proper Turkish. In `finishIfSolved`, at the point where it has decided the puzzle is solved, also set the filled grid to `solutionChars` for the non-block cells.

   This is safe **only** because the puzzle is already finished at that point. Do not do this any earlier: snapping a letter mid-solve would tell the solver their letter was right, which is a free answer-checker.

### Explicitly out of scope

- **Do not touch `normalizeLetter`** in either file. The solver keeps mapping a physical `i`/`I` key to dotless `I`, and the builder keeps `toLocaleUpperCase('tr-TR')` so DCT's grids stay correctly spelled.
- **Do not show the on-screen Turkish panel on desktop.** The fold is what makes desktop work; the panel stays a mobile convenience.
- **Do not change the mobile keyboard's layout or key order in any way** — it stays a full QWERTY.

### How to verify

`npm run build` must pass (no test suite in this repo, so the type check is the automated gate).

Then, with `npm run dev` and a **desktop-width** window, open **Popçular.** and solve it using only an English keyboard:
- `i` is accepted in an `İ` cell, `c` in a `Ç`, `o` in an `Ö`, `s` in a `Ş`, `u` in a `Ü` — Check locks them as correct instead of flagging them wrong.
- The whole puzzle can be completed with ASCII alone, end to end. This is the acceptance test — if any cell still cannot be satisfied, the task is not done.
- On completion, the grid redraws with the real Turkish letters (`Ç Ö Ü İ Ş`).
- Mid-solve, a cell you typed `c` into still shows `C` — it must not silently become `Ç` before the puzzle is finished.
- On a narrow (mobile) window, the Turkish panel keys still work, and `İ` is now also accepted in a cell whose answer is plain `I`.
- A genuinely wrong letter is still marked wrong.

---

## T046 — [BLOCKED, pending user confirmation] Mobile letter-clipping bug — likely fixed, awaiting real-device check

**Not a Cursor task right now — do not pick this up.** Claude handled this directly (real-device-only bug, needed live iteration). Leaving a short record here rather than deleting, in case it resurfaces.

After the diagnostic notes originally left here, the investigation continued directly (not via Cursor) through several more rounds. Two things turned out to matter beyond what's listed below:
- The bug also affects 9x9 (midi), not just 15x15 — just proportionally less severe. That reframed it from "something about 15x15's specific cell size" to "a roughly fixed amount of space being eaten in every cell regardless of size."
- That pointed at the real likely cause: iOS Safari applies native default styling/padding to text inputs unless a page explicitly opts out (`-webkit-appearance: none`), which was missing from `.cell input` entirely. Fixed, plus removed the grid's remaining CSS container-query dependency (container-type/cqw/cqi) in favor of directly JS-measuring cell size via `ResizeObserver` and applying plain pixel values — since the bug never reproduced in any automated testing, container queries behaving unexpectedly on the specific real device was a live suspect worth eliminating regardless.

**Status: fix shipped, not yet confirmed on the user's actual device** ("will check later"). If it comes back after confirmation, or a new report references this, read the full commit history on `src/styles.css` and `src/crossword/CrosswordPlayer.tsx` from today (2026-08-25) before re-diagnosing — a lot of ground was already covered.
