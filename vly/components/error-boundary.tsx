import { ProjectNotFound } from "@/components/project-not-found";
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

      // For other errors, you might want to show a different error page
      // For now, still show ProjectNotFound but you could customize this
      return this.props.children;
    }

    return this.props.children;
  }
}
