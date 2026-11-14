// Reusable loading, error and empty UI states (R04).

export interface LoadingStateProps {
  message?: string;
}

export function LoadingState({ message = 'Loading map data…' }: LoadingStateProps) {
  return (
    <div className="state" role="status">
      <span className="spinner" aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}

export interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ message = 'Something went wrong.', onRetry }: ErrorStateProps) {
  return (
    <div className="state state--error" role="alert">
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

export interface EmptyStateProps {
  message?: string;
}

export function EmptyState({ message = 'No route to display yet.' }: EmptyStateProps) {
  return (
    <div className="state">
      <strong>Nothing here yet</strong>
      <p>{message}</p>
    </div>
  );
}
