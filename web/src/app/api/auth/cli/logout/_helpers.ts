export function shouldUnclaim(
  fingerprintMatchFound: boolean,
  storedHash: string | null | undefined,
  providedHash: string,
): boolean {
  return fingerprintMatchFound || (storedHash != null && storedHash === providedHash)
}
