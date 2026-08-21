# Cursor Tasks

Task queue for handing work from Claude (planning/review) to Cursor (implementation) on dct-crosswords.

## Protocol

- **Cursor**: when told "new task for you, check TASKS.md", find the topmost entry marked `[TODO]`. Implement only that task — don't start a second `[TODO]` in the same pass. When finished, change its status to `[READY FOR REVIEW]` and add a short "Implementation notes" line under it if anything deviated from the instructions.
- **Claude**: reviews `[READY FOR REVIEW]` entries against the actual diff. Marks `[DONE]` and deletes the entry (git history keeps the record — no need to accumulate finished tasks here), or marks `[CHANGES REQUESTED]` and appends specific notes for Cursor to address, leaving status as `[CHANGES REQUESTED]` until fixed.
- IDs are sequential (T001, T002, ...) and never reused, even if a task is deleted.
- Only one task should be active (`[TODO]` at the top) at a time, to keep diffs small and reviewable.
- **Only make the changes the task explicitly describes.** If you notice something else worth fixing while working, do NOT implement it — note it in "Implementation notes" as a suggestion and let Claude turn it into its own task. This has been raised twice already (T001 favicon/port, T002 layout rework) — a third occurrence means diffs will be rejected without detailed review.

---

## T006 — [TODO] Consistent icon-based design language for the editor toolbar

The `.editorToolbar` row in `src/crossword/PuzzleDesigner.tsx` currently mixes three unrelated widget styles for what are conceptually similar "grid setting" controls: Letter/Block mode is two separate tab-like `.btn` elements, "180° block symmetry" is a pill switch (`.symmetryToggle`/`.symmetrySwitch`), and Shuffle (once T004 lands) is a plain `.btn`. Redesign these three as one consistent, icon-led control family.

**Icon library:** add `lucide-react` as a dependency and use its icons — don't hand-roll SVGs, don't mix in a second icon set.

**Labeling:** every control keeps an icon **and** a short visible text label (not icon-only/tooltip-only) — some of these aren't self-explanatory from an icon alone (180° rotational symmetry especially has no obvious single icon), so label text stays.

**Design (implement all three, contained to the toolbar area — don't restyle unrelated buttons elsewhere in the app in this pass):**

1. **Letter / Block mode** — keep as a two-option segmented control (mutually exclusive selection is the correct interaction, don't change that), but restyle so it reads as one joined pill/segmented group rather than two separate buttons sitting side by side: shared outer border/border-radius, a divider or background-fill between the two segments, only the active segment gets the filled/dark treatment (same visual language `.btnPrimary` already uses for "selected"). Suggested icons: `PencilLine` (or similar) for Letter mode, `Grid2x2` (or similar) for Block mode — pick whatever reads clearly at small size, use your judgment on the exact icon name within Lucide's set.
2. **180° block symmetry** — replace the pill switch with a toggle **button** matching the same visual family as the mode segments (an icon + label button that shows a clear pressed/active state when on — e.g. filled/dark background when active, outlined when inactive — consistent with how the mode segment shows "selected"). Suggested icon: `FlipHorizontal2` or `RotateCcw`-style icon that reads as "mirrored/symmetric," whichever fits best. Keep it a single click-to-toggle control (not a drag switch) — use `aria-pressed` for accessibility since it's no longer a native checkbox-style switch.
3. **Shuffle** — icon + label button in the same visual family as the others (same height, border-radius, padding, icon size as the mode segments and symmetry toggle) so all three read as one row of consistent controls. Suggested icon: `Shuffle`.

**Consistency requirements across all three:**
- Same height, icon size, icon-to-label gap, border-radius, and font (label uses the existing body font, not the display font) across all three controls.
- Same "active/on" visual treatment reused across mode-selection and the symmetry toggle (don't invent two different ways of showing "this is currently selected/on").
- Preserve all existing behavior exactly (mode switching, symmetry toggling and its interaction with block-click mirroring, shuffle's confirm-before-destroy flow from T004) — this is a visual/structural restyle only, not a behavior change.

Keep the diff contained to `PuzzleDesigner.tsx`, `styles.css` (new/changed rules for these controls only), and `package.json`/lockfile for the new dependency. Don't touch other buttons or components in this pass.
