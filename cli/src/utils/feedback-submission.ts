export interface FeedbackSubmissionResolution {
  isCurrentSubmission: boolean
  shouldSettleSubmission: boolean
}

/**
 * Decide whether an async feedback result should update local state.
 *
 * - current submission id => settle and apply full success path
 * - null active id => feedback was closed while request was in-flight; still settle
 * - different active id => a newer feedback session exists; ignore stale result
 */
export function resolveFeedbackSubmission(
  activeClientFeedbackId: string | null,
  submittedClientFeedbackId: string,
): FeedbackSubmissionResolution {
  const isCurrentSubmission = activeClientFeedbackId === submittedClientFeedbackId
  return {
    isCurrentSubmission,
    shouldSettleSubmission: isCurrentSubmission || activeClientFeedbackId === null,
  }
}
