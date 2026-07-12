import React, { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback: ReactNode
  componentName?: string
}

interface ErrorBoundaryState {
  failed: boolean
}

/** A real React render error boundary for nested TUI subtrees. */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(
      `[${this.props.componentName ?? 'ErrorBoundary'}] Render failed:`,
      error,
      info.componentStack,
    )
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

export const ErrorBoundaryPlaceholder = ErrorBoundary

export function withErrorFallback<T>(
  renderFn: () => T,
  fallback: T,
  componentName?: string,
): T {
  try {
    return renderFn()
  } catch (error) {
    console.error(
      `[${componentName ?? 'withErrorFallback'}] Error caught:`,
      error,
    )
    return fallback
  }
}
