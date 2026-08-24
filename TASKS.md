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

## T042 — [READY FOR REVIEW] Mobile solver layout, part 3: custom embedded keyboard (replaces relying on the native mobile keyboard) + results screen check

**Superseded scope, explained: this task originally just meant "make `calc(100dvh - 120px)` survive the native keyboard opening." That's no longer the plan.** Live-tested it first (simulating a keyboard eating ~40% of viewport height by shrinking the browser viewport, then measuring/screenshotting the result) and found a real, reproducible bug, not just a rough edge: when the panel's available height shrinks, the grid's `cqmin`-based sizing doesn't leave any room for the clue bar below it — the bar ends up almost entirely clipped by `.solverGridPanel`'s own `overflow-y: auto`, invisible, with no visible scrollbar or other hint that scrolling would reveal it. Measured directly: grid rendered 354×257 (non-square — itself a separate symptom of the same squeeze) while the clue bar's box sat at y:375–433 inside a panel clipped at y:380, meaning all but 5px of the bar was invisible. That's the "completely messed up" the user hit.

**Decision, discussed with the user directly: build a custom on-screen keyboard for mobile instead of trying to make the layout resilient to whatever the native keyboard does.** This isn't just a nicer alternative — it fixes two real problems at once: (1) the layout-instability problem above goes away entirely, since we're never subject to an unpredictable native keyboard resize if the native keyboard never opens; (2) this is a **Turkish-language app**, and the native keyboard only exposes Ğ/Ş/Ö/Ü/Ç/İ/ı if the solver's phone happens to be set to a Turkish keyboard layout — a custom keyboard guarantees every solver can type every Turkish letter the puzzle needs, regardless of their phone's language settings. That's a real correctness gap today, not just a polish concern.

**1. Detect mobile at runtime in JS, matching the existing 860px CSS breakpoint.** Everything else in this mobile work has been pure CSS, but this task genuinely needs JS: whether to suppress the native keyboard and whether to render the custom one are both React-level decisions, not just visual ones. Add a small hook (e.g. `useIsMobile()`) using `window.matchMedia('(max-width: 860px)')` with a change listener (standard pattern — `useState` seeded from `matchMedia(...).matches`, updated via the media query list's `change` event) so it stays in sync with actual viewport/orientation changes, not just the initial render.

**2. Suppress the native keyboard on mobile only.** Add `inputMode={isMobile ? 'none' : undefined}` (or equivalent) to each cell's `<input>`. This is the standard, well-established technique for building a custom on-screen keyboard in a web app — it tells the browser "this is focusable, but don't pop your own virtual keyboard for it." **Leave desktop completely untouched** — `inputMode` stays unset there, physical keyboard typing keeps working exactly as it does today.

**3. New custom keyboard component, rendered only when mobile, sitting below the clue bar** (which is itself already below the grid, per T040/T041). Needs:
   - All 26 standard letters, plus the Turkish-specific ones not on a standard layout — Ç, Ğ, İ, I (dotless capital), Ö, Ş, Ü — clearly reachable as their own keys, not hidden behind long-press (defeats the whole purpose otherwise). Exact visual arrangement (row count, QWERTY-ish vs. simplified) is your call — common on-screen-keyboard conventions apply, no need to overthink the layout itself.
   - A Backspace key.

**4. Wire it to the exact logic that already exists — don't reimplement typing/backspace behavior.** `onCellInputChange(cellIndex, raw)` (already in `CrosswordPlayer.tsx`) already does everything a keystroke needs: normalizes the letter via Turkish-locale uppercasing, updates `filled`, checks for a solve, and auto-advances to the next cell. A letter key's `onClick` should just call `onCellInputChange(activeCellIndex, letterChar)` (no-op if `activeCellIndex == null` or `solved`). Backspace needs to replicate the *two* existing cases from the physical-keyboard handler (`CrosswordPlayer.tsx`'s cell `<input>` `onKeyDown`, the `Backspace` branch) exactly:
     ```tsx
     const handleKeyboardBackspace = () => {
       if (activeCellIndex == null || solved) return;
       if (filled[activeCellIndex]) {
         onCellInputChange(activeCellIndex, ''); // clears the current cell, moves back
       } else {
         backspaceEmptyCell(activeCellIndex); // already empty: jump back, clear the previous cell
       }
     };
     ```
   - **Watch out for focus-stealing**: a `<button>` click normally moves DOM focus to the button itself, away from the cell's `<input>` — add `onMouseDown={(e) => e.preventDefault()}` on the keyboard's keys (a standard trick to keep the input focused through the click) so the active cell's input doesn't lose focus every time a key is tapped.

**5. Results/leaderboard screen on mobile** (carried over from the original scope, unchanged): confirm the "Solved!" screen and leaderboard look right in the single-column mobile shape from T040 — it's simple vertical content and may already be fine, verify live rather than assuming, fix only if something's actually found wrong.

**Honest caveat, flag clearly in the implementation notes:** whether `inputMode="none"` actually suppresses the native keyboard can't be *fully* confirmed through Playwright/emulation alone — that's real OS/browser behavior, and this is exactly the kind of thing that historically has had iOS Safari quirks. Verify what's checkable through emulation (the custom keyboard renders, keys work, `inputMode` attribute is present on mobile and absent on desktop), but call out plainly that a real-device check is still worth doing before fully trusting this in production.

**Verify:** on mobile emulation, confirm the custom keyboard appears below the clue bar, tapping letters (including the Turkish-specific ones) fills the active cell and auto-advances exactly like physical typing does today, Backspace correctly handles both the filled-cell and empty-cell cases, and the active cell's highlight/focus state doesn't visibly break when tapping keys. Confirm desktop is completely unaffected — no custom keyboard rendered, `inputMode` unset, physical typing unchanged. Finish solving a puzzle on mobile and confirm the results/leaderboard screen displays cleanly.

Scope: `CrosswordPlayer.tsx`, `styles.css`, plus a new small hook (e.g. `src/lib/useIsMobile.ts`) if that's the cleanest place for it.

**Implementation notes:** Keyboard is a Turkish-QWERTY-ish 3-row layout (includes Ç/Ğ/İ/I/Ö/Ş/Ü) with Backspace on the last row. Grid sits in a `.gridSlot` size container on mobile so `cqmin` is the leftover space above the clue bar + keyboard, not the full panel. `inputMode="none"` is set on mobile and omitted on desktop; whether that actually suppresses the native OS keyboard needs a real-device check (iOS Safari especially) — emulation can only confirm the attribute, the custom keys, and that desktop is unchanged. Results/leaderboard: only added `overflow-y: auto` + flex fill on mobile so a long board can scroll; no visual redesign.
