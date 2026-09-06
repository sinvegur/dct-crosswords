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
    /** Groups of 2+ entries that belong together. Optional - older puzzles have none. */
    links?: Array<Array<{ direction: Direction; number: number }>>;
    /**
     * Cell indices (row * size + col) drawn with a circle, NYT style, so a
     * constructor can mark letters that spell something across the grid.
     *
     * It lives under `clues` because that column is jsonb and already carries
     * `links`, which are not clues either - putting it here means no schema
     * migration and no window where deployed code selects a column that does
     * not exist yet.
     */
    circles?: number[];
  };
  meta?: {
    createdBy?: string;
    createdAtISO?: string;
  };
};

export type PlayDirection = Direction;

export type ClueLinkMember = { direction: Direction; number: number };

export function clueLinkKey(member: ClueLinkMember): string {
  return `${member.direction}:${member.number}`;
}

/** Drop groups that are too small or that point at entries the grid no longer has. */
export function sanitizeClueLinks(
  links: ClueLinkMember[][] | undefined,
  validEntries: Iterable<ClueLinkMember>,
): ClueLinkMember[][] {
  if (!links?.length) return [];
  const valid = new Set<string>();
  for (const entry of validEntries) valid.add(clueLinkKey(entry));
  const seen = new Set<string>();
  const next: ClueLinkMember[][] = [];
  for (const group of links) {
    const members: ClueLinkMember[] = [];
    for (const member of group) {
      const key = clueLinkKey(member);
      if (!valid.has(key) || seen.has(key)) continue;
      seen.add(key);
      members.push({ direction: member.direction, number: member.number });
    }
    if (members.length >= 2) next.push(members);
  }
  return next;
}

export function findClueLinkGroup(
  links: ClueLinkMember[][] | undefined,
  direction: Direction,
  number: number,
): ClueLinkMember[] | undefined {
  if (!links?.length) return undefined;
  return links.find((group) =>
    group.some((member) => member.direction === direction && member.number === number),
  );
}

/** Drop circles that fall outside the grid or land on a block. */
export function sanitizeCircles(
  circles: number[] | undefined,
  solutionGrid: string[],
): number[] {
  if (!circles?.length) return [];
  const size = solutionGrid.length;
  const seen = new Set<number>();
  for (const index of circles) {
    if (!Number.isInteger(index) || index < 0 || index >= size * size) continue;
    const row = Math.floor(index / size);
    const col = index % size;
    if (solutionGrid[row]?.[col] === '#') continue;
    seen.add(index);
  }
  return [...seen].sort((a, b) => a - b);
}
