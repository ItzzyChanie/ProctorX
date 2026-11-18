import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

type Props = {
  children: ReactNode;
  /** "exam" explains that answers are autosaved and how to get back in. */
  variant?: 'app' | 'exam';
  /** When this value changes (e.g. the route), the boundary resets. */
  resetKey?: string;
};

type State = { error: Error | null };

/**
 * Catches rendering errors so a bug shows a recovery screen instead of a
 * blank page. In the exam room this matters most: the student must know that
 * their answers are saved and how to continue.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error', error, info.componentStack);
  }

  componentDidUpdate(previous: Props) {
    if (this.state.error && previous.resetKey !== this.props.resetKey)
      this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const exam = this.props.variant === 'exam';
    return (
      <main
        role="alert"
        className="flex min-h-screen items-center justify-center bg-canvas p-4"
      >
        <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 text-center shadow-lg sm:p-8">
          <h1 className="text-lg font-bold text-text-1">
            {exam ? 'The exam page hit a problem' : 'Something went wrong'}
          </h1>
          <p className="mt-3 text-sm text-text-2">
            {exam
              ? 'Your answers are saved automatically, and your timer keeps running on the server. Reload the page and enter the same room code to continue where you left off.'
              : 'This page could not be displayed. Reloading usually fixes it. If it keeps happening, tell your instructor or administrator what you were doing.'}
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-[10px] bg-brand-gradient px-4 py-2.5 text-sm font-semibold text-white focus:outline-none focus:ring-4 focus:ring-brand/30"
            >
              {exam ? 'Reload and rejoin' : 'Reload page'}
            </button>
            {!exam && (
              <a
                href="/"
                className="rounded-[10px] border border-border px-4 py-2.5 text-sm font-semibold text-text-1 focus:outline-none focus:ring-4 focus:ring-brand/30"
              >
                Go to home
              </a>
            )}
          </div>
        </div>
      </main>
    );
  }
}

/** Route-level boundary that resets when the user navigates elsewhere. */
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>;
}
