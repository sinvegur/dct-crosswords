import { SIZE_15 } from '@/crossword/engine';

export type StartingGridId = 'classic' | 'easy-fill' | 'open' | 'blank';

export const PUZZLE_SIZES = [5, 9, 15] as const;
export type PuzzleSize = (typeof PUZZLE_SIZES)[number];

export type Template = {
  id: StartingGridId;
  size: number;
  name: string;
  description: string;
  /** `size` rows of `size` chars: `#` = block, `.` = open */
  blocks: string[];
  /** Default 180° block symmetry when opening the editor from this start. */
  defaultSymmetry: boolean;
};

function assertSquare(blocks: string[], size: number) {
  if (blocks.length !== size) throw new Error(`Template must have ${size} rows`);
  for (const row of blocks) {
    if (row.length !== size) throw new Error(`Each row must be ${size} chars`);
  }
}

/** Apply 180° rotational symmetry: if (r,c) is # then (size-1-r, size-1-c) is #. */
export function withRotationalSymmetry(seed: string[]): string[] {
  const size = seed.length;
  const grid = seed.map((row) => row.split(''));
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c] === '#') {
        grid[size - 1 - r][size - 1 - c] = '#';
      }
    }
  }
  return grid.map((row) => row.join(''));
}

/**
 * Build a symmetric grid from an upper-half seed.
 * Cells after the center in row-major order are cleared, then mirrored.
 */
function fromHalfSpec(rows: string[], size = SIZE_15): string[] {
  const normalized = rows.map((row) => row.replaceAll(' ', '.').padEnd(size, '.').slice(0, size));
  while (normalized.length < size) normalized.push('.'.repeat(size));
  const grid = normalized.slice(0, size).map((row) => row.split(''));
  const mid = Math.floor(size / 2);
  const center = mid * size + mid;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (r * size + c > center) grid[r][c] = '.';
    }
  }
  const blocks = withRotationalSymmetry(grid.map((row) => row.join('')));
  assertSquare(blocks, size);
  return blocks;
}

export function blankGrid(size: number): string[] {
  return Array.from({ length: size }, () => '.'.repeat(size));
}

/**
 * Starting layouts only — users can add/remove black squares in the editor.
 * Patterned starts use 180° rotational symmetry only (seeds are not row-palindromes,
 * so grids are not left-right / top-bottom mirror symmetric).
 */
export const TEMPLATES_15: Template[] = [
  {
    id: 'classic',
    size: SIZE_15,
    name: 'Classic',
    description: 'Balanced all-purpose grid with medium-length entries.',
    defaultSymmetry: false,
    // ~36 blacks · medium entries · 180° rotation only
    blocks: fromHalfSpec([
      '......#...##...',
      '......#........',
      '......#........',
      '###.....##.....',
      '#.......#......',
      '....#.....##...',
      '......#....#...',
      '.....#.........',
    ]),
  },
  {
    id: 'easy-fill',
    size: SIZE_15,
    name: 'Easy Fill',
    description: 'More blocks and shorter entries, easier to construct manually.',
    defaultSymmetry: false,
    // ~46 blacks · denser / shorter entries · 180° rotation only
    blocks: fromHalfSpec([
      '.....##...#....',
      '.....#....#....',
      '.....#.........',
      '#...#...##.....',
      '......##...#...',
      '......##...#...',
      '.....#......###',
      '#...##.........',
    ]),
  },
  {
    id: 'open',
    size: SIZE_15,
    name: 'Open',
    description: 'Fewer blocks and longer entries, more challenging to fill.',
    defaultSymmetry: false,
    // ~24 blacks · sparser / longer entries · 180° rotation only
    blocks: fromHalfSpec([
      '.....#.....#...',
      '.....#.........',
      '.....#.........',
      '......#........',
      '.........#.....',
      '...#.....#....#',
      '...#......#....',
      '....#..........',
    ]),
  },
  {
    id: 'blank',
    size: SIZE_15,
    name: 'Blank 15×15',
    description: 'Start from scratch and create your own block layout.',
    defaultSymmetry: true,
    blocks: blankGrid(SIZE_15),
  },
];

export const TEMPLATES_5: Template[] = [
  {
    id: 'blank',
    size: 5,
    name: 'Blank 5×5',
    description: 'Start from scratch and create your own block layout.',
    defaultSymmetry: false,
    blocks: blankGrid(5),
  },
];

export const TEMPLATES_9: Template[] = [
  {
    id: 'blank',
    size: 9,
    name: 'Blank 9×9',
    description: 'Start from scratch and create your own block layout.',
    defaultSymmetry: true,
    blocks: blankGrid(9),
  },
];

export function templatesForSize(size: number): Template[] {
  if (size === 5) return TEMPLATES_5;
  if (size === 9) return TEMPLATES_9;
  return TEMPLATES_15;
}

export function templateToEmptySolution(template: Template): string[] {
  return template.blocks.map((row) => row.replaceAll('.', ' '));
}

export function getTemplateById(id: string, size: number = SIZE_15): Template | undefined {
  return templatesForSize(size).find((t) => t.id === id);
}

export function mirrorPos(row: number, col: number, size: number) {
  return { row: size - 1 - row, col: size - 1 - col };
}
