const paths = {
  help: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm-3-13a3 3 0 1 1 5 2.2c-1.4 1-2 1.4-2 3M12 17h.01',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  fill: 'M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5',
  north: 'm12 3 5 16-5-3-5 3 5-16Zm0 0v13',
  chevron: 'm7 10 5 5 5-5',
  close: 'm6 6 12 12M18 6 6 18',
  check: 'm5 12 4 4L19 6',
} as const;

export function Icon({ name }: { name: keyof typeof paths }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}
