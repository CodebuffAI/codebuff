import { SimpleToolCallItem } from './tool-call-item'
import { defineToolComponent } from './types'

import type { ToolRenderConfig } from './types'

const asTrimmedString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : ''

const BRAND = 'Services'

/** Bold "Services · <Verb>" prefix that names the action like a CLI subcommand. */
const withSubcommand = (verb: string): string => `${BRAND} · ${verb}`

export interface GravityIndexParts {
  /** Bold label: the brand plus the action subcommand. */
  name: string
  /** Non-bold target the action operates on (query, slug, category). May be empty. */
  description: string
}

/**
 * Splits a gravity_index tool call into a bold "Service Catalog · <Verb>" label
 * and the plain target it acts on, so the action reads as one bold unit instead
 * of repeating the verb in non-bold text after the brand.
 */
export const getGravityIndexParts = (input: unknown): GravityIndexParts => {
  if (!input || typeof input !== 'object') {
    return { name: BRAND, description: '' }
  }

  const params = input as Record<string, unknown>
  const action = asTrimmedString(params.action)

  switch (action) {
    case 'search':
      return {
        name: withSubcommand('Search'),
        description: asTrimmedString(params.query),
      }
    case 'browse': {
      const category = asTrimmedString(params.category)
      const keyword = asTrimmedString(params.q)
      return {
        name: withSubcommand('Browse'),
        description: [category, keyword].filter(Boolean).join(' · '),
      }
    }
    case 'list_categories':
      return { name: withSubcommand('Categories'), description: '' }
    case 'get_service':
      return {
        name: withSubcommand('Fetch'),
        description: asTrimmedString(params.slug),
      }
    case 'report_integration': {
      const slug = asTrimmedString(params.integrated_slug)
      return {
        name: withSubcommand('Report'),
        description: slug ? `${slug} integration` : 'integration',
      }
    }
    default:
      return { name: BRAND, description: '' }
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
