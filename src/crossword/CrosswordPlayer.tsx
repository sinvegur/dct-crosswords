import { useEffect, useMemo, useRef, useState } from 'react';
import type { Puzzle15 } from './types';
import { SIZE_15, type Direction, computeEntries15 } from './engine';

function idxOf(row: number, col: number) {
  return row * SIZE_15 + col;
}

function posOf(index: number) {
  return { row: Math.floor(index / SIZE_15), col: index % SIZE_15 };
}

function keyOf(row: number, col: number) {
  return `${row},${col}`;
}

function normalizeLetter(raw: string) {
  // Take the last typed character (handles cases like IME/paste).
  const trimmed = raw.replace(/\s+/g, '');
  if (!trimmed) return '';
  const ch = trimmed[trimmed.length - 1];
  return ch.toLocaleUpperCase('tr-TR');
}

export function CrosswordPlayer({ puzzle }: { puzzle: Puzzle15 }) {
  const computed = useMemo(() => computeEntries15(puzzle.solutionGrid), [puzzle.id]);
  const solutionChars = useMemo(() => puzzle.solutionGrid.flatMap((r) => r.split('')), [puzzle.solutionGrid]);

  const blockSet = useMemo(() => {
    const set = new Set<number>();
    for (let i = 0; i < solutionChars.length; i++) {
      if (solutionChars[i] === '#') set.add(i);
    }
    return set;
  }, [solutionChars]);

  const [filled, setFilled] = useState<string[]>(() => Array.from({ length: SIZE_15 * SIZE_15 }, () => ''));

  useEffect(() => {
    // Reset when puzzle changes.
    setFilled(Array.from({ length: SIZE_15 * SIZE_15 }, () => ''));
    setActiveCellIndex(null);
    setActiveDirection('across');
    setActiveEntryNumber(null);
    setStartAtMs(null);
    setSolved(false);
    setElapsedMs(null);
  }, [puzzle.id]);

  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  const [activeDirection, setActiveDirection] = useState<Direction>('across');
  const [activeEntryNumber, setActiveEntryNumber] = useState<number | null>(null);
  const [activeCellIndex, setActiveCellIndex] = useState<number | null>(null);

  const activeEntry = useMemo(() => {
    if (activeEntryNumber == null) return undefined;
    return computed.entryByNumberDirection(activeDirection, activeEntryNumber);
  }, [computed, activeDirection, activeEntryNumber]);

  const activeEntryCellIndices = useMemo(() => {
    if (!activeEntry) return new Set<number>();
    return new Set(activeEntry.cells.map((c) => idxOf(c.row, c.col)));
  }, [activeEntry]);

  const [startAtMs, setStartAtMs] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [solved, setSolved] = useState(false);

  const [bestTimeMs, setBestTimeMs] = useState<number | null>(null);

  useEffect(() => {
    const key = `dct-crosswords:bestTime:${puzzle.id}`;
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    setBestTimeMs(parsed);
  }, [puzzle.id]);

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
    if (el) el.focus();
  };

  const moveToNextInActiveEntry = (currentCellIndex: number, direction: Direction) => {
    const entry =
      direction === 'across'
        ? computed.entriesAcross.find((e) => e.number === activeEntryNumber)
        : computed.entriesDown.find((e) => e.number === activeEntryNumber);

    if (!entry) return;

    const indices = entry.cells.map((c) => idxOf(c.row, c.col));
    const pos = indices.indexOf(currentCellIndex);
    if (pos === -1) return;
    const next = indices[pos + 1];
    if (next == null) return;
    focusCell(next);
    setActiveCellIndex(next);
  };

  const moveToPrevInActiveEntry = (currentCellIndex: number, direction: Direction) => {
    const entry =
      direction === 'across'
        ? computed.entriesAcross.find((e) => e.number === activeEntryNumber)
        : computed.entriesDown.find((e) => e.number === activeEntryNumber);

    if (!entry) return;
    const indices = entry.cells.map((c) => idxOf(c.row, c.col));
    const pos = indices.indexOf(currentCellIndex);
    if (pos === -1) return;
    const prev = indices[pos - 1];
    if (prev == null) return;
    focusCell(prev);
    setActiveCellIndex(prev);
  };

  const handlePickCell = (cellIndex: number) => {
    if (blockSet.has(cellIndex)) return;
    const { row, col } = posOf(cellIndex);

    const acrossNum = computed.acrossEntryNumberByCell.get(keyOf(row, col));
    const downNum = computed.downEntryNumberByCell.get(keyOf(row, col));

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

  const toggleDirectionForActiveCell = () => {
    if (activeCellIndex == null) return;
    const { row, col } = posOf(activeCellIndex);
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
    if (!startAtMs) return;
    if (!checkSolved(nextFilled)) return;

    const elapsed = Date.now() - startAtMs;
    setSolved(true);
    setElapsedMs(elapsed);

    const key = `dct-crosswords:bestTime:${puzzle.id}`;
    const prevRaw = localStorage.getItem(key);
    const prev = prevRaw ? Number(prevRaw) : null;
    if (prev == null || !Number.isFinite(prev) || elapsed < prev) {
      localStorage.setItem(key, String(elapsed));
      setBestTimeMs(elapsed);
    }
  };

  const onCellInputChange = (cellIndex: number, raw: string) => {
    if (blockSet.has(cellIndex)) return;
    if (!activeEntry) {
      // User typed before selecting an entry; pick based on activeDirection membership.
      handlePickCell(cellIndex);
    }

    const letter = normalizeLetter(raw);
    const next = filled.slice();

    if (!letter) {
      next[cellIndex] = '';
    } else {
      next[cellIndex] = letter;
      if (startAtMs == null) setStartAtMs(Date.now());
    }

    setFilled(next);
    finishIfSolved(next);

    const direction = activeDirection;
    if (!activeEntry) return;

    if (!letter) {
      moveToPrevInActiveEntry(cellIndex, direction);
    } else {
      moveToNextInActiveEntry(cellIndex, direction);
    }
  };

  return (
    <div className="layout">
      <div className="panel">
        <div className="panelHeader">Clues</div>
        <div className="clues">
          <div className="directionBlock">
            <div className="directionHeader">
              <span>ACROSS</span>
              <button className="btn" onClick={toggleDirectionForActiveCell} disabled={activeCellIndex == null}>
                Toggle (SPACE)
              </button>
            </div>
            {computed.entriesAcross.map((e) => {
              const isActive = activeDirection === 'across' && activeEntryNumber === e.number;
              const clue = puzzle.clues.across[e.number] ?? '';
              return (
                <div key={`across:${e.number}`} className={`clueItem ${isActive ? 'clueActive' : ''}`}>
                  <div className="clueNum">{e.number}</div>
                  <div className="clueText">{clue}</div>
                </div>
              );
            })}
          </div>

          <div className="directionBlock">
            <div className="directionHeader">
              <span>DOWN</span>
              <span className="hint">
                {elapsedMs != null ? `Solved in ${Math.round(elapsedMs / 1000)}s` : ''}
                {bestTimeMs != null && elapsedMs == null ? `Best: ${Math.round(bestTimeMs / 1000)}s` : ''}
              </span>
            </div>
            {computed.entriesDown.map((e) => {
              const isActive = activeDirection === 'down' && activeEntryNumber === e.number;
              const clue = puzzle.clues.down[e.number] ?? '';
              return (
                <div key={`down:${e.number}`} className={`clueItem ${isActive ? 'clueActive' : ''}`}>
                  <div className="clueNum">{e.number}</div>
                  <div className="clueText">{clue}</div>
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
              {puzzle.title}
            </div>
            <div className="subtle">
              Click a cell, type letters (Turkish uppercase). Toggle direction with `SPACE`.
            </div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div className="subtle">Active: {activeEntry ? `${activeDirection.toUpperCase()} ${activeEntry.number}` : '—'}</div>
          </div>
        </div>

        <div className="gridWrap">
          <div
            className="grid"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.code === 'Space') {
                e.preventDefault();
                toggleDirectionForActiveCell();
              }
            }}
          >
            {Array.from({ length: SIZE_15 * SIZE_15 }, (_, cellIndex) => {
              const { row, col } = posOf(cellIndex);
              const char = solutionChars[cellIndex];
              const numAtCell = computed.cellNumber[row][col];
              if (char === '#') {
                return <div key={cellIndex} className="cell block" />;
              }

              const value = filled[cellIndex] ?? '';
              const isActiveCell = activeEntryCellIndices.has(cellIndex);

              return (
                <div
                  key={cellIndex}
                  className={`cell ${isActiveCell ? 'cellActive' : ''}`}
                  onClick={() => handlePickCell(cellIndex)}
                >
                  {numAtCell != null ? <div className="cellNumber">{numAtCell}</div> : null}
                  <input
                    ref={(el) => {
                      inputsRef.current[cellIndex] = el;
                    }}
                    value={value}
                    maxLength={1}
                    inputMode="text"
                    autoCorrect="off"
                    spellCheck={false}
                    onFocus={() => handlePickCell(cellIndex)}
                    onChange={(e) => onCellInputChange(cellIndex, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.code === 'Space') {
                        e.preventDefault();
                        toggleDirectionForActiveCell();
                        return;
                      }
                      if (e.key === 'Backspace' && filled[cellIndex]) {
                        // Let onChange clear + move prev.
                        return;
                      }
                      if (e.key === 'Escape') {
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                  />
                </div>
              );
            })}
          </div>

          {solved && elapsedMs != null ? (
            <div style={{ marginTop: 12, padding: 12 }}>
              <div className="subtle">
                Solved! Time: <b>{Math.round(elapsedMs / 1000)}s</b>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

