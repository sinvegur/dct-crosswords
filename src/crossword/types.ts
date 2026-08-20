import type { Direction } from './engine';

export const SIZE_15 = 15 as const;

export type Puzzle15 = {
  id: string;
  title: string;
  // 15 rows, each 15 chars.
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

