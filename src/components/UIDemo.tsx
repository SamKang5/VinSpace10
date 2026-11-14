// UI demo wired into the Vite app (mock data only, no GIS/backend).
import { useState } from 'react';
import { MapLegend } from './MapLegend';
import { HowToModal } from './HowToModal';
import { TerrainInfoPanel } from './TerrainInfoPanel';
import { LoadingState, ErrorState, EmptyState } from './UIStates';

const SLOPE_CLASSES = [
  { label: 'Under 5°', color: 'rgba(230, 195, 90, 0.55)' },
  { label: '5–10°', color: 'rgba(242, 132, 59, 0.7)' },
  { label: '10–15°', color: 'rgba(242, 68, 45, 0.85)' },
  { label: '15°+ (blocked)', color: 'rgba(120, 0, 0, 0.9)' },
];

export default function UIDemo() {
  const [modalOpen, setModalOpen] = useState(false);
  const [demoState, setDemoState] = useState<'loading' | 'error' | 'empty'>('empty');

  return (
    <main style={{ padding: '1.5rem', maxWidth: '1100px', margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ opacity: 0.7, margin: 0 }}>MARS NAVIGATOR</p>
          <h1 style={{ margin: '0.25rem 0' }}>Map UI demo</h1>
          <p style={{ opacity: 0.7, margin: 0 }}>Static components and mock data — no GIS or backend connection.</p>
        </div>
        <button className="btn btn--primary" type="button" onClick={() => setModalOpen(true)}>
          How to use
        </button>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem', marginTop: '1rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <section className="card">
            <h2>Map placeholder</h2>
            <p style={{ opacity: 0.7 }}>The interactive map and A* route will be integrated separately.</p>
          </section>

          <section className="card">
            <h2>Demo states</h2>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
              {(['loading', 'error', 'empty'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={demoState === s ? 'btn btn--primary' : 'btn'}
                  onClick={() => setDemoState(s)}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
            {demoState === 'loading' && <LoadingState />}
            {demoState === 'error' && <ErrorState message="This is a mock error for UI testing." onRetry={() => setDemoState('empty')} />}
            {demoState === 'empty' && <EmptyState />}
          </section>
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <MapLegend
            elevation={{ min: -2600, max: -2300, unit: 'm' }}
            slopeClasses={SLOPE_CLASSES}
            costPolicy="1 + (slope_degrees / 10)^2"
            traversability={{ traversable: 60000, blocked: 11289, total: 71289 }}
          />
          <TerrainInfoPanel
            cell={[120, 85]}
            projected={{ x: 4584223, y: 1093593 }}
            elevation={-2450}
            slope={8.5}
            cost={1.72}
            slopeClass="5–10°"
            blocked={false}
          />
        </aside>
      </div>

      <HowToModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </main>
  );
}
