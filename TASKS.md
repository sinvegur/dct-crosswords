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

## T035 — [READY FOR REVIEW] Copy-link button on the puzzle list for published puzzles

Right now the only place a creator ever sees a puzzle's shareable link is the one-time `PublishSuccessModal` at the moment of publishing — close that modal and there's no way to get the link again without manually constructing it from the slug. Add a copy-to-clipboard affordance directly on the puzzle list.

**Placement — deliberately not in the `.puzzleActions` icon row.** That row (Edit/Delete/Play/Leaderboard, from T030) was specifically redesigned to always render exactly four fixed-position square buttons so every row aligns identically down the list — adding a fifth button there that only sometimes appears would reintroduce the exact row-misalignment problem T030 fixed. Instead, put it in `.puzzleTitleRow` (`App.tsx`, `HomePage`), right after the existing status badge (`<span className="puzzleStatus ...">`). This row already reads naturally as "identity/metadata about the puzzle" (title + status) rather than "actions you take on it," and a share link is closer to that category. **Only render it when `p.status === 'published'`** — a draft has no working public link, so there's nothing to copy.

**1. Reuse the existing copy pattern, don't reinvent it.** `PublishSuccessModal.tsx` already has a working copy-to-clipboard implementation worth mirroring exactly: `navigator.clipboard.writeText(...)`, a `copied` boolean flipped true on success, and `window.setTimeout(() => setCopied(false), 2000)` to revert it. The one difference here: since `HomePage` renders a *list* of puzzles, a single shared `copied` boolean won't work — track it per-row instead, e.g. `const [copiedPuzzleId, setCopiedPuzzleId] = useState<string | null>(null);`, compare `copiedPuzzleId === p.id` per row to decide which one (if any) shows the "copied" state.

**2. Small icon-only button, icon swaps to a checkmark on copy.** Use `lucide-react` (already a dependency) — `Link` or `Link2` for the default state, `Check` for the ~2-second "just copied" state, matching the icon-swap idea the user described. This doesn't need to be a heavy `.toolbarControl`-style 36px square button (that's the action row's look) — something lighter/smaller fits better sitting inline next to a title and status badge; `.linkButton`'s existing minimal styling (no border/background) is a reasonable starting point to adapt, though it's currently tuned for text links so some adjustment for an icon-only button is expected. Always include `aria-label`/`title`, updated to match state (e.g. `"Copy solver link"` → `"Copied!"`).

**3. The link itself**: `${window.location.origin}/p/${p.slug}` — same construction already used for `PublishSuccessModal`'s `shareUrl` in `AppShell`'s `handleSaved`.

**Verify:** on a published puzzle, click the new icon — confirm the link lands on the clipboard (paste it somewhere to check), the icon swaps to a checkmark, and it reverts back to the link icon after ~2 seconds. Confirm draft puzzles show no copy affordance at all. Click it on two different published puzzles in the list and confirm each row's icon-swap is independent — copying one row's link doesn't show a checkmark on a different row.

Scope: `App.tsx`, `styles.css`.

---

## T036 — [READY FOR REVIEW] Make the puzzle title in the list clickable — opens edit mode

`App.tsx`'s `HomePage`, `.puzzleTitleRow` — the title (`<div className="puzzleTitle">{p.title}</div>`) is currently plain, non-interactive text sitting right next to a fully-functional Edit icon button in the same row. Make the title itself clickable too, doing the exact same thing as that Edit button: `navigate(`/design/${p.id}`)`.

**1. Make it interactive.** Swap the `<div className="puzzleTitle">` for a `<button type="button" className="puzzleTitle">` (or wrap the existing text in one) with an `onClick` calling `navigate(`/design/${p.id}`)` — same navigation the Edit icon already triggers, just a second entry point to it. Since it's becoming a real button, give it `cursor: pointer` and strip default button chrome (no border/background) so it keeps looking like plain title text until interacted with.

