import { FREEBUFF_GLM_V53_FLASH_MODEL_ID } from '@codebuff/common/constants/freebuff-models'

import { createBase3CliRoot } from './base3'

// No `reasoningOptions`, for the reason spelled out on base3-free-luna: an
// agent-declared reasoning reaches the wire as `body.reasoning`, which makes
// the definition rather than the user the authority on effort. It costs nothing
// here in particular — OpenRouter reports no effort levels for this model, so
// the catalog row declares no ladder and the picker shows no control.
const definition = {
  ...createBase3CliRoot({
    model: FREEBUFF_GLM_V53_FLASH_MODEL_ID,
    isFreebuff: true,
  }),
  id: 'base3-free-glm-5-3-flash',
  displayName: 'Buffy on GLM 5.3 Flash',
}

export default definition
