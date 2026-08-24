import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Grid2x2, PencilLine, Shuffle } from 'lucide-react';
import { ShuffleConfirmModal } from '@/components/ShuffleConfirmModal';
import { UnsavedChangesModal } from '@/components/UnsavedChangesModal';
import {
  templatesForSize,
  mirrorPos,
  templateToEmptySolution,
  type StartingGridId,
  type Template,
} from '@/data/templates';
import { registerGuard, runGuarded, unregisterGuard } from '@/lib/navigationGuard';
import { SIZE_15, computeEntries, type Direction, type Entry } from './engine';
import type { Puzzle } from './types';

const TOOLBAR_ICON_SIZE = 16;
const AUTOFILL_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function idxOf(size: number, row: number, col: number) {
  return row * size + col;
}

function posOf(size: number, index: number) {
  return { row: Math.floor(index / size), col: index % size };
}

function normalizeLetter(raw: string) {
  const trimmed = raw.replace(/\s+/g, '');
  if (!trimmed) return '';
  return trimmed[trimmed.length - 1].toLocaleUpperCase('tr-TR');
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
): DesignerSnapshot {
  return {
    title,
    rows: [...rows],
    cluesAcross: { ...cluesAcross },
    cluesDown: { ...cluesDown },
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
  return true;
}

function hasDesignerProgress(
  rows: string[],
  cluesAcross: Record<number, string>,
  cluesDown: Record<number, string>,
) {
  for (const row of rows) {
    for (const ch of row) {
      if (ch !== '#' && ch.trim() !== '') return true;
    }
  }
  for (const text of Object.values(cluesAcross)) {
    if (text.trim()) return true;
  }
  for (const text of Object.values(cluesDown)) {
    if (text.trim()) return true;
  }
  return false;
}

function pickShuffleTemplate(excludeId: StartingGridId | null, size: number): Template | null {
  const patterned = templatesForSize(size).filter((t) => t.id !== 'blank');
  if (patterned.length === 0) return null;
  const pool = patterned.filter((t) => t.id !== excludeId);
  const choices = pool.length > 0 ? pool : patterned;
  return choices[Math.floor(Math.random() * choices.length)]!;
}

type EditMode = 'letter' | 'block';

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
    ),
  );

  const [title, setTitle] = useState(initial?.title ?? 'New puzzle');
  const [rows, setRows] = useState<string[]>(() => initialRows(initial, startingTemplate));

  const [editMode, setEditMode] = useState<EditMode>(() =>
    startingTemplate?.id === 'blank' ? 'block' : 'letter',
  );
  const [symmetry, setSymmetry] = useState(
    () => startingTemplate?.defaultSymmetry ?? false,
  );
  const [lastShuffledTemplateId, setLastShuffledTemplateId] = useState<StartingGridId | null>(
    () => (startingTemplate && startingTemplate.id !== 'blank' ? startingTemplate.id : null),
  );
  const [shuffleConfirmOpen, setShuffleConfirmOpen] = useState(false);
  const [unsavedModalOpen, setUnsavedModalOpen] = useState(false);
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

  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  const applyShuffle = () => {
    const nextTemplate = pickShuffleTemplate(lastShuffledTemplateId, rows.length);
    if (!nextTemplate) return;
    setRows(templateToEmptySolution(nextTemplate));
    setCluesAcross({});
    setCluesDown({});
    setLastShuffledTemplateId(nextTemplate.id);
    setActiveEntryNumber(null);
    setActiveCellIndex(null);
    setShuffleConfirmOpen(false);
  };

  const requestShuffle = () => {
    if (hasDesignerProgress(rows, cluesAcross, cluesDown)) {
      setShuffleConfirmOpen(true);
      return;
    }
    applyShuffle();
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

  const flat = useMemo(() => rowsToFlat(solutionGrid), [solutionGrid]);

  const setCellLetter = (cellIndex: number, letter: string) => {
    const { row, col } = posOf(size, cellIndex);
    if (solutionGrid[row][col] === '#') return;

    setRows((prev) => {
      const next = prev.map((r) => r.split(''));
      next[row][col] = letter || ' ';
      return next.map((r) => r.join(''));
    });
  };

  const toggleBlockAt = (row: number, col: number) => {
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

  const moveInResolvedEntry = (entry: Entry, from: number, delta: 1 | -1) => {
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
    let entry = resolveEntryAtCell(cellIndex, activeDirection);
    if (!entry) return;

    let indices = entry.cells.map((c) => idxOf(size, c.row, c.col));
    let pos = indices.indexOf(cellIndex);

    if (pos === -1) {
      entry = resolveEntryAtCell(cellIndex, activeDirection === 'across' ? 'down' : 'across');
      if (!entry) return;
      indices = entry.cells.map((c) => idxOf(size, c.row, c.col));
      pos = indices.indexOf(cellIndex);
      if (pos === -1) return;
      pickCell(cellIndex);
    }

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

  const focusCell = (cellIndex: number) => {
    inputsRef.current[cellIndex]?.focus();
    setActiveCellIndex(cellIndex);
  };

  const onCellChange = (cellIndex: number, raw: string) => {
    if (editMode === 'block') return;
    pickCell(cellIndex);
    const letter = normalizeLetter(raw);
    setCellLetter(cellIndex, letter);
    const entry = resolveEntryAtCell(cellIndex, activeDirection);
    if (!entry) return;
    if (letter) moveInResolvedEntry(entry, cellIndex, 1);
    else moveInResolvedEntry(entry, cellIndex, -1);
  };

  const onCellClick = (cellIndex: number) => {
    const { row, col } = posOf(size, cellIndex);
    if (editMode === 'block') {
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
        snapshotFromState(title, rows, cluesAcross, cluesDown),
        baselineRef.current,
      ),
    [title, rows, cluesAcross, cluesDown],
  );

  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  const updateBaseline = useCallback(() => {
    baselineRef.current = snapshotFromState(title, rows, cluesAcross, cluesDown);
  }, [title, rows, cluesAcross, cluesDown]);

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
      clues: { across: cluesAcross, down: cluesDown },
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
      proceed?.();
    } finally {
      setSaving(false);
    }
  };

  const autofillTestData = () => {
    if (!computed) return;

    let letterIndex = 0;
    setRows((prev) =>
      prev.map((row) =>
        row
          .split('')
          .map((ch) => {
            if (ch === '#') return '#';
            if (ch.trim() !== '') return ch;
            const letter = AUTOFILL_LETTERS[letterIndex % AUTOFILL_LETTERS.length]!;
            letterIndex += 1;
            return letter;
          })
          .join(''),
      ),
    );

    setCluesAcross((prev) => {
      const next = { ...prev };
      for (const entry of computed.entriesAcross) {
        if (!next[entry.number]?.trim()) {
          next[entry.number] = `Test clue ${entry.number} across`;
        }
      }
      return next;
    });

    setCluesDown((prev) => {
      const next = { ...prev };
      for (const entry of computed.entriesDown) {
        if (!next[entry.number]?.trim()) {
          next[entry.number] = `Test clue ${entry.number} down`;
        }
      }
      return next;
    });

    if (!title.trim()) {
      setTitle('New puzzle');
    }
  };

  return (
    <div className="layout">
      <div className="panel">
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
                disabled={editMode === 'block'}
              >
                Direction (SPACE)
              </button>
            </div>
            {computed?.entriesAcross.map((e) => {
              const isActive = activeDirection === 'across' && activeEntryNumber === e.number;
              return (
                <div
                  key={`a-${e.number}`}
                  className={`clueEdit ${isActive ? 'clueActive' : ''}`}
                  onClick={() => {
                    if (editMode === 'block') return;
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
              return (
                <div
                  key={`d-${e.number}`}
                  className={`clueEdit ${isActive ? 'clueActive' : ''}`}
                  onClick={() => {
                    if (editMode === 'block') return;
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

      <div className="panel">
        <div className="controlsRow">
          <div>
            <div className="title" style={{ fontSize: 16 }}>
              Design
            </div>
            <div className="subtle designHint">
              {editMode === 'block'
                ? 'Block mode: click cells to toggle white ↔ black.'
                : 'Toggle direction with SPACE.'}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn"
              onClick={() => runGuarded(onCancel)}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn"
              onClick={autofillTestData}
              disabled={saving || !computed}
            >
              Autofill
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
          <div className="toolbarSegment" role="group" aria-label="Edit mode">
            <button
              type="button"
              className={`toolbarControl ${editMode === 'letter' ? 'isActive' : ''}`}
              aria-label="Letter mode"
              title="Letter mode"
              aria-pressed={editMode === 'letter'}
              onClick={() => setEditMode('letter')}
            >
              <PencilLine size={TOOLBAR_ICON_SIZE} aria-hidden />
            </button>
            <button
              type="button"
              className={`toolbarControl ${editMode === 'block' ? 'isActive' : ''}`}
              aria-label="Block mode"
              title="Block mode"
              aria-pressed={editMode === 'block'}
              onClick={() => setEditMode('block')}
            >
              <Grid2x2 size={TOOLBAR_ICON_SIZE} aria-hidden />
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
            className="toolbarControl"
            aria-label="Shuffle grid layout"
            title={
              templatesForSize(size).some((t) => t.id !== 'blank')
                ? 'Shuffle grid layout'
                : 'No other layouts for this size'
            }
            disabled={!templatesForSize(size).some((t) => t.id !== 'blank')}
            onClick={requestShuffle}
          >
            <Shuffle size={TOOLBAR_ICON_SIZE} aria-hidden />
          </button>
        </div>

        <div className="gridWrap">
          <div
            className={`grid ${editMode === 'block' ? 'gridBlockMode' : ''}`}
            style={{ '--grid-size': size } as CSSProperties}
          >
            {Array.from({ length: size * size }, (_, cellIndex) => {
              const { row, col } = posOf(size, cellIndex);
              const ch = flat[cellIndex];
              const numAtCell = computed?.cellNumber[row][col] ?? null;
              const isBlock = ch === '#';
              const value = isBlock || ch.trim() === '' ? '' : ch;
              const isActive = !isBlock && activeEntryCellIndices.has(cellIndex);

              return (
                <div
                  key={cellIndex}
                  className={`cell ${isBlock ? 'block' : ''} ${isActive ? 'cellActive' : ''} ${
                    editMode === 'block' ? 'cellClickable' : ''
                  }`}
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
                      tabIndex={editMode === 'block' ? -1 : 0}
                      readOnly={editMode === 'block'}
                      onFocus={() => {
                        if (editMode === 'block') return;
                        pickCell(cellIndex);
                      }}
                      onChange={(e) => onCellChange(cellIndex, e.target.value)}
                      onKeyDown={(e) => {
                        if (editMode === 'block') return;
                        if (e.code === 'Space') {
                          e.preventDefault();
                          toggleDirection();
                          return;
                        }
                        if (e.key === 'Backspace') {
                          if (value) {
                            // Let onChange clear current + move prev.
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

          <div className="statusBar">
            {editMode === 'block' ? (
              <span className="hint">
                Starting layouts are editable — add or remove black squares anytime.
                {symmetry ? ' Symmetry mirrors each toggle.' : ''}
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

      <ShuffleConfirmModal
        open={shuffleConfirmOpen}
        onClose={() => setShuffleConfirmOpen(false)}
        onConfirm={applyShuffle}
      />
    </div>
  );
}