**2. Underline on hover**, per the ask — `.puzzleTitle:hover { text-decoration: underline; }` is enough, no need for anything fancier (color change, etc.) unless it reads better that way once it's actually in the browser, your call.

**Verify:** hovering the title shows an underline and a pointer cursor; clicking it navigates to the same edit view the Edit icon button already opens; the Edit icon button itself is untouched and still works exactly as before (this isn't replacing it, just adding a second way in).

Scope: `App.tsx`, `styles.css`.

---

## T038 — [READY FOR REVIEW] Stop the grid from shifting up/down when switching between short and long clues

Verified live: the blue clue bar (`.clueBarText`, `styles.css`) has no reserved height, so it's exactly as tall as its current clue's text needs — one line for a short clue, two (or more) for a long one. Since the grid sits directly below the bar, switching from a short clue to a long one grows the bar and visibly pushes the grid down (and back up again switching back). Measured directly: 39px bar / grid top at 123px for a short clue vs. 58px bar / grid top at 142px for a long one that wraps to two lines — a 19px jump every time.

**Fix — verified live, includes a follow-up refinement (see below) so read the whole thing before implementing, not just the first version.** First pass: reserving height via `min-height` on `.clueBarText` alone fixed the grid-shift problem, but left short one-line clues sitting at the *top* of the now-taller bar with dead space underneath — visually odd. Second, corrected pass moves the reserved height and centering to the row level so short clues sit vertically centered instead:

```css
.clueBarBody {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: calc(14px * 1.35 * 2);
}
```
(`.clueBarText` itself is untouched — no `min-height` added there; `.clueBarLabel` is also untouched.) `align-items` changes from `flex-start` to `center`, and the reserved-height calc (`14px * 1.35 * 2`) matches `.clueBarText`'s own `font-size`/`line-height` explicitly — deliberately spelled out in px rather than a bare `em` on `.clueBarBody`, since `.clueBarBody` doesn't itself have `font-size: 14px` set, so a bare `em` there would've resolved against the wrong (inherited) font-size.

**Verified all three real cases live:**
- **One-line clue**: now vertically centered in the reserved 2-line space, no more dead space hugging the bottom — this was the specific thing being fixed here.
- **Two-line clue**: text exactly fills the reserved height (no visible change from before — a 2-line block being "centered" in an exactly-2-line space is a no-op), and the number/direction label reads naturally next to it.
- **Three-plus-line clue** (rare, exceptionally long clue text): bar grows past the 2-line minimum to fit it in full, no clipping — `min-height` is a floor, not a ceiling, so this still works exactly as intended. The label ends up vertically centered against the whole multi-line block rather than pinned to the first line specifically — a reasonable, common crossword-UI look, not a bug; getting the label to track the *first line specifically* for arbitrary line counts would need JS-based line measurement, out of scope for what's a rare edge case here.

**Verify:** click through several clues of differing lengths (one line, two lines) and confirm the grid's vertical position stays completely fixed, *and* that a one-line clue now visually centers within the bar rather than sitting at the top with empty space below. Find or write a clue long enough to wrap to three-plus lines and confirm it still displays in full, uncut, even though the grid does shift slightly for that rare case.

Scope: `styles.css` only.

---

## T039 — [READY FOR REVIEW] Persist solver progress (filled letters + elapsed time) across a page refresh

Right now `CrosswordPlayer.tsx`'s puzzle-reset `useEffect` (keyed on `[puzzle.id, size]`) unconditionally blanks `filled` and resets `startAtMs` to `Date.now()` every time the component mounts — which includes a plain page refresh, not just navigating to a different puzzle. A solver who refreshes mid-solve loses every letter they've typed and the timer restarts from zero. Fix with `localStorage`, matching the existing per-puzzle persistence pattern already used for `bestTimeMs` (`dct-crosswords:bestTime:${puzzle.id}`) — same idea, new key.

**1. New localStorage key**: `dct-crosswords:progress:${puzzle.id}`, storing JSON `{ filled: string[], startAtMs: number }`.

**2. Restore on mount instead of always blanking.** In the existing reset `useEffect`, before falling back to a blank grid and `Date.now()`, check localStorage for this key. If present, parse it and validate before trusting it: `filled` must be an array of exactly `size * size` entries, `startAtMs` must be a finite number greater than 0. If valid, use those values for the initial `filled`/`startAtMs` instead of the blank defaults; if missing, malformed, or the wrong length (e.g. leftover data from a puzzle that's since changed size), fall back to today's behavior (blank grid, fresh `Date.now()`) exactly as now.

**3. Save progress as the solver types.** Add a `useEffect` watching `filled` (and skip writing once `solved` is true — no need to keep saving a finished grid) that writes `{ filled, startAtMs }` to that key on every change. `startAtMs` itself doesn't change after the initial mount/restore, so this is really just "keep `filled` in sync," but store both together as one JSON blob for simplicity.

**4. Clear the saved progress once the puzzle is solved — this matters, don't skip it.** In `finishIfSolved` (where `solved`/`elapsedMs` get set), also `localStorage.removeItem` this puzzle's progress key. **Why this specifically matters**: the win-detection/submission `useEffect` guards against double-submitting with `submittedRef`, but that's a plain `useRef` — it resets to `false` on every fresh mount, refresh included. If a *solved* grid's `filled` array were left sitting in localStorage and got restored on a later refresh, `checkSolved` would immediately return true again on mount and the submission effect would fire a second time, submitting a duplicate leaderboard entry for the same solve. Clearing progress the moment `solved` becomes true means a refresh after finishing always starts that puzzle fresh (empty grid) rather than replaying an already-solved state — sidesteps the duplicate-submission risk entirely rather than needing to persist and check a separate "already submitted" flag.

**Deliberately not restoring**: `activeDirection`, `activeEntryNumber`, `activeCellIndex`, or cursor/selection position — those aren't part of what was asked (letters + time only) and adding them is meaningfully more state to reason about for comparatively little benefit; a refreshed solver landing with no active cell selected (today's existing default) and their letters/timer intact is a fine outcome.

**Verify:** type several letters into a puzzle, note the elapsed time, refresh the page — confirm the same letters are still there and the timer continues climbing from roughly where it left off rather than resetting to 0:00. Solve the puzzle fully and confirm it submits to the leaderboard exactly once (check for a duplicate entry). Refresh again after solving and confirm a completely fresh, blank grid appears — not the solved state being restored. Also sanity-check switching between two *different* puzzles (e.g. via two browser tabs, or navigating away and back) still each keep their own independent saved progress, not overwriting each other.

Scope: `CrosswordPlayer.tsx` only.

**Implementation notes:** Also seed `useState` initializers from the same validated progress blob so the first paint (and the save effect) don't briefly overwrite a good restore with a blank grid.

---

## T040 — [READY FOR REVIEW] Mobile solver layout, part 1: NYT-style single-column structure (grid + clue bar only, ACROSS/DOWN lists hidden)

**Big-picture context — three-part mobile solver overhaul, staged like T033/T034 was for multi-size puzzles. This is part 1 (structure); T041 (clue bar mobile behavior — arrows + tap-to-toggle) and T042 (results screen + keyboard/viewport handling) depend on this landing first, don't start those until this is done and merged.** Reference: NYT's mobile crossword app (user-provided screenshot) — grid dominant and full-width, the blue clue bar directly below it as the *only* clue-navigation surface, no separate ACROSS/DOWN clue lists visible at all on mobile.

**Root cause of today's mobile view being broken, not just "unoptimized" — confirmed live via Playwright's iPhone 13 emulation (390px viewport):** the existing `@media (max-width: 860px) { .layout { grid-template-columns: 1fr; } }` fallback (from T002/T022) has **never actually applied to the solver layout**. `CrosswordPlayer.tsx` always renders `className="layout layoutSolver"`, and `.layout.layoutSolver` (two classes) has an unconditional, always-active `grid-template-columns: minmax(0,0.85fr) minmax(0,0.85fr) minmax(0,2fr)` rule (`styles.css` line ~88) with *higher CSS specificity* than the media query's plain `.layout` (one class) override — so the more specific desktop rule always wins, media query or not. The media query does have its own `.layout.layoutSolver` block (line ~665), but it only overrides `height`/`min-height`, never `grid-template-columns` — so the 3-column layout silently persists at any viewport width. Measured directly: at 390px, `.layout.layoutSolver`'s *computed* `grid-template-columns` was still `84px 84px 198px` (three explicit tracks), producing three overlapping, unusably narrow columns and a 10px-per-cell grid. Screenshot confirms it's genuinely broken, not just cramped.

**The fix isn't "correct the media query's specificity," though — it's a real restructure**, since the target design doesn't want the ACROSS/DOWN columns present at all on mobile (not stacked below the grid, not present in any form):

**1. Hide the ACROSS/DOWN clue panels entirely below the mobile breakpoint.** Reuse the existing 860px breakpoint (already established in this codebase, no reason to introduce a new one) unless testing reveals it needs adjusting. Simplest approach: `display: none` on `.solverCluePanel` inside the media query — purely CSS-driven, no JSX/conditional-rendering changes needed in `CrosswordPlayer.tsx`.

**2. Make `.solverGridPanel` the only visible column, full width, with `grid-template-columns` on `.layout.layoutSolver` actually overridden for real this time** (`1fr`, specificity now moot since it's the only column left, but set it correctly regardless — don't leave the underlying specificity bug uncorrected just because hiding the other panels masks it).

**3. Re-verify the grid's own sizing (the `cqmin`-based approach from T022/T028) still produces a good, dominant, square grid within this new full-width single-column mobile shape.** The container's aspect ratio changes drastically between "one of three columns in a wide desktop panel" and "full-width mobile viewport" — don't assume the existing sizing math just works unchanged; measure it live (cell size, whether the grid comfortably fits above the clue bar without the two needing to fight for space) the same way T022's rounds did, and adjust if needed.

**4. The clue bar itself stays visible and where it already is (above the grid)** — this task is just about making it — and the grid — the *only* two things in view, full width. Its actual mobile-specific *behavior* (bringing back prev/next arrows, tap-to-toggle-direction) is explicitly T041's job, not this one — don't touch `CrosswordPlayer.tsx`'s clue bar JSX/logic in this task, CSS-only restructuring here.

**Verify:** using Playwright's mobile device emulation (e.g. `devices['iPhone 13']`) or real Chrome DevTools device mode, confirm at a real mobile viewport width: no ACROSS/DOWN columns visible anywhere, the grid renders as a proper square filling most of the available width with reasonably-sized cells (not 10px), the clue bar sits above it looking intentional, and nothing overlaps or overflows horizontally. Confirm the existing desktop 3-column layout above 860px is completely unaffected — this should be an invisible change at desktop widths.

Scope: `styles.css` only (plus a one-line `grid-template-columns` fix on the existing `.layoutSolver` media-query block).

**Implementation notes:** Hide uses `.layout.layoutSolver > .solverCluePanel` so it beats `.layout.layoutSolver > .panel { display: flex }`. Mobile solver height stays `calc(100dvh - 120px)` (not `height: auto`) so `cqmin` still has a sized container — measured ~364px square grid / ~22px cells at 390px; desktop remains 3-column. Review follow-up: flex `order` puts the clue bar below the grid on mobile (plus swapped top/bottom margin so the 8px gap stays between them); reset effect pre-selects `entriesAcross[0]` by setting state only, no `focusEntry`/`focusCell`.

---

**Review notes (Claude) — the core fix (specificity bug, hiding ACROSS/DOWN, sizing) is correct and confirmed against the diff, no changes needed there. Two things to add, found from live testing on a real mobile viewport — one of these is a gap in the original task spec, not something implemented wrong:**

**1. The clue bar needs to sit BELOW the grid on mobile, not above it — this was a real oversight in how T040 was originally spec'd, not a Cursor mistake.** The task said "the clue bar stays visible and where it already is (above the grid)," but that was written without re-checking the user's own NYT reference screenshot from earlier — which clearly shows the order as grid, *then* the blue clue bar, *then* the keyboard. Below-grid placement also isn't just cosmetic: it's what makes T042's "stays visible when the keyboard opens" requirement actually achievable, since a bar sitting immediately above where the keyboard appears is naturally far more likely to stay on-screen than one pushed up above a full-height grid.
   - **Fix, CSS-only, no JSX changes needed**: `.gridWrap` is already `display: flex; flex-direction: column` with `.clueBar` before `.grid` in DOM order. Inside the existing 860px mobile media query, swap their *visual* order with the flex `order` property — leave the DOM order alone (desktop keeps working unchanged, no conditional rendering needed):
     ```css
     @media (max-width: 860px) {
       .clueBar {
         order: 2;
       }
       .grid {
         order: 1;
       }
     }
     ```

**2. On page load, a clue should already be selected — not the "Select a clue to begin" placeholder.** Confirmed: `activeEntryNumber` starts `null` regardless of viewport, so the clue bar sits empty until the solver's first tap. This is low-stakes on desktop (the ACROSS/DOWN lists are right there to browse), but on mobile the clue bar is now the *only* way in — landing on a placeholder is a dead end.
   - **Fix**: in the puzzle-reset `useEffect` (the one keyed on `[puzzle.id, cellCount]`), instead of leaving `activeDirection`/`activeEntryNumber`/`activeCellIndex` at their blank defaults, default to the first ACROSS entry (`computed.entriesAcross[0]`, already numbered in top-left-to-bottom-right order by the engine, so index `0` is genuinely "the first entry") — guard for the pathological empty-puzzle case where that array could be empty, falling back to today's `null` behavior if so.
   - **Important, easy to get wrong**: set this state directly (`setActiveDirection`, `setActiveEntryNumber`, `setActiveCellIndex`) — **do not** call `focusEntry()` or `focusCell()` for this. Both of those call `.focus()` on the cell's real `<input>`, which would pop the mobile on-screen keyboard immediately on page load, before the solver's even looked at the puzzle — exactly the kind of jarring behavior to avoid. The clue bar and grid highlight should reflect the pre-selected entry; nothing should actually receive DOM focus until the solver taps something themselves.
   - This isn't mobile-specific in the code (it's a state default, not CSS) and will also apply on desktop — that's fine, arguably a small improvement there too (no idle empty-bar state), not something that needs gating to mobile-only.

