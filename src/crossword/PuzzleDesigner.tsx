import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link2, Redo2, Undo2, Unlink2 } from 'lucide-react';
import { UnlinkCluesConfirmModal } from '@/components/UnlinkCluesConfirmModal';
import { UnsavedChangesModal } from '@/components/UnsavedChangesModal';
import { mirrorPos, templateToEmptySolution, type Template } from '@/data/templates';
import { registerGuard, runGuarded, unregisterGuard } from '@/lib/navigationGuard';
import { SIZE_15, computeEntries, type Direction, type Entry } from './engine';
import {
  clueLinkKey,
  findClueLinkGroup,
  sanitizeClueLinks,
  type ClueLinkMember,
  type Puzzle,
} from './types';

const TOOLBAR_ICON_SIZE = 16;

function idxOf(size: number, row: number, col: number) {
  return row * size + col;
}

function posOf(size: number, index: number) {
  return { row: Math.floor(index / size), col: index % size };
}

function normalizeLetter(raw: string) {
  const trimmed = raw.replace(/\s+/g, '');
  if (!trimmed) return '';
  const ch = trimmed[trimmed.length - 1];
  // Deliberately NOT the solver's i/I -> dotless "I" rule. The solver has an
  // on-screen Turkish panel to reach "İ" with, so it can afford to make the
  // physical key unambiguous. The builder has no such panel - every letter
  // comes from the OS keyboard - so forcing dotless here made "İ" impossible
  // to put in a puzzle at all, and solvers typing it could never match.
  //
  // Plain Turkish-locale uppercasing maps a Turkish keyboard correctly:
  //   ı -> I,  I -> I,  i -> İ,  İ -> İ
  return ch.toLocaleUpperCase('tr-TR');
}

function gridFromRows(rows: string[]): string[] {
  const size = rows.length;
  return rows.map((r) => r.padEnd(size, ' ').slice(0, size));
}

function rowsToFlat(rows: string[]): string[] {
  return rows.flatMap((r) => r.split(''));
}

type DesignerSnapshot = {
  title: string;
  rows: string[];
  cluesAcross: Record<number, string>;
  cluesDown: Record<number, string>;
  links: ClueLinkMember[][];
};

function initialRows(initial?: Puzzle, startingTemplate?: Template): string[] {
  if (initial?.solutionGrid) return initial.solutionGrid;
  if (startingTemplate) return templateToEmptySolution(startingTemplate);
  return Array.from({ length: SIZE_15 }, () => ' '.repeat(SIZE_15));
}

function snapshotFromState(
  title: string,
  rows: string[],
  cluesAcross: Record<number, string>,
  cluesDown: Record<number, string>,
  links: ClueLinkMember[][],
): DesignerSnapshot {
  return {
    title,
    rows: [...rows],
    cluesAcross: { ...cluesAcross },
    cluesDown: { ...cluesDown },
    links: links.map((group) => group.map((member) => ({ ...member }))),
  };
}

function snapshotsEqual(a: DesignerSnapshot, b: DesignerSnapshot): boolean {
  if (a.title !== b.title) return false;
  if (a.rows.length !== b.rows.length) return false;
  for (let i = 0; i < a.rows.length; i++) {
    if (a.rows[i] !== b.rows[i]) return false;
  }
  if (JSON.stringify(a.cluesAcross) !== JSON.stringify(b.cluesAcross)) return false;
  if (JSON.stringify(a.cluesDown) !== JSON.stringify(b.cluesDown)) return false;
  if (JSON.stringify(a.links) !== JSON.stringify(b.links)) return false;
  return true;
}

type Props = {
  initial?: Puzzle;
  /** Starting layout when creating a new puzzle (from the modal). */
  startingTemplate?: Template;
  onSaved: (puzzle: Puzzle, action: 'draft' | 'published') => void | Promise<void>;
  onCancel: () => void;
};

