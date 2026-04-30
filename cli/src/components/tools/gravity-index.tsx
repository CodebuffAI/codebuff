import { SimpleToolCallItem } from './tool-call-item'
import { defineToolComponent } from './types'

import type { ToolRenderConfig } from './types'

const asTrimmedString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : ''

export const getGravityIndexDescription = (input: unknown): string => {
  if (!input || typeof input !== 'object') {
    return 'Using service catalog'
  }

  const params = input as Record<string, unknown>
  const action = asTrimmedString(params.action)

  switch (action) {
    case 'search': {
      const query = asTrimmedString(params.query)
      return query ? `Searching ${query}` : 'Searching services'
    }
    case 'browse': {
      const category = asTrimmedString(params.category)
      const query = asTrimmedString(params.q)
      return ['Browsing', category || 'services', query ? `for ${query}` : '']
        .filter(Boolean)
        .join(' ')
    }
    case 'list_categories':
      return 'Listing service categories'
    case 'get_service': {
      const slug = asTrimmedString(params.slug)
      return slug ? `Getting ${slug}` : 'Getting service details'
    }
    case 'report_integration': {
      const slug = asTrimmedString(params.integrated_slug)
      return slug ? `Reporting ${slug} integration` : 'Reporting integration'
    }
    default:
      return 'Using service catalog'
  }
}

/**
 * UI component for gravity_index.
 * Displays a one-line summary of what Gravity Index is searching or doing.
 */
export const GravityIndexComponent = defineToolComponent({
  toolName: 'gravity_index',

  render(toolBlock): ToolRenderConfig {
    return {
      content: (
        <SimpleToolCallItem
          name="Service Catalog"
          description={getGravityIndexDescription(toolBlock.input)}
        />
      ),
    }
  },
})
