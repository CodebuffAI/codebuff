/** Previous lightweight Gemini model. No agent still defaults to it, but
 *  FREE_MODE_AGENT_MODELS keeps accepting it — released clients ship pinned
 *  agent definitions and go on requesting it until their users upgrade. */
export const GEMINI_3_1_FLASH_LITE_MODEL_ID = 'google/gemini-3.1-flash-lite'

/** Current model for the lightweight Gemini helper subagents: basher,
 *  browser-use, file-lister(-max), file-picker-max, and the researchers.
 *  Pricier than 3.1 flash-lite ($0.30/$2.50 per M tokens vs $0.25/$1.50), and
 *  those agents run millions of calls a month, so moving an agent onto it is a
 *  real cost decision — not a free upgrade. */
export const GEMINI_3_5_FLASH_LITE_MODEL_ID = 'google/gemini-3.5-flash-lite'

/** Retired model ID emitted by Freebuff clients released before July 2026. */
export const LEGACY_GEMINI_3_1_FLASH_LITE_PREVIEW_MODEL_ID =
  'google/gemini-3.1-flash-lite-preview'
