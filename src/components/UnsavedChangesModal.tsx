import { useEffect } from 'react';

type Props = {
  open: boolean;
  saving?: boolean;
  onKeepEditing: () => void;
  onDiscard: () => void;
  onSaveDraftAndLeave: () => void;
};

export function UnsavedChangesModal({
  open,
  saving = false,
  onKeepEditing,
  onDiscard,
  onSaveDraftAndLeave,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onKeepEditing();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, saving, onKeepEditing]);

  if (!open) return null;

  return (
    <div className="modalOverlay" role="presentation" onClick={saving ? undefined : onKeepEditing}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="unsaved-changes-title"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(480px, 100%)' }}
      >
        <div className="modalHeader">
          <h2 id="unsaved-changes-title" className="modalTitle">
            Unsaved changes
          </h2>
          <button
            type="button"
            className="modalClose"
            onClick={onKeepEditing}
            aria-label="Close"
            disabled={saving}
          >
            ×
          </button>
        </div>

        <div style={{ padding: '16px 18px' }}>
          <p style={{ margin: 0, lineHeight: 1.45 }}>
            You have unsaved edits to this puzzle. Leave without saving, or save a draft first.
          </p>
        </div>

        <div className="modalFooter">
          <button type="button" className="btn" onClick={onKeepEditing} disabled={saving}>
            Keep editing
          </button>
          <button type="button" className="btn" onClick={onDiscard} disabled={saving}>
            Discard changes
          </button>
          <button type="button" className="btn btnPrimary" onClick={onSaveDraftAndLeave} disabled={saving}>
            {saving ? 'Saving…' : 'Save draft & leave'}
          </button>
        </div>
      </div>
    </div>
  );
}
