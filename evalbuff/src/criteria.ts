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
      name: 'Builds & Compiles',
      weight: 3,
      description:
        'The code compiles, builds, and the project starts without errors. Run the build command and verify it succeeds.',
    },
    {
      name: 'Existing Tests Pass',
      weight: 3,
      description:
        'All pre-existing tests still pass. Run the test suite and confirm no regressions were introduced.',
    },
    {
      name: 'Basic Completeness',
      weight: 2,
      description:
        'All aspects of the prompt are addressed. No partial implementations or TODO comments left behind.',
    },
  ],
  2: [
    {
      name: 'Feature Works E2E',
      weight: 4,
      description:
        'The new feature or bug fix actually works when you use the application. Start the app, navigate to the relevant page or endpoint, and exercise the feature. Use browser tools, curl, or the appropriate client to verify the happy path end-to-end.',
    },
    {
      name: 'Logs & Observability',
      weight: 1,
      description:
        'Check application logs for errors, warnings, or stack traces during E2E testing. Verify no unexpected errors appear when exercising the feature.',
    },
  ],
  3: [
    {
      name: 'Edge Cases & Error States',
      weight: 3,
      description:
        'Test error states and edge cases E2E. Submit invalid inputs, trigger error conditions, test boundary values. Verify the app handles them gracefully without crashing.',
    },
    {
      name: 'UI/UX Verification',
      weight: 2,
      description:
        'For UI changes: visually verify the rendered output. Check layout, responsiveness, and that the UI matches expectations. Take screenshots to document.',
    },
  ],
  4: [
    {
      name: 'Cross-Component Integration',
      weight: 2,
      description:
        'Verify the change works correctly with related features. Test flows that cross component boundaries. If a backend change was made, verify the frontend still works. If a DB migration was added, verify queries work.',
    },
    {
      name: 'Performance & No Regressions',
      weight: 2,
      description:
        'Verify no performance regressions. Check page load times, API response times, or resource usage. Ensure the change does not break unrelated features.',
    },
  ],
  5: [
    {
      name: 'Production Readiness',
      weight: 2,
      description:
        'Full production readiness check. Verify migrations, environment variable handling, error recovery, and graceful degradation. The change should be safe to deploy.',
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
 * Format criteria as text for injection into reviewer agent prompts.
 */
export function formatCriteriaForPrompt(criteria: QualityCriteria): string {
  const lines = [
    `## Quality Criteria (Level ${criteria.level}/5)`,
    '',
    'You MUST verify each of these criteria. Higher levels require deeper E2E testing:',
    '',
  ]

  for (const c of criteria.criteria) {
    lines.push(`- **${c.name}** (weight: ${c.weight}): ${c.description}`)
  }

  lines.push(
    '',
    'For each criterion, describe what you tested and what you observed. If you cannot test a criterion (e.g., no UI for a backend change), note that and explain why.',
    '',
    'Weight these criteria proportionally when computing scores. A failure on a high-weight criterion should have a bigger impact on the score than a low-weight one.',
  )

  return lines.join('\n')
}
