import { useEffect, useMemo, useRef, useState } from 'react';
import type { Puzzle15 } from './types';
import { SIZE_15, type Direction, type Entry, computeEntries15 } from './engine';
import {
  getAttemptRank,
  getLeaderboard,
  submitAttempt,
  type LeaderboardEntry,
} from '@/lib/storage';

const SOLVER_NAME_KEY = 'dct-crosswords:solverName';

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
  const trimmed = raw.replace(/\s+/g, '');
  if (!trimmed) return '';
  const ch = trimmed[trimmed.length - 1];
  return ch.toLocaleUpperCase('tr-TR');
}

export function formatElapsedMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export { SOLVER_NAME_KEY };

type Props = {
  puzzle: Puzzle15;
  solverName: string;
  onChangeName?: () => void;
};

export function CrosswordPlayer({ puzzle, solverName, onChangeName }: Props) {
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

  const submittedRef = useRef(false);

  useEffect(() => {
    setFilled(Array.from({ length: SIZE_15 * SIZE_15 }, () => ''));
    setActiveCellIndex(null);
    setActiveDirection('across');
    setActiveEntryNumber(null);
    setStartAtMs(Date.now());
    setSolved(false);
    setElapsedMs(null);
    setTickNowMs(Date.now());
    setLeaderboard([]);
    setUserRank(null);
    setAttemptId(null);
    setSubmitError(null);
    submittedRef.current = false;
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

  const [startAtMs, setStartAtMs] = useState(() => Date.now());
  const [tickNowMs, setTickNowMs] = useState(() => Date.now());
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [solved, setSolved] = useState(false);

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [userRank, setUserRank] = useState<number | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [resultsLoading, setResultsLoading] = useState(false);

  const [bestTimeMs, setBestTimeMs] = useState<number | null>(null);

  useEffect(() => {
    const key = `dct-crosswords:bestTime:${puzzle.id}`;
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    setBestTimeMs(parsed);
  }, [puzzle.id]);

  useEffect(() => {
    if (solved) return;
    const id = window.setInterval(() => setTickNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [solved]);

  const liveElapsedMs = !solved ? tickNowMs - startAtMs : elapsedMs;

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
    if (el) el.focus();
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

  const resolveEntryAtCell = (cellIndex: number, direction: Direction): Entry | undefined => {
    const { row, col } = posOf(cellIndex);
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
    const indices = entry.cells.map((c) => idxOf(c.row, c.col));
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
    let entry = resolveEntryAtCell(cellIndex, activeDirection);
    if (!entry) return;

    let indices = entry.cells.map((c) => idxOf(c.row, c.col));
    let pos = indices.indexOf(cellIndex);

    if (pos === -1) {
      entry = resolveEntryAtCell(cellIndex, activeDirection === 'across' ? 'down' : 'across');
      if (!entry) return;
      indices = entry.cells.map((c) => idxOf(c.row, c.col));
      pos = indices.indexOf(cellIndex);
      if (pos === -1) return;
      handlePickCell(cellIndex);
    }

    if (pos === 0) return;

    const prev = indices[pos - 1]!;
    const nextFilled = filled.slice();
    nextFilled[prev] = '';
    setFilled(nextFilled);
    handlePickCell(prev);
    focusCell(prev);
    setActiveCellIndex(prev);
  };

  const focusEntry = (direction: Direction, entryNumber: number) => {
    const entry = computed.entryByNumberDirection(direction, entryNumber);
    if (!entry || solved) return;
    const firstCell = idxOf(entry.start.row, entry.start.col);
    setActiveDirection(direction);
    setActiveEntryNumber(entryNumber);
    setActiveCellIndex(firstCell);
    focusCell(firstCell);
  };

  const stepEntry = (delta: 1 | -1) => {
    const entries = activeDirection === 'across' ? computed.entriesAcross : computed.entriesDown;
    if (entries.length === 0) return;

    const currentIdx =
      activeEntryNumber == null
        ? -1
        : entries.findIndex((entry) => entry.number === activeEntryNumber);

    let nextIdx: number;
    if (currentIdx === -1) {
      nextIdx = delta === 1 ? 0 : entries.length - 1;
    } else {
      nextIdx = currentIdx + delta;
      if (nextIdx < 0) nextIdx = entries.length - 1;
      if (nextIdx >= entries.length) nextIdx = 0;
    }

    focusEntry(activeDirection, entries[nextIdx]!.number);
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
    if (!checkSolved(nextFilled)) return;

    const elapsed = Date.now() - startAtMs;
    setSolved(true);
    setElapsedMs(elapsed);
    setTickNowMs(Date.now());

    const key = `dct-crosswords:bestTime:${puzzle.id}`;
    const prevRaw = localStorage.getItem(key);
    const prev = prevRaw ? Number(prevRaw) : null;
    if (prev == null || !Number.isFinite(prev) || elapsed < prev) {
      localStorage.setItem(key, String(elapsed));
      setBestTimeMs(elapsed);
    }
  };

  const onCellInputChange = (cellIndex: number, raw: string) => {
    if (solved) return;
    if (blockSet.has(cellIndex)) return;
    handlePickCell(cellIndex);

    const letter = normalizeLetter(raw);
    const next = filled.slice();

    if (!letter) {
      next[cellIndex] = '';
    } else {
      next[cellIndex] = letter;
    }

    setFilled(next);
    finishIfSolved(next);

    const entry = resolveEntryAtCell(cellIndex, activeDirection);
    if (!entry) return;

    if (!letter) moveInResolvedEntry(entry, cellIndex, -1);
    else moveInResolvedEntry(entry, cellIndex, 1);
  };

  const userOnLeaderboard = attemptId != null && leaderboard.some((e) => e.id === attemptId);
  const showRankOutsideTop =
    userRank != null && leaderboard.length > 0 && !userOnLeaderboard;

  return (
    <div className="layout layoutSolver">
      <div className="panel solverCluePanel">
        <div className="panelHeader">Across</div>
        <div className="clues cluesScroll">
          <div className="directionHeader">
            <span className="subtle">Toggle direction with SPACE</span>
          </div>
          {computed.entriesAcross.map((e) => {
            const isActive = activeDirection === 'across' && activeEntryNumber === e.number;
            const clue = puzzle.clues.across[e.number] ?? '';
            return (
              <div
                key={`across:${e.number}`}
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
        <div className="controlsRow">
          <div>
            <div className="title" style={{ fontSize: 16 }}>
              {puzzle.title}
            </div>
            <div className="subtle solverMeta">
              <span>Solving as {solverName}</span>
              {onChangeName ? (
                <>
                  {' · '}
                  <button type="button" className="linkButton" onClick={onChangeName}>
                    Not you? Change name
                  </button>
                </>
              ) : null}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div className="solverTimer" aria-live="polite">
              {formatElapsedMs(liveElapsedMs ?? tickNowMs - startAtMs)}
            </div>
            {!solved ? (
              <div className="subtle">
                Active: {activeEntry ? `${activeDirection.toUpperCase()} ${activeEntry.number}` : '—'}
              </div>
            ) : null}
          </div>
        </div>

        {solved ? (
          <div className="solverResults">
            <div className="solverResultsHeader">
              <div className="title">Solved!</div>
              <div className="subtle">
                Your time: <strong>{elapsedMs != null ? formatElapsedMs(elapsedMs) : '—'}</strong>
              </div>
            </div>

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
        ) : (
          <div className="gridWrap">
            <div className="subtle" style={{ marginBottom: 8 }}>
              Click a cell, type letters (Turkish uppercase). Toggle direction with `SPACE`.
            </div>
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
                        if (e.key === 'Tab') {
                          e.preventDefault();
                          if (solved) return;
                          stepEntry(e.shiftKey ? -1 : 1);
                          return;
                        }
                        if (e.code === 'Space') {
                          e.preventDefault();
                          toggleDirectionForActiveCell();
                          return;
                        }
                        if (e.key === 'Backspace') {
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
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
