/**
 * Gravity server-rendered ad specs (https://docs.trygravity.ai/sdks/server-rendered-ads).
 *
 * The ad server may attach a `renderer_spec` to an ad: a JSON tree of
 * box/text/image/link nodes that describes the complete visual unit, so
 * Gravity can ship new ad designs without a publisher deploy. This module
 * validates an untrusted spec into a typed tree and provides the bundled
 * fallback layout used when the server sends no spec (the documented render
 * precedence: server `renderer_spec`, else bundled fallback).
 *
 * Gravity's own `@gravity-ai/ui` package is not published to npm yet, so the
 * interpreting is done in-house (see gravity-server-ad.tsx) with the same
 * documented constraints: four node types only, binds restricted to known ad
 * fields, no code execution, sanitized URLs, capped tree depth and node count.
 */

export const AD_BIND_FIELDS = [
  'adText',
  'title',
  'cta',
  'brandName',
  'url',
  'favicon',
] as const

export type AdBindField = (typeof AD_BIND_FIELDS)[number]

const SPEC_NODE_TYPES = ['box', 'text', 'image', 'link'] as const

export type SpecNodeType = (typeof SPEC_NODE_TYPES)[number]

export type SpecNode = {
  type: SpecNodeType
  /** Pull content from an ad payload field. */
  bind?: AdBindField
  /** Static text; `{field}` templates interpolate ad fields. */
  text?: string
  /** Render this node only when the named ad field is non-empty. */
  showIf?: AdBindField
  /** Inline CSS, camelCase keys. */
  style?: Record<string, string | number>
  children?: SpecNode[]
}

export type RendererSpec = {
  version: number
  name?: string
  root: SpecNode
}

const MAX_DEPTH = 8
const MAX_NODES = 64

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isBindField(value: unknown): value is AdBindField {
  return (
    typeof value === 'string' && (AD_BIND_FIELDS as readonly string[]).includes(value)
  )
}

/**
 * Inline style values come from the ad server; keep them to CSS-only
 * primitives and reject anything that could trigger a fetch or escape the
 * declaration (`url(...)`) — the documented contract is theme tokens
 * (`hsl(var(--primary))`) and plain values.
 */
function sanitizeStyle(
  value: unknown,
): Record<string, string | number> | undefined {
  if (!isRecord(value)) return undefined
  const style: Record<string, string | number> = {}
  for (const [key, raw] of Object.entries(value)) {
    if (!/^[A-Za-z]+$/.test(key)) continue
    if (typeof raw === 'number') {
      style[key] = raw
    } else if (
      typeof raw === 'string' &&
      raw.length <= 200 &&
      !/url\s*\(|expression\s*\(|;/i.test(raw)
    ) {
      style[key] = raw
    }
  }
  return Object.keys(style).length > 0 ? style : undefined
}

function parseNode(
  value: unknown,
  depth: number,
  budget: { nodes: number },
): SpecNode | null {
  if (depth > MAX_DEPTH || budget.nodes <= 0 || !isRecord(value)) return null
  budget.nodes -= 1

  const type = value.type
  if (
    typeof type !== 'string' ||
    !(SPEC_NODE_TYPES as readonly string[]).includes(type)
  ) {
    return null
  }

  const node: SpecNode = { type: type as SpecNodeType }
  if (isBindField(value.bind)) node.bind = value.bind
  if (typeof value.text === 'string') node.text = value.text
  if (isBindField(value.showIf)) node.showIf = value.showIf
  const style = sanitizeStyle(value.style)
  if (style) node.style = style

  if (Array.isArray(value.children)) {
    const children: SpecNode[] = []
    for (const child of value.children) {
      const parsed = parseNode(child, depth + 1, budget)
      // Strict: one malformed node invalidates the whole spec so we render
      // the bundled fallback rather than a partial ad unit.
      if (!parsed) return null
      children.push(parsed)
    }
    if (children.length > 0) node.children = children
  }

  return node
}

/** Validate an untrusted `renderer_spec`; null means "use the fallback". */
export function parseRendererSpec(value: unknown): RendererSpec | null {
  if (!isRecord(value) || typeof value.version !== 'number') return null
  const root = parseNode(value.root, 1, { nodes: MAX_NODES })
  if (!root) return null
  return {
    version: value.version,
    ...(typeof value.name === 'string' ? { name: value.name } : {}),
    root,
  }
}

/** Only plain web URLs may reach an href/src. */
export function sanitizeUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.toString()
      : null
  } catch {
    return null
  }
}

/** Resolve `{field}` templates in static text against the ad payload. */
export function interpolateText(
  text: string,
  ad: Partial<Record<AdBindField, unknown>>,
): string {
  return text.replace(/\{([A-Za-z]+)\}/g, (match, field: string) => {
    if (!isBindField(field)) return match
    const value = ad[field]
    return typeof value === 'string' ? value : ''
  })
}

/**
 * Bundled fallback: a compact horizontal row visually matched to the existing
 * `@gravity-ai/react` `inline` unit in this slot (chat-ads.tsx), including the
 * `adText` body copy — the `banner` variant's omission of it is exactly what
 * we fixed there. Used whenever the server response carries no usable spec.
 */
export const BUNDLED_FALLBACK_SPEC: RendererSpec = {
  version: 1,
  name: 'freebuff-inline-row',
  root: {
    type: 'link',
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      width: '100%',
      padding: '10px 14px',
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '12px',
      color: 'hsl(var(--foreground))',
      textDecoration: 'none',
    },
    children: [
      {
        type: 'image',
        bind: 'favicon',
        showIf: 'favicon',
        style: {
          width: '20px',
          height: '20px',
          borderRadius: '4px',
          flexShrink: 0,
        },
      },
      {
        type: 'box',
        style: {
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
          minWidth: '0',
          flex: '1',
        },
        children: [
          {
            type: 'box',
            style: {
              display: 'flex',
              alignItems: 'baseline',
              gap: '6px',
            },
            children: [
              {
                type: 'text',
                bind: 'brandName',
                showIf: 'brandName',
                style: {
                  fontSize: '12px',
                  color: 'hsl(var(--muted-foreground))',
                },
              },
              {
                type: 'text',
                bind: 'title',
                style: {
                  fontSize: '14px',
                  fontWeight: 600,
                  color: 'hsl(var(--foreground))',
                },
              },
            ],
          },
          {
            type: 'text',
            bind: 'adText',
            style: {
              fontSize: '13px',
              color: 'hsl(var(--muted-foreground))',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            },
          },
        ],
      },
      {
        type: 'text',
        bind: 'cta',
        showIf: 'cta',
        style: {
          flexShrink: 0,
          fontSize: '12px',
          fontWeight: 600,
          padding: '6px 12px',
          borderRadius: '8px',
          background: 'rgba(255,255,255,0.08)',
          color: 'rgba(255,255,255,0.92)',
        },
      },
      {
        type: 'text',
        text: 'Ad',
        style: {
          flexShrink: 0,
          alignSelf: 'flex-start',
          fontSize: '10px',
          color: 'rgba(255,255,255,0.32)',
        },
      },
    ],
  },
}
