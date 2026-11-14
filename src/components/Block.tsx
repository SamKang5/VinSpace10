import { useId, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

export function Block({ title, defaultOpen = false, children }: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();

  return (
    <section className="block">
      <h2>
        <button type="button" className="block__head" aria-expanded={open} aria-controls={bodyId}
          onClick={() => setOpen((value) => !value)}>
          {title}
          <Icon name="chevron" />
        </button>
      </h2>
      <div id={bodyId} className="block__reveal" data-open={open}
        ref={(element) => { if (element) element.inert = !open; }}
        aria-hidden={!open || undefined}>
        <div className="block__clip">
          <div className="block__body">{children}</div>
        </div>
      </div>
    </section>
  );
}
