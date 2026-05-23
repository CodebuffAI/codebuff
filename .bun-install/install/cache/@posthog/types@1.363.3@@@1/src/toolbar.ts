/**
 * Toolbar types
 */

export type ToolbarUserIntent = 'add-action' | 'edit-action'
export type ToolbarSource = 'url' | 'localstorage'
export type ToolbarVersion = 'toolbar'

/**
 * Parameters for loading the PostHog toolbar
 */
export interface ToolbarParams {
    /** Public posthog-js token */
    token?: string
    /** Private temporary user token */
    temporaryToken?: string
    /** Action ID to edit */
    actionId?: number
    /** User intent for the toolbar */
    userIntent?: ToolbarUserIntent
    /** Source of the toolbar params */
    source?: ToolbarSource
    /** Toolbar version */
    toolbarVersion?: ToolbarVersion
    /** Whether to instrument */
    instrument?: boolean
    /** Distinct ID of the user */
    distinctId?: string
    /** Email of the user */
    userEmail?: string
    /** Data attributes to capture */
    dataAttributes?: string[]
    /** Feature flags */
    featureFlags?: Record<string, string | boolean>
}
