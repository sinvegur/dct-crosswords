# Cursor Tasks

Task queue for handing work from Claude (planning/review) to Cursor (implementation) on dct-crosswords.

## Protocol

- **Cursor**: when told "new task for you, check TASKS.md", find the topmost entry marked `[TODO]`. Implement only that task — don't start a second `[TODO]` in the same pass. When finished, change its status to `[READY FOR REVIEW]` and add a short "Implementation notes" line under it if anything deviated from the instructions.
- **Claude**: reviews `[READY FOR REVIEW]` entries against the actual diff. Marks `[DONE]`, **commits immediately** (one task = one commit, task ID in the subject line), and deletes the entry (git history keeps the record — no need to accumulate finished tasks here). Or marks `[CHANGES REQUESTED]` and appends specific notes for Cursor to address, leaving status as `[CHANGES REQUESTED]` until fixed.
- IDs are sequential (T001, T002, ...) and never reused, even if a task is deleted.
- Only one task should be active (`[TODO]` at the top) at a time, to keep diffs small and reviewable.
- **Only make the changes the task explicitly describes.** If you notice something else worth fixing while working, do NOT implement it — note it in "Implementation notes" as a suggestion and let Claude turn it into its own task. This has been raised twice already (T001 favicon/port, T002 layout rework) — a third occurrence means diffs will be rejected without detailed review.

---

## T053 — [READY FOR REVIEW] "Check" in the solver: lock correct letters, mark wrong ones

Solver-side feature, modelled on the NYT crossword. The user presses **Check**; every filled square is compared against the solution:

- **Correct** → the letter turns **blue** and the square is **locked**. It can no longer be typed over or deleted, for the rest of the solve.
- **Wrong** → the square gets a **red diagonal slash** through it (NYT's marker). It stays fully editable.
- **Empty** squares are untouched — neither locked nor marked.

Scope: `CrosswordPlayer.tsx` and `styles.css` only. Don't touch `PuzzleDesigner.tsx`.

**1. State.** Two sets of cell indices:

```tsx
const [lockedCells, setLockedCells] = useState<Set<number>>(new Set());
const [wrongCells, setWrongCells] = useState<Set<number>>(new Set());
```

`runCheck()` walks every non-block cell that has a letter, compares `filled[i]` to `solutionChars[i]`, and adds it to one set or the other. Locked is **cumulative** — a later check never unlocks a square.

**2. Wrong marks clear on edit, locks never do.** As soon as the user types into or deletes a wrong-marked square, remove it from `wrongCells`. They only reappear on the next Check. Locked squares are permanent for the session.

**3. Locked squares must be genuinely immovable.** This is the fiddly part — there are several paths that write to a cell, and *all* need the guard:

- `onCellInputChange` — ignore any input on a locked cell
- `backspaceEmptyCell` — must not clear a locked cell, and must not clear one during its jump-to-previous-entry cascade
- `handleKeyboardBackspace` — the mobile on-screen backspace, same rule
- `jumpToPreviousEntryEnd` — it clears the previous entry's last cell; skip that clear if locked (still navigate there)
- `moveInResolvedEntry` — already skips filled cells when auto-advancing; locked cells are filled, so this should work already, but confirm typing flows past them naturally

Do **not** make locked cells unfocusable — the user should still be able to select and read them, and arrow/Tab navigation must still pass through them normally. They're read-only, not skipped-over.

**4. Persist locks.** Progress is already saved as `{ filled, startAtMs }` under `progressKey(puzzle.id)`. Add `locked` as an array of indices, and restore it in `loadProgress`. Treat it as optional — `loadProgress` currently validates `filled` and `startAtMs` only, and older saves without `locked` must keep loading fine (default to empty). Don't persist `wrongCells`; those are transient by design.

**5. The button — desktop and mobile.**

The `controlsRow` already has an actions area holding the timer and a `!isMobile`-gated "Solve it" button. Put Check in that same container so no layout is disturbed:
- **Desktop:** a normal `btn` labelled "Check", next to "Solve it"
- **Mobile:** the same action as a compact icon-only button (use `CheckCheck` from `lucide-react`, sized like the existing toolbar icons) with `aria-label="Check puzzle"`, so it fits beside the timer in the compact row

Hide it once `solved` is true, matching how "Solve it" behaves.

**Do NOT add a Check key to the on-screen keyboard.** Its rows must stay a plain QWERTY layout — no reordering, no compressing letters to make room. That's a standing rule from earlier feedback.

**6. CSS in `styles.css`.** Two new cell states, both of which must sit *on top of* the existing `.cellActive` / `.cellCurrent` background highlights rather than fighting them:

```css
.cellLocked input { color: #1d4ed8; }   /* blue, correct + locked */

.cellWrong { position: relative; }
.cellWrong::after {                      /* red slash, NYT-style */
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom right, transparent 46%, #dc2626 46%, #dc2626 54%, transparent 54%);
  pointer-events: none;
}
```
Check `.cell` doesn't already set `position` in a way that breaks this, and make sure the slash sits above the cell background but below the letter and the cell number.

**Note on the leaderboard:** "Solve it" already fills the whole grid and submits a time, so Check doesn't open any new hole in leaderboard integrity. Don't add any "used check" tracking as part of this task.

**Testing — desktop and mobile:**
- Fill some squares correctly and some wrongly, press Check: correct ones turn blue, wrong ones get a red slash, empty ones are untouched
- Try to overwrite a blue square by typing — nothing happens
- Try to delete a blue square with Backspace, and with the mobile on-screen backspace — nothing happens
- Backspace from the start of an entry into a *locked* previous entry: it should navigate there but not clear the letter
- Type over a red-slashed square: the slash disappears immediately
- Press Check again after fixing: newly-correct squares turn blue and lock
- Arrow keys and Tab still move through locked squares normally
- Reload the page mid-solve: blue locked squares are still blue and still locked
- The button is reachable on mobile without the controls row wrapping or the grid shrinking
- A puzzle solved normally still completes, times, and posts to the leaderboard as before

**Implementation notes:** Backspace while *on* a locked square is a no-op (doesn't cascade). Jump-from-empty / previous-entry still navigates onto a locked square without clearing it. Malformed `locked` in old saves is ignored; `filled` still loads.

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
