import { SIZE_15 } from '@/crossword/engine';

export type StartingGridId = 'classic' | 'easy-fill' | 'open' | 'blank';

export type Template15 = {
  id: StartingGridId;
  name: string;
  description: string;
  /** 15 rows of 15 chars: `#` = block, `.` = open */
  blocks: string[];
  /** Default 180° block symmetry when opening the editor from this start. */
  defaultSymmetry: boolean;
};

function assert15(blocks: string[]) {
  if (blocks.length !== SIZE_15) throw new Error(`Template must have ${SIZE_15} rows`);
  for (const row of blocks) {
    if (row.length !== SIZE_15) throw new Error(`Each row must be ${SIZE_15} chars`);
  }
}

/** Apply 180° rotational symmetry: if (r,c) is # then (14-r,14-c) is #. */
export function withRotationalSymmetry(seed: string[]): string[] {
  const grid = seed.map((row) => row.split(''));
  for (let r = 0; r < SIZE_15; r++) {
    for (let c = 0; c < SIZE_15; c++) {
      if (grid[r][c] === '#') {
        grid[SIZE_15 - 1 - r][SIZE_15 - 1 - c] = '#';
      }
    }
  }
  return grid.map((row) => row.join(''));
}

/**
 * Build a symmetric grid from an upper-half seed.
 * Cells after the center (7,7) in row-major order are cleared, then mirrored.
 */
function fromHalfSpec(rows: string[]): string[] {
  const normalized = rows.map((row) => row.replaceAll(' ', '.').padEnd(SIZE_15, '.').slice(0, SIZE_15));
  while (normalized.length < SIZE_15) normalized.push('.'.repeat(SIZE_15));
  const grid = normalized.slice(0, SIZE_15).map((row) => row.split(''));
  const center = 7 * SIZE_15 + 7;
  for (let r = 0; r < SIZE_15; r++) {
    for (let c = 0; c < SIZE_15; c++) {
      if (r * SIZE_15 + c > center) grid[r][c] = '.';
    }
  }
  const blocks = withRotationalSymmetry(grid.map((row) => row.join('')));
  assert15(blocks);
  return blocks;
}

function blankGrid(): string[] {
  return Array.from({ length: SIZE_15 }, () => '.'.repeat(SIZE_15));
}

/**
 * Starting layouts only — users can add/remove black squares in the editor.
 * Patterned starts use 180° rotational symmetry and are tuned to feel distinct.
 */
export const TEMPLATES_15: Template15[] = [
  {
    id: 'classic',
    name: 'Classic',
    description: 'Balanced all-purpose grid with medium-length entries.',
    defaultSymmetry: false,
    // ~36 blacks · mostly 4–7 letter slots · traditional staggered look
    blocks: fromHalfSpec([
      '....#.....#....',
      '....#.....#....',
      '...............',
      '...#.......#...',
      '..#....#....#..',
      '.#....#.#....#.',
      '#....#...#....#',
      '....#.....#....',
    ]),
  },
  {
    id: 'easy-fill',
    name: 'Easy Fill',
    description: 'More blocks and shorter entries, easier to construct manually.',
    defaultSymmetry: false,
    // ~48 blacks · denser segmentation · shorter slots · no full-row 15s
    blocks: fromHalfSpec([
      '...#...#...#...',
      '......#........',
      '...#...#...#...',
      '......#........',
      '..#.#.....#.#..',
      '..#.#.....#.#..',
      '.#...#.#.#...#.',
      '#.#.#.....#.#.#',
    ]),
  },
  {
    id: 'open',
    name: 'Open',
    description: 'Fewer blocks and longer entries, more challenging to fill.',
    defaultSymmetry: false,
    // ~22 blacks · large white regions · many long entries
    blocks: fromHalfSpec([
      '.....#.....#...',
      '...............',
      '...#.......#...',
      '...............',
      '..#.........#..',
      '.....#...#.....',
      '.#...........#.',
      '...#.......#...',
    ]),
  },
  {
    id: 'blank',
    name: 'Blank 15×15',
    description: 'Start from scratch and create your own block layout.',
    defaultSymmetry: true,
    blocks: blankGrid(),
  },
];

export function templateToEmptySolution(template: Template15): string[] {
  return template.blocks.map((row) => row.replaceAll('.', ' '));
}

export function getTemplateById(id: string): Template15 | undefined {
  return TEMPLATES_15.find((t) => t.id === id);
}

export function mirrorPos(row: number, col: number) {
  return { row: SIZE_15 - 1 - row, col: SIZE_15 - 1 - col };
}
