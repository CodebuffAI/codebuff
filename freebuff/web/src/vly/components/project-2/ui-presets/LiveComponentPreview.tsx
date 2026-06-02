"use client";

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  Component,
  type ReactNode,
  type ErrorInfo,
} from "react";
import { transform } from "@babel/standalone";
import { cn } from "@/vly/lib/utils";

// Import scope from separate file
import { SCOPE, LucideIcons } from "./moduleScope";

// ============================================================================
// DEPENDENCY DETECTION
// ============================================================================

interface DependencyCheck {
  available: boolean;
  missing: string[];
  allDeps: string[];
}

/**
 * Extract all import statements from code
 */
function extractImports(code: string): Array<{
  imports: string;
  path: string;
  isDefault: boolean;
  isNamespace: boolean;
}> {
  const imports: Array<{
    imports: string;
    path: string;
    isDefault: boolean;
    isNamespace: boolean;
  }> = [];

  // Match: import X, { Y, Z } from "path" (mixed default + named)
  const mixedImportRegex =
    /import\s+(\w+)\s*,\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?/g;
  let match;
  while ((match = mixedImportRegex.exec(code)) !== null) {
    // Add default import
    imports.push({
      imports: match[1].trim(),
      path: match[3].trim(),
      isDefault: true,
      isNamespace: false,
    });
    // Add named imports
    imports.push({
      imports: match[2].trim(),
      path: match[3].trim(),
      isDefault: false,
      isNamespace: false,
    });
  }

  // Match: import { X, Y } from "path"
  const namedImportRegex = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?/g;
  while ((match = namedImportRegex.exec(code)) !== null) {
    imports.push({
      imports: match[1].trim(),
      path: match[2].trim(),
      isDefault: false,
      isNamespace: false,
    });
  }

  // Match: import X from "path"
  const defaultImportRegex = /import\s+(\w+)\s+from\s*['"]([^'"]+)['"];?/g;
  while ((match = defaultImportRegex.exec(code)) !== null) {
    imports.push({
      imports: match[1].trim(),
      path: match[2].trim(),
      isDefault: true,
      isNamespace: false,
    });
  }

  // Match: import * as X from "path"
  const namespaceImportRegex =
    /import\s*\*\s*as\s+(\w+)\s+from\s*['"]([^'"]+)['"];?/g;
  while ((match = namespaceImportRegex.exec(code)) !== null) {
    imports.push({
      imports: match[1].trim(),
      path: match[2].trim(),
      isDefault: false,
      isNamespace: true,
    });
  }

  return imports;
}

/**
 * Normalize import path to match SCOPE keys
 */
function normalizeImportPath(path: string): string {
  // Handle relative paths (shadcn components)
  if (path.startsWith("@/vly/components/ui/")) {
    return path;
  }

  // Handle scoped packages
  if (path.startsWith("@")) {
    return path;
  }

  // Handle relative paths
  if (path.startsWith("./") || path.startsWith("../")) {
    return path;
  }

  return path;
}

/**
 * Check if all dependencies are available in SCOPE
 */
function checkDependencies(code: string): DependencyCheck {
  const imports = extractImports(code);
  const allDeps = [...new Set(imports.map((i) => i.path))];
  const missing: string[] = [];

  const modules = SCOPE.__modules as Record<string, unknown> | undefined;

  for (const dep of allDeps) {
    const normalized = normalizeImportPath(dep);

    // Skip relative imports (assumed to be available)
    if (normalized.startsWith("./") || normalized.startsWith("../")) {
      continue;
    }

    // Check if dependency exists in SCOPE.__modules
    if (!modules || !modules[normalized]) {
      missing.push(dep);
    }
  }

  return {
    available: missing.length === 0,
    missing,
    allDeps,
  };
}

// ============================================================================
// CODE TRANSFORMATION
// ============================================================================

/**
 * Transform imports to use SCOPE.__modules
 */
