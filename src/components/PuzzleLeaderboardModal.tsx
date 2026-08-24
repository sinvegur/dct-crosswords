import { useEffect, useState } from 'react';
import { formatElapsedMs } from '@/crossword/CrosswordPlayer';
import type { Puzzle } from '@/crossword/types';
import { getLeaderboard, type LeaderboardEntry } from '@/lib/storage';

type Props = {
  open: boolean;
  puzzle: Puzzle | null;
  onClose: () => void;
};

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export function PuzzleLeaderboardModal({ open, puzzle, onClose }: Props) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !puzzle) {
      setEntries([]);
      setFetchError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setFetchError(null);
    setEntries([]);

    void getLeaderboard(puzzle.id, 200)
      .then((data) => {
        if (!cancelled) setEntries(data);
      })
      .catch((err) => {
        if (!cancelled) setFetchError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, puzzle?.id]);

  if (!open || !puzzle) return null;

  return (
    <div className="modalOverlay" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="puzzle-leaderboard-title"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(520px, 100%)' }}
      >
        <div className="modalHeader">
          <h2 id="puzzle-leaderboard-title" className="modalTitle">
            {puzzle.title}
          </h2>
          <button type="button" className="modalClose" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {loading ? (
            <div className="emptyState">
              <p className="subtle">Loading…</p>
            </div>
          ) : fetchError ? (
            <div className="emptyState">
              <p className="loginError">{fetchError}</p>
            </div>
          ) : entries.length === 0 ? (
            <div className="emptyState">
              <p className="subtle">No one has solved this puzzle yet.</p>
            </div>
          ) : (
            <ol className="leaderboardList puzzleLeaderboardList">
              {entries.map((entry, index) => (
                <li key={entry.id} className="leaderboardRow">
                  <span className="leaderboardRank">{index + 1}</span>
                  <span className="leaderboardName">{entry.solverName}</span>
                  <span className="leaderboardTime">{formatElapsedMs(entry.elapsedMs)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="modalFooter">
          <button type="button" className="btn btnPrimary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
