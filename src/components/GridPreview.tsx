import type { CSSProperties } from 'react';

type Props = {
  blocks: string[];
  className?: string;
};

/** Tiny non-interactive block-grid preview. */
export function GridPreview({ blocks, className }: Props) {
  const size = blocks.length;
  return (
    <div
      className={`gridPreview ${className ?? ''}`}
      style={{ '--grid-size': size } as CSSProperties}
      aria-hidden
    >
      {blocks.flatMap((row, r) =>
        row.split('').map((ch, c) => (
          <div
            key={`${r}-${c}`}
            className={`gridPreviewCell ${ch === '#' ? 'isBlock' : 'isOpen'}`}
          />
        )),
      )}
    </div>
  );
}
