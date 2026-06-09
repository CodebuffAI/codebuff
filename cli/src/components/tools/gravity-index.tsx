import { SimpleToolCallItem } from './tool-call-item'
import { defineToolComponent } from './types'

import type { ToolRenderConfig } from './types'

const asTrimmedString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : ''

const DEFAULT_NAME = 'Services'

export interface GravityIndexParts {
  /** Bold label naming the action in plain verb-first language. */
  name: string
  /** Non-bold target the action operates on (query, slug, category). May be empty. */
  description: string
}

/**
 * Splits a gravity_index tool call into a bold verb-first label (e.g.
 * "Search services") and the plain target it acts on, so the action reads as
 * a single natural phrase instead of a "Brand · Verb" subcommand.
 */
export const getGravityIndexParts = (input: unknown): GravityIndexParts => {
  if (!input || typeof input !== 'object') {
    return { name: DEFAULT_NAME, description: '' }
  }

  const params = input as Record<string, unknown>
  const action = asTrimmedString(params.action)

  switch (action) {
    case 'search':
      return {
        name: 'Search services',
        description: asTrimmedString(params.query),
      }
    case 'browse': {
      const category = asTrimmedString(params.category)
      const keyword = asTrimmedString(params.q)
      return {
        name: 'Browse services',
        description: [category, keyword].filter(Boolean).join(' · '),
      }
    }
    case 'list_categories':
      return { name: 'List service categories', description: '' }
    case 'get_service':
      return {
        name: 'Fetch service',
        description: asTrimmedString(params.slug),
      }
    case 'report_integration': {
      const slug = asTrimmedString(params.integrated_slug)
      return {
        name: 'Report integration',
        description: slug ? `${slug} integration` : 'integration',
      }
    }
    default:
      return { name: DEFAULT_NAME, description: '' }
  }
}

/**
 * UI component for gravity_index.
 * Displays a one-line summary of what Gravity Index is searching or doing.
 */
export const GravityIndexComponent = defineToolComponent({
  toolName: 'gravity_index',

  render(toolBlock): ToolRenderConfig {
    const { name, description } = getGravityIndexParts(toolBlock.input)
    return {
      content: <SimpleToolCallItem name={name} description={description} />,
    }
  },
})
