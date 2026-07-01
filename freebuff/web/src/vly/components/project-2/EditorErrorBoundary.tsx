"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Scoped error boundary around the rich-text chat editor.
 *
 * The Slate-based `MentionsEditor` can throw during commit on some mobile
 * browsers/IMEs (e.g. Android Gboard / iOS) while reconciling the DOM selection.
 * Without a boundary, that throw bubbles all the way to the project-level
 * `ProjectErrorBoundary`, so a single keystroke nukes the whole workspace into
 * "Project failed to load".
 *
 * This boundary contains the failure to just the editor and renders a plain,
 * fully-functional `<textarea>` fallback instead, so users can still type and
 * send messages. It auto-recovers when `resetKey` changes (e.g. after a send).
 */
interface Props {
  children: ReactNode;
  fallback: ReactNode;
  resetKey?: unknown;
  onError?: (error: Error) => void;
}

interface State {
  hasError: boolean;
}

export class EditorErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      "[ChatInput] editor crashed — falling back to plain textarea",
      error,
      info,
    );
    this.props.onError?.(error);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}
