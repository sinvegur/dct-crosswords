# Cursor Tasks

Task queue for handing work from Claude (planning/review) to Cursor (implementation) on dct-crosswords.

## Protocol

- **Cursor**: when told "new task for you, check TASKS.md", find the topmost entry marked `[TODO]`. Implement only that task — don't start a second `[TODO]` in the same pass. When finished, change its status to `[READY FOR REVIEW]` and add a short "Implementation notes" line under it if anything deviated from the instructions.
- **Claude**: reviews `[READY FOR REVIEW]` entries against the actual diff. Marks `[DONE]`, **commits immediately** (one task = one commit, task ID in the subject line), and deletes the entry (git history keeps the record — no need to accumulate finished tasks here). Or marks `[CHANGES REQUESTED]` and appends specific notes for Cursor to address, leaving status as `[CHANGES REQUESTED]` until fixed.
- IDs are sequential (T001, T002, ...) and never reused, even if a task is deleted.
- Only one task should be active (`[TODO]` at the top) at a time, to keep diffs small and reviewable.
- **Only make the changes the task explicitly describes.** If you notice something else worth fixing while working, do NOT implement it — note it in "Implementation notes" as a suggestion and let Claude turn it into its own task. This has been raised twice already (T001 favicon/port, T002 layout rework) — a third occurrence means diffs will be rejected without detailed review.

---

## T046 — [TODO] Mobile 15x15 grid: letters render mostly clipped/hidden — needs real-device diagnosis, not another blind CSS guess

**Read this whole thing before touching any code — this task exists specifically because guessing at CSS fixes without real-device data hasn't worked, twice, and a third blind guess is not a good use of anyone's time.**

**Symptom, in the user's own words:** on a 15x15 puzzle on their iPhone (real Safari, not emulation), typed letters in grid cells render "mostly hidden behind white space" — only a small fragment of each letter is visible (e.g. typing "ASTIN" showed only a fraction of each letter: a diagonal sliver where "A" should be, a small curl for "S", a dot for "T", two dots for "I", a single bar for "N"). This reads as **severe clipping/overflow of an oversized glyph inside a small cell**, not a wrong-character bug — the user confirmed the underlying app state is correct (verified independently: typing the same letters in this session's own testing shows the right letters stored correctly), it's purely a rendering/sizing problem on their specific device. This does **not** happen on mini (5x5) or midi (9x9) puzzles, only 15x15, where cells are smallest (~21px at typical phone widths).

**What's already been tried and ruled out — do not re-attempt these without new evidence:**

1. **Font-loading/wrong-font hypothesis** — ruled out. Confirmed via Playwright + WebKit with the exact real webfont (`Atkinson Hyperlegible Next`, weight 700) loaded that letters render correctly and fully inside 21px cells at 16px font-size, including all Turkish diacritics (Ç, Ğ, İ, Ö, Ş, Ü tested individually, all render complete, no clipping).
2. **Reproducing the exact reported scenario** — ruled out as a logic bug. Built a test puzzle with a 5-letter entry ("ASTIN") in the same grid-size/cell-size configuration as reported and typed it via the app's own custom on-screen keyboard in Playwright/WebKit: renders perfectly, clean and fully visible. The bug does not reproduce in any browser-automation environment tried (Chromium or WebKit, various viewports).
3. **Descender/diacritic clipping** (an earlier, different bug that *was* real and fixed) — this was a genuine issue with Turkish cedillas/breves getting cut off at the cell's bottom edge, fixed via `line-height: 1` and adjusting the font-size clamp on `.cell input` in `styles.css`. Confirmed fixed via the WebKit test above. Not the same symptom as this task (that one was a small clipped diacritic tail; this one is most of the letter missing).
4. **iOS Safari auto-zoom-on-focus** (font-size < 16px triggers a disruptive page zoom) — this was real and is fixed (user confirmed: "zoom issue fixed"). Raised `.cell input`'s font-size floor from 12px to 16px specifically to stop this.
5. **iOS Safari's site-wide text-size auto-adjustment** (tied to the phone's own Accessibility → Text Size setting, can inflate rendered text beyond what CSS specifies) — added the standard opt-out (`-webkit-text-size-adjust: 100%` / `text-size-adjust: 100%` on `html, body`) as the most likely remaining explanation. **User reports this did not help ("nothing changed").**

**Hypotheses not yet tried — worth considering, in rough priority order:**

- **Stuck browser zoom state from an earlier session.** The auto-zoom-on-focus bug (see #4 above) was real and only recently fixed. If the user tested in a tab/PWA session that was already zoomed in from *before* that fix landed, Safari does not always reset zoom back to 100% on a soft refresh — it may need a full close-and-reopen (swipe the tab away entirely, not just navigate) or an explicit double-tap-to-reset. This would produce exactly this symptom (everything appearing zoomed in, showing only a fraction of each cell) despite the underlying CSS being correct. **Cheapest thing to rule out first** — ask the user to fully close Safari (not just refresh) and reopen the puzzle fresh, or test in a brand new private tab.
- **Real device inspection is the highest-value next step if the above doesn't explain it.** This bug has not reproduced in any automated testing (Chromium or WebKit) across this whole investigation — that strongly suggests it depends on real iOS Safari behavior or the user's specific device/OS settings in a way emulation can't capture. The correct tool for this is **Safari's remote Web Inspector**: connect the iPhone to a Mac via USB, enable Web Inspector on the iPhone (Settings → Safari → Advanced → Web Inspector), then on the Mac open Safari → Develop menu → [device name] → [page] to get a full live DevTools session against the *actual* broken page — computed styles, actual rendered font-size, actual cell dimensions, actual zoom level. This is the only way to get real data instead of another guess. If neither Claude nor Cursor has physical access to make this happen, the user is the only one who can drive it — say so plainly rather than proposing another speculative CSS change.
- Only after real data is available: consider whether `cqi`/`cqw` container-query units are resolving differently on real iOS Safari than in Playwright's WebKit build (a plausible but so-far-unconfirmed WebKit-version difference), or whether iOS Dynamic Type (a different mechanism from the text-size-adjust already tried) is inflating the `ui-sans-serif`/`system-ui` fallback in the font stack specifically.

**Do not** ship another speculative font-size/line-height/clamp() tweak without first getting real computed-style data from the device (via Web Inspector) or ruling out the stuck-zoom-state hypothesis. Two rounds of guessing have already gone out with high confidence and turned out not to fix it.

Relevant code: `.cell input` in `src/styles.css` (currently `font-size: clamp(16px, 50cqi, 90px); line-height: 1;`), the `html, body` `text-size-adjust` rule added most recently, and `src/crossword/CrosswordPlayer.tsx`'s grid cell rendering (`GridCell` component).

Scope: `src/styles.css` primarily; do not touch `CrosswordPlayer.tsx`'s interaction logic (typing, backspace, navigation) as part of this — that's all been separately verified working and is out of scope here.

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

