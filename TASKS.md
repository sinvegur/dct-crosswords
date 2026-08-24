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

