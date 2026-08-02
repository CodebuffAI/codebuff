import { FREEBUFF_FABLE_5_MODEL_ID } from '@codebuff/common/constants/freebuff-models'

import { createBase2 } from './base2'

/**
 * Buffy on Claude Fable 5, the capacity-limited trial root.
 *
 * Reachable only while the server still advertises the offer (see
 * FREEBUFF_LIMITED_OFFER_MODEL_IDS); admission is what gates it, not this
 * definition. Provider routing is inherited from createBase2's anthropic/*
 * branch — the same Bedrock-only, data_collection:'deny' pin the paid Opus
 * orchestrators use — so a provider outage cannot silently reroute a free
 * frontier model onto a differently-priced endpoint.
 *
 * No dedicated reviewer: unmapped models fall back to code-reviewer-deepseek-flash,
 * which is deliberate here. The trace we are buying with the pool is the ROOT's
 * hour of agentic work, and putting the reviewer on Fable too would roughly
 * double the cost of every session for a subagent whose output we already
 * collect on a cheaper model.
 */
const definition = {
  ...createBase2('free', {
    model: FREEBUFF_FABLE_5_MODEL_ID,
  }),
  id: 'base2-free-fable',
  displayName: 'Buffy the Claude Fable 5 Free Orchestrator',
}

export default definition
