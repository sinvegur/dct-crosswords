# Cursor Tasks

Task queue for handing work from Claude (planning/review) to Cursor (implementation) on dct-crosswords.

## Protocol

- **Cursor**: when told "new task for you, check TASKS.md", find the topmost entry marked `[TODO]`. Implement only that task — don't start a second `[TODO]` in the same pass. When finished, change its status to `[READY FOR REVIEW]` and add a short "Implementation notes" line under it if anything deviated from the instructions.
- **Claude**: reviews `[READY FOR REVIEW]` entries against the actual diff. Marks `[DONE]`, **commits immediately** (one task = one commit, task ID in the subject line), and deletes the entry (git history keeps the record — no need to accumulate finished tasks here). Or marks `[CHANGES REQUESTED]` and appends specific notes for Cursor to address, leaving status as `[CHANGES REQUESTED]` until fixed.
- IDs are sequential (T001, T002, ...) and never reused, even if a task is deleted.
- Only one task should be active (`[TODO]` at the top) at a time, to keep diffs small and reviewable.
- **Only make the changes the task explicitly describes.** If you notice something else worth fixing while working, do NOT implement it — note it in "Implementation notes" as a suggestion and let Claude turn it into its own task. This has been raised twice already (T001 favicon/port, T002 layout rework) — a third occurrence means diffs will be rejected without detailed review.

---

## T060 — [TODO] Coming back to a solved puzzle shows an empty grid

Two pieces of solver feedback are the same bug: "I go away and come back and the grid is empty", and "I don't see the completed grid when I get back".

Finishing a puzzle **deletes** the saved progress. `CrosswordPlayer.tsx` does
`localStorage.removeItem(progressKey(puzzle.id))` the moment the last letter lands, and the
`solved` flag only ever lives in React state. So reopening a puzzle you already finished gives
you a blank grid and a timer counting from 0:00, with nothing to show you ever played — even
though your best time is still sitting in `localStorage` right next to it.

Mid-solve progress is fine and already survives a reload; this is only about the finished state.

### What it should do

Reopening a solved puzzle lands on the results screen it showed at the finish: leaderboard by
default, the completed grid behind the toggle, their own time and rank, their row highlighted.
Timer stopped.

### 1. Persist the finish instead of erasing it

Keep the same `dct-crosswords:progress:<puzzleId>` key. On solve, write the completed grid plus
`solved: true`, `elapsedMs`, and `attemptId` rather than removing the entry. `loadProgress` reads
the three new fields back, and treats `solved` as true only when `elapsedMs` is also a valid
number — a half-written record must fall back to "not solved" rather than restoring a results
screen with no time on it.

### 2. Restore it on mount — including the ref

The per-puzzle init effect currently ends with an unconditional reset (`setSolved(false)`,
`setElapsedMs(null)`, `setAttemptId(null)`). It runs on mount, so restoring state in the
`useState` initializers alone is not enough — this effect would wipe it a moment later. Both
paths need to read the saved record.

### 3. Do not submit the attempt again — this is the one that can do damage

The results effect guards on `submittedRef`, which is a **ref**: it resets to `false` on every
mount. Restore `solved` and `elapsedMs` without accounting for it and every single revisit
inserts another row into `attempts` — the leaderboard fills with duplicates of the same person,
and there is no delete policy on that table, so cleaning it up means hand-written SQL.

A restored solve already has its row. Submit only when there is no stored `attemptId`; otherwise
skip straight to fetching. Fetch the leaderboard and rank fresh on every return rather than
storing them, so standings are current.

### 4. A solve whose submit failed should get another chance

`solved: true` with no `attemptId` means they finished while offline and their time never
reached the server. That record *should* submit on the next visit. This falls out of §3 for free
— it is worth a test of its own, not extra code.

### Verify

`npm run build`, then locally:
- Solve a puzzle. Leave, come back: completed grid, own time, rank, row highlighted, timer stopped.
- Come back twice more, then check the leaderboard: **one** row for that solver, not three.
- A puzzle you have not solved behaves exactly as it does today — blank grid, timer from 0:00.
- Mid-solve progress still survives a reload, untouched.
- Clear that puzzle's `localStorage` key: back to a fresh unsolved grid.

Note that local dev talks to the live Supabase, so a test solve writes a real leaderboard row.
Use an obvious throwaway name, and expect to delete it by hand afterwards.

---

## T046 — [BLOCKED, pending user confirmation] Mobile letter-clipping bug — likely fixed, awaiting real-device check

**Not a Cursor task right now — do not pick this up.** Claude handled this directly (real-device-only bug, needed live iteration). Leaving a short record here rather than deleting, in case it resurfaces.

After the diagnostic notes originally left here, the investigation continued directly (not via Cursor) through several more rounds. Two things turned out to matter beyond what's listed below:
- The bug also affects 9x9 (midi), not just 15x15 — just proportionally less severe. That reframed it from "something about 15x15's specific cell size" to "a roughly fixed amount of space being eaten in every cell regardless of size."
- That pointed at the real likely cause: iOS Safari applies native default styling/padding to text inputs unless a page explicitly opts out (`-webkit-appearance: none`), which was missing from `.cell input` entirely. Fixed, plus removed the grid's remaining CSS container-query dependency (container-type/cqw/cqi) in favor of directly JS-measuring cell size via `ResizeObserver` and applying plain pixel values — since the bug never reproduced in any automated testing, container queries behaving unexpectedly on the specific real device was a live suspect worth eliminating regardless.

**Status: fix shipped, not yet confirmed on the user's actual device** ("will check later"). If it comes back after confirmation, or a new report references this, read the full commit history on `src/styles.css` and `src/crossword/CrosswordPlayer.tsx` from today (2026-08-25) before re-diagnosing — a lot of ground was already covered.

---

## T059 — [TODO] Builder grid is not square, so every cell overflows its row

Found while adding circled letters, and worth fixing on its own.

In the builder the grid box comes out non-square at some window sizes. The cells keep `aspect-ratio: 1 / 1`, so each one stays square while its grid *row* is shorter — every cell overflows its row by a few pixels and the row below paints over its bottom edge.

It is invisible with letters alone, because they are centred and small. Anything that reaches the edge of a square shows it: the circled-letter ring had its bottom arc clipped, which is what surfaced this. The circle's inset was widened from 7% to 12% to buy clearance — that is a workaround sitting on top of this bug, and it can be reverted once the grid is square.

Reproduce: open the builder, then in the console

```js
const g = document.querySelector('.designerGridPanel .grid'), c = g.querySelector('.cell');
console.log({ grid: [g.getBoundingClientRect().width, g.getBoundingClientRect().height],
              cell: [c.getBoundingClientRect().width, c.getBoundingClientRect().height],
              rowHeight: g.getBoundingClientRect().height / 15 });
```

A non-square `grid`, or a `cell` height larger than `rowHeight`, is the bug.

The sizing lives in `.designerGridPanel .grid` (`width`/`height: calc(100cqmin - 24px)` with `max-width`/`max-height: 100%`) plus the base `.grid` rule's own `aspect-ratio: 1 / 1`. The clamps and the explicit height can disagree; the solver's equivalent rule is worth comparing against, since the solver does not show the problem.

Check at several window sizes and both grid sizes (15x15 and 5x5), and confirm the circle still sits inside its square afterwards.
