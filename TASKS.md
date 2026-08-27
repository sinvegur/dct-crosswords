# Cursor Tasks

Task queue for handing work from Claude (planning/review) to Cursor (implementation) on dct-crosswords.

## Protocol

- **Cursor**: when told "new task for you, check TASKS.md", find the topmost entry marked `[TODO]`. Implement only that task — don't start a second `[TODO]` in the same pass. When finished, change its status to `[READY FOR REVIEW]` and add a short "Implementation notes" line under it if anything deviated from the instructions.
- **Claude**: reviews `[READY FOR REVIEW]` entries against the actual diff. Marks `[DONE]`, **commits immediately** (one task = one commit, task ID in the subject line), and deletes the entry (git history keeps the record — no need to accumulate finished tasks here). Or marks `[CHANGES REQUESTED]` and appends specific notes for Cursor to address, leaving status as `[CHANGES REQUESTED]` until fixed.
- IDs are sequential (T001, T002, ...) and never reused, even if a task is deleted.
- Only one task should be active (`[TODO]` at the top) at a time, to keep diffs small and reviewable.
- **Only make the changes the task explicitly describes.** If you notice something else worth fixing while working, do NOT implement it — note it in "Implementation notes" as a suggestion and let Claude turn it into its own task. This has been raised twice already (T001 favicon/port, T002 layout rework) — a third occurrence means diffs will be rejected without detailed review.

---

## T050 — [TODO] Remove letter/block modes from the builder; type `.` to make a black square

Real feedback from the person the app was built for: the Letter/Block mode toggle is friction nobody wants. He builds grids by typing, and reaches for a full stop (`.`) when he wants a black square — no mode switching. Adopt that.

**The whole `editMode` concept goes away.** Delete the `EditMode` type, the `editMode` state, and every `editMode === 'block'` branch (there are ~15 in `PuzzleDesigner.tsx`).

**1. Typing `.` blackens the current square.** Intercept it in `onCellChange`, *before* `normalizeLetter` runs — otherwise `.` gets uppercased and stored as if it were a letter:

```tsx
const onCellChange = (cellIndex: number, raw: string) => {
  pickCell(cellIndex);
  const typed = raw.trim();
  if (typed.endsWith('.')) {
    const { row, col } = posOf(size, cellIndex);
    toggleBlockAt(row, col);
    stepOneCell(1);   // see item 3
    return;
  }
  // ...existing letter handling unchanged
};
```

`toggleBlockAt` already clears the cell's letter and mirrors to the symmetric square when the 180° toggle is on — both behaviours are correct here, keep them.

**2. Clicking a black square turns it white again.** This matters: black cells render no `<input>` (`{!isBlock ? <input .../> : null}`), so once a square is black there is no way to focus it and type `.` a second time. Without this, blackening is a one-way door.

In `onCellClick`: if the clicked cell is currently a block, call `toggleBlockAt` and return. Otherwise `pickCell` as now.

**3. Advance one cell after blackening**, so a run of black squares can be typed as `...` without re-clicking. Add a small helper — note this is a plain geometric step, **not** `moveInResolvedEntry`: adding a block changes the entry structure underneath you, so entry-relative movement is meaningless here.

```tsx
const stepOneCell = (delta: 1 | -1) => {
  const { row, col } = posOf(size, activeCellIndex ?? cellIndex);
  const next = activeDirection === 'across'
    ? (col + delta >= 0 && col + delta < size ? idxOf(size, row, col + delta) : null)
    : (row + delta >= 0 && row + delta < size ? idxOf(size, row + delta, col) : null);
  if (next == null) return;
  pickCell(next);
  focusCell(next);
};
```
If the next cell is itself a block it can't be focused — just leave selection where it lands rather than skipping ahead; don't add skip logic for this.

**4. Remove the toolbar mode buttons.** The `toolbarSegment` holding the Letter (`PencilLine`) and Block (`Grid2x2`) buttons goes entirely. Keep the 180° symmetry and Shuffle buttons. **Remove the now-unused `PencilLine` and `Grid2x2` imports** from the `lucide-react` import — leaving them will fail lint.

**5. Update the two copy strings** that branched on mode:
- The `.designHint` under "Design" (~line 752)
- The `.statusBar` message (~line 931)

Both should now describe one mode. Something like: *"Type letters to fill answers. Type a full stop (.) for a black square — click a black square to undo."* Keep the existing "Ready to save" / incomplete-answers / missing-clues states in the status bar exactly as they are; only the block-mode branch disappears.

**6. Remove `disabled={editMode === 'block'}`** from the "Direction (SPACE)" button (~line 670) — it should always be enabled now.

**7. CSS in `src/styles.css`:**
- Delete the `.gridBlockMode .cell input { pointer-events: none; }` rule — the class no longer exists.
- `.cellClickable` was only applied in block mode. Apply it to **black cells always**, so they show a pointer cursor and read as clickable (they now are). White cells keep the text cursor from their input.

**Do not touch** `CrosswordPlayer.tsx`. Solvers never edit blocks, and `.` must keep doing nothing there.

**Out of scope:** T011 further down this file also proposes changes to this toolbar. Do not implement any of it.

**Testing:** run the app (`npm run dev`) and verify in the builder:
- Typing `.` on an empty square blackens it and moves one cell along the current direction
- Typing `...` in a row produces three black squares
- Typing `.` on a square that already holds a letter blackens it and discards the letter
- With 180° symmetry on, the mirrored square blackens too; with it off, only the one you typed on
- Clicking a black square turns it back to white
- Ordinary letter typing, auto-advance, backspace-jump-back and Tab stepping all still behave exactly as before (these were T049 — don't regress them)
- The clue list and numbering update correctly as blocks appear and disappear
- No Letter/Block buttons remain, and the hint text describes the new behaviour

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

