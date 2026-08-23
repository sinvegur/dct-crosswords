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

## T020 — [TODO] Fix intermittent Backspace/entry-tracking bug in the designer grid

**Reported as "sometimes the back button works, sometimes not" while editing an existing puzzle in `PuzzleDesigner.tsx`.** Diagnosed by carefully reading the code (not live-reproduced — `/design` is auth-gated and I don't have/want creator credentials, so verify this yourself interactively, not just by re-reading the diff, given the "sometimes" nature makes it easy to think it's fixed when it isn't).

**Bug #1 — definite, in the empty-cell Backspace handler** (`onKeyDown`, ~line 665-680): `if (pos <= 0) return;` treats two different situations identically:
- `pos === 0`: the cursor is genuinely at the first cell of the active entry — correctly a no-op.
- `pos === -1`: `activeEntry.cells` doesn't contain `cellIndex` **at all** — meaning the tracked active entry doesn't actually match the cell you're typing in. This is a state-tracking bug, not a boundary condition, and right now it's silently swallowed exactly like the correct case, making it look like "backspace just doesn't work" with no indication why.

Fix: handle `pos === -1` distinctly from `pos === 0` — at minimum, don't silently no-op on a mismatch; ideally, resolve the *correct* entry for `cellIndex` fresh (from `computed.acrossEntryNumberByCell`/`downEntryNumberByCell`, not from the possibly-stale `activeEntry`/`activeDirection` state) before deciding whether there's a previous cell to move to.

**Bug #2 — likely root cause of the intermittency:** `onCellChange` calls `pickCell(cellIndex)` (which updates `activeEntryNumber`/`activeDirection` via `setState`) and then, in the *same synchronous call*, reads `activeEntry` — a `useMemo` derived from that same state — via `moveInEntry`. State updates don't apply mid-function; `activeEntry` at that point still reflects whatever it was *before* this `pickCell` call, not after. Whether that's already correct depends on whether a prior `onFocus` already happened to sync it first — which is exactly the kind of thing that works most of the time and silently breaks specifically at cell/word transitions (clicking into a fresh cell/word, especially at across/down intersections).

Fix: don't rely on `activeEntry` (state-derived, one render behind) immediately after calling `pickCell` in the same handler. Resolve the entry to move within directly from `cellIndex` and the direction at the moment of the call (same fresh-lookup approach as bug #1's fix), not from state that was just asked to update but hasn't yet.

**Apply the same fix pattern to `CrosswordPlayer.tsx`'s equivalent logic too** (`handlePickCell`/`onCellInputChange`/the Backspace handler there) — it has the same shape (calls `handlePickCell` then reads `activeEntry` derived from state), so if this bug is real here, it's likely latent there too, even if not yet reported.

**Verify interactively, not just by reading the diff**: in the designer, click directly into a cell that sits at an across/down intersection (don't click the entry list first, click the grid cell itself), type a few letters, then Backspace repeatedly — including right at a moment where you switch which word you're editing. Do this multiple times in different sequences, since the bug is intermittent — one successful pass doesn't confirm the fix. Do the same in the player view if you have a way to reach it.

Scope: `PuzzleDesigner.tsx`, `CrosswordPlayer.tsx`.

---

## T018 — [MERGE PENDING, do not re-implement] Solver flow: name capture, live timer, leaderboard submission and results screen

**Already implemented and reviewed on branch `t018-solver-leaderboard` — this text is just showing as pending on `main` because that branch (and `t019-t018-fixes`, built on top of it) haven't been merged yet. Do not start this from scratch. If you're reading this as your next task, stop and tell the user to merge the pending PRs first.**

**No new SQL needed for this one** — the `attempts` table and its RLS policies (public read, public insert) were already set up in the original schema and haven't changed. This is entirely app-code work: `src/lib/storage.ts`, `App.tsx`'s `PlayPage`, and `CrosswordPlayer.tsx`.

**Context on what already exists, so this isn't re-derived from scratch:** `/p/:slug` (in `App.tsx`) already publicly loads a *published* puzzle via `getPuzzleBySlug` — that's the "shareable link" mechanism, already done, don't touch it. `CrosswordPlayer.tsx` already tracks `startAtMs` (set on the first letter typed) and computes `elapsedMs` once solving completes — that trigger-on-first-keystroke behavior is correct and should stay. What's missing: a live-updating visible clock while solving (currently elapsed time is only computed once, at the end), a name-capture step before solving starts, and actually submitting the result anywhere — right now a completed puzzle just shows "Solved! Time: Xs" and nothing happens with that data.

**1. Solver name capture, before the grid becomes interactive:**
- On visiting `/p/:slug`, if there's no solver name remembered yet (check `localStorage`, e.g. key `dct-crosswords:solverName`), show a lightweight name-entry step in place of the grid — puzzle title visible, a text input, a "Start" button. Once a name is given, store it in `localStorage` (so returning solvers on this browser aren't asked again) and reveal the actual puzzle.
- If a name is already remembered, skip straight to the puzzle — but give some small, easy way to change it (e.g. a "Not you? Change name" link) rather than locking it in forever.

**2. Live ticking timer during solving**, in `CrosswordPlayer.tsx`: once `startAtMs` is set, update a visible `MM:SS`-style display every second (a `setInterval`, cleared when solved or on unmount) — this is the actual "NYT style" part, a running clock the solver can see the whole time, not just a number revealed at the end.

**3. On solving, submit the result.** Add a `submitAttempt({ puzzleId, solverName, elapsedMs })` function to `storage.ts` — inserts into `attempts` (`puzzle_id`, `solver_name`, `elapsed_ms`). Call it once, right when a puzzle is solved (guard against double-submission if `finishIfSolved`-style logic could otherwise fire more than once).

**4. Results screen after solving**, showing: the solver's own time, and the puzzle's leaderboard — add a `getLeaderboard(puzzleId)` function to `storage.ts` (query `attempts` where `puzzle_id` matches, ordered by `elapsed_ms` ascending, reasonable limit e.g. top 10). Show the top times, and make sure the solver can tell where *their* result landed even if it's outside the visible top N (e.g. a "you: Xs" line, or highlight their row if it's within the shown list). Exact visual treatment is your call — keep it simple and reuse existing panel/list styling patterns rather than inventing a new visual language.

**5. Mobile is explicitly out of scope for this task** — a dedicated mobile-optimization pass on this whole view is coming right after, once this exists to actually test on a phone. Don't skip basic usability, but don't over-invest in responsive polish here either.

**Verify**: solve a published puzzle as a fresh (no remembered name) visitor — confirm the name gate appears, the clock visibly ticks while solving, completing it submits an attempt, and the results screen shows your time plus the leaderboard. Solve the *same* puzzle again as a "different" solver (clear the `localStorage` key or use a private/incognito window) and confirm both attempts show up correctly ordered on that puzzle's leaderboard.

Scope: `src/lib/storage.ts`, `src/App.tsx` (`PlayPage`), `src/crossword/CrosswordPlayer.tsx`, `styles.css` as needed for the new name-gate/results views.

