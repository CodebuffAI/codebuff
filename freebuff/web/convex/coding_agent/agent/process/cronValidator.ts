/**
 * Validates and fixes cron intervals to prevent high-frequency polling
 * that can cause excessive infrastructure costs.
 *
 * Minimum allowed interval: 5 minutes (300 seconds)
 */

export interface CronAdjustment {
  lineNumber: number;
  originalInterval: string;
  adjustedInterval: string;
}

export interface ValidationResult {
  content: string;
  adjustments: CronAdjustment[];
}

const MINIMUM_SECONDS = 300; // 5 minutes

/**
 * Validates and auto-adjusts cron intervals in crons.ts files.
 * Any interval shorter than 5 minutes will be adjusted to 5 minutes.
 */
export function validateAndFixCronIntervals(content: string): ValidationResult {
  const adjustments: CronAdjustment[] = [];

  // Process entire content to handle multiline cron definitions
  let modifiedContent = content;

  // Match crons.interval() calls with interval objects (multiline support)
  // Pattern: crons.interval(..., { seconds: N }, ...)
  // Using [\s\S] instead of . with s flag for better compatibility
  const intervalRegex =
    /crons\.interval[\s\S]*?\(\s*["'][^"']*["']\s*,\s*\{([^}]+)\}/g;

  let match;
  const replacements: Array<{
    original: string;
    replacement: string;
    position: number;
  }> = [];

  while ((match = intervalRegex.exec(content)) !== null) {
    const intervalContent = match[1];
    const fullMatch = match[0];

    // Extract interval value - could be seconds, minutes, or hours
    const secondsMatch = intervalContent.match(/seconds\s*:\s*(\d+)/);
    const minutesMatch = intervalContent.match(/minutes\s*:\s*(\d+)/);
    const hoursMatch = intervalContent.match(/hours\s*:\s*(\d+)/);

    let totalSeconds = 0;
    let intervalType: "seconds" | "minutes" | "hours" | null = null;
    let intervalValue = 0;

    if (secondsMatch) {
      intervalType = "seconds";
      intervalValue = parseInt(secondsMatch[1], 10);
      totalSeconds = intervalValue;
    } else if (minutesMatch) {
      intervalType = "minutes";
      intervalValue = parseInt(minutesMatch[1], 10);
      totalSeconds = intervalValue * 60;
    } else if (hoursMatch) {
      intervalType = "hours";
      intervalValue = parseInt(hoursMatch[1], 10);
      totalSeconds = intervalValue * 3600;
    }

    if (intervalType && totalSeconds < MINIMUM_SECONDS) {
      // Found a violation - adjust to minimum (5 minutes)
      const originalInterval = `{ ${intervalContent.trim()} }`;
      const adjustedIntervalContent = intervalContent.replace(
        new RegExp(`${intervalType}\\s*:\\s*\\d+`),
        `minutes: 5`,
      );
      const adjustedInterval = `{ ${adjustedIntervalContent.trim()} }`;

      // Calculate line number for logging
      const beforeMatch = content.substring(0, match.index);
      const lineNumber = beforeMatch.split("\n").length;

      // Build replacement string
      const replacement = fullMatch.replace(
        `{${intervalContent}}`,
        `{${adjustedIntervalContent}}`,
      );

      replacements.push({
        original: fullMatch,
        replacement: replacement,
        position: match.index,
      });

      adjustments.push({
        lineNumber,
        originalInterval,
        adjustedInterval,
      });
    }
  }

  // Apply replacements in reverse order to preserve positions
  for (let i = replacements.length - 1; i >= 0; i--) {
    const { original, replacement, position } = replacements[i];
    modifiedContent =
      modifiedContent.substring(0, position) +
      replacement +
      modifiedContent.substring(position + original.length);
  }

  return {
    content: modifiedContent,
    adjustments,
  };
}

/**
 * Checks if a file path is a crons.ts file
 */
export function isCronsFile(filePath: string): boolean {
  return (
    filePath === "crons.ts" ||
    filePath.endsWith("/crons.ts") ||
    filePath === "convex/crons.ts"
  );
}
