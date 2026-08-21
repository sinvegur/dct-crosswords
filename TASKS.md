# Cursor Tasks

Task queue for handing work from Claude (planning/review) to Cursor (implementation) on dct-crosswords.

## Protocol

- **Cursor**: when told "new task for you, check TASKS.md", find the topmost entry marked `[TODO]`. Implement only that task — don't start a second `[TODO]` in the same pass. When finished, change its status to `[READY FOR REVIEW]` and add a short "Implementation notes" line under it if anything deviated from the instructions.
- **Claude**: reviews `[READY FOR REVIEW]` entries against the actual diff. Marks `[DONE]`, **commits immediately** (one task = one commit, task ID in the subject line), and deletes the entry (git history keeps the record — no need to accumulate finished tasks here). Or marks `[CHANGES REQUESTED]` and appends specific notes for Cursor to address, leaving status as `[CHANGES REQUESTED]` until fixed.
- IDs are sequential (T001, T002, ...) and never reused, even if a task is deleted.
- Only one task should be active (`[TODO]` at the top) at a time, to keep diffs small and reviewable.
- **Only make the changes the task explicitly describes.** If you notice something else worth fixing while working, do NOT implement it — note it in "Implementation notes" as a suggestion and let Claude turn it into its own task. This has been raised twice already (T001 favicon/port, T002 layout rework) — a third occurrence means diffs will be rejected without detailed review.

---

## T009 — [TODO] Guarantee clearance between the corner number and the main letter

Since T007 made grid letters much bigger (15px → 28px, to dominate the cell NYT-style), the corner number (`.cellNumber`, positioned `top: 2px; left: 3px`) has lost the clearance it used to have — tall/wide glyphs (e.g. `U`, or Turkish capitals with diacritics like `Ğ`/`Ş`/`Ü`) can now visually touch or merge with the number in the top-left corner.

**Goal: guarantee visual separation in every case**, not just nudge the numbers until today's example (`U` in a "10" cell) looks fine — the fix needs to hold for any letter/cell combination, not be tuned to one reported instance.

**Approach — two changes, both in `src/styles.css`, both apply automatically to `PuzzleDesigner.tsx` and `CrosswordPlayer.tsx` since they share these CSS rules:**

1. **Give `.cellNumber` a solid background chip**, not just repositioning it. Right now it's `z-index: 2` above the letter, but both are dark text on a transparent/white background with nothing breaking up the letter's ink where it passes near the corner — so even correctly-stacked, they can read as touching/merging. Add a small background (matching the cell's current background — needs to work correctly against both `--cell-bg` and `--cell-bg-active`, so use `background: inherit` or reference the same variable the parent `.cell`/`.cellActive` currently uses, whichever renders correctly in both states) with a little padding and a small border-radius, so the number always sits on its own visually distinct patch regardless of what the letter glyph is doing underneath.
2. **Increase the corner inset slightly** (`top`/`left`, currently `2px`/`3px`) — modest increase, enough to give a bit more breathing room now that letters are bigger, tuned by eye.

**Verify explicitly, not just the reported case:** check clearance with a range of glyphs in the top-left area of an entry — wide letters (`M`, `W`), tall Turkish capitals with diacritics (`Ğ`, `Ş`, `Ü`, `Ö`), and the originally-reported `U` — across a couple of different cell sizes (resize the browser window) to confirm it holds generally, not just at one window size.

Scope: `.cellNumber` (and its interaction with `.cell`/`.cellActive` background) in `src/styles.css` only.

