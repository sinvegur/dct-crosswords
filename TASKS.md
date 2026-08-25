# Cursor Tasks

Task queue for handing work from Claude (planning/review) to Cursor (implementation) on dct-crosswords.

## Protocol

- **Cursor**: when told "new task for you, check TASKS.md", find the topmost entry marked `[TODO]`. Implement only that task — don't start a second `[TODO]` in the same pass. When finished, change its status to `[READY FOR REVIEW]` and add a short "Implementation notes" line under it if anything deviated from the instructions.
- **Claude**: reviews `[READY FOR REVIEW]` entries against the actual diff. Marks `[DONE]`, **commits immediately** (one task = one commit, task ID in the subject line), and deletes the entry (git history keeps the record — no need to accumulate finished tasks here). Or marks `[CHANGES REQUESTED]` and appends specific notes for Cursor to address, leaving status as `[CHANGES REQUESTED]` until fixed.
- IDs are sequential (T001, T002, ...) and never reused, even if a task is deleted.
- Only one task should be active (`[TODO]` at the top) at a time, to keep diffs small and reviewable.
- **Only make the changes the task explicitly describes.** If you notice something else worth fixing while working, do NOT implement it — note it in "Implementation notes" as a suggestion and let Claude turn it into its own task. This has been raised twice already (T001 favicon/port, T002 layout rework) — a third occurrence means diffs will be rejected without detailed review.

---

## T049 — [TODO] Port solver's typing/navigation UX into the puzzle builder's letter mode

**Context:** `CrosswordPlayer.tsx` (solver) has accumulated a bunch of typing/navigation refinements over time — select-highlighted letter on focus so typing overwrites it, auto-advance to the next available cell (skipping already-filled ones, jumping to the next entry once one is complete), auto-jump-back-and-clear on backspace past an entry's start, Tab/Shift+Tab entry stepping (with a fallback so it never gets stuck once every cell has *something* in it), and a Turkish-keyboard "I" fix. None of this made it into `PuzzleDesigner.tsx`'s letter-entry mode (`editMode === 'letter'`), which still has an older, simpler version of the same functions. Bring it up to parity.

**Do not touch `CrosswordPlayer.tsx`** — copy/adapt its logic into `PuzzleDesigner.tsx`, don't refactor the two into a shared module. Keep this a Designer-only change; a shared-hook extraction is a bigger, riskier refactor that's out of scope here.

Note: the CSS side of this (`-webkit-appearance: none`, 16px font floor, `.cell input::selection { background: transparent }`) is already global on `.cell input` and applies to the Designer's grid automatically — no CSS changes needed, this task is JS/TSX only, in `PuzzleDesigner.tsx`.

**1. Fix `normalizeLetter` (line ~27)** — it's missing the Turkish "I" fix that `CrosswordPlayer.tsx`'s version has. Copy it verbatim:
```tsx
function normalizeLetter(raw: string) {
  const trimmed = raw.replace(/\s+/g, '');
  if (!trimmed) return '';
  const ch = trimmed[trimmed.length - 1];
  if (ch === 'i' || ch === 'I') return 'I';
  return ch.toLocaleUpperCase('tr-TR');
}
```

**2. `focusCell` (line ~324)** — add `el.select()` after focusing, so landing on a cell that already has a letter (via Tab-stepping or auto-advance) lets typing immediately replace it instead of being silently rejected by `maxLength=1`:
```tsx
const focusCell = (cellIndex: number) => {
  const el = inputsRef.current[cellIndex];
  if (!el) return;
  el.focus();
  el.select();
  setActiveCellIndex(cellIndex);
};
```

