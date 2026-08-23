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

## T022 — [READY FOR REVIEW] Solver-mode desktop UX: compact 3-column layout, Tab navigation, clickable clues

**Implementation notes:** Round 2 — applied verified grid sizing fix (`container-type: size` on `.solverGridPanel`, grid centering via `place-items`, `100cqmin` on `.grid`). Round 1 fixes retained: square `.cell`, `cqi` letter/number scaling, `2fr` grid column.

**One task, one branch, deliberately** — these three are being done together instead of as three parallel branches, specifically because they all touch overlapping regions of `CrosswordPlayer.tsx` (the clue-list JSX especially), and parallel branches touching the same file is exactly what caused a real merge conflict a few tasks back (T018/T019 vs T020). Sequential within one task avoids repeating that. Reference screenshot showed a NYT-style layout: grid, ACROSS list, and DOWN list all visible simultaneously in three columns, no scrolling needed to see one at the expense of another.

**1. Three-column desktop layout — grid, ACROSS, DOWN all visible together, no scroll-to-hide-the-other-list.**
   - Currently `.layout` is two columns (`360px 1fr`): one panel holds *both* ACROSS and DOWN stacked in a single scrolling `.clues` div, the other holds the grid. Restructure into three panels/columns: ACROSS list, DOWN list, and the grid+controls — each its own independently-scrollable column (`overflow-y: auto` with a height tied to the viewport, not the page), so all three are visible together without the page itself needing to scroll.
   - This is the "viewport-fit grid + scrollable clue columns" idea that was explicitly deferred as a future task back during T002's review — this is that task now.
   - Preserve the existing mobile fallback behavior reasonably (currently `@media (max-width: 860px) { grid-template-columns: 1fr; }` stacks everything) — it doesn't need to be *optimized* for mobile in this task (that's still a separate planned pass), just don't leave it broken.

**2. Tab / Shift+Tab navigation.** There's currently no Tab handling anywhere in the code — whatever "nothing happens" behavior is being seen is just an unhandled browser default, not a bug worth tracing further. Implement it properly instead: pressing Tab in a grid cell moves to the **first cell of the next entry** in the current direction (cycling across all across-entries, or all down-entries, wrapping around at the end); Shift+Tab moves to the previous entry the same way. This is the standard crossword-app convention. Add `e.preventDefault()` so it doesn't fall through to normal browser tab-order behavior.

**3. Clickable clues that highlight the matching word in the grid.** Right now `CrosswordPlayer.tsx`'s clue list items have no `onClick` at all — purely decorative text. `PuzzleDesigner.tsx` already has exactly this pattern working correctly for its own clue list (`.clueEdit` items — `onClick` sets `activeDirection`/`activeEntryNumber` and focuses the entry's first cell) — mirror that same approach here, it doesn't need to be reinvented. Clicking a clue should: set it as the active entry/direction (which already drives the grid's existing highlight styling via `activeEntryCellIndices`/`cellActive` — no new highlighting logic needed, just correctly setting the state that already controls it) and focus the first cell of that word. Add pointer-cursor styling to the clue rows so they read as clickable.

**Verify**: at a typical desktop width, confirm the grid and both full clue lists are all visible without needing to scroll the page to see one at the cost of hiding another (only the individual clue columns should scroll, independently, if a list is long). Confirm Tab/Shift+Tab cycle through entries correctly including wrap-around at the start/end. Click several different clues (both across and down) and confirm the grid highlight and active-clue highlighting both update correctly each time.

Scope: `CrosswordPlayer.tsx`, `styles.css`.

**Review notes (Claude) — all three of the user's complaints verified live (not just re-read from the diff), root causes found, one fix already verified to work:**

**1. Non-square cells — root cause found and fix verified.** The 3-column layout (`.layout.layoutSolver { grid-template-columns: minmax(0,1fr) minmax(0,1fr) minmax(0,1.25fr); }`) gives the grid meaningfully less width than before, and at many resulting pixel widths, 15 doesn't divide evenly — e.g. tested at a 1280px-wide viewport, the `.grid` container itself measured a perfect square (457×457) but individual `.cell` elements measured **29×32** (not square) due to sub-pixel rounding differences between how the 15 column-tracks vs. 15 row-tracks round to whole pixels. This wasn't visible in the old 2-column layout because the grid had more room and happened to land on more forgiving widths — the 3-column squeeze exposed a latent rounding issue, not something this task broke outright.
   - **Fix, already verified**: add `aspect-ratio: 1 / 1;` directly to `.cell` (in addition to the existing one on `.grid`, don't remove that). This forces every individual cell to independently stay square regardless of any fr-track rounding at the container level. Tested this exact one-line change at four different viewport widths (1280, 1440, 1512, 1728px) — cells were perfectly square at every one afterward.

**2. Letter/number overlap — confirmed live, root cause is the smaller cell size this layout now produces.** Typed `Ğ` into a numbered cell at a 1280px-wide viewport (cell size ~29px) and the number and the letter's breve mark visibly overlap. T009's fix (the `.cellNumber` background chip, `font-size: 9px`, small inset) was tuned against a ~40-48px cell size range from the old 2-column layout — it doesn't scale down and breaks at the smaller cell sizes this new layout can produce. A fixed-px value can't work correctly across a genuinely variable cell-size range.
   - **Fix**: make `.cellNumber`'s `font-size` (and ideally `.cell input`'s `font-size` too, so letter and number scale together proportionally) relative to the actual rendered cell size using CSS container queries — add `container-type: inline-size;` to `.grid` (not currently set anywhere in the codebase) and size those two properties in `cqi` units instead of fixed `px`. This is being explicitly authorized here, in contrast to earlier tasks (T002, T007) where container-query sizing was rejected — those rejections were about *undisclosed* scope creep bundled into unrelated tasks, not a blanket ban on the technique. Here it's the direct, correct fix for a problem this task's own layout change causes. Verify at the same range of widths tested for issue #1, with several Turkish diacritic letters (İ, Ğ, Ö, Ş, Ü) in both single- and double-digit numbered cells — same verification bar as T009 originally required.

