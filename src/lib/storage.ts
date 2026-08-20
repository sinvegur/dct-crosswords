import type { Puzzle15 } from '@/crossword/types';

const STORAGE_KEY = 'dct-crosswords:puzzles';

export function listPuzzles(): Puzzle15[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Puzzle15[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function getPuzzle(id: string): Puzzle15 | undefined {
  return listPuzzles().find((p) => p.id === id);
}

export function savePuzzle(puzzle: Puzzle15): void {
  const all = listPuzzles().filter((p) => p.id !== puzzle.id);
  all.unshift(puzzle);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function deletePuzzle(id: string): void {
  const all = listPuzzles().filter((p) => p.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}
