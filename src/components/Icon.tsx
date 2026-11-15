const paths = {
  help: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm-3-13a3 3 0 1 1 5 2.2c-1.4 1-2 1.4-2 3M12 17h.01',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  fill: 'M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5',
  close: 'm6 6 12 12M18 6 6 18',
  oxygen: 'M10 5V3h4v2m-2 0v2m-4 7h8m-8 5h8M8 11a4 4 0 0 1 8 0v9a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1z',
  energy: 'm13 2-8 12h6l-1 8 9-12h-6z',
} as const;

export function Icon({ name }: { name: keyof typeof paths }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}
