# Cursor Tasks

Task queue for handing work from Claude (planning/review) to Cursor (implementation) on dct-crosswords.

## Protocol

- **Cursor**: when told "new task for you, check TASKS.md", find the topmost entry marked `[TODO]`. Implement only that task — don't start a second `[TODO]` in the same pass. When finished, change its status to `[READY FOR REVIEW]` and add a short "Implementation notes" line under it if anything deviated from the instructions.
- **Claude**: reviews `[READY FOR REVIEW]` entries against the actual diff. Marks `[DONE]`, **commits immediately** (one task = one commit, task ID in the subject line), and deletes the entry (git history keeps the record — no need to accumulate finished tasks here). Or marks `[CHANGES REQUESTED]` and appends specific notes for Cursor to address, leaving status as `[CHANGES REQUESTED]` until fixed.
- IDs are sequential (T001, T002, ...) and never reused, even if a task is deleted.
- Only one task should be active (`[TODO]` at the top) at a time, to keep diffs small and reviewable.
- **Only make the changes the task explicitly describes.** If you notice something else worth fixing while working, do NOT implement it — note it in "Implementation notes" as a suggestion and let Claude turn it into its own task. This has been raised twice already (T001 favicon/port, T002 layout rework) — a third occurrence means diffs will be rejected without detailed review.

---

## T056 — [READY FOR REVIEW] Unpublish a published puzzle, and show its status in the builder

Two related pieces. Once a puzzle is published there's currently no way back — only Delete, which destroys it. Unpublishing returns it to draft so it can be fixed and republished later.

### 1. Unpublish action in the puzzle list

`src/App.tsx` — each row already has Edit / Delete / Play / Leaderboard icon buttons and a Published/Draft badge. Add an **Unpublish** button to that group, using `EyeOff` from `lucide-react` and the existing `toolbarControl` styling with `ROW_ACTION_ICON_SIZE`.

- Only enabled when `p.status === 'published'`; disabled otherwise, with a title explaining why (match how Play and Leaderboard already handle this)
- `aria-label` and `title`: "Unpublish"
- Place it **before** Delete, so the destructive action stays last

### 2. Confirmation modal

New `src/components/UnpublishConfirmModal.tsx`, modelled closely on the existing `DeletePuzzleConfirmModal` — same structure, same styling, same open/onClose/onConfirm shape. Do not invent a new modal pattern.

Copy should state the actual consequence plainly:

> **Unpublish "{title}"?**
> The shared link will stop working — anyone opening it will see "Puzzle not found". The puzzle moves back to Draft, and you can publish it again later. Solve times already recorded are kept.

Buttons: **Cancel** / **Unpublish**.

Every sentence there is verifiable, so don't soften or embellish it:
- The public link genuinely breaks — RLS policy `public read published puzzles` restricts anonymous reads to `status = 'published'`, so `getPuzzleBySlug` returns nothing and the solver shows "Puzzle not found"
- Existing `attempts` rows are untouched, so leaderboard times survive a republish

Note for accuracy, but **don't put this in the UI**: while DCT is signed in, the `authenticated read all puzzles` policy means *he* can still open the link himself. It's dead for solvers, which is what the copy says.

### 3. Storage

Add a focused function to `src/lib/storage.ts` rather than round-tripping the whole puzzle through `savePuzzle`:

```ts
export async function setPuzzleStatus(id: string, status: PuzzleStatus): Promise<void>
```

It updates only the `status` column. After it resolves, refresh the list so the badge and button states update.

### 4. Status in the builder

The list shows a Published/Draft badge, but `PuzzleDesigner.tsx` shows nothing — you can't tell whether the puzzle you're editing is live. Add the same badge next to the "Design" title in the `controlsRow`, reusing the existing `.puzzleStatus` / `.isPublished` / `.isDraft` classes so it looks identical to the list.

It reflects the puzzle's **saved** status (`initial?.status`), not unsaved edits. A published puzzle with unsaved changes still reads "Published" — the unsaved-changes guard already covers that case separately.

**Out of scope:** any "show other puzzles after solving" work. That's the next task.

**Testing:**
- Publish a puzzle, copy its link, confirm it opens in a private window
- Unpublish it; the modal appears and names the right puzzle
- After confirming, the row badge flips to Draft, the Unpublish button disables, and Play/Leaderboard/copy-link disable too
- Reopen that link in a **private window** (not signed in) — it must show "Puzzle not found"
- Republish it: the link works again and the old leaderboard times are still there
- Cancelling the modal changes nothing
- The builder shows the correct Published/Draft badge, matching the list

**Implementation notes:** New (never-saved) puzzles show Draft, since `initial` is undefined. Unpublish sits between Edit and Delete.

---

## T046 — [BLOCKED, pending user confirmation] Mobile letter-clipping bug — likely fixed, awaiting real-device check

**Not a Cursor task right now — do not pick this up.** Claude handled this directly (real-device-only bug, needed live iteration). Leaving a short record here rather than deleting, in case it resurfaces.

After the diagnostic notes originally left here, the investigation continued directly (not via Cursor) through several more rounds. Two things turned out to matter beyond what's listed below:
- The bug also affects 9x9 (midi), not just 15x15 — just proportionally less severe. That reframed it from "something about 15x15's specific cell size" to "a roughly fixed amount of space being eaten in every cell regardless of size."
- That pointed at the real likely cause: iOS Safari applies native default styling/padding to text inputs unless a page explicitly opts out (`-webkit-appearance: none`), which was missing from `.cell input` entirely. Fixed, plus removed the grid's remaining CSS container-query dependency (container-type/cqw/cqi) in favor of directly JS-measuring cell size via `ResizeObserver` and applying plain pixel values — since the bug never reproduced in any automated testing, container queries behaving unexpectedly on the specific real device was a live suspect worth eliminating regardless.

**Status: fix shipped, not yet confirmed on the user's actual device** ("will check later"). If it comes back after confirmation, or a new report references this, read the full commit history on `src/styles.css` and `src/crossword/CrosswordPlayer.tsx` from today (2026-08-25) before re-diagnosing — a lot of ground was already covered.
