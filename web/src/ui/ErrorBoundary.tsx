import { Component, type ReactNode } from "react";

/** A screen that crashes shows a recoverable message instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: unknown }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("[life-admin] screen error", error);
  }

  componentDidUpdate(prev: { resetKey?: unknown }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card stack" role="alert">
        <h2>This screen hit a problem</h2>
        <p className="muted">Your documents are safe. Try again, or go to another tab.</p>
        <p className="hint">Details: {this.state.error.message}</p>
        <button className="btn btn-primary" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    );
  }
}
