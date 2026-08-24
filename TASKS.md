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

**4. Compensate for the removed button — don't regress touch/mouse-only users.** Right now SPACE and the button are the *only* two ways to toggle direction; without a keyboard, a user sitting on a cell that starts both an across and down entry has no way to switch to the other direction without the button (clicking the same already-active cell currently just re-confirms the same direction, doesn't toggle). Fix: make clicking an **already-selected/active** cell toggle direction (if that cell belongs to both an across and a down entry) — standard crossword-app pattern. Implement this in both `CrosswordPlayer.tsx` (`handlePickCell`) and `PuzzleDesigner.tsx` (`pickCell`): if the clicked cell is already the active cell, and it has an entry in the *other* direction available, toggle to that direction instead of re-selecting the same one. **Note: the `CrosswordPlayer.tsx` half was shipped in T026 — when unblocking T011, only implement this in `PuzzleDesigner.tsx`.**

Scope: `CrosswordPlayer.tsx`, `PuzzleDesigner.tsx` only.

---

## T025 — [CHANGES REQUESTED] Tab navigation: sequence across → down (don't wrap within the same list), and skip fully-filled entries

Two related bugs in `stepEntry` (`CrosswordPlayer.tsx`), confirmed against the current code — only one caller (`stepEntry`, from the Tab/Shift+Tab handler on the cell `<input>`), so its internals are safe to rework freely.

**1. Tab from the last ACROSS entry should continue into the first DOWN entry (and vice versa via Shift+Tab), not wrap back to the top of the same list.** Currently: `const entries = activeDirection === 'across' ? computed.entriesAcross : computed.entriesDown;` — `stepEntry` only ever walks within whichever single list matches `activeDirection`, and wraps `nextIdx` back to `0` / `entries.length - 1` inside that same list. So Tab-ing past the last across clue just loops back to the first across clue, never touching the down list (and the reverse for down).
   - Fix: treat ACROSS and DOWN as one combined, circular sequence — all of `computed.entriesAcross` in order, followed by all of `computed.entriesDown` in order (this matches the order both lists are already rendered in, top to bottom in their columns). Stepping forward off the end of the across portion continues into the start of the down portion; stepping forward off the end of the down portion wraps back to the start of the across portion (and symmetrically backward for Shift+Tab). Reaching a down entry via this sequence must also switch `activeDirection` to `'down'` (and back to `'across'` when the sequence lands on an across entry) — `focusEntry(direction, number)` already does this correctly, just make sure `stepEntry` passes the *target* entry's own direction, not the currently-active one.
   - This is **not** full numeric interleaving (1A, 1D, 2A, 2D, ...) — just exhaust the current direction's list, then continue into the other list from its start. Don't build anything fancier than that.

**2. Entries the solver has already fully filled in should be skipped when Tab/Shift+Tab lands on them.** Not implemented at all currently — `stepEntry` has no awareness of fill state, so Tab happily lands on/cycles through entries that are already completely filled in, which is dead time for the solver. "Fully filled" here means every cell in the entry has *some* letter in it (`filled[cellIndex]` is non-empty) — **not** "correctly filled against the solution"; a filled-but-wrong entry should still count as filled and be skipped, since the point is avoiding re-visiting entries that don't need more typing, not flagging correctness (that's a different, unrelated feature). Flag it if this reading seems off before you build it — it's a judgment call on ambiguous wording, not a hard spec.
   - Add a small helper, e.g. `isEntryFilled(entry: Entry) => entry.cells.every((c) => filled[idxOf(c.row, c.col)])`.
   - In the new combined-sequence `stepEntry`, when stepping in a given direction (+1/-1), skip over any entry where `isEntryFilled` is true and keep advancing until an unfilled entry is found. This must also skip the *currently active* entry itself if it just became fully filled (e.g., solver typed the last letter of an entry and immediately hit Tab) — don't special-case "skip only other entries."
   - Guard against an infinite loop in the pathological case where every entry happens to be filled (e.g., puzzle just got solved on this keystroke) — bound the skip search to at most one full pass over the combined list, and simply do nothing (no navigation) if no unfilled entry is found. In practice this shouldn't come up much since a fully-solved puzzle swaps to the results screen, but don't leave it able to infinite-loop.

