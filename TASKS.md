# Cursor Tasks

Task queue for handing work from Claude (planning/review) to Cursor (implementation) on dct-crosswords.

## Protocol

- **Cursor**: when told "new task for you, check TASKS.md", find the topmost entry marked `[TODO]`. Implement only that task — don't start a second `[TODO]` in the same pass. When finished, change its status to `[READY FOR REVIEW]` and add a short "Implementation notes" line under it if anything deviated from the instructions.
- **Claude**: reviews `[READY FOR REVIEW]` entries against the actual diff. Marks `[DONE]`, **commits immediately** (one task = one commit, task ID in the subject line), and deletes the entry (git history keeps the record — no need to accumulate finished tasks here). Or marks `[CHANGES REQUESTED]` and appends specific notes for Cursor to address, leaving status as `[CHANGES REQUESTED]` until fixed.
- IDs are sequential (T001, T002, ...) and never reused, even if a task is deleted.
- Only one task should be active (`[TODO]` at the top) at a time, to keep diffs small and reviewable.
- **Only make the changes the task explicitly describes.** If you notice something else worth fixing while working, do NOT implement it — note it in "Implementation notes" as a suggestion and let Claude turn it into its own task. This has been raised twice already (T001 favicon/port, T002 layout rework) — a third occurrence means diffs will be rejected without detailed review.

---

## T043 — [TODO] Add hover states to buttons; make disabled Play/Leaderboard icons read as clearly non-interactive

**Two related cosmetic fixes, both `styles.css` only, no JSX changes needed.**

**Problem 1 — no hover feedback anywhere.** `.btn` (used for the top nav's Puzzles / New puzzle / Sign out, and most buttons in `PuzzleDesigner.tsx`) and `.toolbarControl` (used for the puzzle list's Edit/Delete/Play/Leaderboard icons in `App.tsx`, and the designer's mode/symmetry toggle buttons) currently have no `:hover` rule at all — confirmed by checking `styles.css`, neither class has one, while several other interactive elements in the app already do (`.modalClose:hover`, `.copyPuzzleLink:hover`, `.templateCard:hover` — all use a light `#f3f4f6` background tint on hover). The page feels static as a result. Add matching hover treatment to both classes, reusing that same established `#f3f4f6` tint pattern rather than inventing a new visual language:

```css
.btn:hover:not(:disabled) {
  background: #f3f4f6;
}

.btnPrimary:hover:not(:disabled) {
  background: #1f2937;
  border-color: #1f2937;
}

.toolbarControl:hover:not(:disabled) {
  background: #f3f4f6;
}

.toolbarControl.isActive:hover:not(:disabled) {
  background: #1f2937;
  border-color: #1f2937;
}
```

**Note the `:not(:disabled)` guard is required, not optional** — without it, hovering a disabled icon (see Problem 2) would light up with the same hover background as an enabled one, actively contradicting the fix below. `.btnPrimary` and `.toolbarControl.isActive` need their own explicit hover rules (a darker shade of their already-dark active background, `#1f2937`) because they're already using a dark background/border — the plain light-tint hover would look wrong applied on top of that, and CSS specificity between `.toolbarControl:hover` and `.toolbarControl.isActive` isn't reliably predictable without an explicit rule for the combination.

**Problem 2 — disabled Play/Leaderboard icons don't read as clearly non-interactive.** In `App.tsx`'s puzzle list, Play and Leaderboard (`.toolbarControl`, both with a real `disabled` attribute when `p.status !== 'published'`) currently only drop to `opacity: 0.6` while keeping the same white background and bordered-button look as the enabled Edit/Delete icons next to them — confirmed live, this reads as "slightly faded button" rather than "not available," easy to miss at a glance. Make the disabled state visually flatten instead of just fade, so it reads as an inert icon rather than a washed-out button:

```css
.toolbarControl:disabled {
  opacity: 0.35;
  cursor: not-allowed;
  border-color: transparent;
  background: transparent;
  color: var(--muted);
}
```

This replaces the existing `.toolbarControl:disabled` rule (currently just `opacity: 0.6; cursor: not-allowed;`) — don't leave both, the new rule supersedes it. Leave `.btn:disabled` (opacity 0.6) untouched — the user's complaint was specifically about the row-icon buttons, not `.btn`.

**Verify:** on the puzzle list, hover over Edit/Delete/Play/Leaderboard on a **published** puzzle — all four should show the light hover tint. On a **draft** puzzle, Play and Leaderboard should look visually flat/borderless and clearly muted (no white box, no border) both at rest and on hover — hovering them should NOT show any hover tint, since they're disabled. Hover the top nav's Puzzles/New puzzle/Sign out buttons and confirm the tint appears, including on whichever one is currently `.btnPrimary` (the active page) — that one should darken slightly rather than getting the light tint. Open the puzzle designer and hover its buttons (Save, Publish, the Letter/Block mode toggles, Symmetry toggle, etc.) and confirm hover feedback there too, including the active-mode toggle button showing the darker hover variant instead of the light one.

Scope: `styles.css` only.

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