**3. Grid isn't the prominent/dominant element — the NYT reference has the grid as the largest single element, this doesn't.** Two compounding causes:
   - The column ratio (`1.25fr` for the grid vs `1fr` each for Across/Down) doesn't give the grid enough of a share — at a 1728px viewport, the grid panel measured 655px vs 524px for each clue column, only ~25% more, not clearly dominant.
   - Even within its allotted space, the grid doesn't fill the available height — at that same width, the grid rendered as a 629×629 square sitting in a panel with significant unused vertical space below it, while the two full-height clue columns use their entire height for content. This makes the grid read as smaller/less prominent than the clue columns, backwards from the reference.
   - **Fix**: increase the grid column's share noticeably (the exact ratio is a visual judgment call — aim for the grid clearly reading as the largest element, similar proportions to the reference screenshot, not just a modest edge over the other two), and make the grid actually grow to use the available height of its column (up to the point where width becomes the limiting factor instead) rather than sitting at whatever size its width band alone produces with slack space below.

Re-verify all three together at multiple viewport widths (not just one) before marking ready again, given issue #1 specifically only showed up at certain widths and not others.

---

**Round 2 review (Claude) — the grid-prominence fix introduced a new, worse regression. Diagnosed and a working fix verified through direct iteration (not just theory) — use the exact CSS below, it's already confirmed to work, don't improvise a variation.**

**What went wrong:** the revision's approach (`.solverGridPanel .gridWrap { container-type: size; display:flex; align-items:center; justify-content:center; } .solverGridPanel .grid { width: min(100cqw, 100cqh); height:auto; max-width:100%; max-height:100%; }`) produced a grid that was both too small (560px square when ~750px of space was actually available) *and* not centered (shifted noticeably right, large empty gap on the left) — confirmed via direct `getBoundingClientRect()` measurement in a live render, not just visually. This is a real, reproducible engine quirk: `aspect-ratio` combined with percentage-based `max-height` does not reliably resolve as naively expected on a flex item, and layering `container-type: size` + composed `min(100cqw, 100cqh)` on top of that compounds it further.

**The fix that's actually verified to work** — tested via direct measurement at multiple viewport widths (1728px, 1280px), confirmed genuinely square, correctly sized to fill the tighter dimension, and correctly centered at every width tested:

```css
.solverGridPanel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
  container-type: size;
}

.solverGridPanel .gridWrap {
  flex: 1;
  min-height: 0;
  display: grid;
  place-items: center;
}

.solverGridPanel .grid {
  width: 100cqmin;
  height: 100cqmin;
}
```

Key differences from the previous attempt, both load-bearing: (1) `container-type: size` goes on `.solverGridPanel` (which has a genuinely fixed/stretched size from the top-level layout) rather than `.gridWrap` (whose size is flex-derived and created a circular dependency); (2) `.gridWrap` uses **CSS Grid** `place-items: center` rather than flexbox centering — flexbox centering combined with an aspect-ratio child produced wrong results in testing, grid centering didn't; (3) `100cqmin` (a single, dedicated container-query unit meaning "whichever of container-width/container-height is smaller") replaces the manual `min(100cqw, 100cqh)` composition, which was not resolving correctly.

**One thing to double check, not yet fully confirmed either way**: with this fix, cells at a 1280px-wide viewport render at 37×37px (bigger than the 29px worst case from round 1, since the grid now correctly uses more of the available space) — the letter/number overlap fix from round 1 (the `cqi`-based `clamp()` sizing) looked *close but not confidently clear* at this size in testing, worth a careful zoomed-in look with a Turkish diacritic letter (Ğ, Ş, Ü, etc.) before considering this fully resolved.

Verify the full picture again at 2-3 different viewport widths: square cells, grid genuinely filling and dominating its column (not floating with empty space around it), correctly centered, and no letter/number overlap.

