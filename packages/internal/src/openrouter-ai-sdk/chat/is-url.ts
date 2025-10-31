export function isUrl({
  url,
  protocols,
}: {
  url: string | URL
  protocols: Set<`${string}:`>
}): boolean {
  try {
    const urlObj = new URL(url)
    // Cast to the literal string due to Set inferred input type
    return protocols.has(urlObj.protocol as `${string}:`)
  } catch (_) {
    return false
  }
}
