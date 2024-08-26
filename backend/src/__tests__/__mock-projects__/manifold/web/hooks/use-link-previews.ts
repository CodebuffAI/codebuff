import { LinkPreview } from 'common/link-preview'
import { useState } from 'react'
import { useDebouncedEffect } from 'web/hooks/use-debounced-effect'
import { api } from 'web/lib/api/api'
import { safeLocalStorage } from 'web/lib/util/local'

export const useLinkPreview = (url: string, initial?: LinkPreview) => {
  const [preview, setPreview] = useState(initial)
  useDebouncedEffect(
    () => {
      if (url) {
        cachedLinkPreview(url.trim()).then((p) => setPreview(p))
      } else {
        setPreview(undefined)
      }
    },
    100,
    [url]
  )
  return preview
}

export const cachedLinkPreview = async (url: string) => {
  const cacheKey = `link-preview-${url}`
  const cached = safeLocalStorage?.getItem(cacheKey)
  if (cached) return JSON.parse(cached) as LinkPreview
  try {
    const preview = await api('fetch-link-preview', { url })
    if (preview) {
      safeLocalStorage?.setItem(cacheKey, JSON.stringify(preview))
    }
    return preview
  } catch (e) {
    // likely just it's not a valid URL
    console.warn(e)
  }
}
