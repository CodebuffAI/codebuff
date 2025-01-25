import { BrowserAction } from 'common/src/browser-actions'

/**
 * Utility function to create a <browser_action> XML snippet.
 */
/**
 * Creates an XML string from a BrowserAction object
 */
export function createBrowserActionXML(action: BrowserAction): string {
  const { type, ...attributes } = action
  const attrsString = Object.entries(attributes)
    .filter(([_, v]) => v !== undefined && v !== null)
    .map(([k, v]) => {
      // Handle different value types
      const val = typeof v === 'object' ? JSON.stringify(v) : String(v)
      // Escape special characters in XML attributes
      const escaped = val.replace(/[<>&'"]/g, (char) => {
        switch (char) {
          case '<': return '&lt;'
          case '>': return '&gt;'
          case '&': return '&amp;'
          case '"': return '&quot;'
          case "'": return '&apos;'
          default: return char
        }
      })
      return `${k}="${escaped}"`
    })
    .join(' ')
  return `<browser_action action="${type}" ${attrsString} />`
}

/**
 * Parses XML attributes into a BrowserAction object
 */
export function parseBrowserActionXML(xmlString: string): BrowserAction {
  // Basic XML validation
  if (!xmlString.includes('<browser_action') || !xmlString.includes('/>')) {
    throw new Error('Invalid browser action XML: missing browser_action tag')
  }

  // Extract attributes using regex
  const attrs: Record<string, string> = {}
  const attrPattern = /(\w+)="([^"]*)"/g
  let match

  while ((match = attrPattern.exec(xmlString)) !== null) {
    const [_, key, value] = match
    attrs[key] = value
  }

  if (!attrs.action) {
    throw new Error('Invalid browser action XML: missing action attribute')
  }

  // Convert action attribute to type
  const type = attrs.action
  delete attrs.action

  // Parse special values (booleans, numbers, objects)
  const parsedAttrs = Object.entries(attrs).reduce((acc, [key, value]) => {
    try {
      // Try to parse as JSON for objects
      if (value.startsWith('{') || value.startsWith('[')) {
        acc[key] = JSON.parse(value)
      }
      // Parse booleans
      else if (value === 'true' || value === 'false') {
        acc[key] = value === 'true'
      }
      // Parse numbers
      else if (!isNaN(Number(value))) {
        acc[key] = Number(value)
      }
      // Keep as string
      else {
        acc[key] = value
      }
    } catch {
      // If parsing fails, keep as string
      acc[key] = value
    }
    return acc
  }, {} as Record<string, any>)

  // Construct and validate the BrowserAction
  const action = { type, ...parsedAttrs } as BrowserAction
  return BrowserActionSchema.parse(action)
}

/**
 * Parse browser action XML attributes into a typed BrowserAction object
 */
export function parseBrowserActionAttributes(attributes: Record<string, string>): BrowserAction {
  const { action, ...rest } = attributes
  return {
    type: action,
    ...Object.entries(rest).reduce((acc, [key, value]) => {
      // Convert string values to appropriate types
      if (value === 'true') return { ...acc, [key]: true }
      if (value === 'false') return { ...acc, [key]: false }
      if (!isNaN(Number(value))) return { ...acc, [key]: Number(value) }
      return { ...acc, [key]: value }
    }, {}),
  } as BrowserAction
}
