import { useEffect, useState } from 'react';

type Props = {
  open: boolean;
  puzzleTitle: string;
  shareUrl: string;
  onClose: () => void;
};

export function PublishSuccessModal({ open, puzzleTitle, shareUrl, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      setCopied(false);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modalOverlay" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-success-title"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(480px, 100%)' }}
      >
        <div className="modalHeader">
          <h2 id="publish-success-title" className="modalTitle">
            Puzzle published!
          </h2>
          <button type="button" className="modalClose" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div style={{ padding: '16px 18px' }}>
          <p style={{ margin: '0 0 12px', lineHeight: 1.45 }}>
            <strong>{puzzleTitle}</strong> is live. Share this link with your solvers:
          </p>
          <div className="shareLinkBox">
            <code className="shareLinkText">{shareUrl}</code>
          </div>
        </div>

        <div className="modalFooter">
          <button type="button" className="btn" onClick={copyLink}>
            {copied ? 'Copied!' : 'Copy link'}
          </button>
          <button type="button" className="btn btnPrimary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
