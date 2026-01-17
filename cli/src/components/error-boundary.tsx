import { memo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback: ReactNode
  componentName?: string
}

/**
 * A wrapper component that provides error boundary-like behavior.
 * Since OpenTUI's JSX types don't support React class components,
 * this uses a memo wrapper. Errors that occur during render will
 * be caught by React's error boundary mechanism if one exists higher
 * in the tree, or will propagate normally.
 * 
 * For true error boundary behavior in OpenTUI, wrap at the application
 * root level using React's native error boundary support.
 */
export const ErrorBoundary = memo(
  ({ children, fallback, componentName }: ErrorBoundaryProps) => {
    // Note: This is a structural wrapper. True error catching requires
    // a class component, but OpenTUI's JSX types don't support them.
    // The fallback is available for parent components to use when they
    // detect errors through other means.
    return <>{children}</>
  },
)

/**
 * Helper to safely render content with error handling.
 * Use this when you need to catch render errors in a functional context.
 */
export function withErrorFallback<T>(
  renderFn: () => T,
  fallback: T,
  componentName?: string,
): T {
  try {
    return renderFn()
  } catch (error) {
    console.error(`[${componentName ?? 'withErrorFallback'}] Error caught:`, error)
    return fallback
  }
}
