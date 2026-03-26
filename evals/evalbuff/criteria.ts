import fs from 'fs'

export interface QualityCriterion {
  name: string
  weight: number
  description: string
}

export interface QualityCriteria {
  level: number // 1-5
  criteria: QualityCriterion[]
  promotionThreshold: number // default 8.0
  promotionWindow: number // default 10
}

export const DEFAULT_CRITERIA: Record<number, QualityCriterion[]> = {
  1: [
    {
      name: 'Correctness',
      weight: 3,
      description:
        'The code compiles, runs without errors, and produces the expected behavior.',
    },
    {
      name: 'Completeness',
      weight: 3,
      description:
        'All aspects of the prompt are addressed. No partial implementations or TODO comments.',
    },
    {
      name: 'Basic Style',
      weight: 1,
      description:
        'Code follows basic formatting conventions and is readable.',
    },
  ],
  2: [
    {
      name: 'Pattern Consistency',
      weight: 2,
      description:
        'New code follows the same patterns, naming conventions, and architectural style as existing code in the codebase.',
    },
  ],
  3: [
    {
      name: 'Test Quality',
      weight: 2,
      description:
        'Tests are meaningful, cover edge cases, and test behavior rather than implementation details.',
    },
  ],
  4: [
    {
      name: 'Optimal Design',
      weight: 2,
      description:
        'Code is DRY, uses the right abstractions, and the diff is minimal — no unnecessary changes.',
    },
  ],
  5: [
    {
      name: 'Fluency',
      weight: 1,
      description:
        'Code reads like a senior engineer wrote it. Idiomatic usage of the language and framework. No over-engineering.',
    },
  ],
}

export function getCriteriaForLevel(level: number): QualityCriterion[] {
  const criteria: QualityCriterion[] = []
  for (let l = 1; l <= Math.min(level, 5); l++) {
    criteria.push(...(DEFAULT_CRITERIA[l] || []))
  }
  return criteria
}

export function loadCriteria(criteriaPath?: string): QualityCriteria {
  if (criteriaPath && fs.existsSync(criteriaPath)) {
    const raw = JSON.parse(fs.readFileSync(criteriaPath, 'utf-8'))
    return raw as QualityCriteria
  }
  return {
    level: 1,
    criteria: getCriteriaForLevel(1),
    promotionThreshold: 8.0,
    promotionWindow: 10,
  }
}

export function saveCriteria(
  criteriaPath: string,
  criteria: QualityCriteria,
): void {
  fs.writeFileSync(criteriaPath, JSON.stringify(criteria, null, 2))
}

/**
 * Checks if criteria should be promoted to the next level.
 * Returns the new level if promoted, or the current level if not.
 */
export function maybePromoteCriteria(
  criteria: QualityCriteria,
  recentScores: number[],
): number {
  if (criteria.level >= 5) return criteria.level
  if (recentScores.length < criteria.promotionWindow) return criteria.level

  const windowScores = recentScores.slice(-criteria.promotionWindow)
  const avg = windowScores.reduce((sum, s) => sum + s, 0) / windowScores.length

  if (avg >= criteria.promotionThreshold) {
    const newLevel = criteria.level + 1
    console.log(
      `Criteria promoted from level ${criteria.level} to ${newLevel} (avg ${avg.toFixed(1)} >= ${criteria.promotionThreshold})`,
    )
    return newLevel
  }

  return criteria.level
}

/**
 * Format criteria as text for injection into judge prompts.
 */
export function formatCriteriaForPrompt(criteria: QualityCriteria): string {
  const lines = [
    `## Quality Criteria (Level ${criteria.level}/5)`,
    '',
    'Apply these additional quality criteria when scoring. Higher levels add stricter standards:',
    '',
  ]

  for (const c of criteria.criteria) {
    lines.push(`- **${c.name}** (weight: ${c.weight}): ${c.description}`)
  }

  lines.push(
    '',
    'Weight these criteria proportionally when computing scores. A violation of a high-weight criterion should have a bigger impact on the score than a low-weight one.',
  )

  return lines.join('\n')
}
