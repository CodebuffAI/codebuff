import type { LabBenchV2Entry } from './agentic-ad-lab-bench-v2'

/** Each pool entry's language family, for "at least one pass per family". */
export function benchLanguageFamilies(
  pool: readonly LabBenchV2Entry[],
): ReadonlyMap<string, string> {
  return new Map(
    pool.map((entry) => {
      const { language } = entry.facets
      const family =
        language === 'python' || language === 'polyglot'
          ? 'python'
          : language === 'typescript' || language === 'javascript'
            ? 'node'
            : 'other'
      return [entry.key, family]
    }),
  )
}
