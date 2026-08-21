-- Run this once in the Supabase SQL Editor for this project.
-- One creator account (created manually in Supabase Auth), public solvers via slug links.

create extension if not exists pgcrypto;

create table if not exists puzzles (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  solution_grid text[] not null,
  clues jsonb not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now()
);

alter table puzzles enable row level security;

-- Solvers (anonymous) can only ever read published puzzles. Drafts are
-- visible only to the authenticated creator (see the next policy).
create policy "public read published puzzles"
  on puzzles for select
  using (status = 'published');

create policy "authenticated read all puzzles"
  on puzzles for select
  to authenticated
  using (true);

create policy "authenticated insert puzzles"
  on puzzles for insert
  to authenticated
  with check (true);

create policy "authenticated update puzzles"
  on puzzles for update
  to authenticated
  using (true);

create policy "authenticated delete puzzles"
  on puzzles for delete
  to authenticated
  using (true);

-- Leaderboard entries. No solver accounts for now (see TASKS.md) — solver_name
-- is a free-text display name, public insert.
create table if not exists attempts (
  id uuid primary key default gen_random_uuid(),
  puzzle_id uuid not null references puzzles(id) on delete cascade,
  solver_name text not null,
  elapsed_ms integer not null,
  completed_at timestamptz not null default now()
);

alter table attempts enable row level security;

create policy "public read attempts"
  on attempts for select
  using (true);

create policy "public insert attempts"
  on attempts for insert
  to anon, authenticated
  with check (true);
