/** The stream URL is an in-memory bearer capability, never a chat event. */
export function isBoatBrowserUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 8192) return false
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      /^[a-z0-9-]+\.on\.boat\.dev$/.test(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.pathname === '/stream.html' &&
      !!new URLSearchParams(url.hash.slice(1)).get('token')
    )
  } catch {
    return false
  }
}

export type BoatBrowserPreview = {
  mode: 'boat'
  vmSlug: string
  address: string
  occupiedBy: string | null
}
export function isBoatBrowserPreview(
  value: unknown,
): value is BoatBrowserPreview {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<BoatBrowserPreview>
  if (
    v.mode !== 'boat' ||
    typeof v.vmSlug !== 'string' ||
    !v.vmSlug.startsWith('fb-boat-') ||
    (v.occupiedBy !== null &&
      (typeof v.occupiedBy !== 'string' ||
        !/^[a-f0-9-]{36}$/.test(v.occupiedBy))) ||
    typeof v.address !== 'string'
  )
    return false
  try {
    const url = new URL(v.address)
    return (
      url.protocol === 'http:' &&
      url.hostname === 'localhost' &&
      Number(url.port) >= 1024 &&
      Number(url.port) <= 65535 &&
      !url.username &&
      !url.password &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash
    )
  } catch {
    return false
  }
}
