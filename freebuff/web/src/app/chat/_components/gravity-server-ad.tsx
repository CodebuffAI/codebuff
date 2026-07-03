'use client'

import { useEffect, useMemo, useRef } from 'react'

import {
  BUNDLED_FALLBACK_SPEC,
  interpolateText,
  parseRendererSpec,
  sanitizeUrl,
} from './gravity-ad-spec'

import type { AdBindField, SpecNode } from './gravity-ad-spec'
import type { CSSProperties, ReactNode } from 'react'

export type GravityServerAdData = Partial<Record<AdBindField, string>> & {
  adText: string
  impUrl?: string
  clickUrl?: string
  renderer_spec?: unknown
}

/**
 * Impression pixels already fired this page load. Module-level (like the
 * desktop AdCard) so remounts and StrictMode double-effects can't double-count
 * the same served ad.
 */
const firedImpressions = new Set<string>()

function renderNode(
  node: SpecNode,
  ad: GravityServerAdData,
  onClick: (() => void) | undefined,
  key: number,
): ReactNode {
  if (node.showIf && !ad[node.showIf]) return null

  const style = node.style as CSSProperties | undefined
  const children = node.children?.map((child, index) =>
    renderNode(child, ad, onClick, index),
  )

  switch (node.type) {
    case 'box':
      return (
        <div key={key} style={style}>
          {children}
        </div>
      )
    case 'text': {
      const content = node.bind
        ? ad[node.bind] ?? ''
        : interpolateText(node.text ?? '', ad)
      if (!content) return null
      return (
        <span key={key} style={style}>
          {content}
        </span>
      )
    }
    case 'image': {
      const src = sanitizeUrl(ad[node.bind ?? 'favicon'])
      if (!src) return null
      return <img key={key} src={src} alt={ad.brandName ?? ''} style={style} />
    }
    case 'link': {
      // Per the spec contract, links always route through the tracked click
      // URL — a custom design never changes tracking or attribution. `||`,
      // not `??`: an empty-string clickUrl must fall back to url too.
      const href = sanitizeUrl(ad.clickUrl || ad.url)
      if (!href) {
        return (
          <div key={key} style={style}>
            {children}
          </div>
        )
      }
      return (
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noopener noreferrer sponsored"
          style={style}
          onClick={onClick}
        >
          {children}
        </a>
      )
    }
  }
}

/**
 * Renders a Gravity ad from its server-delivered `renderer_spec`
 * (https://docs.trygravity.ai/sdks/server-rendered-ads), falling back to the
 * bundled inline-row layout when the response carries no usable spec. Fires
 * the impression pixel once the unit is actually visible, mirroring the
 * official SDK's IntersectionObserver behavior.
 */
export function GravityServerAd({
  ad,
  className,
  onClick,
}: {
  ad: GravityServerAdData
  className?: string
  onClick?: () => void
}) {
  const spec = useMemo(
    () => parseRendererSpec(ad.renderer_spec) ?? BUNDLED_FALLBACK_SPEC,
    [ad.renderer_spec],
  )
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const impUrl = sanitizeUrl(ad.impUrl)
    const el = containerRef.current
    if (!impUrl || firedImpressions.has(impUrl) || !el) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        if (!firedImpressions.has(impUrl)) {
          firedImpressions.add(impUrl)
          new Image().src = impUrl
        }
        observer.disconnect()
      },
      { threshold: 0.5 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [ad.impUrl])

  return (
    <div ref={containerRef} className={className}>
      {renderNode(spec.root, ad, onClick, 0)}
    </div>
  )
}
