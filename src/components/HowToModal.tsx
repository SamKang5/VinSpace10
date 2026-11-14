// How-to-use modal (R02).
//
// Three steps, no routing logic: pick a marker, place it on the map, read the
// comparison. Closes on the button, the backdrop or Escape.

import { useEffect, useRef } from 'react';

export interface HowToModalProps {
  open: boolean;
  onClose: () => void;
}

const STEPS: { title: string; body: string }[] = [
  {
    title: '1 · Place the endpoints',
    body: 'Choose Start (A) or End (B), then click the map. Drag to pan and scroll to zoom. The chip shows the picked cell as [row, column].',
  },
  {
    title: '2 · Calculate the route',
    body: 'Press Calculate route. The app runs A* twice on the D07 navigation grid: once for the shortest distance, once weighted by ground friction.',
  },
  {
    title: '3 · Compare the results',
    body: 'The two cards report distance, modelled cost, mean and maximum slope. Hover the terrain to read the elevation, slope and friction of any cell.',
  },
];

export function HowToModal({ open, onClose }: HowToModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="howto-title">
      <div className="modal__backdrop" onClick={onClose} aria-hidden="true" />
      <div className="modal__panel">
        <h2 className="modal__title" id="howto-title">
          How to use MARS NAVIGATOR
        </h2>
        <ol className="modal__steps">
          {STEPS.map((step) => (
            <li key={step.title}>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
        <p className="modal__note">
          Research prototype. The friction index and the 15° slope cutoff are uncalibrated
          assumptions and do not establish that any route is safe or traversable.
        </p>
        <button ref={closeRef} type="button" className="btn btn--primary" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  );
}
