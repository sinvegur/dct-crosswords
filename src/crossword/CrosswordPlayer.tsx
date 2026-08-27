import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { CheckCheck, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Puzzle } from './types';
import { type Direction, type Entry, computeEntries } from './engine';
import {
  getAttemptRank,
  getLeaderboard,
  submitAttempt,
  type LeaderboardEntry,
} from '@/lib/storage';
import { useIsMobile } from '@/lib/useIsMobile';

const SOLVER_NAME_KEY = 'dct-crosswords:solverName';

const QWERTY_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
] as const;

const TURKISH_EXTRA_LETTERS = ['Ç', 'Ğ', 'İ', 'Ö', 'Ş', 'Ü'] as const;

function idxOf(size: number, row: number, col: number) {
  return row * size + col;
}

function posOf(size: number, index: number) {
  return { row: Math.floor(index / size), col: index % size };
}

function keyOf(row: number, col: number) {
  return `${row},${col}`;
}

function clueKey(direction: Direction, number: number) {
  return `${direction}:${number}`;
}

function normalizeLetter(raw: string) {
  const trimmed = raw.replace(/\s+/g, '');
  if (!trimmed) return '';
  const ch = trimmed[trimmed.length - 1];
  // A physical (EN) keyboard can only ever send plain ASCII "i"/"I" - there's
  // no way to type the Turkish dotless "ı" or dotted "İ" directly, same as
  // every other Turkish-specific letter. Turkish-locale uppercasing turns
  // lowercase "i" into "İ" (correct for real Turkish text, but not what
  // someone pressing the plain "I" key expects). Map straight to dotless "I"
  // instead; typing the actual "İ" stays only reachable via the on-screen
  // keyboard's dedicated key, consistent with Ç/Ğ/Ö/Ş/Ü.
  if (ch === 'i' || ch === 'I') return 'I';
  return ch.toLocaleUpperCase('tr-TR');
}

export function formatElapsedMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export { SOLVER_NAME_KEY };

function SolverTimer({
  startAtMs,
  solved,
  elapsedMs,
}: {
  startAtMs: number;
  solved: boolean;
  elapsedMs: number | null;
}) {
  // Isolated so the once-a-second tick only re-renders this small display,
  // not the whole CrosswordPlayer (and its full cell grid) every second.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    if (solved) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [startAtMs, solved]);

  const liveElapsedMs = !solved ? now - startAtMs : elapsedMs;

  return (
    <div className="solverTimer" aria-live="polite">
      {formatElapsedMs(liveElapsedMs ?? now - startAtMs)}
    </div>
  );
}

// Returns a function with a stable identity that always calls the latest
// `fn` passed in. Lets event handlers stay fresh (correct closures) while
// letting memoized children (GridCell) treat the handler prop as unchanged
// across renders, instead of busting memoization every render.
function useStableCallback<Args extends unknown[]>(fn: (...args: Args) => void) {
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });
  return useCallback((...args: Args) => {
    fnRef.current(...args);
  }, []);
}

type GridCellProps = {
  cellIndex: number;
  value: string;
  numAtCell: number | null;
  showNumber: boolean;
  isActiveCell: boolean;
  isCurrentCell: boolean;
  isLocked: boolean;
  isWrong: boolean;
  isMobile: boolean;
  fontSizePx: number | null;
  inputsRef: React.RefObject<Array<HTMLInputElement | null>>;
  onMouseDownCell: (cellIndex: number) => void;
  onPickCell: (cellIndex: number, opts?: { fromClick?: boolean }) => void;
  onFocusCell: (cellIndex: number) => void;
  onChangeCell: (cellIndex: number, raw: string) => void;
  onKeyDownCell: (cellIndex: number, e: React.KeyboardEvent<HTMLInputElement>) => void;
};

const GridCell = memo(function GridCell({
  cellIndex,
  value,
  numAtCell,
  showNumber,
  isActiveCell,
  isCurrentCell,
  isLocked,
  isWrong,
  isMobile,
  fontSizePx,
  inputsRef,
  onMouseDownCell,
  onPickCell,
  onFocusCell,
  onChangeCell,
  onKeyDownCell,
}: GridCellProps) {
  return (
    <div
      className={`cell ${isActiveCell ? 'cellActive' : ''} ${isCurrentCell ? 'cellCurrent' : ''} ${
        isLocked ? 'cellLocked' : ''
      } ${isWrong ? 'cellWrong' : ''}`}
      onMouseDown={() => onMouseDownCell(cellIndex)}
      onClick={() => onPickCell(cellIndex, { fromClick: true })}
    >
      {showNumber && numAtCell != null ? <div className="cellNumber">{numAtCell}</div> : null}
      <input
        ref={(el) => {
          inputsRef.current[cellIndex] = el;
        }}
        value={value}
        maxLength={1}
        inputMode={isMobile ? 'none' : undefined}
        autoCorrect="off"
        spellCheck={false}
        style={fontSizePx != null ? { fontSize: `${fontSizePx}px` } : undefined}
        onFocus={() => onFocusCell(cellIndex)}
        onChange={(e) => onChangeCell(cellIndex, e.target.value)}
        onKeyDown={(e) => onKeyDownCell(cellIndex, e)}
      />
    </div>
  );
});

