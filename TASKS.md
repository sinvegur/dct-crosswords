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

## T023 — [READY FOR REVIEW] Solver mode: remove leftover instruction text, fix Tab not auto-scrolling the active clue into view, add NYT-style compact clue bar above the grid

**Implementation notes:** Review follow-up — removed desktop clue-bar nav arrows (Tab/Shift+Tab retained); increased label/text gap to 16px.

Three related solver-mode (`CrosswordPlayer.tsx`) polish items from live user testing of T022's new layout.

**1. Remove the "Toggle direction with SPACE" text from the ACROSS column.**
   - In `CrosswordPlayer.tsx`, remove the entire `<div className="directionHeader"><span className="subtle">Toggle direction with SPACE</span></div>` block (currently sits at the top of the ACROSS clue list, just under the "Across" panel header). Confirmed unnecessary by the user — delete it outright, no replacement text needed.
   - Leave the DOWN column's `directionHeader` block (the conditional "Best: ..." time) untouched — that's unrelated.

**2. Tab/Shift+Tab moves the active entry correctly, but nothing scrolls the newly-active clue into view if it's outside the visible area of its clue column.** Confirmed: `stepEntry`/`focusEntry` correctly update `activeDirection`/`activeEntryNumber`/`activeCellIndex` (the underlying state and grid highlighting are right), but the ACROSS/DOWN clue lists (`.cluesScroll`, `overflow-y: auto`) don't scroll themselves — so on a puzzle with a clue list taller than the visible column, tabbing past the bottom of the visible area moves the selection with no visible feedback.
   - Fix: whenever the active entry changes (covers Tab/Shift+Tab, clicking a clue, clicking a grid cell — anywhere `activeDirection`/`activeEntryNumber` changes), scroll the corresponding clue list item into view within its own `.cluesScroll` container if it isn't already visible. Suggested approach: give each clue row a ref (a `Map` or array keyed by `${direction}:${number}`, same pattern as `inputsRef`), and in a `useEffect` keyed on `[activeDirection, activeEntryNumber]`, call `scrollIntoView({ block: 'nearest' })` (no `inline` needed, it's a vertical list) on the currently-active row's element if found. `block: 'nearest'` is important — it only scrolls if the element isn't already visible, avoiding jumpy behavior when the active clue is already on-screen.
   - Also apply the same `{ block: 'nearest', inline: 'nearest' }` scroll-into-view to the active grid cell's `<input>` in `focusCell` (after `.focus()`), as a defensive fix for the grid's own `overflow-y: auto` panel — lower priority than the clue-list fix since T022 already sized the grid to fit its panel in the common case, but cheap to add and covers small-viewport-height edge cases.

**3. New compact clue bar above the grid, NYT-style (reference: attached screenshot) — replaces the removed instructional subtitle.**
   - Location: inside `.gridWrap`, in the space currently occupied by `<div className="subtle" style={{marginBottom:8}}>Click a cell, type letters (Turkish uppercase). Toggle direction with \`SPACE\`.</div>` — **remove that entire subtitle div** (stale copy, doesn't make sense now — also has stray literal backtick characters around SPACE that were never cleaned up) and put the new clue bar in its place, above `.grid`.
   - Content, left to right: a left-arrow button, the active entry's number+direction in NYT's compact format (number immediately followed by the direction letter, bold, no space — e.g. `66A`, `12D`), the clue text (regular weight, wraps to multiple lines if long — see reference screenshot), and a right-arrow button.
   - Behavior: left/right arrows call the existing `stepEntry(-1)` / `stepEntry(1)` — same entry-cycling logic already used for Shift+Tab/Tab, including wrap-around. No new navigation logic needed, just wire the buttons to the existing function.
   - Styling: pale blue rounded background bar (see reference screenshot for the visual target — light blue fill, generous padding, rounded corners), full width of the grid column. Use a distinct, self-contained set of class names (e.g. `.clueBar`, `.clueBarNav`, `.clueBarLabel`, `.clueBarText`) rather than reusing/overloading existing solver-specific classes — **this is deliberate**, the user wants to reuse this exact component later as the default clue-switcher for the mobile layout, so keep its markup and CSS free of desktop-3-column-specific assumptions (don't nest its styling inside `.solverGridPanel`-scoped selectors, for example).
   - Empty state: before any cell/clue is selected (`activeEntry` is undefined on initial load), show the bar in some non-broken neutral state rather than a blank box — your call on exact treatment (e.g. placeholder text, or arrows disabled/hidden with a hint like "Select a clue to begin") as long as it doesn't look like a layout bug.

**Verify:**
- ACROSS column no longer shows any "toggle direction" text.
- On a puzzle with an ACROSS or DOWN list long enough to require scrolling within its column, Tab/Shift+Tab through several entries and confirm the highlighted clue always ends up visible without manual scrolling.
- Click several clues and grid cells directly and confirm the clue bar's number/direction/text updates correctly each time, and the arrows correctly step to the next/previous entry (including wrap-around at the first/last entry).
- Confirm the clue bar's CSS doesn't depend on `.solverGridPanel`'s container-query setup from T022 (sanity check for the future mobile reuse — it doesn't need to actually render correctly on mobile in this task, just not be structurally coupled to the desktop grid panel).

Scope: `CrosswordPlayer.tsx`, `styles.css`.

---

**Review notes (Claude) — items 1 and 2 confirmed correct against the diff, no changes needed there. Item 3 (clue bar) needs two cosmetic tweaks before this is done:**

**1. Remove the prev/next arrow buttons from the desktop clue bar.** The user finds them useless in this three-column desktop layout (the entries are already fully visible/clickable in the ACROSS/DOWN columns, and Tab/Shift+Tab already cover keyboard navigation) — arrows only earn their keep in a future mobile layout where the clue list isn't visible alongside the grid. Remove both `<button className="clueBarNav" ...>` elements (and their `ChevronLeft`/`ChevronRight` icons) from the `.clueBar` JSX in `CrosswordPlayer.tsx`. Remove the now-unused `import { ChevronLeft, ChevronRight } from 'lucide-react';` line too. Leave `stepEntry` itself untouched — it's still wired to Tab/Shift+Tab and will be reused when a mobile clue-switcher is eventually built (separate future task, not part of this one).
   - Remove the `.clueBarNav` CSS rules from `styles.css` (`.clueBarNav`, `.clueBarNav:disabled`, `.clueBarNav:not(:disabled):hover`) since nothing will reference them anymore. `.clueBar`'s `gap: 8px` (previously spacing the nav buttons from `.clueBarBody`) can be dropped too now that `.clueBarBody` is the bar's only child.

**2. With the arrows gone, the bar is just the number+direction label and the clue text — add a bit more space between them for readability.** Currently `.clueBarBody` uses `gap: 8px` between `.clueBarLabel` and `.clueBarText`; bump it to something more generous, `~14-16px`, and re-check that the clue bar still reads cleanly with a long clue that wraps to two lines (the label shouldn't visually crowd the wrapped second line).

**Verify:** confirm no arrow buttons render in the desktop clue bar, confirm `stepEntry` is still reachable via Tab/Shift+Tab (don't accidentally orphan it), confirm the label/text spacing reads more comfortably than before at a glance, and confirm the build has no unused-import warnings from the removed lucide-react icons.

