import { useMemo, useRef, useState } from 'react';
import { SIZE_15, computeEntries15, type Direction } from './engine';
import type { Puzzle15 } from './types';
import {
  TEMPLATES_15,
  mirrorPos,
  templateToEmptySolution,
  type StartingGridId,
  type Template15,
} from '@/data/templates';
import { ShuffleConfirmModal } from '@/components/ShuffleConfirmModal';

function idxOf(row: number, col: number) {
  return row * SIZE_15 + col;
}

function posOf(index: number) {
  return { row: Math.floor(index / SIZE_15), col: index % SIZE_15 };
}

function normalizeLetter(raw: string) {
  const trimmed = raw.replace(/\s+/g, '');
  if (!trimmed) return '';
  return trimmed[trimmed.length - 1].toLocaleUpperCase('tr-TR');
}

function gridFromRows(rows: string[]): string[] {
  return rows.map((r) => r.padEnd(SIZE_15, ' ').slice(0, SIZE_15));
}

function rowsToFlat(rows: string[]): string[] {
  return rows.flatMap((r) => r.split(''));
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

function pickShuffleTemplate(excludeId: StartingGridId | null): Template15 {
  const patterned = TEMPLATES_15.filter((t) => t.id !== 'blank');
  const pool = patterned.filter((t) => t.id !== excludeId);
  const choices = pool.length > 0 ? pool : patterned;
  return choices[Math.floor(Math.random() * choices.length)]!;
}

type EditMode = 'letter' | 'block';

type Props = {
  initial?: Puzzle15;
  /** Starting layout when creating a new puzzle (from the modal). */
  startingTemplate?: Template15;
  onSaved: (puzzle: Puzzle15) => void;
  onCancel: () => void;
};

export function PuzzleDesigner({ initial, startingTemplate, onSaved, onCancel }: Props) {
  const [title, setTitle] = useState(initial?.title ?? 'New puzzle');
  const [rows, setRows] = useState<string[]>(() => {
    if (initial?.solutionGrid) return initial.solutionGrid;
    if (startingTemplate) return templateToEmptySolution(startingTemplate);
    return Array.from({ length: SIZE_15 }, () => ' '.repeat(SIZE_15));
  });

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
    const nextTemplate = pickShuffleTemplate(lastShuffledTemplateId);
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

  const solutionGrid = useMemo(() => gridFromRows(rows), [rows]);
  const computed = useMemo(() => {
    try {
      return computeEntries15(solutionGrid);
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
    return new Set(activeEntry.cells.map((c) => idxOf(c.row, c.col)));
  }, [activeEntry]);

  const flat = useMemo(() => rowsToFlat(solutionGrid), [solutionGrid]);

  const setCellLetter = (cellIndex: number, letter: string) => {
    const { row, col } = posOf(cellIndex);
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
        const m = mirrorPos(row, col);
        apply(m.row, m.col);
      }
      return next.map((r) => r.join(''));
    });
    setActiveEntryNumber(null);
    setActiveCellIndex(null);
  };

  const pickCell = (cellIndex: number) => {
    const { row, col } = posOf(cellIndex);
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

  const toggleDirection = () => {
    if (activeCellIndex == null || !computed) return;
    const { row, col } = posOf(activeCellIndex);
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

  const moveInEntry = (from: number, delta: 1 | -1) => {
    if (!activeEntry) return;
    const indices = activeEntry.cells.map((c) => idxOf(c.row, c.col));
    const pos = indices.indexOf(from);
    if (pos === -1) return;
    const next = indices[pos + delta];
    if (next == null) return;
    focusCell(next);
  };

  const onCellChange = (cellIndex: number, raw: string) => {
    if (editMode === 'block') return;
    pickCell(cellIndex);
    const letter = normalizeLetter(raw);
    setCellLetter(cellIndex, letter);
    if (letter) moveInEntry(cellIndex, 1);
    else moveInEntry(cellIndex, -1);
  };

  const onCellClick = (cellIndex: number) => {
    const { row, col } = posOf(cellIndex);
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

  const canSave =
    Boolean(title.trim()) &&
    computed != null &&
    incompleteEntries.length === 0 &&
    missingClues.length === 0 &&
    computed.allEntries.length > 0;

  const handleSave = () => {
    if (!canSave || !computed) return;

    const cleanGrid = solutionGrid.map((row) =>
      row
        .split('')
        .map((ch) => (ch === '#' ? '#' : ch.trim() === '' ? '?' : ch))
        .join(''),
    );

    if (cleanGrid.some((r) => r.includes('?'))) return;

    const puzzle: Puzzle15 = {
      id: initial?.id ?? `puzzle-${Date.now()}`,
      title: title.trim(),
      solutionGrid: cleanGrid,
      clues: { across: cluesAcross, down: cluesDown },
      meta: {
        createdBy: initial?.meta?.createdBy ?? 'local',
        createdAtISO: initial?.meta?.createdAtISO ?? new Date().toISOString(),
      },
    };
    onSaved(puzzle);
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
                    focusCell(idxOf(e.start.row, e.start.col));
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
                    focusCell(idxOf(e.start.row, e.start.col));
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
            <div className="subtle">
              {editMode === 'block'
                ? 'Block mode: click cells to toggle white ↔ black.'
                : 'Letter mode: type answers (Turkish uppercase). Toggle direction with SPACE.'}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn" onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="btn btnPrimary" disabled={!canSave} onClick={handleSave}>
              Save
            </button>
          </div>
        </div>

        <div className="editorToolbar">
          <div className="modeToggle" role="group" aria-label="Edit mode">
            <button
              type="button"
              className={`btn ${editMode === 'letter' ? 'btnPrimary' : ''}`}
              onClick={() => setEditMode('letter')}
            >
              Letter mode
            </button>
            <button
              type="button"
              className={`btn ${editMode === 'block' ? 'btnPrimary' : ''}`}
              onClick={() => setEditMode('block')}
            >
              Block mode
            </button>
          </div>

          <label className={`symmetryToggle ${symmetry ? 'isOn' : ''}`}>
            <input
              type="checkbox"
              checked={symmetry}
              onChange={(e) => setSymmetry(e.target.checked)}
            />
            <span className="symmetrySwitch" aria-hidden />
            <span className="symmetryLabel">180° block symmetry</span>
          </label>

          <button type="button" className="btn" onClick={requestShuffle}>
            Shuffle
          </button>
        </div>

        <div className="gridWrap">
          <div className={`grid ${editMode === 'block' ? 'gridBlockMode' : ''}`}>
            {Array.from({ length: SIZE_15 * SIZE_15 }, (_, cellIndex) => {
              const { row, col } = posOf(cellIndex);
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
                  {!isBlock && editMode === 'letter' ? (
                    <input
                      ref={(el) => {
                        inputsRef.current[cellIndex] = el;
                      }}
                      value={value}
                      maxLength={1}
                      inputMode="text"
                      autoCorrect="off"
                      spellCheck={false}
                      onFocus={() => pickCell(cellIndex)}
                      onChange={(e) => onCellChange(cellIndex, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.code === 'Space') {
                          e.preventDefault();
                          toggleDirection();
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

      <ShuffleConfirmModal
        open={shuffleConfirmOpen}
        onClose={() => setShuffleConfirmOpen(false)}
        onConfirm={applyShuffle}
      />
    </div>
  );
}