function progressKey(puzzleId: string) {
  return `dct-crosswords:progress:${puzzleId}`;
}

function loadProgress(
  puzzleId: string,
  cellCount: number,
): { filled: string[]; startAtMs: number; locked: number[] } | null {
  try {
    const raw = localStorage.getItem(progressKey(puzzleId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { filled?: unknown; startAtMs?: unknown; locked?: unknown };
    if (!Array.isArray(parsed.filled) || parsed.filled.length !== cellCount) return null;
    if (!parsed.filled.every((c) => typeof c === 'string')) return null;
    if (
      typeof parsed.startAtMs !== 'number' ||
      !Number.isFinite(parsed.startAtMs) ||
      parsed.startAtMs <= 0
    ) {
      return null;
    }
    let locked: number[] = [];
    if (Array.isArray(parsed.locked)) {
      const valid = parsed.locked.every(
        (i) => typeof i === 'number' && Number.isInteger(i) && i >= 0 && i < cellCount,
      );
      if (valid) locked = parsed.locked as number[];
    }
    return { filled: parsed.filled as string[], startAtMs: parsed.startAtMs, locked };
  } catch {
    return null;
  }
}

type Props = {
  puzzle: Puzzle;
  solverName: string;
};

export function CrosswordPlayer({ puzzle, solverName }: Props) {
  const isMobile = useIsMobile();
  const size = puzzle.size;
  const cellCount = size * size;
  const computed = useMemo(() => computeEntries(puzzle.solutionGrid), [puzzle.id]);
  const solutionChars = useMemo(() => puzzle.solutionGrid.flatMap((r) => r.split('')), [puzzle.solutionGrid]);

  const blockSet = useMemo(() => {
    const set = new Set<number>();
    for (let i = 0; i < solutionChars.length; i++) {
      if (solutionChars[i] === '#') set.add(i);
    }
    return set;
  }, [solutionChars]);

  const [filled, setFilled] = useState<string[]>(() => {
    const saved = loadProgress(puzzle.id, cellCount);
    return saved?.filled ?? Array.from({ length: cellCount }, () => '');
  });

  const submittedRef = useRef(false);

  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const clueRowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const clickStartedOnActiveCellRef = useRef(false);
  const skipNextFocusPickRef = useRef(false);

  // Mobile grid sizing is measured directly in JS (ResizeObserver) rather
  // than relying on CSS container queries (container-type/cqw/cqi) - can't
  // confirm those behave identically on every real device, and a plain
  // pixel measurement has no such ambiguity. Desktop keeps its existing
  // cqmin-based CSS sizing, which hasn't shown this problem.
  const gridSlotRef = useRef<HTMLDivElement | null>(null);
  const [gridSlotPx, setGridSlotPx] = useState<number | null>(null);

  useEffect(() => {
    if (!isMobile) return;
    const el = gridSlotRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setGridSlotPx(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [isMobile]);

  const cellPx = isMobile && gridSlotPx ? (gridSlotPx - 24) / size : null;
  const fontSizePx = isMobile && cellPx ? Math.max(16, cellPx * 0.6) : null;
  const showCellNumbers = !isMobile || cellPx == null || cellPx >= 30;

  const [activeDirection, setActiveDirection] = useState<Direction>('across');
  const [activeEntryNumber, setActiveEntryNumber] = useState<number | null>(null);
  const [activeCellIndex, setActiveCellIndex] = useState<number | null>(null);

  const activeEntry = useMemo(() => {
    if (activeEntryNumber == null) return undefined;
    return computed.entryByNumberDirection(activeDirection, activeEntryNumber);
  }, [computed, activeDirection, activeEntryNumber]);

  const activeEntryCellIndices = useMemo(() => {
    if (!activeEntry) return new Set<number>();
    return new Set(activeEntry.cells.map((c) => idxOf(size, c.row, c.col)));
  }, [activeEntry, size]);

  const [startAtMs, setStartAtMs] = useState(() => {
    const saved = loadProgress(puzzle.id, cellCount);
    return saved?.startAtMs ?? Date.now();
  });
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [solved, setSolved] = useState(false);
  const [resultsView, setResultsView] = useState<'leaderboard' | 'grid'>('leaderboard');
  const [lockedCells, setLockedCells] = useState<Set<number>>(() => {
    const saved = loadProgress(puzzle.id, cellCount);
    return new Set(saved?.locked ?? []);
  });
  const [wrongCells, setWrongCells] = useState<Set<number>>(new Set());

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [userRank, setUserRank] = useState<number | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [resultsLoading, setResultsLoading] = useState(false);

  const [bestTimeMs, setBestTimeMs] = useState<number | null>(null);
  const [showTurkishKeys, setShowTurkishKeys] = useState(false);

  useEffect(() => {
    const saved = loadProgress(puzzle.id, cellCount);
    const nextFilled = saved?.filled ?? Array.from({ length: cellCount }, () => '');
    setFilled(nextFilled);
    const firstAcross = computed.entriesAcross[0];
    if (firstAcross) {
      const entryIndices = firstAcross.cells.map((c) => idxOf(size, c.row, c.col));
      const targetCell = entryIndices.find((idx) => !nextFilled[idx]) ?? entryIndices[0]!;
      setActiveDirection('across');
      setActiveEntryNumber(firstAcross.number);
      setActiveCellIndex(targetCell);
      focusCell(targetCell);
    } else {
      setActiveDirection('across');
      setActiveEntryNumber(null);
      setActiveCellIndex(null);
    }
    setStartAtMs(saved?.startAtMs ?? Date.now());
    setLockedCells(new Set(saved?.locked ?? []));
    setWrongCells(new Set());
    setSolved(false);
    setResultsView('leaderboard');
    setElapsedMs(null);
    setLeaderboard([]);
    setUserRank(null);
    setAttemptId(null);
    setSubmitError(null);
    submittedRef.current = false;
  }, [puzzle.id, cellCount, computed, size]);

  // Re-select the focused cell's letter after every edit. The inputs are
  // maxLength=1, so once one holds a character an unselected caret sits
  // *after* it and the browser silently rejects the next keystroke.
  // focusCell selects on every move, which covered this while typing always
  // advanced - but on a word's last square the cursor now deliberately stays
  // put, so without this a second letter there would do nothing at all.
  useEffect(() => {
    const el = document.activeElement as HTMLInputElement | null;
    if (!el || el.tagName !== 'INPUT') return;
    if (!inputsRef.current.includes(el)) return;
    el.select();
  }, [filled]);

  useEffect(() => {
    if (solved) return;
    localStorage.setItem(
      progressKey(puzzle.id),
      JSON.stringify({ filled, startAtMs, locked: Array.from(lockedCells) }),
    );
  }, [filled, startAtMs, lockedCells, puzzle.id, solved]);

  useEffect(() => {
    const key = `dct-crosswords:bestTime:${puzzle.id}`;
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    setBestTimeMs(parsed);
  }, [puzzle.id]);

  useEffect(() => {
    if (activeEntryNumber == null) return;
    const el = clueRowRefs.current.get(clueKey(activeDirection, activeEntryNumber));
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeDirection, activeEntryNumber]);

  useEffect(() => {
    if (!solved || elapsedMs == null || submittedRef.current) return;
    submittedRef.current = true;

    let cancelled = false;
    setResultsLoading(true);
    setSubmitError(null);

    void (async () => {
      try {
        const id = await submitAttempt({
          puzzleId: puzzle.id,
          solverName,
          elapsedMs,
        });
        const [board, rank] = await Promise.all([
          getLeaderboard(puzzle.id),
          getAttemptRank(puzzle.id, elapsedMs),
        ]);
        if (cancelled) return;
        setAttemptId(id);
        setLeaderboard(board);
        setUserRank(rank);
      } catch (err) {
        if (cancelled) return;
        submittedRef.current = false;
        setSubmitError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setResultsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [solved, elapsedMs, puzzle.id, solverName]);

  const checkSolved = (nextFilled: string[]) => {
    for (let i = 0; i < solutionChars.length; i++) {
      if (blockSet.has(i)) continue;
      if (!nextFilled[i]) return false;
      if (nextFilled[i] !== solutionChars[i]) return false;
    }
    return true;
  };

  const focusCell = (cellIndex: number | null) => {
    if (cellIndex == null) return;
    const el = inputsRef.current[cellIndex];
    if (!el) return;
    skipNextFocusPickRef.current = true;
    el.focus();
    // Without this, a programmatic focus on a cell that already has a
    // letter leaves the cursor positioned to insert rather than replace -
    // with maxLength=1 already at capacity, the browser just rejects the
    // next keystroke instead of overwriting. Selecting the (0 or 1 char)
    // content means typing immediately replaces it, same as any normal
    // text input.
    el.select();
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  const handlePickCell = (cellIndex: number, opts?: { fromClick?: boolean }) => {
    if (blockSet.has(cellIndex)) return;
    const { row, col } = posOf(size, cellIndex);

    const acrossNum = computed.acrossEntryNumberByCell.get(keyOf(row, col));
    const downNum = computed.downEntryNumberByCell.get(keyOf(row, col));

    if (
      opts?.fromClick &&
      clickStartedOnActiveCellRef.current &&
      cellIndex === activeCellIndex
    ) {
      if (activeDirection === 'across' && downNum != null) {
        setActiveDirection('down');
        setActiveEntryNumber(downNum);
        setActiveCellIndex(cellIndex);
        return;
      }
      if (activeDirection === 'down' && acrossNum != null) {
        setActiveDirection('across');
        setActiveEntryNumber(acrossNum);
        setActiveCellIndex(cellIndex);
        return;
      }
    }

    if (activeDirection === 'across' && acrossNum != null) {
      setActiveEntryNumber(acrossNum);
    } else if (activeDirection === 'down' && downNum != null) {
      setActiveEntryNumber(downNum);
    } else if (acrossNum != null) {
      setActiveDirection('across');
      setActiveEntryNumber(acrossNum);
    } else if (downNum != null) {
      setActiveDirection('down');
      setActiveEntryNumber(downNum);
    } else {
      setActiveEntryNumber(null);
    }

    setActiveCellIndex(cellIndex);
  };

  const resolveEntryAtCell = (cellIndex: number, direction: Direction): Entry | undefined => {
    const { row, col } = posOf(size, cellIndex);
    const acrossNum = computed.acrossEntryNumberByCell.get(keyOf(row, col));
    const downNum = computed.downEntryNumberByCell.get(keyOf(row, col));

    let resolvedDirection = direction;
    let entryNumber: number | undefined;

    if (direction === 'across' && acrossNum != null) {
      entryNumber = acrossNum;
    } else if (direction === 'down' && downNum != null) {
      entryNumber = downNum;
    } else if (acrossNum != null) {
      resolvedDirection = 'across';
      entryNumber = acrossNum;
    } else if (downNum != null) {
      resolvedDirection = 'down';
      entryNumber = downNum;
    }

    if (entryNumber == null) return undefined;
    return computed.entryByNumberDirection(resolvedDirection, entryNumber);
  };

  const moveInResolvedEntry = (entry: Entry, from: number, delta: 1 | -1) => {
    const indices = entry.cells.map((c) => idxOf(size, c.row, c.col));
    const pos = indices.indexOf(from);
    if (pos === -1) return;

    let nextPos = pos + delta;
    // Skip over cells already filled (e.g. from crossing a solved entry in the
    // other direction) until an empty one, or the entry's end, is reached.
    while (nextPos >= 0 && nextPos < indices.length - 1 && filled[indices[nextPos]!]) {
      nextPos += delta;
    }

    const next = indices[nextPos];
    if (next == null) {
      // End of the entry: stay put. Typing on the last square overwrites it
      // in place rather than carrying the cursor into the next clue - moving
      // between entries is always deliberate (Tab, Space, arrows, click).
      return;
    }
    handlePickCell(next);
    focusCell(next);
    setActiveCellIndex(next);
  };

  // Plain one-step move within an entry: no skipping over filled cells, no
  // auto-jump to the next entry at the boundary. Used when overwriting a
  // cell that was already filled (correcting an answer), where the smarter
  // forward-progress behavior of moveInResolvedEntry would blow through the
  // rest of an already-fully-filled entry after a single keystroke.
  const moveOneWithinEntry = (entry: Entry, from: number, delta: 1 | -1) => {
    const indices = entry.cells.map((c) => idxOf(size, c.row, c.col));
    const pos = indices.indexOf(from);
    if (pos === -1) return;
    const next = indices[pos + delta];
    if (next == null) return;
    handlePickCell(next);
    focusCell(next);
    setActiveCellIndex(next);
  };

  const backspaceEmptyCell = (cellIndex: number) => {
    handlePickCell(cellIndex);
    let direction: Direction = activeDirection;
    let entry = resolveEntryAtCell(cellIndex, direction);
    if (!entry) return;
    direction = entry.direction;

    let indices = entry.cells.map((c) => idxOf(size, c.row, c.col));
    let pos = indices.indexOf(cellIndex);

    if (pos === -1) {
      direction = direction === 'across' ? 'down' : 'across';
      entry = resolveEntryAtCell(cellIndex, direction);
      if (!entry) return;
      direction = entry.direction;
      indices = entry.cells.map((c) => idxOf(size, c.row, c.col));
      pos = indices.indexOf(cellIndex);
      if (pos === -1) return;
      handlePickCell(cellIndex);
    }

    // Already at the entry's first square - stop here rather than jumping
    // into the previous clue.
    if (pos === 0) return;

    // Backspace stops at a wall rather than travelling: the start of the
    // entry, or a locked (checked-correct) square. It never crosses into
    // another clue and never skips over a locked square to find something
    // deletable further back.
    const prevPos = pos - 1;
    if (prevPos < 0) return;

    const prev = indices[prevPos]!;
    if (lockedCells.has(prev)) return;

    const nextFilled = filled.slice();
    nextFilled[prev] = '';
    setFilled(nextFilled);
    setWrongCells((w) => {
      if (!w.has(prev)) return w;
      const next = new Set(w);
      next.delete(prev);
      return next;
    });
    handlePickCell(prev);
    focusCell(prev);
    setActiveCellIndex(prev);
  };

  const focusEntry = (direction: Direction, entryNumber: number) => {
    const entry = computed.entryByNumberDirection(direction, entryNumber);
    if (!entry || solved) return;
    const entryIndices = entry.cells.map((c) => idxOf(size, c.row, c.col));
    const targetCell = entryIndices.find((idx) => !filled[idx]) ?? entryIndices[0]!;
    setActiveDirection(direction);
    setActiveEntryNumber(entryNumber);
    setActiveCellIndex(targetCell);
    focusCell(targetCell);
  };

  // Mobile hides the separate Across/Down clue lists (no room), so the
  // compact clue bar's tap-to-toggle-direction is the only way to switch
  // direction on a cell shared by both an across and a down entry, mirroring
  // the equivalent "tap the already-active cell" behavior on desktop.
  const toggleActiveDirection = () => {
    if (activeCellIndex == null || solved) return;
    const { row, col } = posOf(size, activeCellIndex);
    const acrossNum = computed.acrossEntryNumberByCell.get(keyOf(row, col));
    const downNum = computed.downEntryNumberByCell.get(keyOf(row, col));
    if (activeDirection === 'across' && downNum != null) {
      setActiveDirection('down');
      setActiveEntryNumber(downNum);
    } else if (activeDirection === 'down' && acrossNum != null) {
      setActiveDirection('across');
      setActiveEntryNumber(acrossNum);
    } else {
      return;
    }
    focusCell(activeCellIndex);
  };

  const moveByArrow = (direction: Direction, delta: 1 | -1) => {
    if (solved || activeCellIndex == null) return;
    const { row, col } = posOf(size, activeCellIndex);

    let r = row;
    let c = col;
    for (;;) {
      if (direction === 'across') c += delta;
      else r += delta;
      if (r < 0 || r >= size || c < 0 || c >= size) return;
      if (!blockSet.has(idxOf(size, r, c))) break;
    }

    const target = idxOf(size, r, c);
    const acrossNum = computed.acrossEntryNumberByCell.get(keyOf(r, c));
    const downNum = computed.downEntryNumberByCell.get(keyOf(r, c));
    const useDown = direction === 'down' ? downNum != null : downNum != null && acrossNum == null;

    setActiveDirection(useDown ? 'down' : 'across');
    setActiveEntryNumber(useDown ? (downNum ?? null) : (acrossNum ?? null));
    setActiveCellIndex(target);
    focusCell(target);
  };

  const isEntryFilled = (entry: Entry) =>
    entry.cells.every((c) => Boolean(filled[idxOf(size, c.row, c.col)]));

  const stepEntry = (delta: 1 | -1) => {
    const combined = [
      ...computed.entriesAcross.map((entry) => ({ direction: 'across' as const, entry })),
      ...computed.entriesDown.map((entry) => ({ direction: 'down' as const, entry })),
    ];
    if (combined.length === 0) return;

    const currentIdx =
      activeEntryNumber == null
        ? -1
        : combined.findIndex(
            (item) =>
              item.direction === activeDirection && item.entry.number === activeEntryNumber,
          );

    let nextIdx: number;
    if (currentIdx === -1) {
      nextIdx = delta === 1 ? 0 : combined.length - 1;
    } else {
      nextIdx = currentIdx + delta;
      if (nextIdx < 0) nextIdx = combined.length - 1;
      if (nextIdx >= combined.length) nextIdx = 0;
    }

    const fallbackIdx = nextIdx;

    for (let steps = 0; steps < combined.length; steps++) {
      const item = combined[nextIdx]!;
      if (!isEntryFilled(item.entry)) {
        focusEntry(item.direction, item.entry.number);
        return;
      }
      nextIdx += delta;
      if (nextIdx < 0) nextIdx = combined.length - 1;
      if (nextIdx >= combined.length) nextIdx = 0;
    }

    // Every entry is already filled in (grid complete but not "solved" -
    // some answers may be wrong). There's no unfilled entry to skip to, but
    // navigation shouldn't just stop - fall back to the plain next/previous
    // entry so the solver can keep moving and overwrite a wrong answer.
    // focusEntry already lands on an entry's first cell when it has no
    // empty cells left, so this naturally does the right thing here too.
    const fallback = combined[fallbackIdx]!;
    focusEntry(fallback.direction, fallback.entry.number);
  };

  const toggleDirectionForActiveCell = () => {
    if (activeCellIndex == null) return;
    const { row, col } = posOf(size, activeCellIndex);
    const acrossNum = computed.acrossEntryNumberByCell.get(keyOf(row, col));
    const downNum = computed.downEntryNumberByCell.get(keyOf(row, col));

    if (activeDirection === 'across') {
      if (downNum != null) {
        setActiveDirection('down');
        setActiveEntryNumber(downNum);
      }
      return;
    }

    if (acrossNum != null) {
      setActiveDirection('across');
      setActiveEntryNumber(acrossNum);
    }
  };

  const finishIfSolved = (nextFilled: string[]) => {
    if (solved) return;
    if (!checkSolved(nextFilled)) return;

    const elapsed = Date.now() - startAtMs;
    setSolved(true);
    setElapsedMs(elapsed);
    localStorage.removeItem(progressKey(puzzle.id));

    const key = `dct-crosswords:bestTime:${puzzle.id}`;
    const prevRaw = localStorage.getItem(key);
    const prev = prevRaw ? Number(prevRaw) : null;
    if (prev == null || !Number.isFinite(prev) || elapsed < prev) {
      localStorage.setItem(key, String(elapsed));
      setBestTimeMs(elapsed);
    }
  };

  const runCheck = () => {
    if (solved) return;
    const nextLocked = new Set(lockedCells);
    const nextWrong = new Set<number>();
    for (let i = 0; i < solutionChars.length; i++) {
      if (blockSet.has(i)) continue;
      const letter = filled[i];
      if (!letter) continue;
      if (letter === solutionChars[i]) {
        nextLocked.add(i);
      } else {
        nextWrong.add(i);
      }
    }
    setLockedCells(nextLocked);
    setWrongCells(nextWrong);
  };

  const solveInstantly = () => {
    const nextFilled = filled.slice();
    for (let i = 0; i < solutionChars.length; i++) {
      if (blockSet.has(i)) continue;
      nextFilled[i] = solutionChars[i]!;
    }
    setFilled(nextFilled);
    finishIfSolved(nextFilled);
  };

  const onCellInputChange = (cellIndex: number, raw: string) => {
    if (solved) return;
    if (blockSet.has(cellIndex)) return;
    if (lockedCells.has(cellIndex)) return;
    handlePickCell(cellIndex);

    const wasEmpty = !filled[cellIndex];
    const letter = normalizeLetter(raw);
    const next = filled.slice();

    if (!letter) {
      next[cellIndex] = '';
    } else {
      next[cellIndex] = letter;
    }

    setFilled(next);
    setWrongCells((prev) => {
      if (!prev.has(cellIndex)) return prev;
      const nextWrong = new Set(prev);
      nextWrong.delete(cellIndex);
      return nextWrong;
    });
    finishIfSolved(next);

    if (!letter) return;

    const entry = resolveEntryAtCell(cellIndex, activeDirection);
    if (!entry) return;

    // Skipping over already-filled cells (and auto-jumping to the next entry
    // once this one's full) only makes sense when typing forward through new
    // progress. If the cell just typed into was already filled, this is a
    // correction/review pass (e.g. the whole grid is filled but wrong) - in
    // that mode, jumping past other filled cells or out of the entry entirely
    // after a single keystroke is surprising, not helpful. Just move one cell
    // over instead.
    if (wasEmpty) {
      moveInResolvedEntry(entry, cellIndex, 1);
    } else {
      moveOneWithinEntry(entry, cellIndex, 1);
    }
  };

  const handleKeyboardBackspace = () => {
    if (activeCellIndex == null || solved) return;
    // Same as the physical-keyboard path: from a locked cell, walk back to
    // the nearest deletable one rather than doing nothing at all.
    if (lockedCells.has(activeCellIndex)) {
      backspaceEmptyCell(activeCellIndex);
      return;
    }
    if (filled[activeCellIndex]) {
      onCellInputChange(activeCellIndex, '');
    } else {
      backspaceEmptyCell(activeCellIndex);
    }
  };

  const handleKeyboardLetter = (letter: string) => {
    if (activeCellIndex == null || solved) return;
    onCellInputChange(activeCellIndex, letter);
  };

  const preventKeyboardFocusSteal = (e: { preventDefault: () => void }) => {
    e.preventDefault();
  };

  // Stable-identity versions of the per-cell handlers, so GridCell's
  // React.memo can actually skip re-rendering cells whose own props didn't
  // change, instead of every cell re-rendering on every keystroke.
  const stableMouseDownCell = useStableCallback((cellIndex: number) => {
    clickStartedOnActiveCellRef.current = activeCellIndex === cellIndex;
  });
  const stablePickCell = useStableCallback(
    (cellIndex: number, opts?: { fromClick?: boolean }) => {
      handlePickCell(cellIndex, opts);
    },
  );
  const stableFocusCell = useStableCallback((cellIndex: number) => {
    if (skipNextFocusPickRef.current) {
      skipNextFocusPickRef.current = false;
      return;
    }
    handlePickCell(cellIndex);
  });
  const stableChangeCell = useStableCallback((cellIndex: number, raw: string) => {
    onCellInputChange(cellIndex, raw);
  });
  const stableKeyDownCell = useStableCallback(
    (cellIndex: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        if (solved) return;
        stepEntry(e.shiftKey ? -1 : 1);
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (solved) return;
        moveByArrow('across', -1);
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (solved) return;
        moveByArrow('across', 1);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (solved) return;
        moveByArrow('down', -1);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (solved) return;
        moveByArrow('down', 1);
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        toggleDirectionForActiveCell();
        return;
      }
      if (e.key === 'Backspace') {
        if (lockedCells.has(cellIndex)) {
          // Don't just swallow the key: a locked cell can't be cleared, so
          // sitting here doing nothing leaves the cursor visibly stuck.
          // Fall back to the walk-back, which skips locked cells and lands
          // on the first one that can actually be deleted.
          e.preventDefault();
          backspaceEmptyCell(cellIndex);
          return;
        }
        if (filled[cellIndex]) {
          return;
        }
        e.preventDefault();
        backspaceEmptyCell(cellIndex);
        return;
      }
      if (e.key === 'Escape') {
        (e.target as HTMLInputElement).blur();
      }
    },
  );

  const userOnLeaderboard = attemptId != null && leaderboard.some((e) => e.id === attemptId);
  const showRankOutsideTop =
    userRank != null && leaderboard.length > 0 && !userOnLeaderboard;

  const activeClueText =
    activeEntry == null
      ? ''
      : activeDirection === 'across'
        ? (puzzle.clues.across[activeEntry.number] ?? '')
        : (puzzle.clues.down[activeEntry.number] ?? '');

  return (
    <div className="layout layoutSolver">
      <div className="panel solverCluePanel">
        <div className="panelHeader">Across</div>
        <div className="clues cluesScroll">
          {computed.entriesAcross.map((e) => {
            const isActive = activeDirection === 'across' && activeEntryNumber === e.number;
            const clue = puzzle.clues.across[e.number] ?? '';
            return (
              <div
                key={`across:${e.number}`}
                ref={(el) => {
                  const key = clueKey('across', e.number);
                  if (el) clueRowRefs.current.set(key, el);
                  else clueRowRefs.current.delete(key);
                }}
                className={`clueItem clueItemClickable ${isActive ? 'clueActive' : ''}`}
                onClick={() => focusEntry('across', e.number)}
              >
                <div className="clueNum">{e.number}</div>
                <div className="clueText">{clue}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel solverCluePanel">
        <div className="panelHeader">Down</div>
        <div className="clues cluesScroll">
          {bestTimeMs != null && !solved ? (
            <div className="directionHeader">
              <span className="hint">Best: {formatElapsedMs(bestTimeMs)}</span>
            </div>
          ) : null}
          {computed.entriesDown.map((e) => {
            const isActive = activeDirection === 'down' && activeEntryNumber === e.number;
            const clue = puzzle.clues.down[e.number] ?? '';
            return (
              <div
                key={`down:${e.number}`}
                ref={(el) => {
                  const key = clueKey('down', e.number);
                  if (el) clueRowRefs.current.set(key, el);
                  else clueRowRefs.current.delete(key);
                }}
                className={`clueItem clueItemClickable ${isActive ? 'clueActive' : ''}`}
                onClick={() => focusEntry('down', e.number)}
              >
                <div className="clueNum">{e.number}</div>
                <div className="clueText">{clue}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel solverGridPanel">
        <div className={`controlsRow ${isMobile ? 'controlsRowCompact' : ''}`}>
          {!isMobile ? (
            <div>
              <div className="title" style={{ fontSize: 16 }}>
                {puzzle.title}
              </div>
              <div className="subtle solverMeta">
                <span>
                  Solving as <strong>{solverName}</strong>
                </span>
              </div>
            </div>
          ) : (
            <>
              <img
                src="/dct_crosswords_transparent.png"
                alt="DCT Crosswords"
                className="controlsRowLogo"
              />
              <div className="title controlsRowCompactTitle" style={{ fontSize: 16 }}>
                {puzzle.title}
              </div>
            </>
          )}
          <div
            style={{
              marginLeft: 'auto',
              flexShrink: 0,
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'flex-end',
            }}
          >
            <SolverTimer startAtMs={startAtMs} solved={solved} elapsedMs={elapsedMs} />
            {!solved ? (
              isMobile ? (
                <button
                  type="button"
                  className="toolbarControl"
                  aria-label="Check puzzle"
                  title="Check puzzle"
                  onClick={runCheck}
                >
                  <CheckCheck size={16} aria-hidden />
                </button>
              ) : (
                <button type="button" className="btn" onClick={runCheck}>
                  Check
                </button>
              )
            ) : null}
            {!solved && !isMobile ? (
              <button type="button" className="btn" onClick={solveInstantly}>
                Solve it
              </button>
            ) : null}
          </div>
        </div>

        {solved ? (
          <>
            <div className="solverResultsHeader">
              <div className="title">Solved! 🎉</div>
              <div className="subtle">
                Your time: <strong>{elapsedMs != null ? formatElapsedMs(elapsedMs) : '—'}</strong>
              </div>
              <div
                className="toolbarSegment resultsViewSwitch"
                role="group"
                aria-label="Results view"
              >
                <button
                  type="button"
                  className={`toolbarControl ${resultsView === 'leaderboard' ? 'isActive' : ''}`}
                  aria-pressed={resultsView === 'leaderboard'}
                  onClick={() => setResultsView('leaderboard')}
                >
                  Leaderboard
                </button>
                <button
                  type="button"
                  className={`toolbarControl ${resultsView === 'grid' ? 'isActive' : ''}`}
                  aria-pressed={resultsView === 'grid'}
                  onClick={() => setResultsView('grid')}
                >
                  Puzzle
                </button>
              </div>
            </div>

            {resultsView === 'leaderboard' ? (
              <div className="solverResults">
                {submitError ? <p className="loginError">{submitError}</p> : null}

                <div className="panelHeader" style={{ borderTop: '1px solid var(--border)' }}>
                  Leaderboard
                </div>

                {resultsLoading ? (
                  <div className="emptyState">
                    <p className="subtle">Loading results…</p>
                  </div>
                ) : leaderboard.length === 0 ? (
                  <div className="emptyState">
                    <p className="subtle">No times yet — you&apos;re first!</p>
                  </div>
                ) : (
                  <ol className="leaderboardList">
                    {leaderboard.map((entry, index) => {
                      const isYou = entry.id === attemptId;
                      return (
                        <li
                          key={entry.id}
                          className={`leaderboardRow ${isYou ? 'leaderboardRowYou' : ''}`}
                        >
                          <span className="leaderboardRank">{index + 1}</span>
                          <span className="leaderboardName">
                            {entry.solverName}
                            {isYou ? ' (you)' : ''}
                          </span>
                          <span className="leaderboardTime">{formatElapsedMs(entry.elapsedMs)}</span>
                        </li>
                      );
                    })}
                  </ol>
                )}

                {showRankOutsideTop && elapsedMs != null ? (
                  <div className="leaderboardYouOutside subtle">
                    You: {formatElapsedMs(elapsedMs)} · Rank #{userRank}
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}

        {!solved || resultsView === 'grid' ? (
          <div className="gridWrap">
            {!solved ? (
            <div className="clueBar">
              <button
                type="button"
                className="clueBarNav"
                onClick={() => stepEntry(-1)}
                disabled={!activeEntry || solved}
                aria-label="Previous clue"
              >
                <ChevronLeft size={20} aria-hidden />
              </button>
              <div
                className="clueBarBody"
                onClick={activeEntry ? toggleActiveDirection : undefined}
                role={activeEntry ? 'button' : undefined}
                aria-label={activeEntry ? 'Switch direction' : undefined}
              >
                {activeEntry ? (
                  <>
                    <span className="clueBarLabel">
                      {activeEntry.number}
                      {activeDirection === 'across' ? 'A' : 'D'}
                    </span>
                    <span className="clueBarText">{activeClueText}</span>
                  </>
                ) : (
                  <span className="clueBarText clueBarPlaceholder">Select a clue to begin</span>
                )}
              </div>
              <button
                type="button"
                className="clueBarNav"
                onClick={() => stepEntry(1)}
                disabled={!activeEntry || solved}
                aria-label="Next clue"
              >
                <ChevronRight size={20} aria-hidden />
              </button>
            </div>
            ) : null}
            <div className="gridSlot" ref={gridSlotRef}>
              <div
                className="grid"
                tabIndex={0}
                style={
                  {
                    '--grid-size': size,
                    ...(isMobile && cellPx
                      ? {
                          width: `${cellPx * size}px`,
                          height: `${cellPx * size}px`,
                        }
                      : null),
                  } as CSSProperties
                }
                onKeyDown={(e) => {
                  if (e.code === 'Space') {
                    e.preventDefault();
                    toggleDirectionForActiveCell();
                  }
                }}
              >
                {Array.from({ length: size * size }, (_, cellIndex) => {
                  const { row, col } = posOf(size, cellIndex);
                  const char = solutionChars[cellIndex];
                  const numAtCell = computed.cellNumber[row][col];
                  if (char === '#') {
                    return <div key={cellIndex} className="cell block" />;
                  }

                  return (
                    <GridCell
                      key={cellIndex}
                      cellIndex={cellIndex}
                      value={filled[cellIndex] ?? ''}
                      numAtCell={numAtCell}
                      showNumber={showCellNumbers}
                      isActiveCell={activeEntryCellIndices.has(cellIndex)}
                      isCurrentCell={activeCellIndex === cellIndex}
                      isLocked={!solved && lockedCells.has(cellIndex)}
                      isWrong={!solved && wrongCells.has(cellIndex)}
                      isMobile={isMobile}
                      fontSizePx={fontSizePx}
                      inputsRef={inputsRef}
                      onMouseDownCell={stableMouseDownCell}
                      onPickCell={stablePickCell}
                      onFocusCell={stableFocusCell}
                      onChangeCell={stableChangeCell}
                      onKeyDownCell={stableKeyDownCell}
                    />
                  );
                })}
              </div>
            </div>
            {isMobile && !solved ? (
              <div className="solverKeyboard" role="group" aria-label="On-screen keyboard">
                {showTurkishKeys ? (
                  <div className="solverKeyboardRow">
                    {TURKISH_EXTRA_LETTERS.map((letter) => (
                      <button
                        key={letter}
                        type="button"
                        className="solverKey"
                        onMouseDown={preventKeyboardFocusSteal}
                        onClick={() => {
                          handleKeyboardLetter(letter);
                          setShowTurkishKeys(false);
                        }}
                      >
                        {letter}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="solverKey solverKeyWide"
                      aria-label="Back to letters"
                      onMouseDown={preventKeyboardFocusSteal}
                      onClick={() => setShowTurkishKeys(false)}
                    >
                      ABC
                    </button>
                  </div>
                ) : (
                  QWERTY_ROWS.map((row, rowIndex) => (
                    <div key={rowIndex} className="solverKeyboardRow">
                      {rowIndex === QWERTY_ROWS.length - 1 ? (
                        <button
                          type="button"
                          className="solverKey solverKeyWide"
                          aria-label="Turkish letters"
                          onMouseDown={preventKeyboardFocusSteal}
                          onClick={() => setShowTurkishKeys(true)}
                        >
                          TR
                        </button>
                      ) : null}
                      {row.map((letter) => (
                        <button
                          key={letter}
                          type="button"
                          className="solverKey"
                          onMouseDown={preventKeyboardFocusSteal}
                          onClick={() => handleKeyboardLetter(letter)}
                        >
                          {letter}
                        </button>
                      ))}
                      {rowIndex === QWERTY_ROWS.length - 1 ? (
                        <button
                          type="button"
                          className="solverKey solverKeyWide"
                          aria-label="Backspace"
                          onMouseDown={preventKeyboardFocusSteal}
                          onClick={handleKeyboardBackspace}
                        >
                          ⌫
                        </button>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
