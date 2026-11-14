import { useId, useState, type ReactNode } from 'react';

/**
 * A collapsible tool panel: a title bar that toggles the body.
 *
 * The blocks are collapsed by default so the rail shows the working area
 * first, and each one remembers its own state.
 */
export interface BlockProps {
  title: string;
  /** The body. */
  children: ReactNode;
  /** Open on first render. */
  defaultOpen?: boolean;
  /** A short line under the title, in the header. */
  hint?: string;
}

export function Block({ title, children, defaultOpen = false, hint }: BlockProps) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();

  return (
    <section className={`block ${open ? 'is-open' : 'is-collapsed'}`}>
      <button
        type="button"
        className="block__head"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{title}</span>
        {hint ? <span className="block__hint">{hint}</span> : null}
        <svg
          className="block__chevron"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 3 5 5-5 5" />
        </svg>
      </button>
      <div className="block__body" id={bodyId}>
        {children}
      </div>
    </section>
  );
}
