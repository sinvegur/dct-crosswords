export type Direction = 'across' | 'down';

export const SIZE_15 = 15 as const;

export type CellPos = { row: number; col: number };

export type Entry = {
  number: number;
  direction: Direction;
  start: CellPos;
  length: number;
  cells: CellPos[];
  word: string; // solution letters for the whole entry
};

export type ComputedCrossword = {
  size: number;
  entriesAcross: Entry[];
  entriesDown: Entry[];
  allEntries: Entry[];
  cellNumber: (number | null)[][];
  acrossEntryNumberByCell: Map<string, number>;
  downEntryNumberByCell: Map<string, number>;
  entryByKey: Map<string, Entry>; // `${direction}:${number}`
  entryByNumberDirection: (direction: Direction, number: number) => Entry | undefined;
};

function keyOf(pos: CellPos) {
  return `${pos.row},${pos.col}`;
}

function gridSize(solutionGrid: string[]): number {
  const size = solutionGrid.length;
  if (size < 1) {
    throw new Error('Expected a non-empty square grid');
  }
  for (const row of solutionGrid) {
    if (row.length !== size) {
      throw new Error(`Expected a square grid (${size}×${size}), got a row of length ${row.length}`);
    }
  }
  return size;
}

function isBlock(solutionGrid: string[], row: number, col: number) {
  return solutionGrid[row]?.[col] === '#';
}

function cellLetter(solutionGrid: string[], row: number, col: number) {
  return solutionGrid[row][col];
}

function isAcrossStart(solutionGrid: string[], size: number, row: number, col: number) {
  if (isBlock(solutionGrid, row, col)) return false;
  const leftIsBlockOrEdge = col === 0 || isBlock(solutionGrid, row, col - 1);
  const rightIsNotBlock = col + 1 < size && !isBlock(solutionGrid, row, col + 1);
  return leftIsBlockOrEdge && rightIsNotBlock;
}

function isDownStart(solutionGrid: string[], size: number, row: number, col: number) {
  if (isBlock(solutionGrid, row, col)) return false;
  const upIsBlockOrEdge = row === 0 || isBlock(solutionGrid, row - 1, col);
  const downIsNotBlock = row + 1 < size && !isBlock(solutionGrid, row + 1, col);
  return upIsBlockOrEdge && downIsNotBlock;
}

function buildEntry(
  solutionGrid: string[],
  size: number,
  direction: Direction,
  number: number,
  row: number,
  col: number,
): Entry {
  const cells: CellPos[] = [];
  const letters: string[] = [];

  if (direction === 'across') {
    let c = col;
    while (c < size && !isBlock(solutionGrid, row, c)) {
      cells.push({ row, col: c });
      letters.push(cellLetter(solutionGrid, row, c));
      c++;
    }
  } else {
    let r = row;
    while (r < size && !isBlock(solutionGrid, r, col)) {
      cells.push({ row: r, col });
      letters.push(cellLetter(solutionGrid, r, col));
      r++;
    }
  }

  return {
    number,
    direction,
    start: { row, col },
    length: cells.length,
    cells,
    word: letters.join(''),
  };
}

export function computeEntries(solutionGrid: string[]): ComputedCrossword {
  const size = gridSize(solutionGrid);

  const cellNumber: (number | null)[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => null),
  );

  let counter = 1;
  const entriesAcross: Entry[] = [];
  const entriesDown: Entry[] = [];

  const acrossEntryNumberByCell = new Map<string, number>();
  const downEntryNumberByCell = new Map<string, number>();
  const entryByKey = new Map<string, Entry>();

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const acrossStart = isAcrossStart(solutionGrid, size, row, col);
      const downStart = isDownStart(solutionGrid, size, row, col);
      if (!acrossStart && !downStart) continue;

      const number = counter++;
      cellNumber[row][col] = number;

      if (acrossStart) {
        const entry = buildEntry(solutionGrid, size, 'across', number, row, col);
        entriesAcross.push(entry);
        entryByKey.set(`across:${number}`, entry);
        for (const cell of entry.cells) acrossEntryNumberByCell.set(keyOf(cell), number);
      }
      if (downStart) {
        const entry = buildEntry(solutionGrid, size, 'down', number, row, col);
        entriesDown.push(entry);
        entryByKey.set(`down:${number}`, entry);
        for (const cell of entry.cells) downEntryNumberByCell.set(keyOf(cell), number);
      }
    }
  }

  const allEntries = [...entriesAcross, ...entriesDown];

  return {
    size,
    entriesAcross,
    entriesDown,
    allEntries,
    cellNumber,
    acrossEntryNumberByCell,
    downEntryNumberByCell,
    entryByKey,
    entryByNumberDirection: (direction, number) => entryByKey.get(`${direction}:${number}`),
  };
}
