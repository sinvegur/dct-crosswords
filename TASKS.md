# Cursor Tasks

Task queue for handing work from Claude (planning/review) to Cursor (implementation) on dct-crosswords.

## Protocol

- **Cursor**: when told "new task for you, check TASKS.md", find the topmost entry marked `[TODO]`. Implement only that task — don't start a second `[TODO]` in the same pass. When finished, change its status to `[READY FOR REVIEW]` and add a short "Implementation notes" line under it if anything deviated from the instructions.
- **Claude**: reviews `[READY FOR REVIEW]` entries against the actual diff. Marks `[DONE]`, **commits immediately** (one task = one commit, task ID in the subject line), and deletes the entry (git history keeps the record — no need to accumulate finished tasks here). Or marks `[CHANGES REQUESTED]` and appends specific notes for Cursor to address, leaving status as `[CHANGES REQUESTED]` until fixed.
- IDs are sequential (T001, T002, ...) and never reused, even if a task is deleted.
- Only one task should be active (`[TODO]` at the top) at a time, to keep diffs small and reviewable.
- **Only make the changes the task explicitly describes.** If you notice something else worth fixing while working, do NOT implement it — note it in "Implementation notes" as a suggestion and let Claude turn it into its own task. This has been raised twice already (T001 favicon/port, T002 layout rework) — a third occurrence means diffs will be rejected without detailed review.

---

## T045 — [READY FOR REVIEW] Mobile solver redesign, take two: compact chrome, reordered layout, full-QWERTY keyboard with a "More" key for Turkish letters

**Context — read before starting.** T040/T041/T042 built a mobile-only single-column solver layout with a custom on-screen keyboard, all reverted on 2026-08-24 after the keyboard shipped as a compressed 2-row layout with Turkish letters behind a "TR" toggle — rejected as unusable because it broke the standard QWERTY layout people already know. This task rebuilds the same idea properly, informed by exactly what went wrong last time. Two things must both be true this time: **the letter keys are never reordered, compressed, or hidden** (full standard 3-row QWERTY, always visible by default), and **the surrounding chrome shrinks enough that a full keyboard actually fits** — last time only the keyboard was touched, and it wasn't enough on its own (measured live: dropping from 3 rows to 2 only recovered ~48px against a ~267px shortfall). This task is scoped as one PR, not staged across several, specifically so the full vertical budget gets verified together at the end rather than discovered broken partway through, which is what happened last time.

