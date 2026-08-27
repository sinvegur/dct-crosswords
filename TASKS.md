# Cursor Tasks

Task queue for handing work from Claude (planning/review) to Cursor (implementation) on dct-crosswords.

## Protocol

- **Cursor**: when told "new task for you, check TASKS.md", find the topmost entry marked `[TODO]`. Implement only that task — don't start a second `[TODO]` in the same pass. When finished, change its status to `[READY FOR REVIEW]` and add a short "Implementation notes" line under it if anything deviated from the instructions.
- **Claude**: reviews `[READY FOR REVIEW]` entries against the actual diff. Marks `[DONE]`, **commits immediately** (one task = one commit, task ID in the subject line), and deletes the entry (git history keeps the record — no need to accumulate finished tasks here). Or marks `[CHANGES REQUESTED]` and appends specific notes for Cursor to address, leaving status as `[CHANGES REQUESTED]` until fixed.
- IDs are sequential (T001, T002, ...) and never reused, even if a task is deleted.
- Only one task should be active (`[TODO]` at the top) at a time, to keep diffs small and reviewable.
- **Only make the changes the task explicitly describes.** If you notice something else worth fixing while working, do NOT implement it — note it in "Implementation notes" as a suggestion and let Claude turn it into its own task. This has been raised twice already (T001 favicon/port, T002 layout rework) — a third occurrence means diffs will be rejected without detailed review.

---

## T054 — [TODO] Let solvers switch between the leaderboard and the completed grid

After solving, the results panel completely replaces the grid, so there's no way to look at the puzzle you just finished. Add a simple two-way switcher.

Scope: `CrosswordPlayer.tsx` and `styles.css`. Works on desktop and mobile.

**1. Structure.** Today the render is:

```tsx
{solved ? (
  <div className="solverResults"> …leaderboard… </div>
) : (
  <div className="gridWrap"> …clue bar, grid, mobile keyboard… </div>
)}
```

Add `const [resultsView, setResultsView] = useState<'leaderboard' | 'grid'>('leaderboard')`, and when `solved` is true show whichever the switcher selects. Default to `leaderboard`, so the current behaviour is what people see first.

**Do not duplicate the grid JSX.** Pull the clue bar + grid into a variable (or small local component) rendered by both branches, so there's one copy to maintain. The grid is already effectively read-only when solved — `onCellInputChange` returns early on `solved` — so nothing needs disabling.

**2. Keep the header fixed.** "Solved! 🎉" and "Your time: …" should stay visible in both views. Put the switcher directly beneath them; it swaps only the content below.

**3. The mobile on-screen keyboard must not appear in the solved grid view.** It currently renders inside the grid branch, gated only on `isMobile`. Change that gate to `isMobile && !solved` — there's nothing to type, and it would eat most of the screen.

**4. Suppress check styling in the completed grid.** A solved grid shows every letter correct, so the blue `.cellLocked` letters left over from earlier Check presses look arbitrary. When `solved` is true, don't apply `cellLocked` or `cellWrong` — render a clean finished grid.

**5. The switcher itself.** Two buttons, labelled **Leaderboard** and **Puzzle**, styled as a segmented control. Reuse the existing `toolbarSegment` / `toolbarControl` pattern from `PuzzleDesigner.tsx` if it fits, rather than inventing a new visual language — but keep it text, not icons, since both options need to be unambiguous. Mark the active one with `aria-pressed`.

It must fit the mobile width without wrapping or squeezing the grid. Check both a 5×5 mini and a 15×15 on a narrow viewport.

**Testing:**
- Solve a puzzle (the "Solve it" button is the fast way) on both desktop and mobile
- The leaderboard shows first, exactly as it does today
- Switching to Puzzle shows the completed grid, correctly sized, no on-screen keyboard on mobile
- Switching back to Leaderboard restores the results, still showing your time and rank
- The grid in this view is read-only — typing and the mobile keyboard can't alter it
- Check a few squares *before* solving, then solve: the completed grid shows no leftover blue or red marks
- Clue bar navigation (chevrons, tapping the clue) still behaves in the solved grid view, or is hidden — your call, but say which you chose in the implementation notes
- Starting a different puzzle afterwards resets the view to Leaderboard

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