**3. Add `isEntryFilled` and `stepEntry`** (near `moveInResolvedEntry`, line ~275) — port from `CrosswordPlayer.tsx`, adapted to Designer's data model (no `filled` array or `solved` flag; use `flat[idx].trim() !== ''` for "has a letter" and drop the `solved` guard):
```tsx
const isEntryFilled = (entry: Entry) =>
  entry.cells.every((c) => flat[idxOf(size, c.row, c.col)].trim() !== '');

const focusEntry = (direction: Direction, entryNumber: number) => {
  if (!computed) return;
  const entry = computed.entryByNumberDirection(direction, entryNumber);
  if (!entry) return;
  const entryIndices = entry.cells.map((c) => idxOf(size, c.row, c.col));
  const targetCell =
    entryIndices.find((idx) => flat[idx].trim() === '') ?? entryIndices[0]!;
  setActiveDirection(direction);
  setActiveEntryNumber(entryNumber);
  setActiveCellIndex(targetCell);
  focusCell(targetCell);
};

const stepEntry = (delta: 1 | -1) => {
  if (!computed) return;
  const combined = [
    ...computed.entriesAcross.map((entry) => ({ direction: 'across' as const, entry })),
    ...computed.entriesDown.map((entry) => ({ direction: 'down' as const, entry })),
  ];
  if (combined.length === 0) return;

  const currentIdx =
    activeEntryNumber == null
      ? -1
      : combined.findIndex(
          (item) => item.direction === activeDirection && item.entry.number === activeEntryNumber,
        );

  let nextIdx: number;
  if (currentIdx === -1) {
    nextIdx = delta === 1 ? 0 : combined.length - 1;
  } else {
    nextIdx = currentIdx + delta;
    if (nextIdx < 0) nextIdx = combined.length - 1;
    if (nextIdx >= combined.length) nextIdx = 0;
  }

  const fallbackIdx = nextIdx;

  for (let steps = 0; steps < combined.length; steps++) {
    const item = combined[nextIdx]!;
    if (!isEntryFilled(item.entry)) {
      focusEntry(item.direction, item.entry.number);
      return;
    }
    nextIdx += delta;
    if (nextIdx < 0) nextIdx = combined.length - 1;
    if (nextIdx >= combined.length) nextIdx = 0;
  }

  const fallback = combined[fallbackIdx]!;
  focusEntry(fallback.direction, fallback.entry.number);
};
```
`focusEntry` replaces the body of `toggleDirection`'s sibling role only in that it's new — `toggleDirection` (Space key) stays exactly as-is, unrelated to this.

**4. Replace `moveInResolvedEntry` and add `moveOneWithinEntry`** (line ~275) — the current version just moves one cell with no skip-ahead and no entry-completion handling. Port both of Player's variants: the "smart" one (skips over already-filled cells, and once the whole entry is complete, auto-advances into the next unfilled entry via `stepEntry(1)`) for typing into a cell that was empty, and a "dumb" one (moves exactly one cell within the entry, no skipping, no cross-entry jump) for overwriting a cell that already had a letter — otherwise correcting one letter in an already-fully-filled entry blows straight through to the next entry after a single keystroke (this exact bug was just fixed in the solver; see recent commit `0837979`, "Fix jump-to-next-word regression").
```tsx
const moveInResolvedEntry = (entry: Entry, from: number, delta: 1 | -1) => {
  const indices = entry.cells.map((c) => idxOf(size, c.row, c.col));
  const pos = indices.indexOf(from);
  if (pos === -1) return;

  let nextPos = pos + delta;
  while (nextPos >= 0 && nextPos < indices.length - 1 && flat[indices[nextPos]!].trim() !== '') {
    nextPos += delta;
  }

  const next = indices[nextPos];
  if (next == null) {
    if (delta === 1) stepEntry(1);
    return;
  }
  pickCell(next);
  focusCell(next);
};

const moveOneWithinEntry = (entry: Entry, from: number, delta: 1 | -1) => {
  const indices = entry.cells.map((c) => idxOf(size, c.row, c.col));
  const pos = indices.indexOf(from);
  if (pos === -1) return;
  const next = indices[pos + delta];
  if (next == null) return;
  pickCell(next);
  focusCell(next);
};
```

