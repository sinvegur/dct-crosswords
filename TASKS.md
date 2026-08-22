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

## T019 — [TODO] Three small fixes from testing T018: timer start, gate form width, publish-success modal

Three independent fixes, bundled since they're all small — treat them as separate concerns, don't let fixing one bleed into another.

**1. Timer should start the moment the puzzle becomes visible, not on first keystroke.** In `CrosswordPlayer.tsx`, `startAtMs` currently only gets set inside `onCellInputChange` (`if (startAtMs == null) setStartAtMs(Date.now());`, ~line 288) — meaning a solver can read every clue for as long as they want before the clock starts, which isn't the intended timed-puzzle behavior (NYT-style timers start when you open the puzzle, not when you type your first letter). Fix:
   - Initialize `startAtMs` to `Date.now()` immediately (e.g. `useState(() => Date.now())`) instead of `null`.
   - In the existing "reset when puzzle changes" effect (`useEffect(..., [puzzle.id])`), also reset it to `Date.now()` instead of `null` — a new puzzle instance should start its own clock immediately too.
   - Remove the now-unnecessary `if (startAtMs == null) setStartAtMs(Date.now())` line inside `onCellInputChange`.
   - Since `startAtMs` is now always set once the component is mounted, the timer-ticking effect's `startAtMs == null` check can simplify accordingly (up to you whether you keep `startAtMs` typed as nullable for safety or simplify the type — either is fine, just make sure the behavior is "clock starts on mount/name-gate-dismissal, not on first letter").

**2. Solver name-gate form: button width doesn't match the input width.** In `.solverGateForm` (`styles.css`), the input has `width: 100%` but the "Start" submit button doesn't, so it renders much narrower than the input above it — inconsistent, looks unfinished. Give the button `width: 100%` too (e.g. `.solverGateForm button { width: 100%; }` or similar scoped selector) so both elements span the same width.

**3. Publish success: show a congratulations modal with a copyable share link**, instead of silently dropping the creator back on the puzzles list. This should trigger specifically when the **Publish** button is used (not "Save draft," not "Save changes" on an already-published puzzle) — since "Publish" only ever appears for a not-yet-published puzzle, clicking it is always a genuine "this is now live" moment.
   - `PuzzleDesigner`'s `onSaved` callback needs to communicate *which* action was taken. Change its signature to include that (e.g. `onSaved: (puzzle: Puzzle15, action: 'draft' | 'published') => void | Promise<void>`), passed from the existing `handleSave(status)` / `handleSaveDraftAndLeave` call sites.
   - In `App.tsx`'s `handleSaved`, **capture the return value of `savePuzzle(puzzle)`** (it already returns the saved row, including the real server-assigned `slug` — currently the return value is discarded, which is why this wasn't possible before) and use *that* for the link, not the input puzzle (a brand-new puzzle won't have a real slug until after the insert).
   - When the action was `'published'`, show a modal (same existing modal CSS conventions) — congratulatory tone, puzzle title, the **full absolute shareable URL** (`${window.location.origin}/p/${slug}` — not just the relative path, it needs to be pasteable into a text message), a "Copy link" button using the Clipboard API with some brief visual confirmation it copied (e.g. button text changes to "Copied!" for a moment), and a way to close/continue back to the puzzles list.

Scope: `CrosswordPlayer.tsx`, `PuzzleDesigner.tsx`, `App.tsx`, `styles.css`, one new modal component for item 3.

