import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Icon } from './Icon';

const STEPS = [
  { title: 'Endpoints', text: 'Drag A or B to move it. To start over, choose New route and pick two spots on the map. Select Start or End to move a pin with a single click or the keyboard.' },
  { title: 'Compare', text: 'Both routes update when you place or move a pin. Shortest minimises great-circle distance. Terrain-aware minimises friction-weighted distance. Select a route name to bring its line to the front.' },
  { title: 'Inspect', text: 'Open Inspect, then hover or tap a cell to read it. Drag bare terrain to pan and scroll to zoom. With the map focused, arrows move the cell cursor, Shift with arrows pans, and Enter places the selected pin. You can also enter a row and column in Inspect.' },
];

export function HowToModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;
    const trigger = document.activeElement;
    dialog.showModal();
    tabRefs.current[0]?.focus();
    return () => {
      dialog.close();
      if (trigger instanceof HTMLElement) trigger.focus();
    };
  }, [open]);

  const handleTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = { ArrowLeft: (index + 2) % 3, ArrowRight: (index + 1) % 3, Home: 0, End: 2 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setStep(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <dialog className="modal" ref={dialogRef} aria-labelledby="howto-title"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="modal__panel">
        <header>
          <h2 id="howto-title">How to use</h2>
          <button type="button" className="btn icon-btn" aria-label="Close help" onClick={onClose}><Icon name="close" /></button>
        </header>
        <div className="modal__tabs" role="tablist" aria-label="Help topics">
          {STEPS.map(({ title }, index) => (
            <button type="button" className="btn" role="tab" key={title} id={'help-tab-' + index}
              ref={(element) => { tabRefs.current[index] = element; }}
              aria-selected={step === index} aria-controls={'help-panel-' + index}
              tabIndex={step === index ? 0 : -1} onClick={() => setStep(index)}
              onKeyDown={(event) => handleTabKey(event, index)}>{title}</button>
          ))}
        </div>
        {STEPS.map(({ title, text }, index) => (
          <div role="tabpanel" className="modal__topic" key={title} id={'help-panel-' + index}
            aria-labelledby={'help-tab-' + index} hidden={step !== index} tabIndex={0}>{text}</div>
        ))}
      </div>
    </dialog>
  );
}