**5. Update `onCellChange`** (line ~329) to use the `wasEmpty` distinction and drop the old backward-move-on-clear behavior (Player doesn't move at all when a Backspace clears a filled cell — it just stays put; see its `onCellInputChange`, `if (!letter) return;`):
```tsx
const onCellChange = (cellIndex: number, raw: string) => {
  if (editMode === 'block') return;
  pickCell(cellIndex);
  const wasEmpty = flat[cellIndex].trim() === '';
  const letter = normalizeLetter(raw);
  setCellLetter(cellIndex, letter);
  if (!letter) return;
  const entry = resolveEntryAtCell(cellIndex, activeDirection);
  if (!entry) return;
  if (wasEmpty) {
    moveInResolvedEntry(entry, cellIndex, 1);
  } else {
    moveOneWithinEntry(entry, cellIndex, 1);
  }
};
```

**6. Add `jumpToPreviousEntryEnd` and wire it into `backspaceEmptyCell`** (line ~285) — backspacing past the start of an entry should jump to the previous entry's last cell and clear it in the same action (matching the solver's T048 behavior), instead of just stopping. Port directly:
```tsx
const jumpToPreviousEntryEnd = (direction: Direction, entryNumber: number) => {
  if (!computed) return;
  const combined = [
    ...computed.entriesAcross.map((entry) => ({ direction: 'across' as const, entry })),
    ...computed.entriesDown.map((entry) => ({ direction: 'down' as const, entry })),
  ];
  const currentIdx = combined.findIndex(
    (item) => item.direction === direction && item.entry.number === entryNumber,
  );
  if (currentIdx === -1) return;
  const prevIdx = currentIdx === 0 ? combined.length - 1 : currentIdx - 1;
  const target = combined[prevIdx]!;
  const targetIndices = target.entry.cells.map((c) => idxOf(size, c.row, c.col));
  const lastCell = targetIndices[targetIndices.length - 1]!;
  setCellLetter(lastCell, '');
  setActiveDirection(target.direction);
  setActiveEntryNumber(target.entry.number);
  setActiveCellIndex(lastCell);
  focusCell(lastCell);
};
```
Then in `backspaceEmptyCell`, track the resolved direction through both branches (mirroring Player's version — Designer's version doesn't currently track this at all) and call `jumpToPreviousEntryEnd` instead of returning at `pos === 0`:
```tsx
const backspaceEmptyCell = (cellIndex: number) => {
  pickCell(cellIndex);
  let direction: Direction = activeDirection;
  let entry = resolveEntryAtCell(cellIndex, direction);
  if (!entry) return;
  direction = entry.direction;

  let indices = entry.cells.map((c) => idxOf(size, c.row, c.col));
  let pos = indices.indexOf(cellIndex);

  if (pos === -1) {
    direction = direction === 'across' ? 'down' : 'across';
    entry = resolveEntryAtCell(cellIndex, direction);
    if (!entry) return;
    direction = entry.direction;
    indices = entry.cells.map((c) => idxOf(size, c.row, c.col));
    pos = indices.indexOf(cellIndex);
    if (pos === -1) return;
    pickCell(cellIndex);
  }

  if (pos === 0) {
    jumpToPreviousEntryEnd(direction, entry.number);
    return;
  }

  const prev = indices[pos - 1]!;
  setCellLetter(prev, '');
  pickCell(prev);
  focusCell(prev);
};
```

**7. Wire Tab in the cell's `onKeyDown`** (line ~776) — add a case before the existing Space/Backspace handling:
```tsx
if (e.key === 'Tab') {
  e.preventDefault();
  stepEntry(e.shiftKey ? -1 : 1);
  return;
}
```

**Scope:** `PuzzleDesigner.tsx` only. Don't touch `CrosswordPlayer.tsx`, `styles.css`, or `templates.ts`.

**Testing:** verify in letter mode (not block mode): typing fills forward and skips already-filled crossing cells; completing an entry auto-advances to the next unfilled one; Tab/Shift+Tab step entries and don't get stuck once the whole grid has letters; Backspace on an empty cell jumps to and clears the previous entry's last cell; correcting a letter in an already-fully-filled entry moves one cell at a time instead of jumping entries; typing a physical "I" produces dotless Turkish "I" not "İ". Also sanity-check block mode and the existing Space-toggles-direction behavior still work unchanged.

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

