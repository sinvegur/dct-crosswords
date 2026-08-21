import type { Puzzle15, PuzzleStatus } from '@/crossword/types';
import { supabase } from '@/lib/supabaseClient';

type PuzzleRow = {
  id: string;
  slug: string;
  title: string;
  solution_grid: string[];
  clues: Puzzle15['clues'];
  status: PuzzleStatus;
  created_at: string;
};

function rowToPuzzle(row: PuzzleRow): Puzzle15 {
  return {
    id: row.id,
    slug: row.slug,
    status: row.status,
    title: row.title,
    solutionGrid: row.solution_grid,
    clues: row.clues,
    meta: {
      createdAtISO: row.created_at,
    },
  };
}

function isPersistedId(id: string | undefined): boolean {
  return Boolean(
    id &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id),
  );
}

/** Turkish-aware title → URL-safe kebab slug (ASCII). */
export function slugifyTitle(title: string): string {
  const trMap: Record<string, string> = {
    ç: 'c',
    ğ: 'g',
    ı: 'i',
    i: 'i',
    ö: 'o',
    ş: 's',
    ü: 'u',
  };

  let s = title.trim().toLocaleLowerCase('tr-TR');
  s = [...s].map((ch) => trMap[ch] ?? ch).join('');
  s = s.normalize('NFD').replace(/\p{M}/gu, '');
  s = s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s || 'puzzle';
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6);
}

async function allocateSlug(base: string): Promise<string> {
  let candidate = base;
  for (let attempt = 0; attempt < 8; attempt++) {
    const { data, error } = await supabase
      .from('puzzles')
      .select('id')
      .eq('slug', candidate)
      .maybeSingle();
    if (error) throw error;
    if (!data) return candidate;
    candidate = `${base}-${randomSuffix()}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function listPuzzles(): Promise<Puzzle15[]> {
  const { data, error } = await supabase
    .from('puzzles')
    .select('id, slug, title, solution_grid, clues, status, created_at')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data as PuzzleRow[] | null)?.map(rowToPuzzle) ?? [];
}

export async function getPuzzle(id: string): Promise<Puzzle15 | undefined> {
  const { data, error } = await supabase
    .from('puzzles')
    .select('id, slug, title, solution_grid, clues, status, created_at')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data ? rowToPuzzle(data as PuzzleRow) : undefined;
}

export async function getPuzzleBySlug(slug: string): Promise<Puzzle15 | undefined> {
  const { data, error } = await supabase
    .from('puzzles')
    .select('id, slug, title, solution_grid, clues, status, created_at')
    .eq('slug', slug)
    .maybeSingle();

  if (error) throw error;
  return data ? rowToPuzzle(data as PuzzleRow) : undefined;
}

export async function savePuzzle(puzzle: Puzzle15): Promise<Puzzle15> {
  const payload = {
    title: puzzle.title,
    solution_grid: puzzle.solutionGrid,
    clues: puzzle.clues,
    status: puzzle.status,
  };

  if (isPersistedId(puzzle.id)) {
    const { data, error } = await supabase
      .from('puzzles')
      .update(payload)
      .eq('id', puzzle.id)
      .select('id, slug, title, solution_grid, clues, status, created_at')
      .single();

    if (error) throw error;
    return rowToPuzzle(data as PuzzleRow);
  }

  const base = slugifyTitle(puzzle.title);
  const slug = puzzle.slug?.trim() || (await allocateSlug(base));

  const { data, error } = await supabase
    .from('puzzles')
    .insert({ ...payload, slug })
    .select('id, slug, title, solution_grid, clues, status, created_at')
    .single();

  if (error) {
    // Unique violation — retry once with a fresh suffix.
    if (error.code === '23505') {
      const retrySlug = await allocateSlug(base);
      const second = await supabase
        .from('puzzles')
        .insert({ ...payload, slug: retrySlug })
        .select('id, slug, title, solution_grid, clues, status, created_at')
        .single();
      if (second.error) throw second.error;
      return rowToPuzzle(second.data as PuzzleRow);
    }
    throw error;
  }

  return rowToPuzzle(data as PuzzleRow);
}

export async function deletePuzzle(id: string): Promise<void> {
  const { error } = await supabase.from('puzzles').delete().eq('id', id);
  if (error) throw error;
}
