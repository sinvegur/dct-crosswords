# Cursor Tasks

Task queue for handing work from Claude (planning/review) to Cursor (implementation) on dct-crosswords.

## Protocol

- **Cursor**: when told "new task for you, check TASKS.md", find the topmost entry marked `[TODO]`. Implement only that task — don't start a second `[TODO]` in the same pass. When finished, change its status to `[READY FOR REVIEW]` and add a short "Implementation notes" line under it if anything deviated from the instructions.
- **Claude**: reviews `[READY FOR REVIEW]` entries against the actual diff. Marks `[DONE]`, **commits immediately** (one task = one commit, task ID in the subject line), and deletes the entry (git history keeps the record — no need to accumulate finished tasks here). Or marks `[CHANGES REQUESTED]` and appends specific notes for Cursor to address, leaving status as `[CHANGES REQUESTED]` until fixed.
- IDs are sequential (T001, T002, ...) and never reused, even if a task is deleted.
- Only one task should be active (`[TODO]` at the top) at a time, to keep diffs small and reviewable.
- **Only make the changes the task explicitly describes.** If you notice something else worth fixing while working, do NOT implement it — note it in "Implementation notes" as a suggestion and let Claude turn it into its own task. This has been raised twice already (T001 favicon/port, T002 layout rework) — a third occurrence means diffs will be rejected without detailed review.

---

## T044 — [TODO] Always land on the first across clue in solver mode — no "Select a clue to begin" empty state

Right now `CrosswordPlayer.tsx`'s puzzle-reset `useEffect` (the one keyed on `[puzzle.id, cellCount]`, restores saved progress via `loadProgress`) sets `activeCellIndex`/`activeEntryNumber` to `null` on mount. That means a solver who's just entered their name and landed on the grid sees no clue highlighted at all — the clue bar shows the `clueBarPlaceholder` "Select a clue to begin" text, and no cell is visually active, until they click something. The user wants the grid to always land with the first across entry already selected, so that empty/unselected state never actually appears in practice.

**Fix — in that same reset `useEffect`:** instead of nulling out the active-entry state, select the first across entry, matching the existing "jump to first empty cell" convention already used elsewhere in this file (`focusEntry`, added in T025/T037) rather than always landing on the entry's literal first cell — that matters for a solver resuming a puzzle with saved progress (T039) where the first across entry might already be partly or fully filled in.

```tsx
useEffect(() => {
  const saved = loadProgress(puzzle.id, cellCount);
  const nextFilled = saved?.filled ?? Array.from({ length: cellCount }, () => '');
  setFilled(nextFilled);
  const firstAcross = computed.entriesAcross[0];
  if (firstAcross) {
    const entryIndices = firstAcross.cells.map((c) => idxOf(size, c.row, c.col));
    const targetCell = entryIndices.find((idx) => !nextFilled[idx]) ?? entryIndices[0]!;
    setActiveDirection('across');
    setActiveEntryNumber(firstAcross.number);
    setActiveCellIndex(targetCell);
  } else {
    setActiveDirection('across');
    setActiveEntryNumber(null);
    setActiveCellIndex(null);
  }
  setStartAtMs(saved?.startAtMs ?? Date.now());
  setSolved(false);
  setElapsedMs(null);
  setTickNowMs(Date.now());
  setLeaderboard([]);
  setUserRank(null);
  setAttemptId(null);
  setSubmitError(null);
  submittedRef.current = false;
}, [puzzle.id, cellCount, computed, size]);
```

Note the dependency array gains `computed` and `size` — both needed for the new `entriesAcross[0]`/`idxOf` calls, and both stable per-puzzle (`computed` is itself a `useMemo` keyed on `puzzle.id`), so this doesn't introduce extra reruns.

**Don't force DOM focus on mount.** This should only update the React state that drives the visual highlight (active cell styling, clue bar text) — do not call `.focus()` on the cell's `<input>` as part of this. The user asked for the clue to be *visually* selected/highlighted on landing, not for the browser's actual text-cursor focus (and keyboard, on mobile) to jump into the grid unprompted the moment the page loads.

**Leave the `activeEntry ? ... : <placeholder>` conditional and the "Select a clue to begin" text in place** — don't delete that fallback branch. It becomes effectively unreachable for any real puzzle (which always has at least one across entry), but it's a harmless defensive fallback for a degenerate all-blocked grid, and removing it isn't part of what's being asked here.

**Verify:** enter a solver name and land on a puzzle — confirm the first across entry's number/clue is already showing in the clue bar and its cells are highlighted, with no click needed. Confirm typing immediately (no click first) fills the correct first cell. Refresh mid-solve (T039 persistence) and confirm the first across entry still gets selected on landing — if it's already fully filled from a previous session, it should land on the first cell of that entry (not search other entries for an empty cell elsewhere in the grid, that's out of scope here — just don't error or dead-end on a fully-filled first entry). Confirm solving the puzzle and the results/leaderboard screen still work normally (this `useEffect` shouldn't fire again mid-solve, only on mount/puzzle-change).

Scope: `CrosswordPlayer.tsx` only.

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

## Mobile solver layout — reverted, redo fresh later

T040/T041/T042 (NYT-style single-column mobile layout, clue-bar prev/next arrows + tap-to-toggle, custom on-screen keyboard) were implemented, merged, then fully reverted on 2026-08-24 at the user's request. The on-screen keyboard in particular was a real problem: a 2-row compact layout with Turkish letters behind a toggle key broke the standard QWERTY layout people expect and was unusable. Mobile is back to its original (also imperfect, unoptimized) desktop-only layout — this is the known pre-existing state, not a new regression.

**Before restarting this, rethink the on-screen-keyboard approach specifically** — don't reuse the 2-row/Turkish-toggle design. Whatever comes next should keep a standard, familiar full QWERTY row layout front and center; solving the vertical-space budget problem (a 15×15 grid + header + clue bar + full keyboard doesn't fit comfortably on a phone screen) needs a different idea, not compressing/reordering the keyboard itself.

No `[TODO]` yet — needs a fresh design discussion with the user before queuing real implementation work.

