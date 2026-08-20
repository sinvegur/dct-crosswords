import type { Puzzle15 } from '@/crossword/types';
import { SIZE_15, computeEntries15 } from '@/crossword/engine';

const turkishAlphabet = [
  'A',
  'B',
  'C',
  'Ç',
  'D',
  'E',
  'F',
  'G',
  'Ğ',
  'H',
  'I',
  'İ',
  'J',
  'K',
  'L',
  'M',
  'N',
  'O',
  'Ö',
  'P',
  'R',
  'S',
  'Ş',
  'T',
  'U',
  'Ü',
  'V',
  'Y',
  'Z',
];

function makeSolutionGrid15(): string[] {
  const rows: string[] = [];
  for (let r = 0; r < SIZE_15; r++) {
    let row = '';
    for (let c = 0; c < SIZE_15; c++) {
      const isBorder = r === 0 || c === 0 || r === SIZE_15 - 1 || c === SIZE_15 - 1;
      if (isBorder) row += '#';
      else {
        const idx = (r * 31 + c * 17) % turkishAlphabet.length;
        row += turkishAlphabet[idx];
      }
    }
    rows.push(row);
  }
  return rows;
}

const solutionGrid = makeSolutionGrid15();
const computed = computeEntries15(solutionGrid);

const clues = {
  across: Object.fromEntries(
    computed.entriesAcross.map((e) => [
      e.number,
      // Placeholder NYT-style clue: for now, we include the answer so the sample is solvable.
      // Later, real puzzles will replace this.
      `Sample clue: ${e.word}`,
    ]),
  ),
  down: Object.fromEntries(
    computed.entriesDown.map((e) => [
      e.number,
      `Sample clue: ${e.word}`,
    ]),
  ),
};

export const samplePuzzle15: Puzzle15 = {
  id: 'sample-15-border',
  title: 'Sample 15x15 (Turkish character test)',
  solutionGrid,
  clues,
  meta: {
    createdBy: 'DCT Crosswords',
    createdAtISO: new Date().toISOString(),
  },
};

