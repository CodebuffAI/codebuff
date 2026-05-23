/**
 * Survey types
 */

/**
 * Represents the result of checking if a survey can be rendered.
 */
export interface SurveyRenderReason {
    /** Whether the survey is visible/can be rendered */
    visible: boolean
    /** The reason why the survey cannot be rendered, if applicable */
    disabledReason?: string
}
