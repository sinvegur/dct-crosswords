# DCT Crosswords

A Turkish-language crossword app — build a 15×15 / 9×9 / 5×5 puzzle, publish it, and share a link. Solvers play in the browser with a live timer and land on a leaderboard when they finish. No account is needed to solve; constructors sign in to build and publish.

Built as a personal project, with full Turkish character support (İ/ı, Ğ, Ş, Ö, Ü, Ç) throughout — grid input, clue text, and slug generation.

## Live app

[dctcrosswords.online](https://dctcrosswords.online)

## Features

**Constructing (signed in)**

- **Modeless grid editing** — type letters to fill answers, type a full stop (`.`) to make a black square, click a black square to undo it. There's no mode to switch between.
- **Undo / redo** for grid edits, with keyboard shortcuts
- Optional **180° rotational symmetry**, mirroring each black square as you place it
- **Linked clues** — mark two or more entries as belonging together (the "With 17-Across, …" pattern) and the linked squares tint in both the builder and the solver
- Start from a template — four block layouts for 15×15, or a blank grid at any size
- **Draft / publish / unpublish** — drafts are visible only to signed-in constructors, publishing generates a shareable slug (`/p/your-puzzle-title`), and unpublishing takes a live puzzle back to draft without losing recorded solve times
- Per-puzzle leaderboard view from the dashboard

**Solving (no account)**

- Open a puzzle's link, enter a name, solve
- **Check** — verifies filled squares against the solution: correct letters turn blue and lock, wrong ones get a red slash and stay editable
- Keyboard navigation — arrow keys move square by square (an arrow perpendicular to your current direction switches orientation), Tab/Shift+Tab step between clues, Space toggles direction
- Typing and backspace stay **inside the current word**: on the last square, typing overwrites in place rather than jumping to the next clue
- **Mobile on-screen keyboard** — full QWERTY plus a panel for Turkish letters, so solving doesn't depend on the device's keyboard layout
- Live timer, personal best times, and on finishing a results screen that switches between the **leaderboard and the completed grid**

## Tech stack

- [Vite](https://vitejs.dev/) + [React 19](https://react.dev/) + TypeScript
- [React Router](https://reactrouter.com/) for client-side routing
- [Supabase](https://supabase.com/) (Postgres + Auth) as the backend — the app talks to it directly from the browser, no custom server
- Deployed on [Vercel](https://vercel.com/)

## Local setup

```bash
npm install
```

Create a `.env` file in the project root with your Supabase project's URL and public anon key:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Then run the database setup once, in the Supabase SQL editor for your project:

1. `supabase/schema.sql` — creates the `puzzles` and `attempts` tables with Row Level Security policies
2. `supabase/002_add_draft_status.sql` — adds draft/published status (already folded into `schema.sql` for fresh projects, but kept as a record of the migration)

```bash
npm run dev       # local dev server
npm run build     # production build
npm run preview   # preview a production build locally
```

### Constructor accounts

There's no public sign-up — accounts are created by hand in the Supabase dashboard (Authentication → Users), with **Auto Confirm User** checked.

Supabase Auth identifies users by email address, but people sign in here with a plain username. The login form appends a fixed domain, so an account created as `someone@dctcrosswords.online` signs in as just `someone`. The address is only ever an identifier — it never receives mail, which also means password resets have to be done from the dashboard. A full email address typed into the form still works unchanged.

## Project structure

```
src/
  crossword/        # grid engine (entry numbering), PuzzleDesigner, CrosswordPlayer
  components/       # modals and other shared UI
  lib/              # Supabase client, storage/data-access functions
  data/             # starting grid templates
supabase/           # SQL schema and migrations, run manually in the Supabase SQL editor
```

## Data model

Two tables. `puzzles` stores the whole grid and clue set as a couple of columns (a `text[]` for the grid, `jsonb` for clues) rather than normalizing into per-cell rows — the grid is always read and written as one unit, so there's no relational benefit to splitting it up. Clue links live inside that same `jsonb`, which is why adding them needed no migration. `attempts` is the leaderboard: one row per finished solve, with a free-text solver name and elapsed time.

Row Level Security enforces the access rules directly in Postgres, since there's no backend server sitting in front of the database:

- anyone can read **published** puzzles and the leaderboard
- only an authenticated constructor can read drafts or write puzzles
- anyone can submit an attempt, since finishing a puzzle doesn't require being logged in

That last policy is deliberately open, and worth naming: leaderboard times are unauthenticated and therefore forgeable. For a puzzle shared between friends that's an acceptable trade. Closing it properly would mean validating solves server-side, which is a different architecture than this app needs.

## How it was built

The commit history is the interesting part of this repo. It was written almost entirely through AI pair-programming, using a deliberate two-role workflow recorded in [`TASKS.md`](TASKS.md): one model writes task specifications and reviews the resulting diffs, another implements them, and each task lands as a single reviewed commit.

The history keeps the parts that usually get squashed away — approaches that were tried and reverted, regressions caught by using the app rather than by reading the diff, and commit messages that explain *why* a change was made rather than restating what it did.