**On the other two things mentioned — already correctly covered, no scope change needed, just confirming:** the prev/next arrows and tap-to-toggle-direction are T041's whole job (still blocked on this task, not skipped); staying visible when the keyboard is open is explicitly T042's job. Both remain scoped as already written — the bar's position fix above is what makes them land cleanly.

**Verify:** on a mobile viewport, confirm the clue bar renders below the grid, not above; confirm loading a puzzle fresh (no prior interaction) shows a real clue in the bar and the correct cell(s) highlighted in the grid, with no on-screen keyboard automatically opening. Confirm desktop is completely unaffected by both changes — clue bar still above the grid there (DOM order unchanged, so this falls out naturally), and the first-entry pre-selection reads fine in the existing 3-column layout too.

---

## T041 — [BLOCKED, do not start until T040 is done and merged] Mobile solver layout, part 2: clue bar becomes the primary clue-navigation surface

Once T040 lands the clue bar is the *only* way to see/navigate clues on mobile (no ACROSS/DOWN lists to fall back on) — this task makes it actually work that way, per the user's reference design and explicit direction.

**1. Bring back the prev/next arrows — mobile only.** T023 removed the clue bar's `ChevronLeft`/`ChevronRight` arrow buttons for desktop specifically, on the reasoning (at the time, correct) that they were redundant there since the full ACROSS/DOWN lists were already visible and clickable — and that reasoning explicitly said arrows "only earn their keep in a future mobile layout where the clue list isn't visible alongside the grid." This is that future task. Re-add the two arrow buttons (same `lucide-react` icons, same `stepEntry(-1)`/`stepEntry(1)` wiring as before — nothing new to build, this logic already exists and is already used by Tab/Shift+Tab) to the clue bar JSX, but only *visible* on mobile — render them always in the JSX and hide via the same 860px media query (`display: none` above it), rather than JS-based screen-size branching, consistent with how the rest of this responsive work is being done purely in CSS.

