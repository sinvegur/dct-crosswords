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

export type ComputedCrossword15 = {
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

function isBlock(solutionGrid: string[], row: number, col: number) {
  return solutionGrid[row]?.[col] === '#';
}

function cellLetter(solutionGrid: string[], row: number, col: number) {
  return solutionGrid[row][col];
}

function isAcrossStart(solutionGrid: string[], row: number, col: number) {
  if (isBlock(solutionGrid, row, col)) return false;
  const leftIsBlockOrEdge = col === 0 || isBlock(solutionGrid, row, col - 1);
  const rightIsNotBlock = col + 1 < SIZE_15 && !isBlock(solutionGrid, row, col + 1);
  return leftIsBlockOrEdge && rightIsNotBlock;
}

function isDownStart(solutionGrid: string[], row: number, col: number) {
  if (isBlock(solutionGrid, row, col)) return false;
  const upIsBlockOrEdge = row === 0 || isBlock(solutionGrid, row - 1, col);
  const downIsNotBlock = row + 1 < SIZE_15 && !isBlock(solutionGrid, row + 1, col);
  return upIsBlockOrEdge && downIsNotBlock;
}

function buildEntry(solutionGrid: string[], direction: Direction, number: number, row: number, col: number): Entry {
  const cells: CellPos[] = [];
  const letters: string[] = [];

  if (direction === 'across') {
    let c = col;
    while (c < SIZE_15 && !isBlock(solutionGrid, row, c)) {
      cells.push({ row, col: c });
      letters.push(cellLetter(solutionGrid, row, c));
      c++;
    }
  } else {
    let r = row;
    while (r < SIZE_15 && !isBlock(solutionGrid, r, col)) {
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

export function computeEntries15(solutionGrid: string[]): ComputedCrossword15 {
  if (solutionGrid.length !== SIZE_15) {
    throw new Error(`Expected 15 rows, got ${solutionGrid.length}`);
  }
  for (const row of solutionGrid) {
    if (row.length !== SIZE_15) {
      throw new Error(`Expected 15 cols per row, got ${row.length}`);
    }
  }

  const cellNumber: (number | null)[][] = Array.from({ length: SIZE_15 }, () => Array.from({ length: SIZE_15 }, () => null));

  let counter = 1;
  const entriesAcross: Entry[] = [];
  const entriesDown: Entry[] = [];

  const acrossEntryNumberByCell = new Map<string, number>();
  const downEntryNumberByCell = new Map<string, number>();
  const entryByKey = new Map<string, Entry>();

  for (let row = 0; row < SIZE_15; row++) {
    for (let col = 0; col < SIZE_15; col++) {
      const acrossStart = isAcrossStart(solutionGrid, row, col);
      const downStart = isDownStart(solutionGrid, row, col);
      if (!acrossStart && !downStart) continue;

      const number = counter++;
      cellNumber[row][col] = number;

      if (acrossStart) {
        const entry = buildEntry(solutionGrid, 'across', number, row, col);
        entriesAcross.push(entry);
        entryByKey.set(`across:${number}`, entry);
        for (const cell of entry.cells) acrossEntryNumberByCell.set(keyOf(cell), number);
      }
      if (downStart) {
        const entry = buildEntry(solutionGrid, 'down', number, row, col);
        entriesDown.push(entry);
        entryByKey.set(`down:${number}`, entry);
        for (const cell of entry.cells) downEntryNumberByCell.set(keyOf(cell), number);
      }
    }
  }

  const allEntries = [...entriesAcross, ...entriesDown];

  return {
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

