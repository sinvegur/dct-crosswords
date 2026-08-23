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

**2. Add one small instructional line under "ACROSS"** (in the `directionHeader`, where the button used to sit) in `PuzzleDesigner.tsx` only, reading something like `"Toggle direction with SPACE"` — small/muted text (reuse `.subtle` or similar existing small-text styling), not a button. **Do NOT add this to `CrosswordPlayer.tsx`** — a similar line was added there at some point outside this task, and T023 removes it again at the user's request as unnecessary; don't reintroduce it here.

**3. Clean up redundant existing copy** now that the instruction lives in one place:
   - `PuzzleDesigner.tsx`: the `.controlsRow` subtitle currently reads (Letter mode) `"Letter mode: type answers (Turkish uppercase). Toggle direction with SPACE."` — remove this line entirely for Letter mode (both the "type answers" part, which added no value, and the "toggle direction" part, now covered by the new text under ACROSS). Leave the Block mode text (`"Block mode: click cells to toggle white ↔ black."`) unchanged — that's a different, still-useful instruction.
   - `CrosswordPlayer.tsx`: the subtitle near the puzzle title currently reads `` "Click a cell, type letters (Turkish uppercase). Toggle direction with `SPACE`." `` (note: has stray literal backtick characters around SPACE in the current text — clean those up too as part of touching this line). Remove this subtitle entirely, or shorten it to just `"Click a cell, type letters (Turkish uppercase)."` without the direction part (your call which reads better) — the direction instruction itself should only live in the one new spot under ACROSS.

**4. Compensate for the removed button — don't regress touch/mouse-only users.** Right now SPACE and the button are the *only* two ways to toggle direction; without a keyboard, a user sitting on a cell that starts both an across and down entry has no way to switch to the other direction without the button (clicking the same already-active cell currently just re-confirms the same direction, doesn't toggle). Fix: make clicking an **already-selected/active** cell toggle direction (if that cell belongs to both an across and a down entry) — standard crossword-app pattern. Implement this in both `CrosswordPlayer.tsx` (`handlePickCell`) and `PuzzleDesigner.tsx` (`pickCell`): if the clicked cell is already the active cell, and it has an entry in the *other* direction available, toggle to that direction instead of re-selecting the same one.

Scope: `CrosswordPlayer.tsx`, `PuzzleDesigner.tsx` only.

---

## T024 — [READY FOR REVIEW] Solver mode cosmetics: drop the name-change link, drop the "Active" label, tighten the clue-bar gap, and stop the logo from nuking solve progress

Four small solver-mode (`CrosswordPlayer.tsx` + `App.tsx`) polish items from live testing.

**1. Remove "Not you? Change name" — just show the solver's name, bold.**
   - In `CrosswordPlayer.tsx`'s `controlsRow` (around the `solverMeta` div), currently: `Solving as {solverName}` followed by a `·` separator and a `"Not you? Change name"` button (calls the `onChangeName` prop). Remove the separator and the button entirely, and bold the name: `Solving as <strong>{solverName}</strong>`.
   - Since this was the only caller of `onChangeName`, remove the prop from `CrosswordPlayer`'s `Props` type and its destructuring too.
   - In `App.tsx`, remove the now-dead `onChangeName={openChangeName}` prop passed to `<CrosswordPlayer />`, and remove the `openChangeName` function itself (it has no other callers — verify that before deleting, but it should be the only one). **Leave `showNameGate`/`nameDraft`/`beginWithName` and the initial name-gate screen completely untouched** — those still handle first-time name entry, this task only removes the ability to *change* an already-set name from inside the solver view.

**2. Remove the "Active: DOWN 7" label under the timer.** In `CrosswordPlayer.tsx`, remove the `{!solved ? (<div className="subtle">Active: ...</div>) : null}` block entirely (sits directly under `.solverTimer` in the top-right of `controlsRow`). `activeDirection`/`activeEntry` are still used elsewhere (the clue bar, highlighting logic) — don't touch those, just delete this one display block.

**3. Reduce the gap between the blue clue bar and the grid below it — root cause found and fix verified live, use the exact CSS below.**
   - The gap isn't from `.clueBar`'s `margin-bottom: 8px` as it might look — that's already small. The real cause: `.solverGridPanel .gridWrap { display: grid; place-items: center; }` was written back when `.gridWrap` had a single child (`.grid`) to center. Now it has two children (`.clueBar`, `.grid`) stacked in an implicit two-row grid. With no explicit `grid-template-rows`, both rows are `auto`-sized, and the browser's default content distribution stretches *both* auto rows to share any leftover vertical space in `.gridWrap` (whenever the panel is taller than the bar+grid combined) — then `place-items: center` centers each child within its own now-inflated row. The result: a gap between the bar and the grid that has nothing to do with any margin and instead scales with how much spare vertical space the panel happens to have. Measured directly: 8px at 1440×900 (little spare space, hard to notice), but 252–298px at taller/narrower viewports (900×1200, 1024×1300, 1100×1400) — confirms the scaling relationship.
   - **Fix, verified**: switch `.solverGridPanel .gridWrap` from CSS Grid to a flex column:
     ```css
     .solverGridPanel .gridWrap {
       flex: 1;
       min-height: 0;
       display: flex;
       flex-direction: column;
       align-items: center;
     }
     ```
     This keeps `.clueBar` at its natural height and horizontally centers both children (flex `align-items: center` on the cross axis), but no longer distributes leftover vertical space *between* them — any spare space now falls below the grid instead, which reads better anyway (bar and grid stay visually anchored together). Verified: gap is now a consistent 8px at every one of the previously-tested viewport sizes (both the small-gap and huge-gap cases). Also re-ran T022's original 12-viewport overflow-clipping regression sweep after this change — zero overflow at every size, confirming this doesn't reintroduce that earlier bug.
   - This is the only CSS change needed for this item — `.solverGridPanel .grid`'s sizing rule (the `calc(100cqmin - 24px)` from T022) is untouched and still correct.

