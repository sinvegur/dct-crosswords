# Cursor Tasks

Task queue for handing work from Claude (planning/review) to Cursor (implementation) on dct-crosswords.

## Protocol

- **Cursor**: when told "new task for you, check TASKS.md", find the topmost entry marked `[TODO]`. Implement only that task — don't start a second `[TODO]` in the same pass. When finished, change its status to `[READY FOR REVIEW]` and add a short "Implementation notes" line under it if anything deviated from the instructions.
- **Claude**: reviews `[READY FOR REVIEW]` entries against the actual diff. Marks `[DONE]`, **commits immediately** (one task = one commit, task ID in the subject line), and deletes the entry (git history keeps the record — no need to accumulate finished tasks here). Or marks `[CHANGES REQUESTED]` and appends specific notes for Cursor to address, leaving status as `[CHANGES REQUESTED]` until fixed.
- IDs are sequential (T001, T002, ...) and never reused, even if a task is deleted.
- Only one task should be active (`[TODO]` at the top) at a time, to keep diffs small and reviewable.
- **Only make the changes the task explicitly describes.** If you notice something else worth fixing while working, do NOT implement it — note it in "Implementation notes" as a suggestion and let Claude turn it into its own task. This has been raised twice already (T001 favicon/port, T002 layout rework) — a third occurrence means diffs will be rejected without detailed review.

---

## T055 — [TODO] Replace Shuffle with "link clues"; tint linked squares in both grids

Shuffle picks a different starting template, but every size now ships exactly one template, so it does nothing useful. Remove it and use the toolbar slot for linked clues instead — the NYT "With 17-Across, …" pattern, for multi-part or themed answers.

### Data model

Links live **inside the existing `clues` JSONB**, so no Supabase migration is needed. In `src/crossword/types.ts`:

```ts
clues: {
  across: Record<number, string>;
  down: Record<number, string>;
  /** Groups of 2+ entries that belong together. Optional - older puzzles have none. */
  links?: Array<Array<{ direction: Direction; number: number }>>;
};
```

`savePuzzle` already persists `puzzle.clues` wholesale, so it should carry through with no storage changes — **verify that**, don't assume it.

Rules:
- A group has **at least 2** entries.
- **An entry may belong to at most one group.** If the user picks an entry that's already in a group, replace its old membership.
- Groups referencing entries that no longer exist (the constructor changed the grid) must be ignored when rendering and dropped on save. Don't crash on stale links.

### Builder

**1. Remove Shuffle completely** — the toolbar button, `applyShuffle`, `requestShuffle`, `pickShuffleTemplate`, `lastShuffledTemplateId`, `shuffleConfirmOpen`, the `Shuffle` icon import, and `src/components/ShuffleConfirmModal.tsx` (used nowhere else — confirm before deleting).

**2. Two toolbar buttons** where Shuffle was, matching the existing `toolbarControl` styling and `TOOLBAR_ICON_SIZE`:
- **Link** (`Link2` from lucide) — `aria-label="Link clues"`
- **Unlink** (`Unlink2`) — `aria-label="Remove all clue links"`, disabled when there are no links

**3. Linking flow.** Pressing Link enters a linking mode:
- The status bar explains it: *"Select 2 or more clues to link, then press Link again to confirm."*
- While in this mode, clicking a **clue row** in the Across/Down lists toggles its selection instead of jumping to that cell. Selected rows need a clear visual state (reuse or extend `.clueActive`-style treatment; don't invent a new palette).
- Pressing Link again commits the group if 2+ are selected, and exits the mode. With fewer than 2 selected, exit without creating anything.
- Pressing Escape cancels and exits without creating anything.
- Typing in a clue's text input must still work normally while in this mode — only the row click changes behaviour.

**4. Unlink** opens a confirmation, reusing the existing modal pattern (`DeletePuzzleConfirmModal` / the removed `ShuffleConfirmModal` are the models): *"Remove all clue links? This can't be undone from here."* — Yes / No. It clears **every** group. Deliberately blunt: no per-group editing for now.

**5. Undo must cover links.** `DesignerSnapshot` is `{title, rows, cluesAcross, cluesDown}` and drives both undo/redo and the unsaved-changes check. **Add links to it**, or creating and removing links won't be undoable and won't mark the puzzle dirty — meaning a link change could be silently lost on navigate-away.

### Both grids

When the active entry belongs to a link group, the **grid squares** of the other entries in that group get a mild tint. Applies in `CrosswordPlayer.tsx` and `PuzzleDesigner.tsx` alike.

- New CSS class, e.g. `.cellLinked`, with a **subtle** background — clearly weaker than `.cellActive` (`--cell-bg-active`, the current-word tint) so it reads as secondary information, and it must never override `.cellActive`, `.cellCurrent`, `.cellLocked` or `.cellWrong` where those also apply. Add a `--cell-bg-linked` variable next to the existing cell colour variables rather than hard-coding.
- The active entry's own squares keep their normal active highlight; only the *linked* entries get the new tint.
- Black squares are never tinted.
- In the solver, suppress it when `solved` is true — the finished grid stays clean, matching how the check marks and active highlights already behave there.

**Don't** modify clue text automatically. The constructor writes "With 17-Across, …" themselves if they want it spelled out; the tint reinforces, it doesn't replace.

**Testing:**
- Build a puzzle, link 1-Across and 3-Down, save, reload it from the puzzle list — the link survives
- Selecting 1-Across mildly tints 3-Down's squares, and vice versa, in both the builder and the solver
- The tint is clearly weaker than the active-word highlight and doesn't obscure letters or cell numbers
- Linking a clue that's already in a group moves it rather than putting it in two
- Undo reverses a link creation; redo reapplies it
- Unlink asks for confirmation and clears everything; the button is disabled when there are no links
- Delete a linked entry by adding black squares, then save and reopen — no crash, the stale link is gone
- An older puzzle with no `links` key opens and plays normally
- Nothing named Shuffle remains anywhere in the codebase

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
