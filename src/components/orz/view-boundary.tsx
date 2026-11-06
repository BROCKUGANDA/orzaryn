"use client";

import { Component, type ReactNode } from "react";
import { ErrorState } from "@/components/orz/primitives";

type Props = { children: ReactNode; name?: string };
type State = { error: Error | null };

export class ViewBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error(`[ORZARYN] view crashed (${this.props.name ?? "unknown"})`, error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const labelled = this.props.name
      ? new Error(`${this.props.name} view failed: ${this.state.error.message}`)
      : this.state.error;
    return <ErrorState error={labelled} retry={() => this.setState({ error: null })} />;
  }
}
