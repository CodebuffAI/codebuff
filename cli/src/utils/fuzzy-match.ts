/**
 * Fuzzy match: matches characters in order, allowing gaps.
 * Returns highlight indices if matched, null if not.
 * Also returns a score (lower is better) based on match quality.
 *
 * Extracted from use-suggestion-engine.ts so the command palette and other
 * surfaces can reuse the same matcher without duplication.
 */
export function fuzzyMatch(
  text: string,
  query: string,
): { indices: number[]; score: number } | null {
  const textLower = text.toLowerCase()
  const queryLower = query.toLowerCase()
  const indices: number[] = []
  let textIdx = 0
  let lastMatchIdx = -1
  let gaps = 0
  let consecutiveMatches = 0
  let maxConsecutive = 0

  for (let queryIdx = 0; queryIdx < queryLower.length; queryIdx++) {
    const char = queryLower[queryIdx]
    let found = false

    while (textIdx < textLower.length) {
      if (textLower[textIdx] === char) {
        // Prefer matches at word boundaries (after / or at start)
        if (lastMatchIdx >= 0 && textIdx > lastMatchIdx + 1) {
          gaps += textIdx - lastMatchIdx - 1
          consecutiveMatches = 1
        } else {
          consecutiveMatches++
          maxConsecutive = Math.max(maxConsecutive, consecutiveMatches)
        }
        indices.push(textIdx)
        lastMatchIdx = textIdx
        textIdx++
        found = true
        break
      }
      textIdx++
    }

    if (!found) return null
  }

  // Capture final consecutive run
  maxConsecutive = Math.max(maxConsecutive, consecutiveMatches)

  // Score: lower is better
  // - Fewer gaps = better
  // - Longer consecutive matches = better
  // - Matches at word boundaries (after /) = better
  const boundaryBonus = indices.filter(
    (idx) => idx === 0 || text[idx - 1] === '/',
  ).length

  const score =
    gaps * 10 - maxConsecutive * 5 - boundaryBonus * 15 + (indices[0] ?? 0) // Prefer matches that start earlier

  return { indices, score }
}