Everything in this task is **mobile-only**, gated the same way T040-T042 were: a `useIsMobile()` hook (`window.matchMedia('(max-width: 860px)')`, `useState` seeded from `.matches`, updated on the query list's `change` event) — recreate `src/lib/useIsMobile.ts`, it was deleted in the revert. Desktop must render pixel-identical to how it does today; every change below either lives inside `@media (max-width: 860px)` in CSS or is gated by `isMobile` in JS.

### 1. Compact top chrome (mobile only)

Two separate pieces of chrome currently eat a lot of height before the puzzle even starts: the app's own logo header (`App.tsx`, `.header`) and `CrosswordPlayer.tsx`'s `controlsRow` (puzzle title, "Solving as X", timer, "Solve it" button).

**`styles.css`, inside the existing `@media (max-width: 860px)` block:**
```css
.logoImg {
  height: 40px;
}
.header {
  margin-bottom: 6px;
}
.page {
  padding: 10px;
}
```

**`CrosswordPlayer.tsx`'s `controlsRow` (around line 534) — mobile-only compact version.** Hide the puzzle title, the "Solving as X" line, and the "Solve it" button (that button is a temporary testing aid per T029, not meant for real solvers — hiding it on mobile only, still fully present on desktop). Keep only the timer, in a slim single-line bar:

```tsx
<div className={`controlsRow ${isMobile ? 'controlsRowCompact' : ''}`}>
  {!isMobile ? (
    <div>
      <div className="title" style={{ fontSize: 16 }}>
        {puzzle.title}
      </div>
      <div className="subtle solverMeta">
        <span>
          Solving as <strong>{solverName}</strong>
        </span>
      </div>
    </div>
  ) : null}
  <div
    style={{
      marginLeft: 'auto',
      display: 'flex',
      gap: 8,
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'flex-end',
    }}
  >
    <div className="solverTimer" aria-live="polite">
      {formatElapsedMs(liveElapsedMs ?? tickNowMs - startAtMs)}
    </div>
    {!solved && !isMobile ? (
      <button type="button" className="btn" onClick={solveInstantly}>
        Solve it
      </button>
    ) : null}
  </div>
</div>
```

```css
.controlsRowCompact {
  padding: 6px 12px;
}
```

### 2. Reorder to grid → clue bar → keyboard (mobile only)

Right now `.gridWrap` renders the clue bar above the grid, and there's no keyboard. On mobile, flip the order so the grid comes first (matches the layout order the user asked for). `.solverGridPanel .gridWrap` is already `display: flex; flex-direction: column` (unchanged, works for both breakpoints), so this is just `order` in the mobile media query:

```css
.clueBar {
  order: 2;
}
.gridSlot {
  order: 1;
}
.solverKeyboard {
  order: 3;
}
```

Wrap the grid in a `.gridSlot` div (new, mobile-only sizing container — same pattern T040 used): `<div className="gridSlot"><div className="grid" ...>...</div></div>` in `CrosswordPlayer.tsx`. Give `.gridSlot` `container-type: size` **only inside the mobile media query** (not the default rule) — `.solverGridPanel` already has `container-type: size` unconditionally for desktop's `cqmin` sizing, so don't touch that.

```css
.gridSlot {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
```
and inside the mobile media query:
```css
.gridSlot {
  order: 1;
  container-type: size;
}
.solverGridPanel {
  overflow-y: hidden;
}
```

### 3. Clue bar prev/next arrows, borderless

Add prev/next buttons flanking the clue bar (reuses `stepEntry`, already in the file for Tab/Shift+Tab navigation — no new logic needed). Borderless/flat by default per the user's explicit ask, subtle hover only:

```tsx
<div className="clueBar">
  <button
    type="button"
    className="clueBarNav"
    onClick={() => stepEntry(-1)}
    disabled={!activeEntry || solved}
    aria-label="Previous clue"
  >
    <ChevronLeft size={20} aria-hidden />
  </button>
  <div className="clueBarBody">
    {activeEntry ? (
      <>
        <span className="clueBarLabel">
          {activeEntry.number}
          {activeDirection === 'across' ? 'A' : 'D'}
        </span>
        <span className="clueBarText">{activeClueText}</span>
      </>
    ) : (
      <span className="clueBarText clueBarPlaceholder">Select a clue to begin</span>
    )}
  </div>
  <button
    type="button"
    className="clueBarNav"
    onClick={() => stepEntry(1)}
    disabled={!activeEntry || solved}
    aria-label="Next clue"
  >
    <ChevronRight size={20} aria-hidden />
  </button>
</div>
```
(new import: `import { ChevronLeft, ChevronRight } from 'lucide-react';`)

```css
.clueBar {
  display: flex;
  align-items: center;
  gap: 8px;
}
.clueBarNav {
  flex-shrink: 0;
  display: none; /* shown only on mobile, below */
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  background: transparent;
  color: #1e3a8a;
  cursor: pointer;
  border-radius: 8px;
}
.clueBarNav:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.clueBarNav:not(:disabled):hover {
  background: #dbeafe; /* the only hover feedback — still no border, stays flat at rest */
}
.clueBarBody {
  flex: 1;
  min-width: 0;
}
```
and inside the mobile media query: `.clueBarNav { display: inline-flex; }` (arrows only ever show on mobile — desktop already has Tab/Shift+Tab and doesn't need them).

**Not in scope this time:** tapping the clue bar body to toggle direction (T041 had this). Not asked for in this round — SPACE and tapping an already-active cell already toggle direction (T011/T026), so there's no functional gap. Leave `.clueBarBody` a plain non-interactive div.

### 4. The keyboard — full standard QWERTY, Turkish letters behind one "More"-style key

**This is the part that went wrong last time — read carefully.** The default keyboard view must be indistinguishable from a real phone keyboard: standard 10/9/7 row lengths, letters never reordered, nothing appended to row ends. All 6 Turkish-specific letters (Ç, Ğ, İ, Ö, Ş, Ü) live behind one key in the bottom-left corner — the same physical slot and mental model as the "123"/shift key on a real keyboard, so it reads as a familiar gesture rather than a new invented control.

```tsx
const QWERTY_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
] as const;

const TURKISH_EXTRA_LETTERS = ['Ç', 'Ğ', 'İ', 'Ö', 'Ş', 'Ü'] as const;
```

State: `const [showTurkishKeys, setShowTurkishKeys] = useState(false);`

Reuse the exact same cell-input wiring as before (don't reimplement): `onCellInputChange(activeCellIndex, letter)` for a letter tap, and the two-case backspace logic (`onCellInputChange(activeCellIndex, '')` if the active cell is filled, else `backspaceEmptyCell(activeCellIndex)`), plus `onMouseDown={(e) => e.preventDefault()}` on every key to keep the cell's `<input>` focused through the tap. `inputMode={isMobile ? 'none' : undefined}` on the cell `<input>`, same as before, to suppress the native keyboard on mobile only.

```tsx
{isMobile ? (
  <div className="solverKeyboard" role="group" aria-label="On-screen keyboard">
    {showTurkishKeys ? (
      <div className="solverKeyboardRow">
        {TURKISH_EXTRA_LETTERS.map((letter) => (
          <button
            key={letter}
            type="button"
            className="solverKey"
            onMouseDown={preventKeyboardFocusSteal}
            onClick={() => {
              handleKeyboardLetter(letter);
              setShowTurkishKeys(false);
            }}
          >
            {letter}
          </button>
        ))}
        <button
          type="button"
          className="solverKey solverKeyWide"
          aria-label="Back to letters"
          onMouseDown={preventKeyboardFocusSteal}
          onClick={() => setShowTurkishKeys(false)}
        >
          ABC
        </button>
      </div>
    ) : (
      QWERTY_ROWS.map((row, rowIndex) => (
        <div key={rowIndex} className="solverKeyboardRow">
          {rowIndex === QWERTY_ROWS.length - 1 ? (
            <button
              type="button"
              className="solverKey solverKeyWide"
              aria-label="Turkish letters"
              onMouseDown={preventKeyboardFocusSteal}
              onClick={() => setShowTurkishKeys(true)}
            >
              TR
            </button>
          ) : null}
          {row.map((letter) => (
            <button
              key={letter}
              type="button"
              className="solverKey"
              onMouseDown={preventKeyboardFocusSteal}
              onClick={() => handleKeyboardLetter(letter)}
            >
              {letter}
            </button>
          ))}
          {rowIndex === QWERTY_ROWS.length - 1 ? (
            <button
              type="button"
              className="solverKey solverKeyWide"
              aria-label="Backspace"
              onMouseDown={preventKeyboardFocusSteal}
              onClick={handleKeyboardBackspace}
            >
              ⌫
            </button>
          ) : null}
        </div>
      ))
    )}
  </div>
) : null}
```

**Selecting a Turkish letter auto-reverts to the standard layout** (matches typing cadence — one letter per cell, then move on) — deliberate choice, not an oversight, don't "fix" this to require a manual tap back to "ABC".

**Row shape must stay standard-looking.** The bottom row's `TR` and `⌫` keys sit in the same wide-utility-key slots real keyboards use (shift on the left, backspace on the right) — don't let them visually compress or crowd the 7 letters between them; give them real width (`solverKeyWide`, below) same as the reverted attempt used.

```css
.solverKeyboard {
  display: none; /* shown only on mobile, below */
}
```
and inside the mobile media query:
```css
.solverKeyboard {
  order: 3;
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  flex-shrink: 0;
  box-sizing: border-box;
  padding: 6px 4px 4px;
}
.solverKeyboardRow {
  display: flex;
  justify-content: center;
  gap: 4px;
}
.solverKey {
  flex: 1 1 0;
  min-width: 0;
  max-width: 36px;
  height: 42px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: #ffffff;
  color: #111827;
  font-family: var(--font-grid);
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  user-select: none;
}
.solverKey:active {
  background: #e5e7eb;
}
.solverKeyWide {
  max-width: 46px;
  font-size: 14px;
}
```
(exact `max-width`/`height` values are a starting point — see the verification step below, adjust if the measured result says otherwise.)

### 5. Verify — this is not optional, the whole point of doing this as one task

Use Playwright at `devices['iPhone 13']` dimensions (390×844), a puzzle with a **realistic short title** (not a long test-only one — a long title changes how much room `controlsRow` needs and would give a misleadingly bad reading). Confirm, and report the actual numbers in the Implementation notes:

1. **Measure the resulting grid cell size** (`.grid`'s computed `width` divided by 15). Report the number. If it's meaningfully below ~24px, that's worth flagging even if nothing is "broken" — say so plainly rather than silently shipping a cramped result.
2. Confirm the default keyboard view has exactly 3 rows, row lengths 10/9/7 (plus the two wide utility keys on row 3), and every letter key text matches standard QWERTY with nothing reordered.
3. Tap "TR", confirm all 6 Turkish letters appear plus "ABC"; tap one, confirm it fills the active cell and the keyboard reverts to the standard layout automatically.
4. Confirm order top-to-bottom is: compact controls row (timer only) → grid → clue bar (with working, borderless, hover-only prev/next arrows) → keyboard.
5. Confirm desktop (e.g. 1280×800) is **completely unchanged** from its current appearance — full title/solver-name/Solve-it-button still show, no keyboard, no clue-bar arrows, `inputMode` unset.
6. Confirm typing (via the custom keyboard), backspace, and finishing a puzzle (results/leaderboard screen) all still work correctly on mobile.

Scope: `CrosswordPlayer.tsx`, `styles.css`, `src/lib/useIsMobile.ts` (new file).

**Implementation notes:** Also hide ACROSS/DOWN via `.layout.layoutSolver > .solverCluePanel { display: none }` and force `grid-template-columns: 1fr` on mobile (same specificity fix as T040) — without that the 3-column desktop grid still wins and the new stack can't fit. Layout height uses `calc(100dvh - 88px)` with compact chrome. Keyboard keys tightened to 38px tall after first measure. **iPhone 13 (390×844) measure:** grid ~320×320 → **cell ≈ 21.3px** (below the ~24px flag). That's a **width** limit on a 390px viewport (page padding + 15 columns), not leftover vertical space — `gridSlot` was ~500px tall while the square grid only needed 320. Desktop 1280 check: 3 columns, panels visible, no keyboard, no clue-bar arrows. `inputMode="none"` still needs a real-device check for native-keyboard suppression.

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

