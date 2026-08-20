# Cursor Tasks

Task queue for handing work from Claude (planning/review) to Cursor (implementation) on dct-crosswords.

## Protocol

- **Cursor**: when told "new task for you, check TASKS.md", find the topmost entry marked `[TODO]`. Implement only that task — don't start a second `[TODO]` in the same pass. When finished, change its status to `[READY FOR REVIEW]` and add a short "Implementation notes" line under it if anything deviated from the instructions.
- **Claude**: reviews `[READY FOR REVIEW]` entries against the actual diff. Marks `[DONE]` and deletes the entry (git history keeps the record — no need to accumulate finished tasks here), or marks `[CHANGES REQUESTED]` and appends specific notes for Cursor to address, leaving status as `[CHANGES REQUESTED]` until fixed.
- IDs are sequential (T001, T002, ...) and never reused, even if a task is deleted.
- Only one task should be active (`[TODO]` at the top) at a time, to keep diffs small and reviewable.
- **Only make the changes the task explicitly describes.** If you notice something else worth fixing while working, do NOT implement it — note it in "Implementation notes" as a suggestion and let Claude turn it into its own task. This has been raised twice already (T001 favicon/port, T002 layout rework) — a third occurrence means diffs will be rejected without detailed review.

---

## T004 — [TODO] Shuffle button: randomize block layout in the designer

**Do this task after T002 is done and merged — not before.** (T002 touches some of the same CSS files this task will touch; keep diffs from overlapping.)

Add a "Shuffle" button to the puzzle designer's block-editing toolbar (`src/crossword/PuzzleDesigner.tsx`, the `.editorToolbar` row that currently has the Letter/Block mode toggle and the "180° block symmetry" switch). Clicking it replaces the current block layout with a different one, randomly picked from the existing curated templates in `src/data/templates.ts` (`TEMPLATES_15`, excluding `blank`).

**Behavior:**
1. Button picks a random template from `TEMPLATES_15.filter(t => t.id !== 'blank')`, excluding whichever template produced the *current* layout if that's knowable (avoid immediately reshuffling to the same pattern twice in a row — simplest approach: exclude the previously-shuffled template id from the random pick pool, tracked in local component state).
2. Applying the new layout means replacing `rows` with `templateToEmptySolution(newTemplate)` (same helper `startingTemplate` already uses on initial mount) — this clears all letters (cells become blocks or empty), and should also **reset `cluesAcross`/`cluesDown` to `{}`**, not just the grid. Reason: entry numbers are derived from block positions via `computeEntries15`, so a new block layout reassigns numbers — old clues keyed by old numbers would silently attach to the wrong entries otherwise. This applies whether or not the confirmation dialog (below) was shown.
3. **Confirm before destroying progress.** Before applying a shuffle, check whether the user has any unsaved progress: any letter cell is non-empty (`rows` contains a letter, not just spaces/`#`), OR any entry in `cluesAcross`/`cluesDown` has non-empty trimmed text. If either is true, show a confirmation modal first ("Shuffling will replace the grid and clear any letters and clues you've entered. Continue?" / Cancel / Shuffle) and only proceed if confirmed. If there's no progress yet (fresh blank-ish grid), shuffle immediately with no modal.
4. Use a **styled modal matching the app's existing modal CSS** (`.modalOverlay`, `.modal`, `.modalHeader`, `.modalTitle`, `.modalClose`, `.modalFooter`, `.btn`/`.btnPrimary` — see `StartingGridModal.tsx` for the pattern to follow) — not the browser's native `confirm()`. `App.tsx` currently uses native `confirm()` for delete-puzzle; don't copy that pattern here, it doesn't match the app's design.
5. Shuffle should work regardless of current `editMode` (letter or block) — clicking it while in letter mode should still work (it's about grid structure, not the current view).

Keep the change contained to `PuzzleDesigner.tsx` plus any new modal component file needed — don't touch unrelated parts of the designer.
