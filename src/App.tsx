import { useCallback, useEffect, useMemo, useState } from 'react';
import { PencilLine, Play, Trash2, Trophy } from 'lucide-react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { CrosswordPlayer, SOLVER_NAME_KEY } from '@/crossword/CrosswordPlayer';
import { PuzzleDesigner } from '@/crossword/PuzzleDesigner';
import { StartingGridModal } from '@/components/StartingGridModal';
import { DeletePuzzleConfirmModal } from '@/components/DeletePuzzleConfirmModal';
import { PuzzleLeaderboardModal } from '@/components/PuzzleLeaderboardModal';
import { PublishSuccessModal } from '@/components/PublishSuccessModal';
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
import { runGuarded } from '@/lib/navigationGuard';

const ROW_ACTION_ICON_SIZE = 16;

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
  const [publishSuccess, setPublishSuccess] = useState<{
    title: string;
    shareUrl: string;
  } | null>(null);

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
  const isSolverRoute = location.pathname.startsWith('/p/');
  const isNewDesign =
    location.pathname === '/design' || (gridModalOpen && !location.pathname.startsWith('/design/'));

  const goHome = () => {
    runGuarded(() => {
      setStartingTemplate(undefined);
      setGridModalOpen(false);
      void refresh().finally(() => navigate('/'));
    });
  };

  const openNewPuzzleModal = useCallback(() => {
    runGuarded(() => {
      setStartingTemplate(undefined);
      setGridModalOpen(true);
      navigate('/design');
    });
  }, [navigate]);

  const handleSaved = async (puzzle: Puzzle15, action: 'draft' | 'published') => {
    try {
      const saved = await savePuzzle(puzzle);
      await refresh();
      // Leave design before clearing template — otherwise DesignNewPage's
      // "no template" effect would reopen the starting-grid modal.
      navigate('/');
      setStartingTemplate(undefined);
      setGridModalOpen(false);
      if (action === 'published' && saved.slug) {
        setPublishSuccess({
          title: saved.title,
          shareUrl: `${window.location.origin}/p/${saved.slug}`,
        });
      }
    } catch (err) {
      alert(`Could not save puzzle: ${errorMessage(err)}`);
      throw err;
    }
  };

  return (
    <div className="page">
      <div className="header">
        {isSolverRoute ? (
          <img
            className="logoImg"
            src="/dct_crosswords_transparent.png"
            alt="DCT Crosswords"
          />
        ) : (
          <button type="button" className="logoButton" onClick={goHome} aria-label="Home">
            <img
              className="logoImg"
              src="/dct_crosswords_transparent.png"
              alt="DCT Crosswords"
            />
          </button>
        )}
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
                onClick={() => {
                  runGuarded(async () => {
                    await signOut();
                    navigate('/login');
                  });
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

      <PublishSuccessModal
        open={publishSuccess != null}
        puzzleTitle={publishSuccess?.title ?? ''}
        shareUrl={publishSuccess?.shareUrl ?? ''}
        onClose={() => setPublishSuccess(null)}
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
  const [deleteTarget, setDeleteTarget] = useState<Puzzle15 | null>(null);
  const [leaderboardTarget, setLeaderboardTarget] = useState<Puzzle15 | null>(null);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setActionError(null);
    setDeleting(true);
    try {
      await deletePuzzle(deleteTarget.id);
      setDeleteTarget(null);
      onRefresh();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

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
                <button
                  type="button"
                  className="toolbarControl"
                  aria-label="Edit"
                  title="Edit"
                  onClick={() => navigate(`/design/${p.id}`)}
                >
                  <PencilLine size={ROW_ACTION_ICON_SIZE} aria-hidden />
                </button>
                <button
                  type="button"
                  className="toolbarControl"
                  aria-label="Delete"
                  title="Delete"
                  onClick={() => setDeleteTarget(p)}
                >
                  <Trash2 size={ROW_ACTION_ICON_SIZE} aria-hidden />
                </button>
                <button
                  type="button"
                  className="toolbarControl"
                  aria-label="Play"
                  title={
                    p.status === 'published'
                      ? 'Play'
                      : 'Publish this puzzle to enable Play'
                  }
                  disabled={p.status !== 'published' || !p.slug}
                  onClick={() => navigate(`/p/${p.slug}`)}
                >
                  <Play size={ROW_ACTION_ICON_SIZE} aria-hidden />
                </button>
                <button
                  type="button"
                  className="toolbarControl"
                  aria-label="Leaderboard"
                  title={
                    p.status === 'published'
                      ? 'Leaderboard'
                      : 'Publish this puzzle to enable Leaderboard'
                  }
                  disabled={p.status !== 'published'}
                  onClick={() => setLeaderboardTarget(p)}
                >
                  <Trophy size={ROW_ACTION_ICON_SIZE} aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <PuzzleLeaderboardModal
        open={leaderboardTarget != null}
        puzzle={leaderboardTarget}
        onClose={() => setLeaderboardTarget(null)}
      />

      <DeletePuzzleConfirmModal
        open={deleteTarget != null}
        puzzleTitle={deleteTarget?.title ?? ''}
        deleting={deleting}
        onClose={() => {
          if (!deleting) setDeleteTarget(null);
        }}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}

function DesignNewPage({
  startingTemplate,
  setGridModalOpen,
  setStartingTemplate,
  onCancel,
  onSaved,
}: {
  startingTemplate: Template15 | undefined;
  setGridModalOpen: (open: boolean) => void;
  setStartingTemplate: (t: Template15 | undefined) => void;
  onCancel: () => void;
  onSaved: (puzzle: Puzzle15, action: 'draft' | 'published') => void | Promise<void>;
}) {
  // Open the template picker once when entering new-design without a template.
  // Do NOT depend on startingTemplate/gridModalOpen — clearing the template on
  // save would otherwise re-trigger and pop the modal on the puzzles list.
  useEffect(() => {
    if (!startingTemplate) {
      setGridModalOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only
  }, []);

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
  onSaved: (puzzle: Puzzle15, action: 'draft' | 'published') => void | Promise<void>;
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
  const [solverName, setSolverName] = useState<string | null>(() => {
    const stored = localStorage.getItem(SOLVER_NAME_KEY);
    return stored?.trim() ? stored.trim() : null;
  });
  const [showNameGate, setShowNameGate] = useState(() => {
    const stored = localStorage.getItem(SOLVER_NAME_KEY);
    return !stored?.trim();
  });
  const [nameDraft, setNameDraft] = useState('');

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

  const beginWithName = () => {
    const trimmed = nameDraft.trim();
    if (!trimmed) return;
    localStorage.setItem(SOLVER_NAME_KEY, trimmed);
    setSolverName(trimmed);
    setShowNameGate(false);
    setNameDraft('');
  };

  if (loading) {
    return (
      <div className="panel">
        <div className="emptyState">
          <p className="subtle">Loading puzzle…</p>
        </div>
      </div>
    );
  }

  if (playing && showNameGate) {
    return (
      <div className="panel solverGate">
        <div className="emptyState">
          <div className="title" style={{ fontSize: 20, marginBottom: 8 }}>
            {playing.title}
          </div>
          <p className="subtle" style={{ marginBottom: 16 }}>
            Enter your name to start the timer and join the leaderboard.
          </p>
          <form
            className="solverGateForm"
            onSubmit={(e) => {
              e.preventDefault();
              beginWithName();
            }}
          >
            <label className="loginField">
              <span className="fieldLabel">Your name</span>
              <input
                type="text"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                autoFocus
                maxLength={64}
                placeholder="e.g. Alex"
              />
            </label>
            <button type="submit" className="btn btnPrimary" disabled={!nameDraft.trim()}>
              Start
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (playing && solverName) {
    return (
      <CrosswordPlayer puzzle={playing} solverName={solverName} />
    );
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
