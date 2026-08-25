# Cursor Tasks

Task queue for handing work from Claude (planning/review) to Cursor (implementation) on dct-crosswords.

## Protocol

- **Cursor**: when told "new task for you, check TASKS.md", find the topmost entry marked `[TODO]`. Implement only that task — don't start a second `[TODO]` in the same pass. When finished, change its status to `[READY FOR REVIEW]` and add a short "Implementation notes" line under it if anything deviated from the instructions.
- **Claude**: reviews `[READY FOR REVIEW]` entries against the actual diff. Marks `[DONE]`, **commits immediately** (one task = one commit, task ID in the subject line), and deletes the entry (git history keeps the record — no need to accumulate finished tasks here). Or marks `[CHANGES REQUESTED]` and appends specific notes for Cursor to address, leaving status as `[CHANGES REQUESTED]` until fixed.
- IDs are sequential (T001, T002, ...) and never reused, even if a task is deleted.
- Only one task should be active (`[TODO]` at the top) at a time, to keep diffs small and reviewable.
- **Only make the changes the task explicitly describes.** If you notice something else worth fixing while working, do NOT implement it — note it in "Implementation notes" as a suggestion and let Claude turn it into its own task. This has been raised twice already (T001 favicon/port, T002 layout rework) — a third occurrence means diffs will be rejected without detailed review.

---

## T046 — [BLOCKED, pending user confirmation] Mobile letter-clipping bug — likely fixed, awaiting real-device check

**Not a Cursor task right now — do not pick this up.** Claude handled this directly (real-device-only bug, needed live iteration). Leaving a short record here rather than deleting, in case it resurfaces.

After the diagnostic notes originally left here, the investigation continued directly (not via Cursor) through several more rounds. Two things turned out to matter beyond what's listed below:
- The bug also affects 9x9 (midi), not just 15x15 — just proportionally less severe. That reframed it from "something about 15x15's specific cell size" to "a roughly fixed amount of space being eaten in every cell regardless of size."
- That pointed at the real likely cause: iOS Safari applies native default styling/padding to text inputs unless a page explicitly opts out (`-webkit-appearance: none`), which was missing from `.cell input` entirely. Fixed, plus removed the grid's remaining CSS container-query dependency (container-type/cqw/cqi) in favor of directly JS-measuring cell size via `ResizeObserver` and applying plain pixel values — since the bug never reproduced in any automated testing, container queries behaving unexpectedly on the specific real device was a live suspect worth eliminating regardless.

**Status: fix shipped, not yet confirmed on the user's actual device** ("will check later"). If it comes back after confirmation, or a new report references this, read the full commit history on `src/styles.css` and `src/crossword/CrosswordPlayer.tsx` from today (2026-08-25) before re-diagnosing — a lot of ground was already covered.

---

## T047 — [TODO] Auto-advance to the next unfilled clue when an entry is completed

Right now, typing the last letter of an entry (across or down) just stops there — the solver has to manually click/tap the next clue to continue. NYT's app (and most crossword apps) auto-jump to the next entry that still needs filling in, so solving flows continuously without breaking to pick the next clue by hand. This applies on both desktop and mobile equally — not a mobile-specific change.

**The building blocks already exist, this is about connecting them.** `CrosswordPlayer.tsx` already has:
- `moveInResolvedEntry(entry, from, delta)` — moves the active cell forward within the current entry after typing a letter, already skipping over cells pre-filled by a crossing entry (T-earlier fix). When `delta` moves past the entry's last cell, `next` comes back `null` and the function currently just `return`s, i.e. — **this is exactly the moment the current entry has just been completed** (if any cell before the end were still empty, the skip-forward loop would have stopped there instead of reaching `null`).
- `stepEntry(delta)` — already implements "next available" correctly: walks across+down entries in order starting after the current one, skips any that `isEntryFilled()` already, and calls `focusEntry()` on the first one that still needs filling. Already wired to Tab/Shift+Tab.

**The fix is a two-line change in `moveInResolvedEntry`:**

```tsx
const moveInResolvedEntry = (entry: Entry, from: number, delta: 1 | -1) => {
  const indices = entry.cells.map((c) => idxOf(size, c.row, c.col));
  const pos = indices.indexOf(from);
  if (pos === -1) return;

  let nextPos = pos + delta;
  while (nextPos >= 0 && nextPos < indices.length - 1 && filled[indices[nextPos]!]) {
    nextPos += delta;
  }

  const next = indices[nextPos];
  if (next == null) {
    if (delta === 1) stepEntry(1);
    return;
  }
  handlePickCell(next);
  focusCell(next);
  setActiveCellIndex(next);
};
```

