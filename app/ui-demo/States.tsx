// Reusable UI states compatible with the old app's class conventions.

export function LoadingState({ message = "Loading map data…" }: { message?: string }) {
  return (
    <div className="state" role="status">
      <span className="spinner" aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}

export function ErrorState({ message = "Something went wrong.", onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="state error" role="alert">
      <strong>Unable to load</strong>
      <p>{message}</p>
      {onRetry && (
        <button type="button" className="btn btn--primary" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ message = "No route to display yet." }: { message?: string }) {
  return (
    <div className="state">
      <strong>Nothing here yet</strong>
      <p>{message}</p>
    </div>
  );
}

export default { LoadingState, ErrorState, EmptyState };
