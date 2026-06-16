// Tracks which OAuth provider the user last signed in with, so the login page
// can badge it "Last used". Stored in a non-HttpOnly cookie (set client-side at
// click time) so it survives across visits and could also be read server-side.
// This is a UX hint only — never an auth decision.
const LAST_PROVIDER_COOKIE = 'last_provider'
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

export function rememberLastProvider(provider: string): void {
  if (typeof document === 'undefined') return
  document.cookie = `${LAST_PROVIDER_COOKIE}=${encodeURIComponent(
    provider,
  )}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`
}

export function readLastProvider(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${LAST_PROVIDER_COOKIE}=`))
  if (!match) return null
  return decodeURIComponent(match.slice(LAST_PROVIDER_COOKIE.length + 1))
}
