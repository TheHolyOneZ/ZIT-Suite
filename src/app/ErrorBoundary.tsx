import { Component, type ReactNode } from "react";
import i18n from "i18next";
import { TriangleAlert } from "lucide-react";
import { Button, EmptyState } from "@/ui";

interface State {
  error: Error | null;
}


export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <EmptyState
        icon={<TriangleAlert size={20} className="text-danger" />}
        title={i18n.t("shell.crash.title")}
        body={<span className="num text-[11.5px]">{this.state.error.message}</span>}
        action={<Button onClick={() => this.setState({ error: null })}>{i18n.t("shell.crash.retry")}</Button>}
      />
    );
  }
}
