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

## T014 — [READY FOR REVIEW] Structurally prevent number/letter overlap (T009's chip fix wasn't sufficient)

Screenshot: a cell showing "25" with an `İ` below it — the number visually overlaps the letter's dot. T009 added a background chip behind `.cellNumber` hoping it would always cover the letter's ink underneath, but that only works if the chip is guaranteed bigger than whatever the letter can render into that corner — and it isn't. This matters more here than in a typical crossword app: **most Turkish uppercase diacritics sit above the letter** (İ's dot, Ğ's breve, Ö/Ü's dieresis), exactly where the corner number lives, so this isn't a one-off glyph edge case, it's systemic to this app's alphabet.

**Why "make the chip bigger" isn't the real fix**: any padding/chip-size number is a guess tuned against whichever glyphs happen to get tested — a genuinely sustainable fix doesn't depend on guessing font metrics per glyph at all.

**Required approach — reserve real layout space, don't just paint over a guessed danger zone:**

Give `.cell input` (`src/styles.css`) a `padding-top` sized to comfortably clear the corner number's actual rendered height (number height + a little breathing room — reference real values, e.g. current `.cellNumber` font-size/line-height/inset, don't guess a round number). This shifts the letter's entire rendering box down within the cell, so the letter's ink — including any diacritic above it — starts *below* the number's row by construction, not by chance. This is standard crossword typography, not a compromise: real crossword grids visually center the letter within the space *below* the corner number, not the full square. Confirm `.cell input` has `box-sizing: border-box` (add if missing) so the added padding doesn't change the input's overall size, just where its content sits within it.

Keep T009's background chip on `.cellNumber` too — harmless, and a reasonable second line of defense — but the padding-based reservation is what actually guarantees no overlap, not the chip.

**Verify specifically against the failure case and the systemic pattern, not just a couple of letters:** test `İ`, `Ğ`, `Ö`, `Ş`, `Ü` (the letters whose diacritics sit at the top) in cells numbered with both single and double-digit numbers (e.g. "1" and "25"), at a couple of different window widths/cell sizes. No ink from the letter (including its diacritic) should ever visually reach the number's chip.

Scope: `.cell input` in `src/styles.css` only (plus confirming/adding `box-sizing: border-box` there if not already present).

**Implementation notes:** `.cell input` now has `box-sizing: border-box` and `padding-top: 18px` (from `.cellNumber` top `3px` + `11px×1.15` line-height ≈ `15.65px`, plus breathing room). T009 chip kept. Checked İ/Ğ/Ö/Ş/Ü with numbers `1` and `25` at ~48/40/32px cells — letter ink stays below the number row.

**Rejected — wrong approach, revert `padding-top` entirely.** The user's feedback: crossword cells are squares with the letter truly centered in the square — that's non-negotiable, not a style preference. `padding-top` visually shifts the letter's optical center downward within the cell; even though the cell's own border stays a geometric square, the letter no longer reads as centered in it, which breaks the classic crossword look this app is explicitly going for. **Revert `padding-top: 18px`** (the `box-sizing: border-box` addition can stay, it's harmless/good practice, just not doing anything useful without the padding).

**New required approach — no layout shifting, tune size/footprint instead, verify empirically:**

Real constraint to work within: the letter must stay truly centered in the square cell at all times. That means a mathematically airtight guarantee against every possible glyph isn't achievable here (there will always be some theoretical diacritic height that could reach the corner) — the goal is a combination that holds up in actual testing against this app's real alphabet, not a formal proof.

1. **Shrink `.cellNumber`'s footprint** — smaller font-size than the current `11px` (try ~9-10px), tucked as tightly into the literal corner as still looks intentional (reduce the `top`/`left` inset a bit from T009's `3px`/`4px`). Smaller number = smaller collision target.
2. **Modestly reduce the letter's `font-size`** from the current `28px` — small tuning (try somewhere in the `24-26px` range), not a big step down. This isn't walking back T007's "letters should dominate the cell" goal, it's a minor adjustment in service of a hard constraint (no overlap) that takes priority — the letter should still read as large/bold/NYT-style, just not at the exact max that was pushing into the corner.
3. Keep T009's background chip on `.cellNumber` as a safety net.
4. **Verify empirically against the worst realistic case**, since that's the actual bar here (not a mathematical proof): `İ` specifically (the originally reported failure) plus `Ğ`, `Ö`, `Ş`, `Ü`, paired with a **double-digit number** (worst case for chip size, e.g. "25" as originally reported) at the **smallest realistic cell size** (narrow browser window / a denser template like `easy-fill`). Confirm the letter stays visually centered in the square (no perceptible shift) and no diacritic ink touches the number's chip in any of these combinations. If some combination still grazes, tune size down slightly further and re-check — this is a "verify it actually holds," not "implement and assume."

**Implementation notes (revision):** Reverted `padding-top` entirely (kept `box-sizing: border-box`). Letter `font-size` `28→24px`; `.cellNumber` `11→9px`, inset `3/4→2/2`, tighter chip padding. Letters stay optically centered. Checked `İ/Ğ/Ö/Ş/Ü` + `25` at ~44/40/34px cells — number sits clear of diacritics with chip as backup.

---

## T013 — [READY FOR REVIEW] Supabase client + creator auth gate

**Scope of this task — plumbing and auth only, not the puzzle data migration yet (that's a separate follow-up task once this lands):**

1. Add `@supabase/supabase-js`. Create `src/lib/supabaseClient.ts` exporting a configured client, reading `import.meta.env.VITE_SUPABASE_URL` and `import.meta.env.VITE_SUPABASE_ANON_KEY` (Vite's convention — env vars exposed to client code must be prefixed `VITE_`). Throw a clear error at startup if either is missing, rather than failing silently later.
2. Add a simple creator login: an email/password form (Supabase Auth `signInWithPassword`), a way to sign out, and session persistence (Supabase's client handles this by default via localStorage — confirm it's on). Since there's only ever one creator account in this Supabase project, gating just needs "is there an active session," not checking a specific user ID.
3. Gate the `/design` and `/design/:id` routes (from T012) behind having an active session — redirect to a login screen/form if not authenticated. The `/` (puzzle list) and `/p/:slug` (play) routes stay public, no auth required.
4. Don't migrate `storage.ts`'s actual puzzle CRUD to Supabase yet — that's the next task once this auth/plumbing layer is confirmed working. `localStorage` stays as the data source for now.

Scope: new `src/lib/supabaseClient.ts`, a new login component, routing guard changes in `App.tsx`, `package.json`/lockfile.

**Implementation notes:** Added `AuthProvider` / `RequireAuth` / `CreatorLogin` in `src/components/CreatorLogin.tsx`, `/login` route, Sign out in nav when session exists. Default Supabase client persists session in localStorage. Minimal `.loginForm` styles in `styles.css` so the form is usable. Puzzle CRUD still localStorage. Confirm schema.sql was run and the creator Auth user exists before testing sign-in.

**Implementation notes (revision):** Centered login card via `.loginPanel` (`max-width: 420px`, `margin: 40px auto 0`). Post-login always goes to `/` (removed `from` return-path). Sign out awaits `signOut()` then `navigate('/login')`.

**Implementation notes (revision 2):** `/` wrapped in `RequireAuth` (only `/p/:slug` stays public). Puzzles / New puzzle / Sign out nav shown only when `session` is set — logo remains for everyone.
