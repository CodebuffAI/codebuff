/**
 * Copy text to the clipboard, preferring the async Clipboard API and falling
 * back to the legacy `execCommand` path when it's unavailable (e.g. an unfocused
 * or non-secure context). Resolves to whether the copy actually landed, so
 * callers only show "Copied" / a toast on real success.
 */
export function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard
      .writeText(text)
      .then(() => true)
      .catch(() => fallbackCopy(text))
  }
  return Promise.resolve(fallbackCopy(text))
}

function fallbackCopy(text: string): boolean {
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}