**Verify:** on a puzzle with a mix of filled/unfilled entries, Tab from the last ACROSS entry lands on the first *unfilled* DOWN entry (not wrapping to ACROSS #1, and not landing on an already-filled DOWN entry); Shift+Tab from the first ACROSS entry lands on the last *unfilled* DOWN entry; fill in an entry completely mid-puzzle, then Tab away from it, and confirm Tab never lands back on it later in the cycle; confirm direction highlighting (grid + active clue in the ACROSS/DOWN columns) updates correctly every time Tab crosses from one list into the other.

Scope: `CrosswordPlayer.tsx` only.

---

**Review notes (Claude) — `stepEntry`'s own index math is correct (verified with a debug instrumentation pass, logging every step of its internal loop), but the feature still visibly fails: live testing found a separate, pre-existing bug that corrupts the result whenever `focusEntry` crosses from one direction into the other. Root-caused and a fix verified live — this is a small, surgical change, not a rewrite of anything T025 already built.**

**The bug:** `focusEntry(direction, entryNumber)` calls `setActiveDirection(direction)`, `setActiveEntryNumber(entryNumber)`, then `focusCell(firstCell)`, which calls `el.focus()`. That `.focus()` synchronously fires the cell `<input>`'s `onFocus={() => handlePickCell(cellIndex)}` — and `handlePickCell` reads `activeDirection` from its render closure, which at this point in the same synchronous call stack **still holds the pre-update value** (React hasn't re-rendered yet). So `handlePickCell` re-derives the entry number using the *old* direction and overwrites the correct one `focusEntry` just set — direction ends up right, but the entry number silently gets replaced by whichever entry the *old* direction covers at that cell.

