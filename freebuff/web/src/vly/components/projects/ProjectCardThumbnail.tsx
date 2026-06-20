'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/vly/lib/utils'

const IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g|webp|gif)(\?|#|$)/i

function isLikelyImageUrl(url: string): boolean {
  if (!url.startsWith('http')) return false
  if (url.includes('freebuff.dev') || url.includes('freebuff.app')) return false
  if (url.includes('daytona.works') || url.includes('proxy.daytona')) return false
  if (url.includes('screenshots.')) return true
  return IMAGE_EXTENSION_PATTERN.test(url)
}

export function getProjectImageSrc(project: {
  screenshotUrl?: string | null
  pretty_preview_url?: string | null
}): string | null {
  if (project.screenshotUrl && isLikelyImageUrl(project.screenshotUrl)) {
    return project.screenshotUrl
  }
  const previewUrl = project.pretty_preview_url
  if (previewUrl && isLikelyImageUrl(previewUrl)) {
    return previewUrl
  }
  return null
}

export function getProxiedScreenshotUrl(url: string): string {
  return `/api/web/proxy-screenshot?url=${encodeURIComponent(url)}`
}

function getProjectInitial(name?: string): string {
  const trimmed = (name || 'Project').trim()
  const word = trimmed.split(/\s+/).find(Boolean)
  return (word?.charAt(0) ?? 'P').toUpperCase()
}

async function isMostlyBlankImageBlob(blob: Blob): Promise<boolean> {
  if (blob.size < 1200) return true

  const bitmap = await createImageBitmap(blob, {
    resizeWidth: 32,
    resizeHeight: 18,
  })

  const canvas = document.createElement('canvas')
  canvas.width = 32
  canvas.height = 18
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    return false
  }

  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()

  const { data } = ctx.getImageData(0, 0, 32, 18)
  let brightPixels = 0
  const totalPixels = 32 * 18

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    if (r > 244 && g > 244 && b > 244) brightPixels++
  }

  return brightPixels / totalPixels > 0.9
}

async function resolveThumbnailSrc(
  imageSrc: string,
): Promise<{ mode: 'image'; src: string } | { mode: 'placeholder' }> {
  const proxiedSrc = getProxiedScreenshotUrl(imageSrc)

  try {
    const proxiedResponse = await fetch(proxiedSrc)
    if (proxiedResponse.ok) {
      const blob = await proxiedResponse.blob()
      if (await isMostlyBlankImageBlob(blob)) {
        return { mode: 'placeholder' }
      }
      return { mode: 'image', src: proxiedSrc }
    }
  } catch {
    // Fall through to direct URL.
  }

  try {
    const directResponse = await fetch(imageSrc, { mode: 'cors' })
    if (!directResponse.ok) {
      return { mode: 'placeholder' }
    }
    const blob = await directResponse.blob()
    if (await isMostlyBlankImageBlob(blob)) {
      return { mode: 'placeholder' }
    }
    return { mode: 'image', src: imageSrc }
  } catch {
    // CORS may block analysis; still try showing the screenshot directly.
    return { mode: 'image', src: imageSrc }
  }
}

type ThumbnailState =
  | { status: 'checking' }
  | { status: 'image'; src: string }
  | { status: 'placeholder' }

type ProjectCardThumbnailProps = {
  name?: string
  imageSrc?: string | null
  className?: string
  imageClassName?: string
}

function ProjectThumbnailPlaceholder({
  name,
  className,
}: {
  name?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex h-full w-full items-center justify-center bg-muted/50',
        className,
      )}
      aria-hidden
    >
      <span className="text-2xl font-medium text-muted-foreground/70">
        {getProjectInitial(name)}
      </span>
    </div>
  )
}

function ProjectThumbnailSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('h-full w-full animate-pulse bg-muted/35', className)}
      aria-hidden
    />
  )
}

export function ProjectCardThumbnail({
  name,
  imageSrc,
  className,
  imageClassName,
}: ProjectCardThumbnailProps) {
  const [state, setState] = useState<ThumbnailState>(() =>
    imageSrc ? { status: 'checking' } : { status: 'placeholder' },
  )

  useEffect(() => {
    if (!imageSrc) {
      setState({ status: 'placeholder' })
      return
    }

    let cancelled = false
    setState({ status: 'checking' })

    void (async () => {
      const resolved = await resolveThumbnailSrc(imageSrc)
      if (cancelled) return
      if (resolved.mode === 'placeholder') {
        setState({ status: 'placeholder' })
      } else {
        setState({ status: 'image', src: resolved.src })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [imageSrc])

  if (state.status === 'checking') {
    return <ProjectThumbnailSkeleton className={className} />
  }

  if (state.status === 'placeholder') {
    return <ProjectThumbnailPlaceholder name={name} className={className} />
  }

  return (
    <img
      src={state.src}
      alt={name || 'Project preview'}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setState({ status: 'placeholder' })}
      className={cn(
        'h-full w-full object-cover object-top',
        imageClassName,
        className,
      )}
    />
  )
}