function transformImportsToScope(code: string): string {
  let transformed = code;
  const imports = extractImports(code);

  // Group imports by path for cleaner code
  const importsByPath = new Map<
    string,
    Array<{ imports: string; isDefault: boolean; isNamespace: boolean }>
  >();

  imports.forEach((imp) => {
    const existing = importsByPath.get(imp.path) || [];
    existing.push({
      imports: imp.imports,
      isDefault: imp.isDefault,
      isNamespace: imp.isNamespace,
    });
    importsByPath.set(imp.path, existing);
  });

  // Generate const declarations for each import path
  const declarations: string[] = [];

  importsByPath.forEach((imps, path) => {
    const normalized = normalizeImportPath(path);

    imps.forEach((imp) => {
      if (imp.isNamespace) {
        // import * as X from "path" → const X = __modules["path"]
        declarations.push(`const ${imp.imports} = __modules["${normalized}"];`);
      } else if (imp.isDefault) {
        // import X from "path" → const X = __modules["path"].default || __modules["path"]
        declarations.push(
          `const ${imp.imports} = __modules["${normalized}"].default || __modules["${normalized}"];`,
        );
      } else {
        // import { X, Y } from "path" → const { X, Y } = __modules["path"]
        declarations.push(
          `const { ${imp.imports} } = __modules["${normalized}"];`,
        );
      }
    });
  });

  // Remove all import statements
  // Handle: import X, { y, z } from "..." (mixed default + named)
  transformed = transformed.replace(
    /import\s+\w+\s*,\s*\{[^}]*\}\s*from\s*['"][^'"]+['"];?\s*/g,
    "",
  );
  // Handle: import { x, y } from "..." | import x from "..." | import * as x from "..."
  transformed = transformed.replace(
    /import\s+(?:(?:\{[^}]*\})|(?:\*\s+as\s+\w+)|(?:\w+))\s+from\s*['"][^'"]+['"];?\s*/g,
    "",
  );
  // Handle: import "..." (side-effect imports)
  transformed = transformed.replace(/import\s*['"][^'"]+['"];?\s*/g, "");
  // Catch any remaining import statements (fallback)
  transformed = transformed.replace(/import\s+.+?;/g, "");

  // Add our const declarations at the top
  transformed = declarations.join("\n") + "\n" + transformed;

  return transformed;
}

/**
 * Transform code: handle exports and JSX
 */
