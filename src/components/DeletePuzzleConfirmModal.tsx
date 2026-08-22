import { useEffect } from 'react';

type Props = {
  open: boolean;
  puzzleTitle: string;
  deleting?: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function DeletePuzzleConfirmModal({
  open,
  puzzleTitle,
  deleting = false,
  onClose,
  onConfirm,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !deleting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, deleting, onClose]);

  if (!open) return null;

  return (
    <div className="modalOverlay" role="presentation" onClick={deleting ? undefined : onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-puzzle-title"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(440px, 100%)' }}
      >
        <div className="modalHeader">
          <h2 id="delete-puzzle-title" className="modalTitle">
            Delete puzzle?
          </h2>
          <button
            type="button"
            className="modalClose"
            onClick={onClose}
            aria-label="Close"
            disabled={deleting}
          >
            ×
          </button>
        </div>

        <div style={{ padding: '16px 18px' }}>
          <p style={{ margin: 0, lineHeight: 1.45 }}>
            Delete &ldquo;{puzzleTitle}&rdquo;? This cannot be undone.
          </p>
        </div>

        <div className="modalFooter">
          <button type="button" className="btn" onClick={onClose} disabled={deleting}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btnPrimary"
            onClick={onConfirm}
            disabled={deleting}
            style={{ background: '#b91c1c', borderColor: '#b91c1c' }}
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