**4. Clicking the logo while solving a puzzle (`/p/:slug`) navigates to `/`, which is `RequireAuth`-gated — for an unauthenticated solver this dumps them on a login screen and silently discards their in-progress solve (filled letters, timer) since none of that is persisted.** Fix: while on a solver route, the logo should not be a navigation trigger at all.
   - In `AppShell` (`App.tsx`), add `const isSolverRoute = location.pathname.startsWith('/p/');` (it already has `location` from `useLocation()`). When `isSolverRoute` is true, render the logo as a plain, non-interactive `<img>` (no `<button>` wrapper, no `onClick`, no `goHome` call) instead of the current `<button className="logoButton" onClick={goHome}>`. Keep the existing button behavior unchanged for every other route.
   - Scope this narrowly to just the logo, as asked — don't touch the `Puzzles`/`New puzzle`/`Sign out` nav buttons (those only render when `session` is truthy, which is a separate, narrower case not covered by this task).

**Verify:** solver view shows only `Solving as **Name**` (no link, no separator); no "Active: ..." text anywhere in solver mode; the clue-bar-to-grid gap stays visually small and constant across a few different browser window sizes (try resizing tall/narrow vs. wide/short); as an unauthenticated visitor on a `/p/:slug` link, confirm clicking the logo does nothing (no navigation, progress stays intact) while the same logo still works normally as a home link on every other page.

Scope: `CrosswordPlayer.tsx`, `App.tsx`, `styles.css`.

---

## T027 — [TODO] Name-gate screen: fix double label spacing and input/button width mismatch

Two small CSS bugs on the solver name-gate screen (`App.tsx`'s `PlayPage`, the "Enter your name" form before solving starts), both root-caused and verified live with real measurements — apply the exact fixes below, no design judgment needed here.

**1. The gap between "YOUR NAME" and the input box is double what's intended.** The label (`<span className="fieldLabel">`) sits inside `<label className="loginField">` alongside the `<input>`. `.loginField` is `display:flex; flex-direction:column; gap:6px`, which already spaces its two children — but `.fieldLabel` *also* has its own `margin-bottom: 6px` (needed elsewhere, e.g. `PuzzleDesigner.tsx`'s `.fieldBlock` usage, which isn't flex-based and relies on that margin). Margin and flex `gap` both apply and stack, so the real on-screen gap is 12px, not 6px. Measured directly: `gapLabelToInput` computed as exactly 12px before, 6px after the fix below.
   - **Fix**: add a scoped override so `.fieldLabel`'s margin is zeroed out specifically inside `.loginField` (leaving the base `.fieldLabel` rule, and its `.fieldBlock` usage elsewhere, untouched):
     ```css
     .loginField .fieldLabel {
       margin-bottom: 0;
     }
     ```

**2. The input box is measurably wider than the "Start" button below it (and everything above it), breaking the visual symmetry.** Root cause: `.loginField input` has no `box-sizing` set, so it uses the browser's default `content-box` for `<input>` elements — meaning its `padding: 8px 10px` and `border: 1px` get added *on top of* its `width: 100%`, making it wider than its container. `<button>` elements default to `border-box` in most browsers, so `.btn`'s `width: 100%` (from `.solverGateForm button`) renders at the container's actual width with no such inflation. Measured directly at one viewport: input rendered at 342px wide vs. the button's 320px — a 22px gap, which is exactly `padding (2×10px) + border (2×1px)`. This isn't limited to the name-gate screen either — `.loginField input` is shared with the Creator sign-in form (email/password), which has the identical latent bug (confirmed live: both its inputs also rendered wider than its "Sign in" button before the fix, all three matched exactly after).
   - **Fix**: add the missing `box-sizing` to the shared rule:
     ```css
     .loginField input {
       box-sizing: border-box;
       /* existing declarations unchanged */
     }
     ```

**Verify:** on the name-gate screen, "YOUR NAME" sits closer to the input (visibly tighter, not the current noticeable gap); the input box's left *and* right edges line up exactly with the "Start" button's edges below it (no overhang on either side); repeat the same edge-alignment check on the Creator sign-in form (email input, password input, and "Sign in" button should all now match widths exactly, where before the two inputs were wider than the button).

Scope: `styles.css` only — no JSX/component changes needed for either fix.

