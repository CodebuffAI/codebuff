import { ProjectNotFound } from "@/vly/components/project-not-found";
import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: (error: Error, semanticIdentifier?: string) => ReactNode;
  semanticIdentifier?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ProjectErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log the error for debugging
    console.error("Project Error Boundary caught an error:", error, errorInfo);
  }

  reset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      // Check if this is a project-related error
      const errorMessage = this.state.error.message;
      const isProjectError =
        errorMessage.includes("Project not found") ||
        errorMessage.includes("Access denied") ||
        errorMessage.includes("User not found");

      if (isProjectError) {
        // Use custom fallback if provided, otherwise use ProjectNotFound
        if (this.props.fallback) {
          return this.props.fallback(
            this.state.error,
            this.props.semanticIdentifier,
          );
        }
        return (
          <ProjectNotFound semanticIdentifier={this.props.semanticIdentifier} />
        );
      }

      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0b] px-4 text-center text-zinc-100">
          <div className="max-w-md rounded-lg border border-zinc-800 bg-zinc-950 p-6 shadow-xl">
            <h1 className="text-lg font-semibold">Project failed to load</h1>
            <p className="mt-2 text-sm text-zinc-400">
              The project hit a temporary loading error. Try again, or refresh
              the page if it keeps happening.
            </p>
            <button
              className="mt-5 rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-zinc-200"
              onClick={this.reset}
              type="button"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
