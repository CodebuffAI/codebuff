const POLICY_EFFECTIVE_DATE = 'July 23, 2026'

export const FREEBUFF_POLICY_ROLLOUT = {
  version: '2026-07-23',
  effectiveDate: POLICY_EFFECTIVE_DATE,
  lastUpdated: '07/23/2026',
  noticeEndsAt: '2026-08-23T00:00:00-07:00',
  notice: {
    title: `We’ve updated our Terms and Privacy Policy, effective ${POLICY_EFFECTIVE_DATE}.`,
    summary:
      'Prompts may be used to personalize ads, AI training applies only to labeled models or features, and usage restrictions were updated.',
  },
} as const

export const FREEBUFF_PRIVACY_POLICY_URL = 'https://freebuff.com/privacy-policy'

export const FREEBUFF_AI_TRAINING_NOTICE = 'May use data for AI training'

export type FreebuffModelDataUse = 'service' | 'training'

/**
 * Canonical short-form public copy derived from the July 23 Privacy Policy.
 * Product surfaces should import these answers instead of restating data-use
 * promises. Static Markdown/MDX copies are protected by the drift test in
 * `freebuff-public-data-use-copy.test.ts`.
 */
export const FREEBUFF_PUBLIC_DATA_USE_COPY = {
  collectionQuestion: 'Does Freebuff collect my data?',
  collectionAnswer:
    'Freebuff is supported by text ads. We do not collect your traces or files unless the model provider does. Currently, this applies only to DeepSeek models.',
  trainingQuestion: 'Is my data used to train AI?',
  trainingAnswer:
    'Only when a model or feature says data may be used for AI training. Freebuff or the provider may then keep submissions to develop, train, test, evaluate, fine-tune, and improve AI models or products.',
  storageQuestion: 'How is my data used and stored?',
  storageAnswer:
    'We use prompts, messages, code, files, and repository data to provide the service. We may analyze prompts and messages—including pasted content—to personalize ads, using Freebuff systems and service providers acting on our behalf. Separate uploads and connected repositories are not provided to advertising providers. Where required by law, we provide advertising choices and honor recognized opt-out signals; elsewhere, this processing may be required to use the free service. See the Privacy Policy for retention and details.',
  compactTrainingSummary: `Models or features labeled “${FREEBUFF_AI_TRAINING_NOTICE}” may keep submissions to develop, train, test, evaluate, fine-tune, and improve AI models or products.`,
  compactPrivacySummary: `Prompts and messages may be analyzed to personalize ads, using Freebuff systems and service providers acting on our behalf. Separate uploads and connected repositories are not provided to advertising providers. Models or features labeled “${FREEBUFF_AI_TRAINING_NOTICE}” may use submissions for that purpose.`,
  localExecutionSummary:
    'Freebuff edits files locally but sends relevant prompts, code, files, and repository context to its servers and model providers. See the Privacy Policy for details.',
  compactLocalExecutionSummary:
    'Edits run locally, but relevant prompts, code, files, and repository context are sent to Freebuff and model providers.',
} as const

export const FREEBUFF_DATA_USE_GENERATED_MARKDOWN_BLOCK = {
  start: '<!-- BEGIN GENERATED FREEBUFF DATA USE -->',
  end: '<!-- END GENERATED FREEBUFF DATA USE -->',
} as const

export const FREEBUFF_DATA_USE_GENERATED_MDX_BLOCK = {
  start: '{/* BEGIN GENERATED FREEBUFF DATA USE */}',
  end: '{/* END GENERATED FREEBUFF DATA USE */}',
} as const

export function renderFreebuffDataUseFaqMarkdown(): string {
  return `${FREEBUFF_DATA_USE_GENERATED_MARKDOWN_BLOCK.start}

**${FREEBUFF_PUBLIC_DATA_USE_COPY.trainingQuestion}** ${FREEBUFF_PUBLIC_DATA_USE_COPY.trainingAnswer}

**${FREEBUFF_PUBLIC_DATA_USE_COPY.storageQuestion}** ${FREEBUFF_PUBLIC_DATA_USE_COPY.storageAnswer}

See the [Privacy Policy](${FREEBUFF_PRIVACY_POLICY_URL}) for complete details.

${FREEBUFF_DATA_USE_GENERATED_MARKDOWN_BLOCK.end}`
}

export function renderFreebuffDataUseFaqMdx(): string {
  return `${FREEBUFF_DATA_USE_GENERATED_MDX_BLOCK.start}

## ${FREEBUFF_PUBLIC_DATA_USE_COPY.storageQuestion}

${FREEBUFF_PUBLIC_DATA_USE_COPY.storageAnswer}

## ${FREEBUFF_PUBLIC_DATA_USE_COPY.trainingQuestion}

${FREEBUFF_PUBLIC_DATA_USE_COPY.trainingAnswer}

See the [Privacy Policy](${FREEBUFF_PRIVACY_POLICY_URL}) for complete details.

${FREEBUFF_DATA_USE_GENERATED_MDX_BLOCK.end}`
}