(Only the `if (next == null)` branch changes — was a bare `return`, now calls `stepEntry(1)` first, and only for `delta === 1` since `moveInResolvedEntry` is only ever called with `delta: 1` today, from `onCellInputChange`'s forward-typing path; guarding on `delta` keeps the function correct if a `delta: -1` caller is ever added later.)

**One nuance already handled correctly by `stepEntry`, don't try to "fix" it:** if every other entry in the puzzle is already filled in except the puzzle's very last one, `stepEntry(1)` wrapping around and finding nothing new to land on is expected — it already loops back to the start and, if it can't find any unfilled entry after a full loop, does nothing (stays put). That's correct behavior for "you just filled the last word."

**Verify:** fill an entry completely (either direction) and confirm the active cell/clue automatically jumps to the next entry that still has empty cells, skipping any already-completed ones — both when the completed entry is followed immediately by another unfilled one, and when several entries in a row are already filled (confirm it skips all of them, matching Tab's existing behavior). Confirm this works via the physical keyboard AND the mobile custom on-screen keyboard (both funnel through the same `onCellInputChange` path, so one code change should cover both — verify both anyway). Confirm completing the very last remaining entry in the puzzle doesn't error or infinite-loop (should just stay put once `checkSolved` marks the puzzle solved, same as today, since `onCellInputChange` calls `finishIfSolved` before the auto-advance step). Confirm normal mid-entry typing (not yet complete) is unaffected — should still behave exactly as before.

Scope: `CrosswordPlayer.tsx` only.

---

## T011 — [BLOCKED, do not start yet] Remove the "Toggle (SPACE)" / "Direction (SPACE)" buttons; consolidate into small instructional text

**T010 is done, but this is deprioritized behind the T012/T013 backend work the user just started — wait for explicit go-ahead before picking this up, even once it's otherwise unblocked.**

Both `CrosswordPlayer.tsx` (button labeled "Toggle (SPACE)", in the ACROSS `directionHeader`) and `PuzzleDesigner.tsx` (button labeled "Direction (SPACE)", same location) have a button that just toggles direction — redundant with the SPACE key, which already does the same thing. Remove both buttons entirely and replace with small instructional text.

**1. Remove both buttons.**

**2. Add one small instructional line under "ACROSS"** (in the `directionHeader`, where the button used to sit) in `PuzzleDesigner.tsx` only, reading something like `"Toggle direction with SPACE"` — small/muted text (reuse `.subtle` or similar existing small-text styling), not a button. **Do NOT add this to `CrosswordPlayer.tsx`** — a similar line was added there at some point outside this task, and T023 removes it again at the user's request as unnecessary; don't reintroduce it here.

**3. Clean up redundant existing copy** now that the instruction lives in one place:
   - `PuzzleDesigner.tsx`: the `.controlsRow` subtitle currently reads (Letter mode) `"Letter mode: type answers (Turkish uppercase). Toggle direction with SPACE."` — remove this line entirely for Letter mode (both the "type answers" part, which added no value, and the "toggle direction" part, now covered by the new text under ACROSS). Leave the Block mode text (`"Block mode: click cells to toggle white ↔ black."`) unchanged — that's a different, still-useful instruction.
   - `CrosswordPlayer.tsx`: the subtitle near the puzzle title currently reads `` "Click a cell, type letters (Turkish uppercase). Toggle direction with `SPACE`." `` (note: has stray literal backtick characters around SPACE in the current text — clean those up too as part of touching this line). Remove this subtitle entirely, or shorten it to just `"Click a cell, type letters (Turkish uppercase)."` without the direction part (your call which reads better) — the direction instruction itself should only live in the one new spot under ACROSS.

**4. Compensate for the removed button — don't regress touch/mouse-only users.** Right now SPACE and the button are the *only* two ways to toggle direction; without a keyboard, a user sitting on a cell that starts both an across and down entry has no way to switch to the other direction without the button (clicking the same already-active cell currently just re-confirms the same direction, doesn't toggle). Fix: make clicking an **already-selected/active** cell toggle direction (if that cell belongs to both an across and a down entry) — standard crossword-app pattern. Implement this in both `CrosswordPlayer.tsx` (`handlePickCell`) and `PuzzleDesigner.tsx` (`pickCell`): if the clicked cell is already the active cell, and it has an entry in the *other* direction available, toggle to that direction instead of re-selecting the same one. **Note: the `CrosswordPlayer.tsx` half was shipped in T026 — when unblocking T011, only implement this in `PuzzleDesigner.tsx`.**

Scope: `CrosswordPlayer.tsx`, `PuzzleDesigner.tsx` only.

