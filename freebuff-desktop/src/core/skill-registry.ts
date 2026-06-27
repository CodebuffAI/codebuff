/**
 * Client for the skills.sh registry — the one place that speaks the registry's
 * HTTP protocol (URLs, response shapes, timeouts). Kept out of ThreadEngine so
 * the engine stays an orchestrator over stores, mirroring how `browser-check.ts`
 * isolates the other external-IO concern (playwright).
 */

import type { SkillSearchResult } from './types'

const REGISTRY_BASE = 'https://skills.sh'

/** Search the registry for acquirable skills, most-installed first. Returns an
 *  empty list on any failure (network, timeout, bad shape) — discovery is best-effort. */
export async function searchRegistry(query: string): Promise<SkillSearchResult[]> {
  const q = query.trim()
  if (q.length < 2) return []
  try {
    const url = `${REGISTRY_BASE}/api/search?q=${encodeURIComponent(q)}&limit=10`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return []
    const data = (await res.json()) as { skills?: any[] }
    return (data.skills ?? [])
      .map((s) => ({
        id: String(s.id ?? ''),
        name: String(s.name ?? s.skillId ?? ''),
        slug: String(s.skillId ?? ''),
        source: String(s.source ?? ''),
        installs: Number(s.installs ?? 0),
      }))
      .filter((s) => s.slug && s.source)
      .sort((a, b) => b.installs - a.installs)
  } catch {
    return []
  }
}

/** Download a registry skill and return its markdown body (SKILL.md, else
 *  AGENTS.md, else any .md). Returns null if the skill can't be fetched. */
export async function downloadSkill(source: string, slug: string): Promise<string | null> {
  const [owner, repo] = source.split('/')
  if (!owner || !repo || !slug) return null
  try {
    const url = `${REGISTRY_BASE}/api/download/${encodeURIComponent(owner)}/${encodeURIComponent(
      repo,
    )}/${encodeURIComponent(slug)}`
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) return null
    const data = (await res.json()) as { files?: { path: string; contents: string }[] }
    const files = data.files ?? []
    const pick =
      files.find((f) => /(^|\/)SKILL\.md$/i.test(f.path)) ??
      files.find((f) => /(^|\/)AGENTS\.md$/i.test(f.path)) ??
      files.find((f) => f.path.toLowerCase().endsWith('.md'))
    return pick?.contents ?? null
  } catch {
    return null
  }
}