**2. Tapping the clue bar (the label/text area, not the new arrow buttons) toggles direction for the current cell.** Per the user's explicit direction: on mobile, tapping the clue itself changes between across/down — this is in *addition* to the existing desktop gesture (tapping an already-active grid cell that starts both an across and down entry, from T026), not a replacement for it; both should keep working everywhere. The function to call already exists and needs no changes — `toggleDirectionForActiveCell()` (already wired to the Space key) — just add an `onClick` to `.clueBarBody` (or the label/text spans specifically, excluding the arrow buttons' own click targets) that calls it.

**Verify:** at a mobile viewport, confirm the prev/next arrows are visible and step through entries correctly (same cycling/wrap-around behavior as Tab already has); confirm the arrows are NOT visible at desktop widths (unchanged from before T023 removed them — no regression there). Tap the clue bar's text on a cell that starts both an across and a down entry and confirm it toggles direction, updating the grid highlight and the bar's own label/text to match. Confirm the existing tap-active-cell-to-toggle gesture still also works unchanged. Confirm tapping the arrows doesn't also accidentally trigger the toggle (they need separate, non-overlapping tap targets).

Scope: `CrosswordPlayer.tsx`, `styles.css`.

---

## T042 — [BLOCKED, do not start until T040 is done and merged] Mobile solver layout, part 3: results/leaderboard screen fits the mobile view, keyboard-safe viewport height

