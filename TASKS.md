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