function transformCode(code: string): string {
  // Remove "use client" directive
  let cleaned = code.replace(/["']use client["'];?\s*/g, "");

  // Transform imports to use scope
  cleaned = transformImportsToScope(cleaned);

  // Handle exports
  // export { Name } -> (remove entirely)
  cleaned = cleaned.replace(/^export\s*\{[^}]*\};?\s*$/gm, "");

  // export default ComponentName; -> (remove, will be found by name)
  cleaned = cleaned.replace(/^export\s+default\s+(\w+);?\s*$/gm, "");

  // export default function Name() -> function Name()
  cleaned = cleaned.replace(
    /^export\s+default\s+function\s+(\w+)/gm,
    "function $1",
  );

  // export default () => ... -> const __DefaultComponent = () => ...
  cleaned = cleaned.replace(
    /^export\s+default\s+(\([^)]*\)\s*=>)/gm,
    "const __DefaultComponent = $1",
  );

  // export default memo(...) -> const __DefaultComponent = memo(...)
  cleaned = cleaned.replace(
    /^export\s+default\s+(?!function)(.+)/gm,
    "const __DefaultComponent = $1",
  );

  // export const/function/class -> const/function/class
  cleaned = cleaned.replace(
    /^export\s+(const|let|var|function|class)\s+/gm,
    "$1 ",
  );

  // Transform JSX with Babel
  try {
    const result = transform(cleaned, {
      presets: [
        [
          "typescript",
          { isTSX: true, allExtensions: true, onlyRemoveTypeImports: true },
        ],
        ["react", { runtime: "automatic" }],
      ],
      filename: "component.tsx",
    });

    let finalCode = result.code || "";

    // Remove Babel-generated imports (jsx runtime is already in scope)
    // Babel's automatic runtime adds: import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime"
    finalCode = finalCode.replace(
      /import\s*\{[^}]*\}\s*from\s*['"]react\/jsx-runtime['"];?\s*/g,
      "",
    );
    finalCode = finalCode.replace(
      /import\s*\*\s*as\s+\w+\s*from\s*['"]react\/jsx-runtime['"];?\s*/g,
      "",
    );

    return finalCode;
  } catch (error) {
    console.error("Babel transformation error:", error);
    throw new Error(
      `Failed to transform JSX: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Extract component name from code
 */
function extractComponentName(code: string): string {
  const patterns = [
    /export\s+default\s+function\s+(\w+)/,
    /export\s+default\s+(\w+)/,
    /export\s*{\s*(\w+)\s*}/,
    /export\s+(?:const|function)\s+(\w+)/,
    /const\s+(\w+)\s*=\s*(?:memo|forwardRef)\s*\(/,
    /function\s+([A-Z]\w+)/,
    /const\s+([A-Z]\w+)\s*[:=]/,
  ];

  for (const pattern of patterns) {
    const match = code.match(pattern);
    if (match && match[1]) {
      // Ignore common non-component names
      const name = match[1];
      if (
        !["Button", "Card", "Input"].includes(name) ||
        code.includes(`function ${name}`) ||
        code.includes(`const ${name}`)
      ) {
        return name;
      }
    }
  }

  return "Component";
}

/**
 * Create component from code
 */
function createComponentFromCode(
  code: string,
  componentName: string,
): React.ComponentType<unknown> | null {
  const transformedCode = transformCode(code);

  // Build the function that executes the component code
  const functionBody = `
    "use strict";

    // Extract __modules and __jsx from scope
    const { __modules, __jsx } = scope;

    // Make jsx-runtime available for Babel output
    const { jsx: _jsx, jsxs: _jsxs, Fragment: _Fragment } = __jsx;

    // Execute the transformed code (imports are handled via __modules)
    ${transformedCode}
    
    // Try to find and return the component
    if (typeof ${componentName} !== 'undefined') return ${componentName};
    if (typeof __DefaultComponent !== 'undefined') return __DefaultComponent;
    
    // Last resort: find any function that looks like a component
    const possibleComponents = Object.keys(this).filter(key => 
      typeof this[key] === 'function' && 
      key[0] === key[0].toUpperCase()
    );
    
    if (possibleComponents.length > 0) {
      return this[possibleComponents[0]];
    }
    
    throw new Error("Could not find component export. Expected: " + "${componentName}");
  `;

  try {
    // Create function with scope context
    const factory = new Function("scope", functionBody);
    const component = factory(SCOPE);

    if (typeof component === "function") {
      return component as React.ComponentType<unknown>;
    }

    throw new Error(`Component "${componentName}" is not a function`);
  } catch (err) {
    console.error("Component creation error:", err);
    console.error("Original code:", code);
    console.error("Transformed code:", transformedCode);
    console.error("Function body:", functionBody);
    throw err;
  }
}

// ============================================================================
// ERROR BOUNDARY
// ============================================================================

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback: (error: Error, reset: () => void) => ReactNode;
}

class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Component Error:", error);
    console.error("Error Info:", info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return this.props.fallback(this.state.error, this.reset);
    }
    return this.props.children;
  }
}

// ============================================================================
// PREVIEW CONTAINER COMPONENT
// ============================================================================

interface PreviewContainerProps {
  children: ReactNode;
  className?: string;
}

/**
 * Consistent container for preview states with a nice checkered background
 */
function PreviewContainer({ children, className }: PreviewContainerProps) {
  return (
    <div
      className={cn("relative w-full overflow-auto", "bg-white", className)}
      style={{
        backgroundImage: `
          linear-gradient(45deg, #f8f9fa 25%, transparent 25%),
          linear-gradient(-45deg, #f8f9fa 25%, transparent 25%),
          linear-gradient(45deg, transparent 75%, #f8f9fa 75%),
          linear-gradient(-45deg, transparent 75%, #f8f9fa 75%)
        `,
        backgroundSize: "20px 20px",
        backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
      }}
    >
      {children}
    </div>
  );
}

// ============================================================================
// ERROR MESSAGE COMPONENT
// ============================================================================

interface ErrorMessageProps {
  title: string;
  message: string;
  details?: string[];
  onReset?: () => void;
}

function ErrorMessage({ title, message, details, onReset }: ErrorMessageProps) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="flex min-h-[200px] w-full items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-red-200 bg-gradient-to-b from-red-50 to-white p-5 shadow-sm">
        <div className="mb-3 flex items-start gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
            <LucideIcons.AlertCircle className="h-5 w-5 text-red-600" />
          </div>
          <div className="flex-1 pt-1">
            <h3 className="mb-1 text-sm font-semibold text-red-700">{title}</h3>
            <p className="text-xs leading-relaxed text-gray-600">{message}</p>
          </div>
        </div>

        {details && details.length > 0 && (
          <div className="mb-3 ml-12">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="mb-2 flex items-center gap-1.5 text-xs font-medium text-gray-500 transition-colors hover:text-gray-700"
            >
              <LucideIcons.ChevronRight
                className={cn(
                  "h-3 w-3 transition-transform duration-200",
                  showDetails && "rotate-90",
                )}
              />
              {showDetails ? "Hide" : "Show"} details
            </button>

            {showDetails && (
              <div className="max-h-32 space-y-1 overflow-auto rounded-lg border border-red-100 bg-white p-3 font-mono text-[11px] leading-relaxed text-gray-600">
                {details.map((detail, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-red-400">•</span>
                    <span className="break-all">{detail}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="ml-12 flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <LucideIcons.Terminal className="h-3 w-3" />
            Check console
          </span>
          {onReset && (
            <>
              <span className="text-gray-300">•</span>
              <button
                onClick={onReset}
                className="flex items-center gap-1.5 font-medium text-gray-500 transition-colors hover:text-gray-700"
              >
                <LucideIcons.RefreshCw className="h-3 w-3" />
                Retry
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface LiveComponentPreviewProps {
  code: string;
  className?: string;
}

export function LiveComponentPreview({
  code,
  className,
}: LiveComponentPreviewProps) {
  const [error, setError] = useState<Error | null>(null);
  const [key, setKey] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const [DynamicComponent, setDynamicComponent] =
    useState<React.ComponentType<unknown> | null>(null);

  const componentName = useMemo(() => extractComponentName(code), [code]);

  // Check dependencies (computed value, not state)
  const depCheck = useMemo(() => {
    const check = checkDependencies(code);
    if (!check.available) {
      console.warn("Missing dependencies:", check.missing);
    }
    return check;
  }, [code]);

  // Create component and handle errors
  useEffect(() => {
    // Reset state for new code
    // eslint-disable-next-line react-hooks/set-state-in-effect -- State resets are intentional when code changes, preventing stale error states
    setError(null);
    setTimedOut(false);

    // Don't create component if dependencies are missing
    if (!depCheck.available) {
      setDynamicComponent(null);
      return;
    }

    try {
      const component = createComponentFromCode(code, componentName);
      setDynamicComponent(() => component);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error("Component creation failed:", error);
      setError(error);
      setDynamicComponent(null);
    }
  }, [code, componentName, depCheck]);

  // 10 second timeout
  useEffect(() => {
    if (DynamicComponent || error || !depCheck.available) return;

    const timer = setTimeout(() => {
      setTimedOut(true);
    }, 10000);

    return () => clearTimeout(timer);
  }, [DynamicComponent, error, depCheck]);

  const handleReset = useCallback(() => {
    setError(null);
    setTimedOut(false);
    setKey((k) => k + 1);
  }, []);

  // Missing dependencies error
  if (!depCheck.available) {
    return (
      <PreviewContainer className={className}>
        <ErrorMessage
          title="Missing Dependencies"
          message="This component requires libraries that are not currently available."
          details={[
            "Missing libraries:",
            ...depCheck.missing.map((dep) => `  ${dep}`),
            "",
            "Add these imports to moduleScope.ts to enable preview.",
          ]}
          onReset={handleReset}
        />
      </PreviewContainer>
    );
  }

  // Runtime error
  if (error) {
    return (
      <PreviewContainer className={className}>
        <ErrorMessage
          title="Component Error"
          message={error.message}
          details={[error.stack || "No stack trace available"]}
          onReset={handleReset}
        />
      </PreviewContainer>
    );
  }

  // Timeout error
  if (timedOut) {
    return (
      <PreviewContainer className={className}>
        <ErrorMessage
          title="Component Timeout"
          message="The component took too long to load (>10 seconds)"
          onReset={handleReset}
        />
      </PreviewContainer>
    );
  }

  // Loading state
  if (!DynamicComponent) {
    return (
      <PreviewContainer className={className}>
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 text-gray-400">
          <div className="relative">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-gray-400" />
          </div>
          <span className="text-sm font-medium">Compiling component...</span>
        </div>
      </PreviewContainer>
    );
  }

  // Render component
  return (
    <ErrorBoundary
      key={key}
      fallback={(err, reset) => (
        <PreviewContainer className={className}>
          <ErrorMessage
            title="Runtime Error"
            message={err.message}
            details={[err.stack || "No stack trace available"]}
            onReset={reset}
          />
        </PreviewContainer>
      )}
    >
      <PreviewContainer className={className}>
        <div className="flex min-h-[200px] w-full items-center justify-center p-6">
          <DynamicComponent />
        </div>
      </PreviewContainer>
    </ErrorBoundary>
  );
}