export function PuzzleDesigner({ initial, startingTemplate, onSaved, onCancel }: Props) {
  const baselineRef = useRef<DesignerSnapshot>(
    snapshotFromState(
      initial?.title ?? 'New puzzle',
      initialRows(initial, startingTemplate),
      initial?.clues.across ?? {},
      initial?.clues.down ?? {},
      initial?.clues.links ?? [],
    ),
  );

  const [title, setTitle] = useState(initial?.title ?? 'New puzzle');
  const [rows, setRows] = useState<string[]>(() => initialRows(initial, startingTemplate));

  const [symmetry, setSymmetry] = useState(
    () => startingTemplate?.defaultSymmetry ?? false,
  );
  const [unsavedModalOpen, setUnsavedModalOpen] = useState(false);
  const [unlinkConfirmOpen, setUnlinkConfirmOpen] = useState(false);
  const pendingProceedRef = useRef<(() => void) | null>(null);

  const [activeDirection, setActiveDirection] = useState<Direction>('across');
  const [activeEntryNumber, setActiveEntryNumber] = useState<number | null>(null);
  const [activeCellIndex, setActiveCellIndex] = useState<number | null>(null);

  const [cluesAcross, setCluesAcross] = useState<Record<number, string>>(
    () => initial?.clues.across ?? {},
  );
  const [cluesDown, setCluesDown] = useState<Record<number, string>>(
    () => initial?.clues.down ?? {},
  );
  const [links, setLinks] = useState<ClueLinkMember[][]>(() => initial?.clues.links ?? []);
  const [linkingMode, setLinkingMode] = useState(false);
  const [linkSelection, setLinkSelection] = useState<ClueLinkMember[]>([]);

  const [history, setHistory] = useState<{ past: DesignerSnapshot[]; future: DesignerSnapshot[] }>(
    { past: [], future: [] },
  );

  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const cluePanelRef = useRef<HTMLDivElement | null>(null);

  const pushHistory = () => {
    setHistory((h) => ({
      past: [...h.past, snapshotFromState(title, rows, cluesAcross, cluesDown, links)].slice(-100),
      future: [],
    }));
  };

  const applySnapshot = (s: DesignerSnapshot) => {
    setTitle(s.title);
    setRows(s.rows);
    setCluesAcross(s.cluesAcross);
    setCluesDown(s.cluesDown);
    setLinks(s.links);
  };

  // Note: applySnapshot must be called OUTSIDE the setHistory updater.
  // Updater functions have to be pure, and StrictMode double-invokes them to
  // catch exactly this - a setState side effect nested inside another one.
  const undo = () => {
    if (history.past.length === 0) return;
    const current = snapshotFromState(title, rows, cluesAcross, cluesDown, links);
    const previous = history.past[history.past.length - 1]!;
    applySnapshot(previous);
    setHistory((h) => ({
      past: h.past.slice(0, -1),
      future: [current, ...h.future].slice(0, 100),
    }));
  };

  const redo = () => {
    if (history.future.length === 0) return;
    const current = snapshotFromState(title, rows, cluesAcross, cluesDown, links);
    const next = history.future[0]!;
    applySnapshot(next);
    setHistory((h) => ({
      past: [...h.past, current].slice(-100),
      future: h.future.slice(1),
    }));
  };

  const size = rows.length;
  const solutionGrid = useMemo(() => gridFromRows(rows), [rows]);
  const computed = useMemo(() => {
    try {
      return computeEntries(solutionGrid);
    } catch {
      return null;
    }
  }, [solutionGrid]);

  const activeEntry = useMemo(() => {
    if (!computed || activeEntryNumber == null) return undefined;
    return computed.entryByNumberDirection(activeDirection, activeEntryNumber);
  }, [computed, activeDirection, activeEntryNumber]);

  const activeEntryCellIndices = useMemo(() => {
    if (!activeEntry) return new Set<number>();
    return new Set(activeEntry.cells.map((c) => idxOf(size, c.row, c.col)));
  }, [activeEntry, size]);

  const validLinks = useMemo(
    () => sanitizeClueLinks(links, computed?.allEntries ?? []),
    [links, computed],
  );

  const linkedCellIndices = useMemo(() => {
    const set = new Set<number>();
    if (!computed || activeEntryNumber == null) return set;
    const group = findClueLinkGroup(validLinks, activeDirection, activeEntryNumber);
    if (!group) return set;
    for (const member of group) {
      if (member.direction === activeDirection && member.number === activeEntryNumber) continue;
      const entry = computed.entryByNumberDirection(member.direction, member.number);
      if (!entry) continue;
      for (const cell of entry.cells) {
        const idx = idxOf(size, cell.row, cell.col);
        if (activeEntryCellIndices.has(idx)) continue;
        set.add(idx);
      }
    }
    return set;
  }, [computed, validLinks, activeDirection, activeEntryNumber, activeEntryCellIndices, size]);

  const exitLinkingMode = () => {
    setLinkingMode(false);
    setLinkSelection([]);
  };

  const toggleLinkSelection = (direction: Direction, number: number) => {
    const key = clueLinkKey({ direction, number });
    setLinkSelection((prev) => {
      if (prev.some((member) => clueLinkKey(member) === key)) {
        return prev.filter((member) => clueLinkKey(member) !== key);
      }
      return [...prev, { direction, number }];
    });
  };

  const onLinkButton = () => {
    if (!linkingMode) {
      setLinkingMode(true);
      setLinkSelection([]);
      return;
    }
    if (linkSelection.length < 2) {
      exitLinkingMode();
      return;
    }
    pushHistory();
    const selectedKeys = new Set(linkSelection.map(clueLinkKey));
    const next = links
      .map((group) => group.filter((member) => !selectedKeys.has(clueLinkKey(member))))
      .filter((group) => group.length >= 2);
    next.push(linkSelection.map((member) => ({ ...member })));
    setLinks(next);
    exitLinkingMode();
  };

  const confirmUnlinkAll = () => {
    pushHistory();
    setLinks([]);
    setUnlinkConfirmOpen(false);
    exitLinkingMode();
  };

  const flat = useMemo(() => rowsToFlat(solutionGrid), [solutionGrid]);

  const setCellLetter = (cellIndex: number, letter: string) => {
    const { row, col } = posOf(size, cellIndex);
    if (solutionGrid[row][col] === '#') return;

    pushHistory();
    setRows((prev) => {
      const next = prev.map((r) => r.split(''));
      next[row][col] = letter || ' ';
      return next.map((r) => r.join(''));
    });
  };

  const toggleBlockAt = (row: number, col: number) => {
    pushHistory();
    setRows((prev) => {
      const next = prev.map((r) => r.split(''));
      const makeBlock = next[row][col] !== '#';
      const apply = (r: number, c: number) => {
        next[r][c] = makeBlock ? '#' : ' ';
      };
      apply(row, col);
      if (symmetry) {
        const m = mirrorPos(row, col, size);
        apply(m.row, m.col);
      }
      return next.map((r) => r.join(''));
    });
    setActiveEntryNumber(null);
    setActiveCellIndex(null);
  };

  const pickCell = (cellIndex: number) => {
    const { row, col } = posOf(size, cellIndex);
    if (solutionGrid[row][col] === '#') return;
    if (!computed) return;

    const acrossNum = computed.acrossEntryNumberByCell.get(`${row},${col}`);
    const downNum = computed.downEntryNumberByCell.get(`${row},${col}`);

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
    }

    setActiveCellIndex(cellIndex);
  };

  const resolveEntryAtCell = (cellIndex: number, direction: Direction): Entry | undefined => {
    if (!computed) return undefined;
    const { row, col } = posOf(size, cellIndex);
    const acrossNum = computed.acrossEntryNumberByCell.get(`${row},${col}`);
    const downNum = computed.downEntryNumberByCell.get(`${row},${col}`);

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

  const isEntryFilled = (entry: Entry) =>
    entry.cells.every((c) => flat[idxOf(size, c.row, c.col)].trim() !== '');

  const focusCell = (cellIndex: number) => {
    const el = inputsRef.current[cellIndex];
    if (!el) return;
    el.focus();
    el.select();
    setActiveCellIndex(cellIndex);
  };

  const focusEntry = (direction: Direction, entryNumber: number) => {
    if (!computed) return;
    const entry = computed.entryByNumberDirection(direction, entryNumber);
    if (!entry) return;
    const entryIndices = entry.cells.map((c) => idxOf(size, c.row, c.col));
    const targetCell =
      entryIndices.find((idx) => flat[idx].trim() === '') ?? entryIndices[0]!;
    setActiveDirection(direction);
    setActiveEntryNumber(entryNumber);
    setActiveCellIndex(targetCell);
    focusCell(targetCell);
  };

  const stepEntry = (delta: 1 | -1) => {
    if (!computed) return;
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

    const fallback = combined[fallbackIdx]!;
    focusEntry(fallback.direction, fallback.entry.number);
  };

  const moveInResolvedEntry = (entry: Entry, from: number, delta: 1 | -1) => {
    const indices = entry.cells.map((c) => idxOf(size, c.row, c.col));
    const pos = indices.indexOf(from);
    if (pos === -1) return;

    let nextPos = pos + delta;
    while (nextPos >= 0 && nextPos < indices.length - 1 && flat[indices[nextPos]!].trim() !== '') {
      nextPos += delta;
    }

    const next = indices[nextPos];
    if (next == null) {
      // End of the entry: stay put. Typing on the last square overwrites it
      // in place rather than carrying the cursor into the next clue - moving
      // between entries is always deliberate (Tab, Space, arrows, click).
      // Mirrors CrosswordPlayer.
      return;
    }
    pickCell(next);
    focusCell(next);
  };

  const moveOneWithinEntry = (entry: Entry, from: number, delta: 1 | -1) => {
    const indices = entry.cells.map((c) => idxOf(size, c.row, c.col));
    const pos = indices.indexOf(from);
    if (pos === -1) return;
    const next = indices[pos + delta];
    if (next == null) return;
    pickCell(next);
    focusCell(next);
  };

  const backspaceEmptyCell = (cellIndex: number) => {
    pickCell(cellIndex);
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
      pickCell(cellIndex);
    }

    // Already at the entry's first square - stop here rather than jumping
    // into the previous clue.
    if (pos === 0) return;

    const prev = indices[pos - 1]!;
    setCellLetter(prev, '');
    pickCell(prev);
    focusCell(prev);
  };

  const toggleDirection = () => {
    if (activeCellIndex == null || !computed) return;
    const { row, col } = posOf(size, activeCellIndex);
    const acrossNum = computed.acrossEntryNumberByCell.get(`${row},${col}`);
    const downNum = computed.downEntryNumberByCell.get(`${row},${col}`);
    if (activeDirection === 'across' && downNum != null) {
      setActiveDirection('down');
      setActiveEntryNumber(downNum);
    } else if (activeDirection === 'down' && acrossNum != null) {
      setActiveDirection('across');
      setActiveEntryNumber(acrossNum);
    }
  };

  const moveByArrow = (direction: Direction, delta: 1 | -1) => {
    if (activeCellIndex == null || !computed) return;
    const { row, col } = posOf(size, activeCellIndex);

    let r = row;
    let c = col;
    for (;;) {
      if (direction === 'across') c += delta;
      else r += delta;
      if (r < 0 || r >= size || c < 0 || c >= size) return;
      if (solutionGrid[r][c] !== '#') break;
    }

    const target = idxOf(size, r, c);
    const acrossNum = computed.acrossEntryNumberByCell.get(`${r},${c}`);
    const downNum = computed.downEntryNumberByCell.get(`${r},${c}`);
    const useDown = direction === 'down' ? downNum != null : downNum != null && acrossNum == null;

    setActiveDirection(useDown ? 'down' : 'across');
    setActiveEntryNumber(useDown ? (downNum ?? null) : (acrossNum ?? null));
    setActiveCellIndex(target);
    focusCell(target);
  };

  const stepOneCell = (fromIndex: number, delta: 1 | -1) => {
    const { row, col } = posOf(size, activeCellIndex ?? fromIndex);
    const next =
      activeDirection === 'across'
        ? col + delta >= 0 && col + delta < size
          ? idxOf(size, row, col + delta)
          : null
        : row + delta >= 0 && row + delta < size
          ? idxOf(size, row + delta, col)
          : null;
    if (next == null) return;
    pickCell(next);
    focusCell(next);
  };

  const onCellChange = (cellIndex: number, raw: string) => {
    pickCell(cellIndex);
    const typed = raw.trim();
    if (typed.endsWith('.')) {
      const { row, col } = posOf(size, cellIndex);
      toggleBlockAt(row, col);
      stepOneCell(cellIndex, 1);
      return;
    }
    const wasEmpty = flat[cellIndex].trim() === '';
    const letter = normalizeLetter(raw);
    setCellLetter(cellIndex, letter);
    if (!letter) return;
    const entry = resolveEntryAtCell(cellIndex, activeDirection);
    if (!entry) return;
    if (wasEmpty) {
      moveInResolvedEntry(entry, cellIndex, 1);
    } else {
      moveOneWithinEntry(entry, cellIndex, 1);
    }
  };

  const onCellClick = (cellIndex: number) => {
    const { row, col } = posOf(size, cellIndex);
    if (solutionGrid[row][col] === '#') {
      toggleBlockAt(row, col);
      return;
    }
    pickCell(cellIndex);
  };

  const incompleteEntries = useMemo(() => {
    if (!computed) return [];
    return computed.allEntries.filter((e) => e.word.includes(' ') || e.word.length === 0);
  }, [computed]);

  const missingClues = useMemo(() => {
    if (!computed) return [];
    const missing: string[] = [];
    for (const e of computed.entriesAcross) {
      if (!cluesAcross[e.number]?.trim()) missing.push(`Across ${e.number}`);
    }
    for (const e of computed.entriesDown) {
      if (!cluesDown[e.number]?.trim()) missing.push(`Down ${e.number}`);
    }
    return missing;
  }, [computed, cluesAcross, cluesDown]);

  const canPublish =
    Boolean(title.trim()) &&
    computed != null &&
    incompleteEntries.length === 0 &&
    missingClues.length === 0 &&
    computed.allEntries.length > 0;

  const alreadyPublished = initial?.status === 'published';
  const [saving, setSaving] = useState(false);

  const isDirty = useMemo(
    () =>
      !snapshotsEqual(
        snapshotFromState(title, rows, cluesAcross, cluesDown, links),
        baselineRef.current,
      ),
    [title, rows, cluesAcross, cluesDown, links],
  );

  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  const updateBaseline = useCallback(() => {
    baselineRef.current = snapshotFromState(title, rows, cluesAcross, cluesDown, links);
  }, [title, rows, cluesAcross, cluesDown, links]);

  // Re-select the focused cell's letter after every edit. The inputs are
  // maxLength=1, so once one holds a character an unselected caret sits
  // *after* it and the browser silently rejects the next keystroke. Mirrors
  // CrosswordPlayer - needed now that a word's last square keeps the cursor
  // in place instead of advancing.
  useEffect(() => {
    const el = document.activeElement as HTMLInputElement | null;
    if (!el || el.tagName !== 'INPUT') return;
    if (!inputsRef.current.includes(el)) return;
    el.select();
  }, [rows]);

  useEffect(() => {
    registerGuard((proceed) => {
      if (!isDirtyRef.current) {
        proceed();
        return;
      }
      pendingProceedRef.current = proceed;
      setUnsavedModalOpen(true);
    });
    return unregisterGuard;
  }, []);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && linkingMode && !unlinkConfirmOpen) {
        e.preventDefault();
        exitLinkingMode();
        return;
      }
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
      const active = document.activeElement;
      if (active instanceof Node && cluePanelRef.current?.contains(active)) return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [title, rows, cluesAcross, cluesDown, links, history, linkingMode, unlinkConfirmOpen]);

  const buildPuzzle = (status: 'draft' | 'published'): Puzzle | null => {
    if (status === 'published' && !canPublish) return null;

    const cleanGrid = solutionGrid.map((row) =>
      row
        .split('')
        .map((ch) => {
          if (ch === '#') return '#';
          if (ch.trim() === '') return status === 'published' ? '?' : ' ';
          return ch;
        })
        .join(''),
    );

    if (status === 'published' && cleanGrid.some((r) => r.includes('?'))) return null;

    return {
      id: initial?.id ?? '',
      slug: initial?.slug ?? '',
      status,
      title: title.trim() || 'Untitled',
      size,
      solutionGrid: cleanGrid,
      clues: {
        across: cluesAcross,
        down: cluesDown,
        ...(validLinks.length > 0 ? { links: validLinks } : {}),
      },
      meta: {
        createdBy: initial?.meta?.createdBy ?? 'local',
        createdAtISO: initial?.meta?.createdAtISO ?? new Date().toISOString(),
      },
    };
  };

  const handleSave = async (status: 'draft' | 'published') => {
    const puzzle = buildPuzzle(status);
    if (!puzzle) return;
    setSaving(true);
    try {
      await onSaved(puzzle, status);
      updateBaseline();
    } finally {
      setSaving(false);
    }
  };

  const handleDiscardChanges = () => {
    const proceed = pendingProceedRef.current;
    pendingProceedRef.current = null;
    setUnsavedModalOpen(false);
    // `proceed` (e.g. goHome) re-wraps itself in runGuarded, and discarding
    // doesn't change title/rows/clues - isDirty stays true, so without this
    // the same guard re-fires and just reopens this modal instead of
    // navigating. The user already made their call; let it through.
    unregisterGuard();
    proceed?.();
  };

  const handleSaveDraftAndLeave = async () => {
    const proceed = pendingProceedRef.current;
    const puzzle = buildPuzzle('draft');
    if (!puzzle) return;
    setSaving(true);
    try {
      await onSaved(puzzle, 'draft');
      updateBaseline();
      pendingProceedRef.current = null;
      setUnsavedModalOpen(false);
      // Same reason as handleDiscardChanges: updateBaseline() only updates a
      // ref, which isDirty's useMemo doesn't depend on, so isDirty stays
      // stale/true here too - without this, proceed() re-triggers the guard.
      unregisterGuard();
      proceed?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="layout layoutDesigner">
      <div className="panel designerCluePanel" ref={cluePanelRef}>
        <div className="panelHeader">Clues</div>
        <div className="clues">
          <div className="fieldBlock">
            <label className="fieldLabel">Title</label>
            <input
              className="fieldInput"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Puzzle title"
            />
          </div>

          <div className="directionBlock">
            <div className="directionHeader">
              <span>Across</span>
              <button
                type="button"
                className="btn"
                onClick={toggleDirection}
              >
                Direction (SPACE)
              </button>
            </div>
            {computed?.entriesAcross.map((e) => {
              const isActive = activeDirection === 'across' && activeEntryNumber === e.number;
              const isLinkPicked =
                linkingMode &&
                linkSelection.some((member) => member.direction === 'across' && member.number === e.number);
              return (
                <div
                  key={`a-${e.number}`}
                  className={`clueEdit ${isActive ? 'clueActive' : ''} ${isLinkPicked ? 'clueLinkPicked' : ''}`}
                  onClick={() => {
                    if (linkingMode) {
                      toggleLinkSelection('across', e.number);
                      return;
                    }
                    setActiveDirection('across');
                    setActiveEntryNumber(e.number);
                    focusCell(idxOf(size, e.start.row, e.start.col));
                  }}
                >
                  <div className="clueMeta">
                    <span className="clueNum">{e.number}</span>
                    <span className="answerPreview">{e.word.replaceAll(' ', '·')}</span>
                    <span className="subtle">{e.length}</span>
                  </div>
                  <input
                    className="fieldInput"
                    value={cluesAcross[e.number] ?? ''}
                    placeholder="Clue…"
                    onChange={(e2) =>
                      setCluesAcross((prev) => ({ ...prev, [e.number]: e2.target.value }))
                    }
                    onClick={(e2) => e2.stopPropagation()}
                  />
                </div>
              );
            })}
          </div>

          <div className="directionBlock">
            <div className="directionHeader">
              <span>Down</span>
            </div>
            {computed?.entriesDown.map((e) => {
              const isActive = activeDirection === 'down' && activeEntryNumber === e.number;
              const isLinkPicked =
                linkingMode &&
                linkSelection.some((member) => member.direction === 'down' && member.number === e.number);
              return (
                <div
                  key={`d-${e.number}`}
                  className={`clueEdit ${isActive ? 'clueActive' : ''} ${isLinkPicked ? 'clueLinkPicked' : ''}`}
                  onClick={() => {
                    if (linkingMode) {
                      toggleLinkSelection('down', e.number);
                      return;
                    }
                    setActiveDirection('down');
                    setActiveEntryNumber(e.number);
                    focusCell(idxOf(size, e.start.row, e.start.col));
                  }}
                >
                  <div className="clueMeta">
                    <span className="clueNum">{e.number}</span>
                    <span className="answerPreview">{e.word.replaceAll(' ', '·')}</span>
                    <span className="subtle">{e.length}</span>
                  </div>
                  <input
                    className="fieldInput"
                    value={cluesDown[e.number] ?? ''}
                    placeholder="Clue…"
                    onChange={(e2) =>
                      setCluesDown((prev) => ({ ...prev, [e.number]: e2.target.value }))
                    }
                    onClick={(e2) => e2.stopPropagation()}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="panel designerGridPanel">
        <div className="controlsRow">
          <div className="controlsRowCopy">
            <div className="title" style={{ fontSize: 16 }}>
              Design
            </div>
            <div className="subtle designHint">
              Type letters to fill answers. Type a full stop (.) for a black square — click a black
              square to undo.
            </div>
          </div>
          <div className="controlsRowActions">
            <button
              type="button"
              className="btn"
              onClick={() => runGuarded(onCancel)}
              disabled={saving}
            >
              Cancel
            </button>
            {alreadyPublished ? (
              <button
                type="button"
                className="btn btnPrimary"
                disabled={!canPublish || saving}
                onClick={() => void handleSave('published')}
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="btn"
                  disabled={saving}
                  onClick={() => void handleSave('draft')}
                >
                  {saving ? 'Saving…' : 'Save draft'}
                </button>
                <button
                  type="button"
                  className="btn btnPrimary"
                  disabled={!canPublish || saving}
                  onClick={() => void handleSave('published')}
                >
                  {saving ? 'Saving…' : 'Publish'}
                </button>
              </>
            )}
          </div>
        </div>

        <div className="editorToolbar">
          <div className="toolbarSegment" role="group" aria-label="Undo and redo">
            <button
              type="button"
              className="toolbarControl"
              aria-label="Undo"
              title="Undo"
              disabled={history.past.length === 0}
              onClick={undo}
            >
              <Undo2 size={TOOLBAR_ICON_SIZE} aria-hidden />
            </button>
            <button
              type="button"
              className="toolbarControl"
              aria-label="Redo"
              title="Redo"
              disabled={history.future.length === 0}
              onClick={redo}
            >
              <Redo2 size={TOOLBAR_ICON_SIZE} aria-hidden />
            </button>
          </div>

          <button
            type="button"
            className={`toolbarControl ${symmetry ? 'isActive' : ''}`}
            aria-label="Toggle 180° block symmetry"
            title="Toggle 180° block symmetry"
            aria-pressed={symmetry}
            onClick={() => setSymmetry((v) => !v)}
          >
            <span className="toolbarGlyph" aria-hidden>
              180°
            </span>
          </button>

          <button
            type="button"
            className={`toolbarControl ${linkingMode ? 'isActive' : ''}`}
            aria-label="Link clues"
            title="Link clues"
            aria-pressed={linkingMode}
            onClick={onLinkButton}
          >
            <Link2 size={TOOLBAR_ICON_SIZE} aria-hidden />
          </button>

          <button
            type="button"
            className="toolbarControl"
            aria-label="Remove all clue links"
            title="Remove all clue links"
            disabled={validLinks.length === 0}
            onClick={() => setUnlinkConfirmOpen(true)}
          >
            <Unlink2 size={TOOLBAR_ICON_SIZE} aria-hidden />
          </button>
        </div>

        <div className="gridWrap">
          <div className="designerGridSlot">
          <div
            className="grid"
            style={{ '--grid-size': size } as CSSProperties}
          >
            {Array.from({ length: size * size }, (_, cellIndex) => {
              const { row, col } = posOf(size, cellIndex);
              const ch = flat[cellIndex];
              const numAtCell = computed?.cellNumber[row][col] ?? null;
              const isBlock = ch === '#';
              const value = isBlock || ch.trim() === '' ? '' : ch;
              const isActive = !isBlock && activeEntryCellIndices.has(cellIndex);
              const isLinked = !isBlock && !isActive && linkedCellIndices.has(cellIndex);
              // The single square the cursor is on, distinct from the whole
              // highlighted entry. CrosswordPlayer has always drawn this;
              // the designer never did, which made arrow-key movement
              // invisible - the word highlight doesn't change as you step
              // within it.
              const isCurrent = !isBlock && activeCellIndex === cellIndex;

              return (
                <div
                  key={cellIndex}
                  className={`cell ${isBlock ? 'block' : ''} ${isLinked ? 'cellLinked' : ''} ${
                    isActive ? 'cellActive' : ''
                  } ${isCurrent ? 'cellCurrent' : ''} ${isBlock ? 'cellClickable' : ''}`}
                  onClick={() => onCellClick(cellIndex)}
                >
                  {!isBlock && numAtCell != null ? (
                    <div className="cellNumber">{numAtCell}</div>
                  ) : null}
                  {!isBlock ? (
                    <input
                      ref={(el) => {
                        inputsRef.current[cellIndex] = el;
                      }}
                      value={value}
                      maxLength={1}
                      inputMode="text"
                      autoCorrect="off"
                      spellCheck={false}
                      onFocus={() => {
                        pickCell(cellIndex);
                      }}
                      onChange={(e) => onCellChange(cellIndex, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === '.') {
                          e.preventDefault();
                          const { row, col } = posOf(size, cellIndex);
                          toggleBlockAt(row, col);
                          stepOneCell(cellIndex, 1);
                          return;
                        }
                        if (e.key === 'Tab') {
                          e.preventDefault();
                          stepEntry(e.shiftKey ? -1 : 1);
                          return;
                        }
                        if (e.key === 'ArrowLeft') {
                          e.preventDefault();
                          moveByArrow('across', -1);
                          return;
                        }
                        if (e.key === 'ArrowRight') {
                          e.preventDefault();
                          moveByArrow('across', 1);
                          return;
                        }
                        if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          moveByArrow('down', -1);
                          return;
                        }
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          moveByArrow('down', 1);
                          return;
                        }
                        if (e.code === 'Space') {
                          e.preventDefault();
                          toggleDirection();
                          return;
                        }
                        if (e.key === 'Backspace') {
                          if (value) {
                            // Let onChange clear current; stay put (no move).
                            return;
                          }
                          e.preventDefault();
                          backspaceEmptyCell(cellIndex);
                        }
                      }}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
          </div>

          <div className="statusBar">
            {linkingMode ? (
              <span className="hint">
                Select 2 or more clues to link, then press Link again to confirm.
              </span>
            ) : incompleteEntries.length > 0 ? (
              <span className="hint">
                Incomplete answers: {incompleteEntries.length} entries — fill every letter before
                saving.
              </span>
            ) : missingClues.length > 0 ? (
              <span className="hint">Missing clues: {missingClues.length}</span>
            ) : computed && computed.allEntries.length === 0 ? (
              <span className="hint">Add some open word slots (at least 2 letters) before saving.</span>
            ) : (
              <span className="hint">Ready to save.</span>
            )}
          </div>
        </div>
      </div>

      <UnsavedChangesModal
        open={unsavedModalOpen}
        saving={saving}
        onKeepEditing={() => {
          pendingProceedRef.current = null;
          setUnsavedModalOpen(false);
        }}
        onDiscard={handleDiscardChanges}
        onSaveDraftAndLeave={() => void handleSaveDraftAndLeave()}
      />

      <UnlinkCluesConfirmModal
        open={unlinkConfirmOpen}
        onClose={() => setUnlinkConfirmOpen(false)}
        onConfirm={confirmUnlinkAll}
      />
    </div>
  );
}
