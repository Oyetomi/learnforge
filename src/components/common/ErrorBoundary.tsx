import { Component, type ReactNode } from "react";

/**
 * Keeps one failing screen from blanking the whole window. Learning records
 * are saved as they change, so recovering is safe; `resetKey` (for example
 * the open topic and view) clears the error when the learner navigates away.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode; resetKey?: string },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("A screen failed to render:", error);
  }

  componentDidUpdate(previous: { resetKey?: string }) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section className="screen-error" role="alert">
        <h2>This screen couldn’t be shown</h2>
        <p>Your topics, answers and reading place are saved. Try again, or reload the app.</p>
        <details>
          <summary>Technical details</summary>
          <pre>{this.state.error.message}</pre>
        </details>
        <div>
          <button className="dialog-primary-button" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
          <button className="dialog-secondary-button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </section>
    );
  }
}
