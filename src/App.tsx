/**
 * MARS NAVIGATOR — application shell.
 *
 * M1-01 delivers the shell only: the app builds, runs locally, and every
 * member can clone and start on their own module. Feature sections (map view,
 * routing controls, comparison cards) are owned by other members and land in
 * their own files under src/ as they are implemented.
 */
export function App() {
  return (
    <main>
      <h1>MARS NAVIGATOR</h1>
      <p>
        Route planning across Jezero Crater, from NASA and USGS terrain data.
        The application shell is running.
      </p>
    </main>
  );
}
