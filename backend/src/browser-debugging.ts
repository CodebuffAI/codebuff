import { BrowserAction } from 'common/src/browser-actions'

/**
 * Utility function to create a <browser_action> XML snippet.
 */
export function createBrowserActionXML(action: BrowserAction): string {
  const { type, ...attributes } = action
  const attrsString = Object.entries(attributes)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ')
  return `<browser_action action="${type}" ${attrsString} />`
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
