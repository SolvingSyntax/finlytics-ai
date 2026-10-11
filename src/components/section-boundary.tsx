import { Component, type ReactNode } from "react";

export class SectionBoundary extends Component<
  { name: string; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: unknown) {
    console.error(`[${this.props.name}]`, error);
  }
  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="panel" role="alert">
        <div className="panel-heading">
          <h3>{this.props.name} unavailable</h3>
        </div>
        <div className="panel-subtitle">
          This section hit an error. The rest of the dashboard still works.
        </div>
        <button
          type="button"
          className="tiny-label"
          onClick={() => this.setState({ failed: false })}
        >
          Retry
        </button>
      </div>
    );
  }
}
