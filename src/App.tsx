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
import {
  deletePuzzle,
  getPuzzle,
  getPuzzleBySlug,
  listPuzzles,
  savePuzzle,
} from '@/lib/storage';

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, signOut } = useAuth();
  const [puzzles, setPuzzles] = useState<Puzzle15[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [startingTemplate, setStartingTemplate] = useState<Template15 | undefined>(undefined);
  const [gridModalOpen, setGridModalOpen] = useState(false);

  const refresh = useCallback(async () => {
    setListError(null);
    try {
      const next = await listPuzzles();
      setPuzzles(next);
    } catch (err) {
      setListError(errorMessage(err));
      throw err;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setListLoading(true);
    listPuzzles()
      .then((next) => {
        if (!cancelled) setPuzzles(next);
      })
      .catch((err) => {
        if (!cancelled) setListError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const isHome = location.pathname === '/';
  const isNewDesign =
    location.pathname === '/design' || (gridModalOpen && !location.pathname.startsWith('/design/'));

  const goHome = () => {
    setStartingTemplate(undefined);
    setGridModalOpen(false);
    void refresh().finally(() => navigate('/'));
  };

  const openNewPuzzleModal = useCallback(() => {
    setStartingTemplate(undefined);
    setGridModalOpen(true);
    navigate('/design');
  }, [navigate]);

  const handleSaved = async (puzzle: Puzzle15) => {
    try {
      await savePuzzle(puzzle);
      await refresh();
      setStartingTemplate(undefined);
      setGridModalOpen(false);
      navigate('/');
    } catch (err) {
      alert(`Could not save puzzle: ${errorMessage(err)}`);
      throw err;
    }
  };

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
          {session ? (
            <>
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
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  await signOut();
                  navigate('/login');
                }}
              >
                Sign out
              </button>
            </>
          ) : null}
        </div>
      </div>

      <Routes>
        <Route
          path="/"
          element={
            <RequireAuth>
              <HomePage
                puzzles={puzzles}
                loading={listLoading}
                error={listError}
                onRefresh={() => void refresh()}
                onNewPuzzle={openNewPuzzleModal}
              />
            </RequireAuth>
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
                onSaved={handleSaved}
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
                listLoading={listLoading}
                onCancel={goHome}
                onSaved={handleSaved}
              />
            </RequireAuth>
          }
        />
        <Route path="/p/:slug" element={<PlayPage />} />
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
  loading,
  error,
  onRefresh,
  onNewPuzzle,
}: {
  puzzles: Puzzle15[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onNewPuzzle: () => void;
}) {
  const navigate = useNavigate();
  const [actionError, setActionError] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="panel">
        <div className="panelHeader">Saved puzzles</div>
        <div className="emptyState">
          <p className="subtle">Loading puzzles…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panelHeader">Saved puzzles</div>
      {error || actionError ? (
        <div className="emptyState">
          <p className="loginError">{error || actionError}</p>
          <button type="button" className="btn" onClick={onRefresh}>
            Retry
          </button>
        </div>
      ) : puzzles.length === 0 ? (
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
                <div className="puzzleTitleRow">
                  <div className="puzzleTitle">{p.title}</div>
                  <span
                    className={`puzzleStatus ${p.status === 'published' ? 'isPublished' : 'isDraft'}`}
                  >
                    {p.status === 'published' ? 'Published' : 'Draft'}
                  </span>
                </div>
                <div className="subtle">
                  {p.meta?.createdAtISO
                    ? new Date(p.meta.createdAtISO).toLocaleString('en-US')
                    : p.slug}
                </div>
              </div>
              <div className="puzzleActions">
                {p.status === 'published' ? (
                  <button
                    type="button"
                    className="btn btnPrimary"
                    onClick={() => navigate(`/p/${p.slug}`)}
                    disabled={!p.slug}
                  >
                    Play
                  </button>
                ) : null}
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
                  onClick={async () => {
                    if (!confirm(`Delete “${p.title}”?`)) return;
                    setActionError(null);
                    try {
                      await deletePuzzle(p.id);
                      onRefresh();
                    } catch (err) {
                      setActionError(errorMessage(err));
                    }
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
  onSaved: (puzzle: Puzzle15) => void | Promise<void>;
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
  listLoading,
  onCancel,
  onSaved,
}: {
  puzzles: Puzzle15[];
  listLoading: boolean;
  onCancel: () => void;
  onSaved: (puzzle: Puzzle15) => void | Promise<void>;
}) {
  const { id } = useParams<{ id: string }>();
  const fromList = useMemo(() => puzzles.find((p) => p.id === id), [puzzles, id]);
  const [fetched, setFetched] = useState<Puzzle15 | undefined>(undefined);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || fromList || listLoading) return;
    let cancelled = false;
    setFetching(true);
    getPuzzle(id)
      .then((p) => {
        if (!cancelled) setFetched(p);
      })
      .catch((err) => {
        if (!cancelled) setFetchError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setFetching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, fromList, listLoading]);

  const puzzle = fromList ?? fetched;

  if (listLoading || fetching) {
    return (
      <div className="panel">
        <div className="emptyState">
          <p className="subtle">Loading puzzle…</p>
        </div>
      </div>
    );
  }

  if (fetchError || !puzzle) {
    return (
      <div className="panel">
        <div className="emptyState">
          <p>{fetchError ?? 'Puzzle not found.'}</p>
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

function PlayPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [playing, setPlaying] = useState<Puzzle15 | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getPuzzleBySlug(slug)
      .then((p) => {
        if (!cancelled) setPlaying(p);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) {
    return (
      <div className="panel">
        <div className="emptyState">
          <p className="subtle">Loading puzzle…</p>
        </div>
      </div>
    );
  }

  if (playing) {
    return <CrosswordPlayer puzzle={playing} />;
  }

  return (
    <div className="panel">
      <div className="emptyState">
        <p>{error ?? 'Puzzle not found.'}</p>
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
