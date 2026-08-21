# Cursor Tasks

Task queue for handing work from Claude (planning/review) to Cursor (implementation) on dct-crosswords.

## Protocol

- **Cursor**: when told "new task for you, check TASKS.md", find the topmost entry marked `[TODO]`. Implement only that task — don't start a second `[TODO]` in the same pass. When finished, change its status to `[READY FOR REVIEW]` and add a short "Implementation notes" line under it if anything deviated from the instructions.
- **Claude**: reviews `[READY FOR REVIEW]` entries against the actual diff. Marks `[DONE]`, **commits immediately** (one task = one commit, task ID in the subject line), and deletes the entry (git history keeps the record — no need to accumulate finished tasks here). Or marks `[CHANGES REQUESTED]` and appends specific notes for Cursor to address, leaving status as `[CHANGES REQUESTED]` until fixed.
- IDs are sequential (T001, T002, ...) and never reused, even if a task is deleted.
- Only one task should be active (`[TODO]` at the top) at a time, to keep diffs small and reviewable.
- **Only make the changes the task explicitly describes.** If you notice something else worth fixing while working, do NOT implement it — note it in "Implementation notes" as a suggestion and let Claude turn it into its own task. This has been raised twice already (T001 favicon/port, T002 layout rework) — a third occurrence means diffs will be rejected without detailed review.

---

## T010 — [READY FOR REVIEW] Fix inconsistent backspace/delete in the grid

**Root cause, already diagnosed — implement this fix, don't re-diagnose from scratch:**

In both `CrosswordPlayer.tsx` (the cell `<input>`'s `onKeyDown`, ~line 322-336) and `PuzzleDesigner.tsx` (`onCellChange` + its `<input>`'s `onKeyDown`, ~line 227 / 494), Backspace is only handled via the browser's native `onChange` event — which only fires when the input's value actually changes. That works fine when the current cell has a letter (clearing it fires `onChange`, which correctly clears and moves back one cell — that part is already correct, don't change it). But **pressing Backspace on an already-empty cell fires no `onChange` event at all**, since there's nothing to clear — so it's currently a complete no-op: no move, no clear. That's why deleting a word by holding/repeating Backspace feels random: the moment focus lands on a cell that's already blank (which happens as soon as you've cleared one), further Backspace presses silently do nothing until you manually click.

**Required fix, both files:** add explicit handling in each grid `<input>`'s `onKeyDown` for `e.key === 'Backspace'` when the **current cell is already empty**: `e.preventDefault()`, find the previous cell in the active entry (reuse existing helpers — `moveToPrevInActiveEntry`-equivalent logic already exists for finding the previous index), **clear that previous cell's letter** (not just move focus to it — both clear AND move), and focus it. This makes repeated/held Backspace chain smoothly backward through an entire word, clearing one letter per press, same as the letter-typing direction already works forward. The existing "clear current cell via onChange, then move back" path for a filled cell stays as-is — this is an additional branch for the empty-cell case, not a replacement.

**Verify:** type a full word, then hold/repeatedly press Backspace from the end — confirm it deletes the whole word smoothly, one letter per press, without ever needing an extra click or press to "unstick." Test in both the puzzle designer (Letter mode) and the player. Also confirm Backspace at the very first cell of an entry does nothing beyond that boundary (no crash, no wraparound to another entry).

Scope: `CrosswordPlayer.tsx` and `PuzzleDesigner.tsx` only — the `onKeyDown` handlers on the grid cell inputs (and any small helper you need to add/reuse for "clear + move to previous cell").

**Implementation notes:** Empty-cell Backspace now clears the previous letter in the active entry and focuses it (both files). Filled-cell path still uses onChange. First cell of an entry is a no-op (no wrap).

---

## T011 — [BLOCKED, do not start yet — will flip to TODO once T010 is done] Remove the "Toggle (SPACE)" / "Direction (SPACE)" buttons; consolidate into small instructional text

**Blocked on T010** — both tasks touch the same input `onKeyDown` handlers; keep them in separate review passes. Wait for T010 to be marked done before starting this one.

Both `CrosswordPlayer.tsx` (button labeled "Toggle (SPACE)", in the ACROSS `directionHeader`) and `PuzzleDesigner.tsx` (button labeled "Direction (SPACE)", same location) have a button that just toggles direction — redundant with the SPACE key, which already does the same thing. Remove both buttons entirely and replace with small instructional text.

**1. Remove both buttons.**

**2. Add one small instructional line under "ACROSS"** (in the `directionHeader`, where the button used to sit) in both files, reading something like `"Toggle direction with SPACE"` — small/muted text (reuse `.subtle` or similar existing small-text styling), not a button.

**3. Clean up redundant existing copy** now that the instruction lives in one place:
   - `PuzzleDesigner.tsx`: the `.controlsRow` subtitle currently reads (Letter mode) `"Letter mode: type answers (Turkish uppercase). Toggle direction with SPACE."` — remove this line entirely for Letter mode (both the "type answers" part, which added no value, and the "toggle direction" part, now covered by the new text under ACROSS). Leave the Block mode text (`"Block mode: click cells to toggle white ↔ black."`) unchanged — that's a different, still-useful instruction.
   - `CrosswordPlayer.tsx`: the subtitle near the puzzle title currently reads `` "Click a cell, type letters (Turkish uppercase). Toggle direction with `SPACE`." `` (note: has stray literal backtick characters around SPACE in the current text — clean those up too as part of touching this line). Remove this subtitle entirely, or shorten it to just `"Click a cell, type letters (Turkish uppercase)."` without the direction part (your call which reads better) — the direction instruction itself should only live in the one new spot under ACROSS.

**4. Compensate for the removed button — don't regress touch/mouse-only users.** Right now SPACE and the button are the *only* two ways to toggle direction; without a keyboard, a user sitting on a cell that starts both an across and down entry has no way to switch to the other direction without the button (clicking the same already-active cell currently just re-confirms the same direction, doesn't toggle). Fix: make clicking an **already-selected/active** cell toggle direction (if that cell belongs to both an across and a down entry) — standard crossword-app pattern. Implement this in both `CrosswordPlayer.tsx` (`handlePickCell`) and `PuzzleDesigner.tsx` (`pickCell`): if the clicked cell is already the active cell, and it has an entry in the *other* direction available, toggle to that direction instead of re-selecting the same one.

Scope: `CrosswordPlayer.tsx`, `PuzzleDesigner.tsx` only.