Confirmed via direct instrumentation: Shift+Tab from ACROSS 1 correctly computed `nextIdx` → DOWN 13 internally, but the final active state showed DOWN 1 (1 being whatever ACROSS entry happened to cover DOWN 13's starting cell). **This is not new to T025** — it's a latent bug in `focusEntry`/`focusCell` that predates this task. Confirmed it independently breaks plain clue-clicking too: with ACROSS 1 active, clicking the "Down 5" clue directly (no keyboard involved) also incorrectly landed on "Down 1" instead of "Down 5", for the same reason. T025 is what exercises this path for the first time in a way that's easy to trigger and notice (crossing directions via Tab is common), but the underlying `focusCell`/`onFocus` interaction should be fixed regardless.

**The fix — verified live**: suppress the redundant `onFocus`-driven `handlePickCell` call specifically when the focus was triggered programmatically by `focusCell` (every one of `focusCell`'s callers — `focusEntry`, `moveInResolvedEntry`, `backspaceEmptyCell` — already explicitly set the correct state before calling it, so that `onFocus` call is always redundant in this path; it should only fire for a genuine user-driven focus change, e.g. a raw click landing directly on the `<input>`).

```tsx
// new ref alongside inputsRef/clueRowRefs
const skipNextFocusPickRef = useRef(false);

const focusCell = (cellIndex: number | null) => {
  if (cellIndex == null) return;
  const el = inputsRef.current[cellIndex];
  if (!el) return;
  skipNextFocusPickRef.current = true;
  el.focus();
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
};
```

```tsx
// the cell <input>'s onFocus
onFocus={() => {
  if (skipNextFocusPickRef.current) {
    skipNextFocusPickRef.current = false;
    return;
  }
  handlePickCell(cellIndex);
}}
```

Verified this exact change live: re-tested Shift+Tab from ACROSS 1 (now correctly lands on DOWN 13), the direct clue-click case (now correctly lands on DOWN 5), plus a regression pass — raw grid-cell clicks, typing forward through an entry, backspace-moves-back, and the skip-filled-entry logic (filled an entry, tabbed away, confirmed it's skipped and never revisited) all still behave exactly as before. Build (`npm run build`) passes clean.

**Verify:** everything already listed in T025's own Verify section, plus: with ACROSS active, click a DOWN clue directly (mouse, no keyboard) and confirm it activates the clue you actually clicked, not some other one.

Scope: still just `CrosswordPlayer.tsx`.

---

## T029 — [READY FOR REVIEW] Temporary "Solve it" button in solver mode, for repeatedly testing the leaderboard flow

**Same idea as T021's "Autofill" button in the designer (`PuzzleDesigner.tsx`) — same precedent applies: plain, always-visible `.btn`, no dev-only gating or feature flag needed, understood to be a temporary testing aid the user will remove by hand before real launch.** The user wants to iterate on the leaderboard/results experience and needs a fast way to repeatedly "finish" a published puzzle without manually typing every letter each time.

**Add a "Solve it" button to `CrosswordPlayer.tsx`'s solver `controlsRow`** (the same row that has the puzzle title and the timer — put the button in the right-hand div, near the timer, mirroring where T021 placed its Autofill button relative to the designer's other toolbar buttons). Only render it while `!solved` (no reason to show it after the puzzle's already finished).

**Behavior:** on click, instantly fill every non-block cell with its correct letter from `solutionChars` (already computed via `useMemo` from `puzzle.solutionGrid` — this is exactly the array `checkSolved` compares against, so building `nextFilled` from it directly guarantees a correct solve) and call the existing `finishIfSolved(nextFilled)` after `setFilled(nextFilled)` — that function already handles everything else (marking `solved`, recording `elapsedMs`, best-time tracking), and the existing `useEffect` watching `solved`/`elapsedMs` will automatically submit the attempt and load the leaderboard, exactly like a real solve. No new submission/leaderboard logic needed — this should be a small, mechanical addition that reuses the existing win path end to end.

```tsx
const solveInstantly = () => {
  const nextFilled = filled.slice();
  for (let i = 0; i < solutionChars.length; i++) {
    if (blockSet.has(i)) continue;
    nextFilled[i] = solutionChars[i]!;
  }
  setFilled(nextFilled);
  finishIfSolved(nextFilled);
};
```

**Verify:** click "Solve it" on a puzzle with no letters typed yet — confirm it jumps straight to the "Solved!" results screen with a real (if trivially fast) elapsed time, the attempt gets submitted, and the leaderboard loads and shows the new entry. Reload the page (fresh `filled` state) and repeat a few times to confirm it's reliably repeatable for testing.

Scope: `CrosswordPlayer.tsx` only.

---

## T033 — [TODO] Multi-size puzzles, part 1: generalize the engine/types/rendering off the hardcoded 15×15 assumption

**Big-picture context (read this before starting):** the user wants to eventually offer 5×5 and 9×9 puzzles alongside the current 15×15. This is staged into two tasks — **this one is pure infrastructure: no new sizes are actually usable by a creator yet, no new templates, no UI changes.** Every existing 15×15 flow (designer, solver, autofill, shuffle, leaderboard) must work identically before and after this task — that's the whole acceptance bar. T034 (separate, do not start until this is done and merged) is where 5×5/9×9 actually become choosable and get real starting templates.

**Why this is safe to do as a refactor, not a rewrite:** audited `computeEntries15` in `engine.ts` — the entry-numbering algorithm itself (block-adjacency scanning) is already fully size-agnostic; it just hardcodes the loop bounds and validation to the module-level `SIZE_15` constant instead of deriving them from the actual grid passed in. Same story in `CrosswordPlayer.tsx`/`PuzzleDesigner.tsx` (`idxOf`/`posOf`/array-length math) and `templates.ts`'s helpers (`withRotationalSymmetry`, `fromHalfSpec`, `assert15`). **No database migration is needed** — `puzzles.solution_grid` is a plain `text[]` with no length constraint in `schema.sql`, so it already stores whatever size grid you give it.

**1. Engine (`engine.ts`).** Make `computeEntries15` derive its working size from `solutionGrid.length` (validating it's square — every row the same length as the row count) instead of hardcoding `SIZE_15`. Rename it to something size-neutral (e.g. `computeEntries`) and update the one call site in each of `CrosswordPlayer.tsx`/`PuzzleDesigner.tsx`. Keep the underlying algorithm exactly as-is — this is a parameterization, not a logic change.

**2. Types (`types.ts`).** Add a `size: number` field to the puzzle type. Given the whole point of this work is that "15" stops being the only option, rename `Puzzle15` → `Puzzle` (and `ComputedCrossword15` → something size-neutral too) — yes, this ripples through every file that imports it (`App.tsx`, `storage.ts`, `CrosswordPlayer.tsx`, `PuzzleDesigner.tsx`, `PuzzleLeaderboardModal.tsx`) but it's a mechanical rename with zero behavior change, not something to work around by keeping a confusingly-named type once it can represent three different sizes. Existing 15×15 puzzles in the database don't have a `size` column to read from — since it's not stored explicitly, derive it in `storage.ts`'s `rowToPuzzle` from `solution_grid.length` rather than requiring a migration.

**3. Grid rendering (`CrosswordPlayer.tsx`, `PuzzleDesigner.tsx`).** Both currently use the module-level `SIZE_15` constant for `idxOf(row,col)`, `posOf(index)`, and `Array.from({ length: SIZE_15 * SIZE_15 }, ...)` grid-cell generation. Switch these to use the specific puzzle's own `size` (or `Math.sqrt(solutionChars.length)`, whichever reads cleaner given how `solutionChars` is already derived) instead of the constant.

**4. CSS — two spots hardcode 15 columns/rows, confirmed via direct search, both need to become dynamic:**
   - `.grid` (`styles.css`, currently `grid-template-columns: repeat(15, 1fr); grid-template-rows: repeat(15, 1fr);`) — shared by both the designer and solver grids.
   - `.gridPreview` (`styles.css`, currently `grid-template-columns: repeat(15, 1fr);`, used by `GridPreview.tsx` for the small template-thumbnail preview) — note `GridPreview.tsx` itself already renders however many cells `blocks` actually has (`blocks.flatMap(...)`), so today it would silently render the wrong number of *columns* for a non-15 block array even though the cell *count* would be correct — this is a live latent bug, just currently unreachable since nothing feeds it a non-15 array yet.
   - Fix both via a CSS custom property set inline where the grid size is known (e.g. `style={{ '--grid-size': size }}` on the `.grid`/`.gridPreview` element) and `repeat(var(--grid-size), 1fr)` in the CSS rule, rather than inline `style` for the whole `grid-template-columns` value — keeps the actual track-sizing logic in CSS, just parameterizes the count.

**5. Templates (`templates.ts`).** Its helpers (`withRotationalSymmetry`, `fromHalfSpec`, `assert15`, `blankGrid`) are also hardcoded to `SIZE_15` — generalize them to take/derive a size parameter. **Don't author any new 5×5/9×9 template content in this task** — that's explicitly T034's job, this task only needs the helper functions to be capable of it. `TEMPLATES_15`'s actual four 15×15 templates stay exactly as they are.

**Verify — this is a pure regression check, not a new-feature check:** every existing 15×15 flow must look and behave completely unchanged — create a new puzzle from each of the four starting templates, confirm the grid renders as a proper 15×15 square with correct entry numbering; type Turkish letters and confirm no regressions in letter/number clearance; use Autofill and Shuffle in the designer; publish and solve a puzzle end to end including the leaderboard. Nothing in this task should be visually or behaviorally distinguishable from before it — if anything looks different, that's a bug in this task, not an intended change.

Scope: `engine.ts`, `types.ts`, `templates.ts`, `CrosswordPlayer.tsx`, `PuzzleDesigner.tsx`, `storage.ts`, `PuzzleLeaderboardModal.tsx` (import updates only), `GridPreview.tsx`, `styles.css`.

---

## T034 — [BLOCKED, do not start until T033 is done and merged] Multi-size puzzles, part 2: 5×5 and 9×9 starting templates + a size picker in the "new puzzle" flow

**This is where 5×5/9×9 actually become real, choosable options — depends entirely on T033's generalization work already being in place.** Don't start this until T033 is confirmed done.

**1. Author starting templates for 5×5 and 9×9**, using the now-generalized helpers from T033 (`withRotationalSymmetry`, `fromHalfSpec`, `blankGrid`). At minimum, a "Blank" template for each new size (matching the existing `blank` 15×15 entry) — a patterned option or two per size is a nice-to-have if it's not much extra effort, but not required for this task; a blank canvas the creator can hand-block themselves is a perfectly good starting point for a first pass. Keep 180° rotational symmetry as the same default convention already used at 15×15 (both 5 and 9 are odd, so the existing center-cell reflection math generalizes cleanly with no special-casing).

**2. Add a size-selection step to `StartingGridModal`.** Currently it goes straight to showing the four (soon: per-size) templates. Add a size choice — 5×5 / 9×9 / 15×15 — before or alongside the template cards, defaulting to 15×15 (today's only option, least disruptive default). Once a size is picked, show that size's templates instead of always `TEMPLATES_15`.

**3. Wire the chosen size through puzzle creation.** `onCreate(template)` currently only passes a `Template15`; make sure the resulting new puzzle actually ends up with the correct `size` and correctly-dimensioned `solutionGrid` for whichever size was picked — trace this through `DesignNewPage`/`PuzzleDesigner`'s `initialRows` and however `startingTemplate` currently flows into the created puzzle's state.

**Verify:** create a new puzzle at each of the three sizes, confirm the designer grid renders at the correct dimensions with correct entry numbering for each; publish a 5×5 and a 9×9 puzzle and solve them end to end (including the leaderboard) exactly like a 15×15 puzzle already works; confirm existing 15×15 creation still defaults correctly and is unaffected.

Scope: `templates.ts`, `StartingGridModal.tsx`, `App.tsx`, `PuzzleDesigner.tsx`.

