# Tasks

Task queue for dct-crosswords. Claude implements directly (Cursor was dropped on 2026-10-17).

## Protocol

- Work the topmost `[TODO]` entry. One task = one branch = one PR, with the task ID in the commit subject.
- The PR that completes a task also deletes its entry here — git history keeps the record.
- A task is done when its PR is merged to `main`, not when the branch exists. Check with `gh pr list` / `git merge-base --is-ancestor` rather than trusting this file.
- IDs are sequential (T001, T002, ...) and never reused, even if a task is deleted.
- Only make the changes the task describes. Anything else worth fixing becomes its own task.

---

## T046 — [BLOCKED, pending user confirmation] Mobile letter-clipping bug — likely fixed, awaiting real-device check

**Waiting on a real-device check — do not pick this up.** Claude handled this directly (real-device-only bug, needed live iteration). Leaving a short record here rather than deleting, in case it resurfaces.

After the diagnostic notes originally left here, the investigation continued directly (not via Cursor) through several more rounds. Two things turned out to matter beyond what's listed below:
- The bug also affects 9x9 (midi), not just 15x15 — just proportionally less severe. That reframed it from "something about 15x15's specific cell size" to "a roughly fixed amount of space being eaten in every cell regardless of size."
- That pointed at the real likely cause: iOS Safari applies native default styling/padding to text inputs unless a page explicitly opts out (`-webkit-appearance: none`), which was missing from `.cell input` entirely. Fixed, plus removed the grid's remaining CSS container-query dependency (container-type/cqw/cqi) in favor of directly JS-measuring cell size via `ResizeObserver` and applying plain pixel values — since the bug never reproduced in any automated testing, container queries behaving unexpectedly on the specific real device was a live suspect worth eliminating regardless.

**Status: fix shipped, not yet confirmed on the user's actual device** ("will check later"). If it comes back after confirmation, or a new report references this, read the full commit history on `src/styles.css` and `src/crossword/CrosswordPlayer.tsx` from today (2026-08-25) before re-diagnosing — a lot of ground was already covered.

---
