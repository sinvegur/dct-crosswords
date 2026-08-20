import { useCallback, useMemo, useState } from 'react';
import { CrosswordPlayer } from '@/crossword/CrosswordPlayer';
import { PuzzleDesigner } from '@/crossword/PuzzleDesigner';
import { StartingGridModal } from '@/components/StartingGridModal';
import type { Puzzle15 } from '@/crossword/types';
import type { Template15 } from '@/data/templates';
import { deletePuzzle, listPuzzles, savePuzzle } from '@/lib/storage';

type Mode = 'home' | 'design' | 'play';

export default function App() {
  const [mode, setMode] = useState<Mode>('home');
  const [puzzles, setPuzzles] = useState<Puzzle15[]>(() => listPuzzles());
  const [playId, setPlayId] = useState<string | null>(null);
  const [editPuzzle, setEditPuzzle] = useState<Puzzle15 | undefined>(undefined);
  const [startingTemplate, setStartingTemplate] = useState<Template15 | undefined>(undefined);
  const [gridModalOpen, setGridModalOpen] = useState(false);

  const playing = useMemo(
    () => (playId ? puzzles.find((p) => p.id === playId) : undefined),
    [playId, puzzles],
  );

  const refresh = () => setPuzzles(listPuzzles());

  const goHome = () => {
    setMode('home');
    setPlayId(null);
    setEditPuzzle(undefined);
    setStartingTemplate(undefined);
    setGridModalOpen(false);
    refresh();
  };

  const openNewPuzzleModal = useCallback(() => {
    setEditPuzzle(undefined);
    setStartingTemplate(undefined);
    setPlayId(null);
    setGridModalOpen(true);
  }, []);

  return (
    <div className="page">
      <div className="header">
        <button type="button" className="logoButton" onClick={goHome} aria-label="Home">
          <img
            className="logoImg"
            src="/dct_crosswords_transparent.png"
            alt="DCT Crosswords"
          />
        </button>
        <div className="nav">
          <button
            type="button"
            className={`btn ${mode === 'home' ? 'btnPrimary' : ''}`}
            onClick={goHome}
          >
            Puzzles
          </button>
          <button
            type="button"
            className={`btn ${gridModalOpen || (mode === 'design' && !editPuzzle) ? 'btnPrimary' : ''}`}
            onClick={openNewPuzzleModal}
          >
            New puzzle
          </button>
        </div>
      </div>

      {mode === 'home' ? (
        <div className="panel">
          <div className="panelHeader">Saved puzzles</div>
          {puzzles.length === 0 ? (
            <div className="emptyState">
              <p>No puzzles yet.</p>
              <button type="button" className="btn btnPrimary" onClick={openNewPuzzleModal}>
                Create your first puzzle
              </button>
            </div>
          ) : (
            <ul className="puzzleList">
              {puzzles.map((p) => (
                <li key={p.id} className="puzzleRow">
                  <div>
                    <div className="puzzleTitle">{p.title}</div>
                    <div className="subtle">
                      {p.meta?.createdAtISO
                        ? new Date(p.meta.createdAtISO).toLocaleString('en-US')
                        : p.id}
                    </div>
                  </div>
                  <div className="puzzleActions">
                    <button
                      type="button"
                      className="btn btnPrimary"
                      onClick={() => {
                        setPlayId(p.id);
                        setMode('play');
                      }}
                    >
                      Play
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        setEditPuzzle(p);
                        setStartingTemplate(undefined);
                        setMode('design');
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        if (!confirm(`Delete “${p.title}”?`)) return;
                        deletePuzzle(p.id);
                        refresh();
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {mode === 'design' ? (
        <PuzzleDesigner
          key={editPuzzle?.id ?? startingTemplate?.id ?? 'design'}
          initial={editPuzzle}
          startingTemplate={editPuzzle ? undefined : startingTemplate}
          onCancel={goHome}
          onSaved={(puzzle) => {
            savePuzzle(puzzle);
            refresh();
            setEditPuzzle(undefined);
            setStartingTemplate(undefined);
            setMode('home');
          }}
        />
      ) : null}

      {mode === 'play' && playing ? <CrosswordPlayer puzzle={playing} /> : null}
      {mode === 'play' && !playing ? (
        <div className="panel">
          <div className="emptyState">
            <p>Puzzle not found.</p>
            <button type="button" className="btn" onClick={() => setMode('home')}>
              Back
            </button>
          </div>
        </div>
      ) : null}

      <StartingGridModal
        open={gridModalOpen}
        onClose={() => setGridModalOpen(false)}
        onCreate={(template) => {
          setEditPuzzle(undefined);
          setStartingTemplate(template);
          setGridModalOpen(false);
          setMode('design');
        }}
      />
    </div>
  );
}
