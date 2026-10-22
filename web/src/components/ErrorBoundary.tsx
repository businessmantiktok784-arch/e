import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Top-level UI safety net.
 *
 * Without this, a throw anywhere in a render or effect unmounts the whole tree
 * and leaves a blank page with no explanation. The boundary shows the failure
 * and offers a reload, so the application never presents an empty screen.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Uncaught UI error', error, info.componentStack);
  }

  private handleReload = (): void => {
    this.setState({ error: null });
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#f0f4f9] p-6">
        <div className="w-full max-w-md rounded-2xl border border-[#e3e3e3] bg-white p-6 shadow-[var(--g-elev-2)]">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#fce8e6] text-[#b3261e]">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </span>
            <h1 className="text-base font-semibold text-[#1f1f1f]">Something went wrong</h1>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-[#5e5e5e]">
            The page ran into an unexpected error. Reloading usually clears it. If it keeps
            happening, let the team know.
          </p>
          {error.message && (
            <pre className="mt-3 max-h-32 overflow-auto rounded-lg bg-[#f8f9fa] p-3 text-xs text-[#5e5e5e]">
              {error.message}
            </pre>
          )}
          <button
            type="button"
            onClick={this.handleReload}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#0b57d0] px-4 py-2 text-sm font-medium text-white hover:bg-[#0a4bb5] transition-colors"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Reload
          </button>
        </div>
      </div>
    );
  }
}
