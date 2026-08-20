import { useEffect, useState } from 'react';
import { GridPreview } from '@/components/GridPreview';
import { TEMPLATES_15, type StartingGridId, type Template15 } from '@/data/templates';

type Props = {
  open: boolean;
  onClose: () => void;
  onCreate: (template: Template15) => void;
};

export function StartingGridModal({ open, onClose, onCreate }: Props) {
  const [selectedId, setSelectedId] = useState<StartingGridId>('classic');

  useEffect(() => {
    if (!open) return;
    setSelectedId('classic');

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const selected = TEMPLATES_15.find((t) => t.id === selectedId) ?? TEMPLATES_15[0]!;

  return (
    <div className="modalOverlay" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="starting-grid-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modalHeader">
          <h2 id="starting-grid-title" className="modalTitle">
            Choose a starting grid
          </h2>
          <button type="button" className="modalClose" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="templateCards">
          {TEMPLATES_15.map((t) => {
            const isSelected = t.id === selectedId;
            return (
              <button
                key={t.id}
                type="button"
                className={`templateCard ${isSelected ? 'isSelected' : ''}`}
                onClick={() => setSelectedId(t.id)}
              >
                <GridPreview blocks={t.blocks} />
                <div className="templateCardBody">
                  <div className="templateCardName">{t.name}</div>
                  <div className="templateCardDesc">{t.description}</div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="modalFooter">
          <button
            type="button"
            className="btn btnPrimary"
            onClick={() => onCreate(selected)}
          >
            Create puzzle
          </button>
        </div>
      </div>
    </div>
  );
}
