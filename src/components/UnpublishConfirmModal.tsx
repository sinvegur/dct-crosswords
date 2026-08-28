import { useEffect } from 'react';

type Props = {
  open: boolean;
  puzzleTitle: string;
  unpublishing?: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function UnpublishConfirmModal({
  open,
  puzzleTitle,
  unpublishing = false,
  onClose,
  onConfirm,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !unpublishing) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, unpublishing, onClose]);

  if (!open) return null;

  return (
    <div className="modalOverlay" role="presentation" onClick={unpublishing ? undefined : onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="unpublish-puzzle-title"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(440px, 100%)' }}
      >
        <div className="modalHeader">
          <h2 id="unpublish-puzzle-title" className="modalTitle">
            Unpublish &ldquo;{puzzleTitle}&rdquo;?
          </h2>
          <button
            type="button"
            className="modalClose"
            onClick={onClose}
            aria-label="Close"
            disabled={unpublishing}
          >
            ×
          </button>
        </div>

        <div style={{ padding: '16px 18px' }}>
          <p style={{ margin: 0, lineHeight: 1.45 }}>
            The shared link will stop working — anyone opening it will see &ldquo;Puzzle not
            found&rdquo;. The puzzle moves back to Draft, and you can publish it again later. Solve
            times already recorded are kept.
          </p>
        </div>

        <div className="modalFooter">
          <button type="button" className="btn" onClick={onClose} disabled={unpublishing}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btnPrimary"
            onClick={onConfirm}
            disabled={unpublishing}
          >
            {unpublishing ? 'Unpublishing…' : 'Unpublish'}
          </button>
        </div>
      </div>
    </div>
  );
}
