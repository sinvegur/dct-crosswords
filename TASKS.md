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

## T015 — [TODO] Migrate puzzle storage to Supabase + draft/publish support

**Prerequisite — do this first, before writing any code:** ask the user to confirm they've run `supabase/002_add_draft_status.sql` in their Supabase project's SQL Editor (adds a `status` column to `puzzles` and splits read access so drafts are only visible to the authenticated creator, published puzzles are public). Don't start until confirmed.

**Why this is one task despite touching several files**: these pieces only work together — async Supabase storage, slug generation, and the draft/publish UI are all part of the same change, not separate concerns. That's expected scope, not scope creep. What *would* be scope creep: touching anything not needed to make draft/publish actually work end to end (e.g. don't touch `CrosswordPlayer.tsx`, don't touch unrelated styling).

**1. Update `Puzzle15` (`src/crossword/types.ts`)**: add `slug: string` and `status: 'draft' | 'published'` fields.

**2. Rewrite `src/lib/storage.ts` to call Supabase instead of `localStorage`**, using the `supabase` client from `src/lib/supabaseClient.ts`. Functions become **async** (return Promises) — this is a real API shape change, not a drop-in:
   - `listPuzzles()`: `select` all columns from `puzzles`, ordered by most-recently-updated/created first.
   - `getPuzzle(id)`: `select` a single row by `id`.
   - `savePuzzle(puzzle)`: **insert** if the puzzle has no real `id` yet (new puzzle — let Postgres generate the `uuid` via `default gen_random_uuid()`, don't client-generate an id like the old `puzzle-${Date.now()}` scheme did), **update** if it already has an `id` (editing an existing puzzle). Include `status` in the write.
   - `deletePuzzle(id)`: `delete` by `id`.
   - **Slug generation**: when a puzzle is saved for the first time (no `id`/`slug` yet), generate a URL-safe slug from the title — lowercase, kebab-case, and transliterate Turkish characters to ASCII (ç→c, ğ→g, ı→i, ö→o, ş→s, ü→u, İ→i) so the slug is clean in a URL. Handle collisions (e.g. append a short random suffix, or check-and-retry) since `slug` is `unique not null` in the schema. Once a puzzle has a slug, keep it stable across future saves/edits (including the draft→published transition) — regenerating it later would break any link already shared.

**3. Update `App.tsx` for async data loading.** The current `useState<Puzzle15[]>(() => listPuzzles())` lazy-init pattern won't work with an async call. Needs a real loading state, e.g.:
   ```tsx
   const [puzzles, setPuzzles] = useState<Puzzle15[]>([]);
   const [loading, setLoading] = useState(true);
   const refresh = () => { listPuzzles().then(setPuzzles).catch(...); };
   useEffect(() => { setLoading(true); listPuzzles().then(setPuzzles).catch(...).finally(() => setLoading(false)); }, []);
   ```
   Show a simple loading state on the puzzle list while fetching (reuse `.emptyState`/`.subtle` styling, don't invent a new pattern). Handle save/delete failures with at least a visible error message — don't fail silently. `savePuzzle`/`deletePuzzle` call sites need to handle the returned Promise (await it, then refresh/navigate) instead of assuming synchronous completion.

**4. `PuzzleDesigner.tsx` — split Save into two buttons:**
   - **"Save draft"** — always enabled, no completeness requirement (remove the current `canSave`-based disabling for this button specifically). Saves with `status: 'draft'`.
   - **"Publish"** — only enabled when the existing completeness checks pass (today's `canSave` logic: title present, every entry filled, every clue written) — reuse that logic unchanged, just as the gate for this specific button now instead of the single old Save button. Saves with `status: 'published'`.
   - If editing a puzzle that's *already* published, it's reasonable to just show a single "Save changes" button instead of both (no real need to "re-draft" something already live) — your call on this specific detail, but keep the two-button split for new/draft puzzles as specified.

**5. `PlayPage` in `App.tsx` — fix the temporary slug workaround from T012.** It currently matches `:slug` against puzzle `id` as a placeholder (noted in a comment as temporary). Now that real slugs exist, match against the actual `slug` field instead.

**6. Dashboard (`HomePage` in `App.tsx`) — show status per puzzle.** Add a small badge/label next to each puzzle's title indicating "Draft" vs "Published" (reuse existing small-text/pill styling patterns already in the app, e.g. something in the spirit of `.subtle` or a small colored label — don't invent a whole new visual language for one badge).

Scope: `src/crossword/types.ts`, `src/lib/storage.ts`, `src/App.tsx`, `src/crossword/PuzzleDesigner.tsx`. Don't touch `CrosswordPlayer.tsx` or the Supabase auth/login code from T013 — unrelated to this change.

---

