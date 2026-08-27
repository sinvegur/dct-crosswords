import { useEffect } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function UnlinkCluesConfirmModal({ open, onClose, onConfirm }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modalOverlay" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="unlink-clues-title"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(440px, 100%)' }}
      >
        <div className="modalHeader">
          <h2 id="unlink-clues-title" className="modalTitle">
            Remove all clue links?
          </h2>
          <button type="button" className="modalClose" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div style={{ padding: '16px 18px' }}>
          <p style={{ margin: 0, lineHeight: 1.45 }}>
            Remove all clue links? This can&apos;t be undone from here.
          </p>
        </div>

        <div className="modalFooter">
          <button type="button" className="btn" onClick={onClose}>
            No
          </button>
          <button type="button" className="btn btnPrimary" onClick={onConfirm}>
            Yes
          </button>
        </div>
      </div>
    </div>
  );
}
