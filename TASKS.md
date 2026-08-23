# Cursor Tasks

Task queue for handing work from Claude (planning/review) to Cursor (implementation) on dct-crosswords.

## Protocol

- **Cursor**: when told "new task for you, check TASKS.md", find the topmost entry marked `[TODO]`. Implement only that task — don't start a second `[TODO]` in the same pass. When finished, change its status to `[READY FOR REVIEW]` and add a short "Implementation notes" line under it if anything deviated from the instructions.
- **Claude**: reviews `[READY FOR REVIEW]` entries against the actual diff. Marks `[DONE]`, **commits immediately** (one task = one commit, task ID in the subject line), and deletes the entry (git history keeps the record — no need to accumulate finished tasks here). Or marks `[CHANGES REQUESTED]` and appends specific notes for Cursor to address, leaving status as `[CHANGES REQUESTED]` until fixed.
- IDs are sequential (T001, T002, ...) and never reused, even if a task is deleted.
- Only one task should be active (`[TODO]` at the top) at a time, to keep diffs small and reviewable.
- **Only make the changes the task explicitly describes.** If you notice something else worth fixing while working, do NOT implement it — note it in "Implementation notes" as a suggestion and let Claude turn it into its own task. This has been raised twice already (T001 favicon/port, T002 layout rework) — a third occurrence means diffs will be rejected without detailed review.

---

## T011 — [BLOCKED, do not start yet] Remove the "Toggle (SPACE)" / "Direction (SPACE)" buttons; consolidate into small instructional text

**T010 is done, but this is deprioritized behind the T012/T013 backend work the user just started — wait for explicit go-ahead before picking this up, even once it's otherwise unblocked.**

Both `CrosswordPlayer.tsx` (button labeled "Toggle (SPACE)", in the ACROSS `directionHeader`) and `PuzzleDesigner.tsx` (button labeled "Direction (SPACE)", same location) have a button that just toggles direction — redundant with the SPACE key, which already does the same thing. Remove both buttons entirely and replace with small instructional text.

**1. Remove both buttons.**

**2. Add one small instructional line under "ACROSS"** (in the `directionHeader`, where the button used to sit) in both files, reading something like `"Toggle direction with SPACE"` — small/muted text (reuse `.subtle` or similar existing small-text styling), not a button.

**3. Clean up redundant existing copy** now that the instruction lives in one place:
   - `PuzzleDesigner.tsx`: the `.controlsRow` subtitle currently reads (Letter mode) `"Letter mode: type answers (Turkish uppercase). Toggle direction with SPACE."` — remove this line entirely for Letter mode (both the "type answers" part, which added no value, and the "toggle direction" part, now covered by the new text under ACROSS). Leave the Block mode text (`"Block mode: click cells to toggle white ↔ black."`) unchanged — that's a different, still-useful instruction.
   - `CrosswordPlayer.tsx`: the subtitle near the puzzle title currently reads `` "Click a cell, type letters (Turkish uppercase). Toggle direction with `SPACE`." `` (note: has stray literal backtick characters around SPACE in the current text — clean those up too as part of touching this line). Remove this subtitle entirely, or shorten it to just `"Click a cell, type letters (Turkish uppercase)."` without the direction part (your call which reads better) — the direction instruction itself should only live in the one new spot under ACROSS.

**4. Compensate for the removed button — don't regress touch/mouse-only users.** Right now SPACE and the button are the *only* two ways to toggle direction; without a keyboard, a user sitting on a cell that starts both an across and down entry has no way to switch to the other direction without the button (clicking the same already-active cell currently just re-confirms the same direction, doesn't toggle). Fix: make clicking an **already-selected/active** cell toggle direction (if that cell belongs to both an across and a down entry) — standard crossword-app pattern. Implement this in both `CrosswordPlayer.tsx` (`handlePickCell`) and `PuzzleDesigner.tsx` (`pickCell`): if the clicked cell is already the active cell, and it has an entry in the *other* direction available, toggle to that direction instead of re-selecting the same one.

Scope: `CrosswordPlayer.tsx`, `PuzzleDesigner.tsx` only.

---

## T022 — [TODO] Solver-mode desktop UX: compact 3-column layout, Tab navigation, clickable clues

**One task, one branch, deliberately** — these three are being done together instead of as three parallel branches, specifically because they all touch overlapping regions of `CrosswordPlayer.tsx` (the clue-list JSX especially), and parallel branches touching the same file is exactly what caused a real merge conflict a few tasks back (T018/T019 vs T020). Sequential within one task avoids repeating that. Reference screenshot showed a NYT-style layout: grid, ACROSS list, and DOWN list all visible simultaneously in three columns, no scrolling needed to see one at the expense of another.

**1. Three-column desktop layout — grid, ACROSS, DOWN all visible together, no scroll-to-hide-the-other-list.**
   - Currently `.layout` is two columns (`360px 1fr`): one panel holds *both* ACROSS and DOWN stacked in a single scrolling `.clues` div, the other holds the grid. Restructure into three panels/columns: ACROSS list, DOWN list, and the grid+controls — each its own independently-scrollable column (`overflow-y: auto` with a height tied to the viewport, not the page), so all three are visible together without the page itself needing to scroll.
   - This is the "viewport-fit grid + scrollable clue columns" idea that was explicitly deferred as a future task back during T002's review — this is that task now.
   - Preserve the existing mobile fallback behavior reasonably (currently `@media (max-width: 860px) { grid-template-columns: 1fr; }` stacks everything) — it doesn't need to be *optimized* for mobile in this task (that's still a separate planned pass), just don't leave it broken.

**2. Tab / Shift+Tab navigation.** There's currently no Tab handling anywhere in the code — whatever "nothing happens" behavior is being seen is just an unhandled browser default, not a bug worth tracing further. Implement it properly instead: pressing Tab in a grid cell moves to the **first cell of the next entry** in the current direction (cycling across all across-entries, or all down-entries, wrapping around at the end); Shift+Tab moves to the previous entry the same way. This is the standard crossword-app convention. Add `e.preventDefault()` so it doesn't fall through to normal browser tab-order behavior.

**3. Clickable clues that highlight the matching word in the grid.** Right now `CrosswordPlayer.tsx`'s clue list items have no `onClick` at all — purely decorative text. `PuzzleDesigner.tsx` already has exactly this pattern working correctly for its own clue list (`.clueEdit` items — `onClick` sets `activeDirection`/`activeEntryNumber` and focuses the entry's first cell) — mirror that same approach here, it doesn't need to be reinvented. Clicking a clue should: set it as the active entry/direction (which already drives the grid's existing highlight styling via `activeEntryCellIndices`/`cellActive` — no new highlighting logic needed, just correctly setting the state that already controls it) and focus the first cell of that word. Add pointer-cursor styling to the clue rows so they read as clickable.

**Verify**: at a typical desktop width, confirm the grid and both full clue lists are all visible without needing to scroll the page to see one at the cost of hiding another (only the individual clue columns should scroll, independently, if a list is long). Confirm Tab/Shift+Tab cycle through entries correctly including wrap-around at the start/end. Click several different clues (both across and down) and confirm the grid highlight and active-clue highlighting both update correctly each time.

Scope: `CrosswordPlayer.tsx`, `styles.css`.

