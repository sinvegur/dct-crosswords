import { useEffect, useState } from 'react';
import { GridPreview } from '@/components/GridPreview';
import {
  PUZZLE_SIZES,
  templatesForSize,
  type PuzzleSize,
  type StartingGridId,
  type Template,
} from '@/data/templates';

type Props = {
  open: boolean;
  onClose: () => void;
  onCreate: (template: Template) => void;
};

export function StartingGridModal({ open, onClose, onCreate }: Props) {
  const [size, setSize] = useState<PuzzleSize>(15);
  const [selectedId, setSelectedId] = useState<StartingGridId>('classic');

  const templates = templatesForSize(size);
  const selected = templates.find((t) => t.id === selectedId) ?? templates[0]!;

  useEffect(() => {
    if (!open) return;
    setSize(15);
    setSelectedId('classic');

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

        <div className="sizePicker" role="group" aria-label="Puzzle size">
          {PUZZLE_SIZES.map((option) => (
            <button
              key={option}
              type="button"
              className={`btn ${size === option ? 'btnPrimary' : ''}`}
              aria-pressed={size === option}
              onClick={() => {
                setSize(option);
                const nextTemplates = templatesForSize(option);
                setSelectedId(nextTemplates[0]!.id);
              }}
            >
              {option}×{option}
            </button>
          ))}
        </div>

        <div className="templateCards">
          {templates.map((t) => {
            const isSelected = t.id === selectedId;
            return (
              <button
                key={`${t.size}-${t.id}`}
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
