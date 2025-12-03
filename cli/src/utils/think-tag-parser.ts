/**
 * Parses <think>...</think> tags from text and splits into segments.
 * Handles streaming scenarios where tags may be incomplete.
 */

export const THINK_OPEN_TAG = '<think>'
export const THINK_CLOSE_TAG = '</think>'

export type ThinkSegment = {
  type: 'text' | 'thinking'
  content: string
}

/**
 * Possible partial tag prefixes that we should buffer.
 * These are prefixes that could become a complete tag with more input.
 */
const PARTIAL_OPEN_PREFIXES = ['<', '<t', '<th', '<thi', '<thin', '<think']
const PARTIAL_CLOSE_PREFIXES = ['</', '</t', '</th', '</thi', '</thin', '</think']

/**
 * Check if text ends with a potential partial tag that we should buffer.
 * Returns the length of the partial tag suffix, or 0 if none.
 */
export function getPartialTagLength(text: string): number {
  // Check for partial closing tag first (longer prefixes)
  for (const prefix of PARTIAL_CLOSE_PREFIXES) {
    if (text.endsWith(prefix)) {
      return prefix.length
    }
  }
  // Check for partial opening tag
  for (const prefix of PARTIAL_OPEN_PREFIXES) {
    if (text.endsWith(prefix)) {
      return prefix.length
    }
  }
  return 0
}

/**
 * Parse text for think tags and return segments.
 * This handles complete tags only - partial tags at the end should be
 * handled by the caller using getPartialTagLength.
 */
export function parseThinkTags(text: string): ThinkSegment[] {
  if (!text) {
    return []
  }

  const segments: ThinkSegment[] = []
  let remaining = text
  let insideThink = false

  while (remaining.length > 0) {
    if (insideThink) {
      // Look for closing tag
      const closeIdx = remaining.indexOf(THINK_CLOSE_TAG)
      if (closeIdx === -1) {
        // No closing tag found - all remaining is thinking content
        if (remaining.length > 0) {
          segments.push({ type: 'thinking', content: remaining })
        }
        break
      }
      // Content before closing tag is thinking
      if (closeIdx > 0) {
        segments.push({ type: 'thinking', content: remaining.slice(0, closeIdx) })
      }
      remaining = remaining.slice(closeIdx + THINK_CLOSE_TAG.length)
      insideThink = false
    } else {
      // Look for opening tag
      const openIdx = remaining.indexOf(THINK_OPEN_TAG)
      if (openIdx === -1) {
        // No opening tag found - all remaining is regular text
        if (remaining.length > 0) {
          segments.push({ type: 'text', content: remaining })
        }
        break
      }
      // Content before opening tag is regular text
      if (openIdx > 0) {
        segments.push({ type: 'text', content: remaining.slice(0, openIdx) })
      }
      remaining = remaining.slice(openIdx + THINK_OPEN_TAG.length)
      insideThink = true
    }
  }

  return segments
}

// Note: isThinkingOpen and mergeSegments were removed as they are not currently used.
// They can be added back if needed for future functionality.
