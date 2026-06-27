import { useEffect, useMemo, useRef, useState } from 'react'

import { api } from '../lib/api'
import { useStore } from '../store/store'
import type { SkillSearchResult } from '../lib/types'
import { Icon } from './Icon'

/** Cold-start order before any usage is tallied (most-used skills float to the
 *  front over time; never-used acquired skills sink to the bottom of the list). */
const DEFAULT_SKILL_RANK = ['review', 'test', 'open-pr', 'merge', 'simplify', 'reflect']

/** Compact install-count label, matching the skills.sh style (506.1K / 1.2M). */
function formatInstalls(count: number): string {
  if (!count || count <= 0) return ''
  if (count >= 1e6) return `${(count / 1e6).toFixed(1).replace(/\.0$/, '')}M installs`
  if (count >= 1e3) return `${(count / 1e3).toFixed(1).replace(/\.0$/, '')}K installs`
  return `${count} install${count === 1 ? '' : 's'}`
}

/**
 * The skills section of the queue column: a scrollable, usage-sorted list of
 * skills plus a registry search to acquire new ones. `searching` is owned by the
 * parent because it also drives whether the parent hides the queue lanes below.
 */
export function SkillsPanel({
  threadId,
  searching,
  setSearching,
}: {
  threadId: string
  searching: boolean
  setSearching: (v: boolean) => void
}) {
  const skills = useStore((s) => s.skills)
  const enqueueSkill = useStore((s) => s.enqueueSkill)
  const installSkill = useStore((s) => s.installSkill)
  const pushToast = useStore((s) => s.pushToast)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SkillSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [installing, setInstalling] = useState<string | null>(null)
  // Result ids acquired this session — keyed by id (not name) because the saved
  // skill is stored under a sanitized name, so `installedNames.has(r.name)` alone
  // can miss a just-added skill whose registry name needed sanitizing.
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const skillsListRef = useRef<HTMLDivElement>(null)
  // After acquiring a skill, scroll the (usage-sorted) list to its new bottom row.
  const [pendingScroll, setPendingScroll] = useState(false)

  // All skills, most-used first — a sensible default order for ties / never-used
  // skills. Ranked once per skills-load (reading the tally via getState() rather
  // than subscribing) so the list doesn't reshuffle under the cursor on a click.
  const orderedSkills = useMemo(() => {
    const tally = useStore.getState().skillTally
    const rank = (name: string) => {
      const i = DEFAULT_SKILL_RANK.indexOf(name)
      return i === -1 ? DEFAULT_SKILL_RANK.length : i
    }
    return [...skills]
      .sort(
        (a, b) =>
          (tally[b.name] ?? 0) - (tally[a.name] ?? 0) ||
          rank(a.name) - rank(b.name) ||
          a.name.localeCompare(b.name),
      )
      .map((s) => s.name)
  }, [skills])
  const installedNames = useMemo(() => new Set(skills.map((s) => s.name)), [skills])

  // Live search: re-query on every keystroke, debounced. The cleanup cancels both
  // the pending timer and any in-flight response, so only the latest query lands.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    const t = setTimeout(async () => {
      const res = await api.searchSkills(q).catch(() => ({ skills: [] as SkillSearchResult[] }))
      if (cancelled) return
      setResults(res.skills ?? [])
      setLoading(false)
    }, 220)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query])

  // Once the list view is back and a skill was just acquired, reveal it (bottom row).
  useEffect(() => {
    if (pendingScroll && !searching && skillsListRef.current) {
      skillsListRef.current.scrollTop = skillsListRef.current.scrollHeight
      setPendingScroll(false)
    }
  }, [pendingScroll, searching, orderedSkills])

  const openSearch = () => {
    setSearching(true)
    setQuery('')
    setResults([])
  }
  const closeSearch = () => {
    setSearching(false)
    setQuery('')
  }

  const onSave = async (r: SkillSearchResult) => {
    if (installing) return
    setInstalling(r.id)
    const name = await installSkill(r.source, r.slug, r.name)
    setInstalling(null)
    if (name) {
      setSavedIds((prev) => new Set(prev).add(r.id))
      pushToast(`Added “${name}” skill`)
      // Return to the list and scroll to the freshly-added (usage 0) bottom row.
      setSearching(false)
      setQuery('')
      setPendingScroll(true)
    } else {
      pushToast('Could not add that skill', 'error')
    }
  }

  // One message stands in for the whole results area until there's something to show.
  const hint =
    query.trim().length < 2
      ? 'Type at least 2 characters to search the registry.'
      : loading
        ? 'Searching…'
        : results.length === 0
          ? `No skills found for “${query.trim()}”.`
          : null

  return (
    <div className={`skills-panel${searching ? ' searching' : ''}`}>
      <div className="skills-head">
        {searching ? (
          <div className="skills-search">
            <Icon name="search" />
            <input
              autoFocus
              value={query}
              placeholder="Search skills to add…"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') closeSearch()
              }}
            />
            <button className="skills-x" onClick={closeSearch} title="Close search (Esc)">
              <Icon name="x" />
            </button>
          </div>
        ) : (
          <>
            <span className="queue-title">Skills</span>
            <button className="skills-find" onClick={openSearch} title="Find &amp; add new skills">
              <Icon name="search" />
            </button>
          </>
        )}
      </div>

      {searching ? (
        <div className="skills-results">
          {hint ? (
            <div className="skills-hint">{hint}</div>
          ) : (
            results.map((r) => {
              const added = savedIds.has(r.id) || installedNames.has(r.name)
              const busy = installing === r.id
              return (
                <div key={r.id} className="skill-result">
                  <div className="skill-result-info">
                    <span className="skill-result-name">{r.name}</span>
                    <span className="skill-result-meta">
                      {r.source}
                      {r.installs ? ` · ${formatInstalls(r.installs)}` : ''}
                    </span>
                  </div>
                  <button
                    className={`btn save${added ? ' added' : ''}`}
                    disabled={added || busy}
                    onClick={() => onSave(r)}
                    title={added ? 'Already added' : `Save ${r.name} to your skills`}
                  >
                    <Icon name={added ? 'check' : 'download'} />
                    <span>{added ? 'Added' : busy ? 'Saving…' : 'Save'}</span>
                  </button>
                </div>
              )
            })
          )}
        </div>
      ) : (
        <div className="skills-list" ref={skillsListRef}>
          {orderedSkills.map((name) => (
            <button
              key={name}
              className="btn chip"
              onClick={() => enqueueSkill(threadId, name)}
              title={`Queue the ${name} skill`}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
