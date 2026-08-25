# Cursor Tasks

Task queue for handing work from Claude (planning/review) to Cursor (implementation) on dct-crosswords.

## Protocol

- **Cursor**: when told "new task for you, check TASKS.md", find the topmost entry marked `[TODO]`. Implement only that task — don't start a second `[TODO]` in the same pass. When finished, change its status to `[READY FOR REVIEW]` and add a short "Implementation notes" line under it if anything deviated from the instructions.
- **Claude**: reviews `[READY FOR REVIEW]` entries against the actual diff. Marks `[DONE]`, **commits immediately** (one task = one commit, task ID in the subject line), and deletes the entry (git history keeps the record — no need to accumulate finished tasks here). Or marks `[CHANGES REQUESTED]` and appends specific notes for Cursor to address, leaving status as `[CHANGES REQUESTED]` until fixed.
- IDs are sequential (T001, T002, ...) and never reused, even if a task is deleted.
- Only one task should be active (`[TODO]` at the top) at a time, to keep diffs small and reviewable.
- **Only make the changes the task explicitly describes.** If you notice something else worth fixing while working, do NOT implement it — note it in "Implementation notes" as a suggestion and let Claude turn it into its own task. This has been raised twice already (T001 favicon/port, T002 layout rework) — a third occurrence means diffs will be rejected without detailed review.

---

## T048 — [TODO] Auto-jump to the previous entry when backspacing past the start of a word

Mirror of T047 (auto-advance to the next unfilled entry on completion), but for deletion: right now, backspacing at the very first cell of an entry that's already empty just does nothing — the solver is stuck there. It should instead jump to the *previous* entry (in the same across-then-down sequence `stepEntry` already walks), landing on its last cell so they can keep backspacing back through it if they want. This matches NYT and is the natural mirror of T047.

**Where this lives:** `backspaceEmptyCell(cellIndex)` in `CrosswordPlayer.tsx` — called when backspacing a cell that's already empty (the "cascade back and clear the previous letter" case; backspacing a *filled* cell just clears it in place, per an earlier fix — that path is untouched by this task). Currently:

```tsx
if (pos === 0) return;
```

`pos === 0` means the cursor is already at the entry's first cell with nothing left to delete within it — that's the exact moment to jump to the previous entry instead of just stopping.

**Important: this is deliberately different from `stepEntry`, not a call to it.** `stepEntry(-1)` (used for Shift+Tab) skips over any entry that's already fully filled, which is right for *navigating* but wrong here — if you're backspacing backward, you want the entry immediately before this one in sequence, complete or not, so you can keep deleting into it. Don't reuse `stepEntry` for this; add a separate helper that always goes to the immediately-previous entry with no skip logic.

```tsx
const jumpToPreviousEntryEnd = (direction: Direction, entryNumber: number) => {
  const combined = [
    ...computed.entriesAcross.map((entry) => ({ direction: 'across' as const, entry })),
    ...computed.entriesDown.map((entry) => ({ direction: 'down' as const, entry })),
  ];
  const currentIdx = combined.findIndex(
    (item) => item.direction === direction && item.entry.number === entryNumber,
  );
  if (currentIdx === -1) return;
  const prevIdx = currentIdx === 0 ? combined.length - 1 : currentIdx - 1;
  const target = combined[prevIdx]!;
  const targetIndices = target.entry.cells.map((c) => idxOf(size, c.row, c.col));
  const lastCell = targetIndices[targetIndices.length - 1]!;
  setActiveDirection(target.direction);
  setActiveEntryNumber(target.entry.number);
  setActiveCellIndex(lastCell);
  focusCell(lastCell);
};
```

(Modeled directly on the existing `focusEntry` — same pattern of setting state directly and calling `focusCell`, not going through `handlePickCell`. `combined`'s across-then-down ordering matches `stepEntry`'s exactly, for consistency — the "previous" entry from an across entry near the start of the across list will wrap around to the last down entry, same wraparound behavior `stepEntry` already has going the other way.)

**In `backspaceEmptyCell`, replace the bare return:**

```tsx
if (pos === 0) {
  jumpToPreviousEntryEnd(direction, entry.number);
  return;
}
```

**One real wrinkle to get right:** `backspaceEmptyCell` currently reassigns `entry` (and `pos`/`indices`) inside a fallback block that tries the *other* direction if the cell doesn't belong to an entry in `activeDirection` (see the existing `if (pos === -1) { ... }` block above the line being changed). By the time you reach `pos === 0`, you need the **actual resolved direction for `entry`**, which may not match `activeDirection` state (that fallback exists precisely because it sometimes doesn't, and `activeDirection` won't have updated synchronously within this same function call even if `handlePickCell` was called). Track a local `direction` variable alongside `entry` through that whole fallback block (starting from `activeDirection`, reassigned to the opposite value in the fallback branch, exactly mirroring how `entry` itself already gets reassigned there) and pass *that* to `jumpToPreviousEntryEnd`, not `activeDirection` directly.

**Verify:** fill an entry, then backspace it back to empty and press backspace once more while sitting on its already-empty first cell — confirm it jumps to the previous entry in sequence (across-then-down order) and lands on that entry's *last* cell, ready to continue backspacing. Test from an entry that isn't the very first (normal previous-entry case), from the very first entry in the puzzle (should wrap to the last down entry, mirroring `stepEntry`'s existing wraparound), and specifically test backspacing into a *previous entry that's still fully filled* — confirm it still lands there (does **not** skip past it looking for an unfilled one, unlike Shift+Tab). Confirm this works via both the physical keyboard and the mobile custom on-screen keyboard's backspace key. Confirm normal backspace-within-an-entry (not yet at position 0) is completely unaffected.

Scope: `CrosswordPlayer.tsx` only.

---

## T046 — [BLOCKED, pending user confirmation] Mobile letter-clipping bug — likely fixed, awaiting real-device check

**Not a Cursor task right now — do not pick this up.** Claude handled this directly (real-device-only bug, needed live iteration). Leaving a short record here rather than deleting, in case it resurfaces.

After the diagnostic notes originally left here, the investigation continued directly (not via Cursor) through several more rounds. Two things turned out to matter beyond what's listed below:
- The bug also affects 9x9 (midi), not just 15x15 — just proportionally less severe. That reframed it from "something about 15x15's specific cell size" to "a roughly fixed amount of space being eaten in every cell regardless of size."
- That pointed at the real likely cause: iOS Safari applies native default styling/padding to text inputs unless a page explicitly opts out (`-webkit-appearance: none`), which was missing from `.cell input` entirely. Fixed, plus removed the grid's remaining CSS container-query dependency (container-type/cqw/cqi) in favor of directly JS-measuring cell size via `ResizeObserver` and applying plain pixel values — since the bug never reproduced in any automated testing, container queries behaving unexpectedly on the specific real device was a live suspect worth eliminating regardless.

**Status: fix shipped, not yet confirmed on the user's actual device** ("will check later"). If it comes back after confirmation, or a new report references this, read the full commit history on `src/styles.css` and `src/crossword/CrosswordPlayer.tsx` from today (2026-08-25) before re-diagnosing — a lot of ground was already covered.

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

