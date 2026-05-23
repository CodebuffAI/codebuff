import { Survey } from '../posthog-surveys-types';
/**
 * Extracted URL prefill parameters by question index
 */
export interface PrefillParams {
    [questionIndex: number]: string[];
}
/**
 * Extract prefill parameters from URL search string
 * Format: ?q0=1&q1=8&q2=0&q2=2&auto_submit=true
 * NOTE: Manual parsing for IE11/op_mini compatibility (no URLSearchParams)
 */
export declare function extractPrefillParamsFromUrl(searchString: string): {
    params: PrefillParams;
    autoSubmit: boolean;
};
/**
 * Convert URL prefill values to SDK response format
 */
export declare function convertPrefillToResponses(survey: Survey, prefillParams: PrefillParams): Record<string, any>;
/**
 * Calculate which question index to start at based on prefilled questions.
 * Advances past consecutive prefilled questions (starting from index 0)
 * that have skipSubmitButton enabled, respecting any branching logic configured
 * on those questions.
 *
 * @param survey - The full survey object (needed for branching logic)
 * @param prefilledIndices - Array of question indices that have been prefilled
 * @param responses - Map of response keys to response values
 * @returns Object with startQuestionIndex and map of questions which have been skipped
 */
export declare function calculatePrefillStartIndex(survey: Survey, prefilledIndices: number[], responses: Record<string, any>): {
    startQuestionIndex: number;
    skippedResponses: Record<string, any>;
};
