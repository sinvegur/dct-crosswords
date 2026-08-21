-- Run this once in the Supabase SQL Editor for this project (after schema.sql).
-- Adds draft/published status to puzzles, and splits public read access so
-- only published puzzles are readable by anonymous solvers — drafts stay
-- visible only to the authenticated creator.

alter table puzzles
  add column if not exists status text not null default 'draft'
  check (status in ('draft', 'published'));

drop policy if exists "public read puzzles" on puzzles;

create policy "public read published puzzles"
  on puzzles for select
  using (status = 'published');

create policy "authenticated read all puzzles"
  on puzzles for select
  to authenticated
  using (true);
