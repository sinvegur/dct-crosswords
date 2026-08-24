import type { Direction } from './engine';

export const SIZE_15 = 15 as const;

export type PuzzleStatus = 'draft' | 'published';

export type Puzzle = {
  id: string;
  slug: string;
  status: PuzzleStatus;
  title: string;
  size: number;
  // `size` rows, each `size` chars.
  // Use '#' for blocks, and any single letter (including Turkish letters) for answer cells.
  solutionGrid: string[];
  clues: {
    across: Record<number, string>;
    down: Record<number, string>;
  };
  meta?: {
    createdBy?: string;
    createdAtISO?: string;
  };
};

export type PlayDirection = Direction;
