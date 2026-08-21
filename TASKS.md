# Cursor Tasks

Task queue for handing work from Claude (planning/review) to Cursor (implementation) on dct-crosswords.

## Protocol

- **Cursor**: when told "new task for you, check TASKS.md", find the topmost entry marked `[TODO]`. Implement only that task — don't start a second `[TODO]` in the same pass. When finished, change its status to `[READY FOR REVIEW]` and add a short "Implementation notes" line under it if anything deviated from the instructions.
- **Claude**: reviews `[READY FOR REVIEW]` entries against the actual diff. Marks `[DONE]`, **commits immediately** (one task = one commit, task ID in the subject line), and deletes the entry (git history keeps the record — no need to accumulate finished tasks here). Or marks `[CHANGES REQUESTED]` and appends specific notes for Cursor to address, leaving status as `[CHANGES REQUESTED]` until fixed.
- IDs are sequential (T001, T002, ...) and never reused, even if a task is deleted.
- Only one task should be active (`[TODO]` at the top) at a time, to keep diffs small and reviewable.
- **Only make the changes the task explicitly describes.** If you notice something else worth fixing while working, do NOT implement it — note it in "Implementation notes" as a suggestion and let Claude turn it into its own task. This has been raised twice already (T001 favicon/port, T002 layout rework) — a third occurrence means diffs will be rejected without detailed review.

---

## T008 — [READY FOR REVIEW] Legible grid corner numbers, kept consistent with the sidebar clue numbers

**Do this after T007 lands** (this task uses `--font-grid`, which T007 introduces).

`.cellNumber` (the small corner index number in each grid cell, `src/styles.css`) has the same underlying problem T007 just fixed for the main letters: it's set in `var(--font-display)` (Fraunces, a stylized serif) at a tiny `font-size: 10px`, which is genuinely hard to read at that size with that font's character.

**1. Fix the grid corner numbers:**
- Change `.cellNumber` from `font-family: var(--font-display)` to `font-family: var(--font-grid)` (the same legible font T007 sets up for the main letters).
- Increase `font-size` from `10px` — modestly, not to the same scale as the main letter (it's a secondary label in the corner of an already-small cell, it can't compete with the main letter for space), but enough to actually read clearly. Try somewhere in the 11-12px range as a starting point and adjust by eye; make sure it doesn't visually collide with the main letter in the smallest across/down entries.

