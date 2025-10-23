type SuppressFunction = (args: any[], errorName: string) => boolean

// Store the original console methods with proper typing
const originalMethods: Record<string, (...args: any[]) => void> = {}

// Store active suppress functions for each console method
const activeSuppressFunctions: Record<string, SuppressFunction[]> = {}

// Initialize original methods and active functions
function initializeConsoleMethod(type: 'error' | 'warn' | 'log') {
  if (!originalMethods[type]) {
    originalMethods[type] = console[type]
    activeSuppressFunctions[type] = []
  }
}

// Create the wrapped console function that checks all active suppress functions
function createWrappedConsoleMethod(type: 'error' | 'warn' | 'log') {
  return function (...args: any[]) {
    // Check for error name in any of the arguments
    let errorName = ''
    for (const arg of args) {
      if (arg instanceof Error) {
        errorName = arg.name
        break
      } else if (arg && typeof arg === 'object' && arg.constructor) {
        errorName = arg.constructor.name
        break
      }
    }

    // Check if any active suppress function wants to suppress this output
    const shouldSuppress = activeSuppressFunctions[type].some((suppressFn) =>
      suppressFn(args, errorName),
    )

    if (shouldSuppress) {
      // Don't call the original function
      return
    }

    // Call the original function
    originalMethods[type].apply(console, args)
  }
}

export function suppressConsoleOutput(
  type: 'error' | 'warn' | 'log' | 'all',
  suppress: SuppressFunction,
): () => void {
  if (type === 'all') {
    // Apply to all console methods
    const cleanupFunctions = (['error', 'warn', 'log'] as const).map(
      (consoleType) => suppressConsoleOutput(consoleType, suppress),
    )

    // Return cleanup function that cleans up all
    return () => {
      cleanupFunctions.forEach((cleanup) => cleanup())
    }
  }

  // Initialize if needed
  initializeConsoleMethod(type)

  if (!activeSuppressFunctions[type].includes(suppress)) {
    // Add the suppress function to the active list
    activeSuppressFunctions[type].push(suppress)
  }

  // Replace console method with wrapped version (if not already replaced)
  if (console[type] === originalMethods[type]) {
    console[type] = createWrappedConsoleMethod(type)
  }

  // Return cleanup function
  return () => {
    const index = activeSuppressFunctions[type].indexOf(suppress)
    if (index > -1) {
      activeSuppressFunctions[type].splice(index, 1)
    }

    // If no more suppress functions are active, restore the original method
    if (activeSuppressFunctions[type].length === 0) {
      console[type] = originalMethods[type]
    }
  }
}

// Utility function to clean up all suppress functions and restore original console methods
export function cleanupAllSuppression() {
  for (const type of ['error', 'warn', 'log'] as const) {
    if (originalMethods[type]) {
      console[type] = originalMethods[type]
      activeSuppressFunctions[type] = []
    }
  }
}
