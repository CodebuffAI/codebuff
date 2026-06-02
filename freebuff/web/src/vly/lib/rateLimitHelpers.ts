import { toast } from "sonner";

/**
 * Format milliseconds into a human-readable time string (e.g., "5m 30s" or "45s")
 */
export function formatRetryTime(milliseconds: number): string {
  const remainingSeconds = Math.ceil(milliseconds / 1000);
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

/**
 * Check if currently rate limited and show a toast notification if so
 * @returns true if NOT rate limited (can proceed), false if rate limited (should block)
 */
export function checkRateLimitAndNotify(
  rateLimitRetryAfter: number | null | undefined,
  action: string,
): boolean {
  if (rateLimitRetryAfter && rateLimitRetryAfter > Date.now()) {
    const remainingMs = rateLimitRetryAfter - Date.now();
    const timeString = formatRetryTime(remainingMs);

    toast.error(
      `Rate limit exceeded. Please wait ${timeString} before ${action}.`,
      {
        duration: 5000,
      },
    );
    return false;
  }
  return true;
}

/**
 * Handle rate limit error from API response
 * @returns true if rate limited, false if not rate limited
 */
export function handleRateLimitError(
  result: any,
  setRateLimitRetryAfter: (time: number | null) => void,
  action: string,
): boolean {
  if (result && !result.success && result.error?.kind === "RateLimited") {
    const retryAfterMs = result.error.retryAfter || 0;
    const retryTime = Date.now() + retryAfterMs;
    setRateLimitRetryAfter(retryTime);

    const timeString = formatRetryTime(retryAfterMs);

    toast.error(
      `Rate limit exceeded. Please wait ${timeString} before ${action}.`,
      {
        duration: 5000,
      },
    );
    return true;
  }
  return false;
}