**2. Sidebar consistency — yes, this should change too:** `.clueNum` (in the Across/Down clue lists, both `CrosswordPlayer.tsx` and `PuzzleDesigner.tsx`) shows the exact same number as the corresponding grid cell — it's the same piece of information in two places. It's currently also on `var(--font-display)`. Change it to `var(--font-grid)` as well, so a "14" in the grid and the "14" next to its clue in the sidebar are visually the same typeface — right now they'd be inconsistent (one legible sans, one stylized serif) if only the grid were fixed. Leave `.clueNum`'s font-size as-is unless it looks obviously wrong once the font-family changes (it's not been reported as too small, only the grid corner numbers were).

**3. Scope:** just these two CSS rules (`.cellNumber`, `.clueNum`) in `src/styles.css`. Don't touch anything else.

**Implementation notes:** `.cellNumber` → `--font-grid` at `11px`; `.clueNum` → `--font-grid` (size unchanged). Done in the same pass as the T007 Next font fix so numbering uses the Turkish-complete face.

## T007 — [READY FOR REVIEW] Crystal-clear grid letters, decoupled from the branding fonts

Grid-cell letters currently use `var(--font-display)` (Fraunces, a characterful/stylized serif) at `font-size: 15px; font-weight: 700;` in `.cell input` (`src/styles.css`). This is the wrong font for this one spot: like NYT's crossword grid, the letters players actually read/type need to be maximally legible, even though the rest of the app (headings, clues) is intentionally stylish — grid letters should be treated as a deliberate exception, not matched to the branding fonts.

**1. New dedicated font, not `--font-display`:**
- Add a new CSS variable `--font-grid` in `:root`, separate from `--font-display` and `--font-body`.
- Use **Atkinson Hyperlegible** (free Google Font, self-host via `@fontsource` the same way Fraunces/Literata are already loaded — add `@fontsource/atkinson-hyperlegible` and import it in `src/main.tsx`). This isn't an arbitrary "clean sans" pick — it's specifically designed (by the Braille Institute) to maximize differentiation between commonly-confused characters, which matters a lot here (see the Turkish check below).
- Set `.cell input { font-family: var(--font-grid); }`, replacing the current `var(--font-display)` (also remove the now-irrelevant `font-variation-settings: 'opsz' 40` line, that was a Fraunces-specific optical-size axis).

**2. Make letters dominate the cell, NYT-style:**
- Increase `font-size` substantially from the current static `15px` — size it so the letter visually fills most of the cell (NYT-style grids are much bigger relative to cell size than what's here now). Use a static px value sized against the current cell dimensions (grid cells are ~40-45px at typical widths after the T005 fix) — don't reintroduce container-query/`clamp()` responsive sizing, that's a separate concern for a different task.
- Keep `font-weight: 700` (bold) or increase if Atkinson Hyperlegible's bold weight looks better at this size — your call, optimize for legibility.
- `.cellNumber` (the small corner index number) can stay on its current font — this task is only about the main answer letters.

**3. Turkish-specific verification (not optional, not generic "check the font supports Turkish"):**
Grid letters are always uppercase (`toLocaleUpperCase('tr-TR')` in both `CrosswordPlayer.tsx` and `PuzzleDesigner.tsx`), so the specific pair that matters is **İ (dotted capital I, U+0130) vs I (dotless capital I, U+0049)** — both appear in Turkish words and must be visually distinguishable at a glance in the grid. Type both into grid cells and visually confirm Atkinson Hyperlegible renders them as clearly different glyphs (not just technically different code points that happen to look identical at this weight/size). Also spot-check `ÇĞÖŞÜ` render correctly (no missing-glyph boxes).

**4. Scope:** `.cell input` is a single shared CSS rule used by both `PuzzleDesigner.tsx` and `CrosswordPlayer.tsx` — one CSS change covers both surfaces, no need to touch either component file. Keep the diff contained to `src/styles.css`, `src/main.tsx` (new font import), and `package.json`/lockfile (new dependency).

**Implementation notes:** Swapped to `@fontsource/atkinson-hyperlegible-next` / `'Atkinson Hyperlegible Next'`. Cmap + `document.fonts.check` confirm İ/I/Ç/Ğ/Ö/Ş/Ü all in-font (İ no longer falls back). Side-by-side İ vs I match the same face/weight; dotted vs undotted remains clear.

**Review notes (Claude):** This caveat is a real blocker, not a nice-to-have follow-up — I independently verified it by extracting the actual `.woff2` files and inspecting their glyph tables with `fonttools` (not just trusting the report): confirmed `@fontsource/atkinson-hyperlegible` genuinely has no U+0130 (İ) glyph in either its `latin` or `latin-ext` subset. İ is a common, essential letter in Turkish — falling back to an undefined system font for just that one letter means it'll render at a different weight/style than every other letter in the grid, inconsistently across different users' machines.

**Fix, already verified by me:** swap to **`@fontsource/atkinson-hyperlegible-next`** (the Braille Institute's updated release with expanded language support) instead of `@fontsource/atkinson-hyperlegible`. I downloaded it into a scratch directory and confirmed with `fonttools` that its `latin-ext` subset *does* contain U+0130 (İ, glyph name `Idotaccent`), and combined with its `latin` subset (I, ı, Ç, Ö, Ü) every Turkish character needed is covered. Same font family and design philosophy, just the newer variant.

1. Replace the `@fontsource/atkinson-hyperlegible` dependency and its import in `src/main.tsx` with `@fontsource/atkinson-hyperlegible-next` (same weight/CSS import pattern, just the package name and font-family string change to `'Atkinson Hyperlegible Next'`).
2. Update `--font-grid` to reference `'Atkinson Hyperlegible Next'`.
3. Re-verify: type İ into a grid cell and confirm it now renders in the same typeface/weight as every other letter (not falling back to a different font) — compare it side by side with a plain `I` in another cell to confirm both look like they belong to the same font, not just that they're "distinguishable by accident."

