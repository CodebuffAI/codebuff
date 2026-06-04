/**
 * Lightweight validator for expensive Convex patterns.
 * Focuses on the most critical cost drivers with simple pattern matching.
 */

export interface CostViolation {
  lineNumber: number;
  pattern: string;
  message: string;
}

export interface CostValidationResult {
  violations: CostViolation[];
}

/**
 * Checks if a file is a Convex function file
 */
export function isConvexFunctionFile(filePath: string): boolean {
  return (
    filePath.startsWith("convex/") &&
    filePath.endsWith(".ts") &&
    !filePath.includes("/_generated/") &&
    !filePath.endsWith("/schema.ts") &&
    !filePath.endsWith("/auth.config.ts")
  );
}

/**
 * Simple validation for the most expensive patterns
 */
export function validateConvexCosts(content: string): CostValidationResult {
  const violations: CostViolation[] = [];
  const lines = content.split("\n");

  lines.forEach((line, index) => {
    // Pattern 1: .collect() without pagination context
    if (line.includes(".collect()")) {
      violations.push({
        lineNumber: index + 1,
        pattern: ".collect() detected",
        message:
          "Using .collect() loads entire table. Use .take(100) or .paginate() instead",
      });
    }

    // Pattern 2: Obvious N+1 pattern (mutation in for loop)
    if (
      /for\s*\(/.test(line) &&
      (line.includes("ctx.db.patch") ||
        line.includes("ctx.db.insert") ||
        line.includes("ctx.db.delete"))
    ) {
      violations.push({
        lineNumber: index + 1,
        pattern: "Database operation in for loop",
        message:
          "N+1 pattern detected. Batch operations with Promise.all() instead",
      });
    }

    // Pattern 3: await in for loop with db operation
    if (/for\s*\(/.test(line) && line.includes("await ctx.db")) {
      violations.push({
        lineNumber: index + 1,
        pattern: "Await in for loop",
        message:
          "Sequential database operations. Use Promise.all() for batch operations",
      });
    }
  });

  return { violations };
}

/**
 * Formats violations for logging
 */
export function formatViolations(
  violations: CostViolation[],
  filePath: string,
): string {
  if (violations.length === 0) return "";

  const lines = [`[COST_VALIDATION] ${filePath}:`];
  violations.forEach((v) => {
    lines.push(`  Line ${v.lineNumber}: ${v.pattern} - ${v.message}`);
  });

  return lines.join("\n");
}
