import {
  FREEBUFF_GEMINI_4_ARGON_MODEL_ID,
  FREEBUFF_GEMINI_4_ARGON_REASONING_EFFORT,
} from '@codebuff/common/constants/freebuff-models'

import { createBase2 } from './base2'

// The base2 rollback root for Gemini 4 Argon, bundled alongside its base3 twin
// so the FREEBUFF_BASE3_HARNESS_DISABLED kill switch has somewhere to route.
const definition = {
  ...createBase2('free', {
    model: FREEBUFF_GEMINI_4_ARGON_MODEL_ID,
  }),
  id: 'base2-free-gemini-4-argon',
  displayName: 'Buffy the Gemini 4 Argon Free Orchestrator',
  // The server applies this default too (applyFreebuffReasoningDefaults), both
  // reading the shared constant.
  reasoningOptions: {
    enabled: true,
    effort: FREEBUFF_GEMINI_4_ARGON_REASONING_EFFORT,
  },
}

export default definition
