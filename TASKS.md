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

## T012 — [READY FOR REVIEW] Add URL routing (react-router-dom)

Starting a backend migration (Supabase — see T013, blocked behind this one). First prerequisite: the app currently has **no URL routing at all** — `App.tsx` is one screen switching between `home`/`design`/`play` via a `useState<Mode>`, so there's no way to represent "a link to puzzle X" as a real, shareable URL. That's required for the stated goal (solvers access puzzles via dedicated links).

**1.** Add `react-router-dom`. Set up routes replacing the current `mode` state:
   - `/` — the puzzles list (currently `mode === 'home'`)
   - `/design` — new puzzle (currently the "New puzzle" flow via `StartingGridModal` → designer)
   - `/design/:id` — edit an existing puzzle (currently `mode === 'design'` with `editPuzzle` set)
   - `/p/:slug` — play a puzzle by its shareable slug (currently `mode === 'play'` with `playId` — note the switch from an internal `id`/`playId` lookup to a public-facing `slug`; puzzles don't have a `slug` field yet, that's part of T013's data model, not this task — for now just add the route shape and pass `slug` as a param, wiring it to actual data comes in T013)

**2.** Preserve all existing behavior/navigation exactly (Puzzles list, New puzzle modal flow, Edit, Delete, Play, Cancel/Save from the designer) — this is a routing restructure, not a feature or behavior change. `localStorage`-backed `src/lib/storage.ts` stays as-is for this task; don't touch it yet.

**3.** Keep the diff to `App.tsx`, `package.json`/lockfile, and routing wiring only. Don't touch `CrosswordPlayer.tsx`, `PuzzleDesigner.tsx`, or `storage.ts` internals beyond what's needed to receive params instead of local state (e.g. reading `:id`/`:slug` from the route instead of a `playId`/`editPuzzle` state variable).

**Implementation notes:** `BrowserRouter` + routes live in `App.tsx` (`/`, `/design`, `/design/:id`, `/p/:slug`). Play temporarily resolves `:slug` against puzzle `id` so existing localStorage puzzles still open until T013 adds a real slug. New-puzzle flow still uses `StartingGridModal` on `/design`.

---

## T013 — [BLOCKED, do not start yet — will flip to TODO once T012 is done] Supabase client + creator auth gate

**Blocked on T012.** Also blocked on the user having (a) added `.env` with `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, and (b) run `supabase/schema.sql` in their Supabase project's SQL Editor, and (c) manually created the one creator account in Supabase Auth — ask if unsure these are done before starting.

**Scope of this task — plumbing and auth only, not the puzzle data migration yet (that's a separate follow-up task once this lands):**

1. Add `@supabase/supabase-js`. Create `src/lib/supabaseClient.ts` exporting a configured client, reading `import.meta.env.VITE_SUPABASE_URL` and `import.meta.env.VITE_SUPABASE_ANON_KEY` (Vite's convention — env vars exposed to client code must be prefixed `VITE_`). Throw a clear error at startup if either is missing, rather than failing silently later.
2. Add a simple creator login: an email/password form (Supabase Auth `signInWithPassword`), a way to sign out, and session persistence (Supabase's client handles this by default via localStorage — confirm it's on). Since there's only ever one creator account in this Supabase project, gating just needs "is there an active session," not checking a specific user ID.
3. Gate the `/design` and `/design/:id` routes (from T012) behind having an active session — redirect to a login screen/form if not authenticated. The `/` (puzzle list) and `/p/:slug` (play) routes stay public, no auth required.
4. Don't migrate `storage.ts`'s actual puzzle CRUD to Supabase yet — that's the next task once this auth/plumbing layer is confirmed working. `localStorage` stays as the data source for now.

Scope: new `src/lib/supabaseClient.ts`, a new login component, routing guard changes in `App.tsx`, `package.json`/lockfile.