**1. Confirm (and fix if needed) the "Solved!" results screen — including the leaderboard — looks right in the new single-column mobile shape from T040.** This screen already exists and already replaces the grid area when `solved` is true, regardless of viewport, so it may already be mostly fine (it's simple vertical content, not a multi-column layout) — but it hasn't been checked against a real mobile viewport since it was built entirely in a desktop 3-column context. Verify live (mobile emulation) rather than assuming; fix spacing/sizing only if something's actually found to be wrong, don't preemptively redesign a screen that already works.

**2. Keyboard-safe viewport height.** The user flagged that the native mobile on-screen keyboard opening is a different animal from NYT's native app (which draws its own in-app keyboard) — for this web app, focusing a cell's real `<input>` triggers the browser's native keyboard, which resizes the visible viewport. `.layoutSolver` already uses `calc(100dvh - 120px)` (dynamic viewport height, not the older static `100vh`) which is the modern-correct unit for this exact problem — confirm live whether that's actually sufficient in practice (e.g. via Chrome DevTools' device mode with a simulated on-screen keyboard, or ideally a real phone if available) or whether the clue bar/grid still end up partially hidden behind the keyboard when it's open. This is the one part of the mobile work that most benefits from testing on an actual device rather than only emulation — flag clearly in the implementation notes if only emulated testing was possible, so this can get a real-device check later if needed.

**Verify:** finish solving a puzzle on a mobile viewport and confirm the results/leaderboard screen displays cleanly, no overflow or cramped spacing. Focus a grid cell on a mobile viewport (or emulated touch device) and confirm the on-screen keyboard opening doesn't hide the active cell or the clue bar above it.

Scope: `CrosswordPlayer.tsx`, `styles.css`.
