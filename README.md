# DCT Crosswords

A Turkish-language crossword puzzle app — build a 15×15 puzzle, publish it, and share a link. Solvers play in the browser with a live timer and land on a leaderboard when they finish. No accounts needed to solve; one creator account handles building and publishing.

Built as a personal project (and a gift), with full Turkish character support (İ/ı, Ğ, Ş, Ö, Ü, Ç) throughout — grid input, clue text, and slug generation.

## Live app

[dct-crosswords.vercel.app](https://dct-crosswords.vercel.app)

## Features

**Creator (signed in)**
- Grid designer: click-to-toggle blocks, letter entry, optional 180° rotational symmetry
- Start from a template (a few preset block layouts, or a blank grid) or shuffle for a fresh layout
- Draft/publish workflow — drafts are only visible to the signed-in creator; publishing generates a shareable slug (`/p/your-puzzle-title`)
- Per-puzzle leaderboard view from the dashboard, showing every solver's name and time

**Solver (no account)**
- Open a puzzle's link, enter a name, solve
- Keyboard navigation (arrow movement within a word, Tab/Shift+Tab between clues), click-to-select clues, click-to-toggle direction on cells that start both an across and down entry
- Live timer, then a results screen with the puzzle's leaderboard on finishing

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

The creator account itself is created manually in the Supabase dashboard (Authentication → Users) — there's no public sign-up flow by design.

```bash
npm run dev       # local dev server
npm run build     # production build
npm run preview   # preview a production build locally
```

## Project structure

```
src/
  crossword/       # grid engine (entry numbering), PuzzleDesigner, CrosswordPlayer
  components/       # modals and other shared UI
  lib/              # Supabase client, storage/data-access functions
  data/             # starting grid templates, sample puzzle data
supabase/           # SQL schema and migrations, run manually in the Supabase SQL editor
```

## Data model

Two tables. `puzzles` stores the whole 15×15 grid and clue set as a couple of columns (a `text[]` for the grid, `jsonb` for clues) rather than normalizing into per-cell rows — the grid is always read and written as one unit, so there's no relational benefit to splitting it up. `attempts` is the leaderboard: one row per finished solve, with a free-text solver name (no accounts) and elapsed time.

Row Level Security enforces the access rules directly in Postgres, since there's no backend server sitting in front of the database: anyone can read published puzzles and the leaderboard, only the authenticated creator can read drafts or write puzzles, and anyone can submit an attempt (finishing a puzzle doesn't require being logged in).
