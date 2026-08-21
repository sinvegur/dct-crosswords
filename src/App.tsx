import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { CrosswordPlayer } from '@/crossword/CrosswordPlayer';
import { PuzzleDesigner } from '@/crossword/PuzzleDesigner';
import { StartingGridModal } from '@/components/StartingGridModal';
import {
  AuthProvider,
  CreatorLogin,
  RequireAuth,
  useAuth,
} from '@/components/CreatorLogin';
import type { Puzzle15 } from '@/crossword/types';
import type { Template15 } from '@/data/templates';
import { deletePuzzle, listPuzzles, savePuzzle } from '@/lib/storage';

function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, signOut } = useAuth();
  const [puzzles, setPuzzles] = useState<Puzzle15[]>(() => listPuzzles());
  const [startingTemplate, setStartingTemplate] = useState<Template15 | undefined>(undefined);
  const [gridModalOpen, setGridModalOpen] = useState(false);

  const refresh = () => setPuzzles(listPuzzles());

  const isHome = location.pathname === '/';
  const isNewDesign =
    location.pathname === '/design' || (gridModalOpen && !location.pathname.startsWith('/design/'));

  const goHome = () => {
    setStartingTemplate(undefined);
    setGridModalOpen(false);
    refresh();
    navigate('/');
  };

  const openNewPuzzleModal = useCallback(() => {
    setStartingTemplate(undefined);
    setGridModalOpen(true);
    navigate('/design');
  }, [navigate]);

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
            className={`btn ${isHome ? 'btnPrimary' : ''}`}
            onClick={goHome}
          >
            Puzzles
          </button>
          <button
            type="button"
            className={`btn ${isNewDesign ? 'btnPrimary' : ''}`}
            onClick={openNewPuzzleModal}
          >
            New puzzle
          </button>
          {session ? (
            <button type="button" className="btn" onClick={() => void signOut()}>
              Sign out
            </button>
          ) : null}
        </div>
      </div>

      <Routes>
        <Route
          path="/"
          element={
            <HomePage
              puzzles={puzzles}
              onRefresh={refresh}
              onNewPuzzle={openNewPuzzleModal}
            />
          }
        />
        <Route path="/login" element={<CreatorLogin />} />
        <Route
          path="/design"
          element={
            <RequireAuth>
              <DesignNewPage
                startingTemplate={startingTemplate}
                gridModalOpen={gridModalOpen}
                setGridModalOpen={setGridModalOpen}
                setStartingTemplate={setStartingTemplate}
                onCancel={goHome}
                onSaved={(puzzle) => {
                  savePuzzle(puzzle);
                  refresh();
                  setStartingTemplate(undefined);
                  navigate('/');
                }}
              />
            </RequireAuth>
          }
        />
        <Route
          path="/design/:id"
          element={
            <RequireAuth>
              <DesignEditPage
                puzzles={puzzles}
                onCancel={goHome}
                onSaved={(puzzle) => {
                  savePuzzle(puzzle);
                  refresh();
                  navigate('/');
                }}
              />
            </RequireAuth>
          }
        />
        <Route path="/p/:slug" element={<PlayPage puzzles={puzzles} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <StartingGridModal
        open={gridModalOpen && !!session}
        onClose={() => {
          setGridModalOpen(false);
          if (location.pathname === '/design' && !startingTemplate) {
            navigate('/');
          }
        }}
        onCreate={(template) => {
          setStartingTemplate(template);
          setGridModalOpen(false);
          navigate('/design');
        }}
      />
    </div>
  );
}

function HomePage({
  puzzles,
  onRefresh,
  onNewPuzzle,
}: {
  puzzles: Puzzle15[];
  onRefresh: () => void;
  onNewPuzzle: () => void;
}) {
  const navigate = useNavigate();

  return (
    <div className="panel">
      <div className="panelHeader">Saved puzzles</div>
      {puzzles.length === 0 ? (
        <div className="emptyState">
          <p>No puzzles yet.</p>
          <button type="button" className="btn btnPrimary" onClick={onNewPuzzle}>
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
                  onClick={() => navigate(`/p/${p.id}`)}
                >
                  Play
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => navigate(`/design/${p.id}`)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    if (!confirm(`Delete “${p.title}”?`)) return;
                    deletePuzzle(p.id);
                    onRefresh();
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
  );
}

function DesignNewPage({
  startingTemplate,
  gridModalOpen,
  setGridModalOpen,
  setStartingTemplate,
  onCancel,
  onSaved,
}: {
  startingTemplate: Template15 | undefined;
  gridModalOpen: boolean;
  setGridModalOpen: (open: boolean) => void;
  setStartingTemplate: (t: Template15 | undefined) => void;
  onCancel: () => void;
  onSaved: (puzzle: Puzzle15) => void;
}) {
  useEffect(() => {
    if (!startingTemplate && !gridModalOpen) {
      setGridModalOpen(true);
    }
  }, [startingTemplate, gridModalOpen, setGridModalOpen]);

  if (!startingTemplate) {
    return null;
  }

  return (
    <PuzzleDesigner
      key={startingTemplate.id}
      startingTemplate={startingTemplate}
      onCancel={() => {
        setStartingTemplate(undefined);
        onCancel();
      }}
      onSaved={onSaved}
    />
  );
}

function DesignEditPage({
  puzzles,
  onCancel,
  onSaved,
}: {
  puzzles: Puzzle15[];
  onCancel: () => void;
  onSaved: (puzzle: Puzzle15) => void;
}) {
  const { id } = useParams<{ id: string }>();
  const puzzle = useMemo(() => puzzles.find((p) => p.id === id), [puzzles, id]);

  if (!puzzle) {
    return (
      <div className="panel">
        <div className="emptyState">
          <p>Puzzle not found.</p>
          <button type="button" className="btn" onClick={onCancel}>
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <PuzzleDesigner
      key={puzzle.id}
      initial={puzzle}
      onCancel={onCancel}
      onSaved={onSaved}
    />
  );
}

function PlayPage({ puzzles }: { puzzles: Puzzle15[] }) {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  // Temporary: slug is the puzzle id until T013 adds a real slug field.
  const playing = useMemo(() => puzzles.find((p) => p.id === slug), [puzzles, slug]);

  if (playing) {
    return <CrosswordPlayer puzzle={playing} />;
  }

  return (
    <div className="panel">
      <div className="emptyState">
        <p>Puzzle not found.</p>
        <button type="button" className="btn" onClick={() => navigate('/')}>
          Back
        </button>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </BrowserRouter>
  );
}
