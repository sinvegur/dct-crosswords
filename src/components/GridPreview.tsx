type Props = {
  blocks: string[];
  className?: string;
};

/** Tiny non-interactive 15×15 block preview. */
export function GridPreview({ blocks, className }: Props) {
  return (
    <div className={`gridPreview ${className ?? ''}`} aria-hidden>
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
