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

## T016 — [READY FOR REVIEW] Confirm before losing unsaved changes in the designer

**The exit points that currently navigate away with zero warning, even with unsaved edits**: the logo (→ home), the "Puzzles" nav button, "Sign out", the "New puzzle" button, and `PuzzleDesigner`'s own "Cancel" button. All of these need to check for unsaved changes first and, if any exist, show a confirmation modal offering: **Keep editing** (stay, do nothing) / **Discard changes** (proceed with the original action, dropping edits) / **Save draft & leave** (save as draft, then proceed with the original action).

**Important architectural constraint — read before implementing:** this app uses React Router's plain `<BrowserRouter>` (declarative router), not a data router (`createBrowserRouter`). **Do not reach for `useBlocker`/`unstable_useBlocker`** — that hook only works with a data router, and migrating to one is a much bigger, unrelated change. Solve this without it, per the approach below.

**1. Dirty-state tracking, inside `PuzzleDesigner.tsx`:**
- Capture a baseline snapshot once when the component mounts — the state as loaded from `initial` (editing an existing puzzle) or as derived from `startingTemplate` (a brand new puzzle, blocks placed but no letters/clues yet). This baseline is the "nothing changed yet" reference point, not a hardcoded empty grid.
- Compare current `title`, `rows` (the grid/letters), `cluesAcross`, `cluesDown` against that baseline to determine `isDirty`. Don't include `editMode`, `symmetry`, or cell-selection state in the comparison — those are transient view state, not puzzle content, and shouldn't trigger a warning on their own.
- Update the baseline to the just-saved state after every successful save (draft or publish) — so continuing to edit after a save starts dirty-tracking fresh from that point, and saving then immediately leaving doesn't falsely warn.

**2. A shared navigation-guard mechanism**, so `AppShell` (in `App.tsx`) — which owns the Logo/Puzzles/Sign out/New puzzle buttons, entirely outside `PuzzleDesigner` — can have its navigation intercepted by whichever `PuzzleDesigner` instance is currently mounted, without needing router-level blocking:
- Something along the lines of a small module (e.g. `src/lib/navigationGuard.ts`) exposing `registerGuard(fn)` / `unregisterGuard()` and `runGuarded(proceed: () => void)`. `runGuarded` calls the currently-registered guard function if one exists (passing `proceed` through so the guard can decide whether/when to call it), or just calls `proceed()` immediately if no guard is registered (i.e., not currently in the designer — the common case, must stay a no-op fast-path).
- `PuzzleDesigner` registers a guard on mount and unregisters on unmount. The guard function: if not dirty, call `proceed()` immediately with no UI. If dirty, show the confirmation modal and store the `proceed` callback; **Keep editing** just closes the modal (never calls `proceed`); **Discard changes** calls `proceed()` immediately; **Save draft & leave** runs the existing internal save-draft logic (reuse `handleSave('draft')`/`buildPuzzle('draft')` from T015, don't duplicate it) and calls `proceed()` only after that succeeds.
- In `AppShell`, wrap the actual navigation logic for the logo click, "Puzzles" click, "Sign out" click, and "New puzzle" click in `runGuarded(() => /* the existing action */)` instead of calling that action directly. On the Puzzles list or Player page (no designer mounted), this remains an instant no-op passthrough — exactly today's behavior, unchanged.
- `PuzzleDesigner`'s own "Cancel" button should go through the **same** `runGuarded(() => onCancel())` call, rather than a separate local implementation — one guard mechanism, one modal, used consistently everywhere, not two different code paths for "internal" vs "external" exits.

**3. The confirmation modal**: reuse the app's existing modal CSS (`.modalOverlay`/`.modal`/`.modalHeader`/`.modalTitle`/`.modalClose`/`.modalFooter`, `.btn`/`.btnPrimary` — same pattern as `ShuffleConfirmModal`/`StartingGridModal`), not a new visual language. Title something like "Unsaved changes," body explaining there are unsaved edits to this puzzle, three buttons: "Keep editing" (plain), "Discard changes" (plain), "Save draft & leave" (primary — the safe/recommended action, visually emphasized).

**4. Also add a `beforeunload` handler** in `PuzzleDesigner` (active only while dirty) as a backstop against actual tab close / typed-URL navigation / browser back-forward — standard `e.preventDefault(); e.returnValue = '';`. Note: this triggers the browser's own generic "leave site?" dialog, which cannot be customized with custom button text/labels — that's a hard browser limitation, not something to work around.

**Verify**: make an edit in the designer (type a letter, edit a clue, change the title, or toggle a block), then try each of Logo / Puzzles / Sign out / New puzzle / Cancel — each should show the modal. Confirm all three modal actions behave correctly, confirm making zero edits allows any of these to proceed with no modal at all (don't regress the common no-changes case), and confirm the guard correctly stops applying once you've navigated away (no modal firing on unrelated pages afterward).

Scope: `PuzzleDesigner.tsx`, `App.tsx`, a new small guard-registry module, a new modal component (or extending an existing one), `styles.css` if any new classes are needed beyond what already exists.

