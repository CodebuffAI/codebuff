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
    // No thinker-gpt: escalating "think harder" to openai/gpt-5.4 buys nothing
    // when the root is already a frontier model. Live wave sessions spent three
    // spawn attempts on it in a single turn before this was removed.
    //
    // Note it is NOT dead weight generally — a user who has run /connect-chatgpt
    // reaches it directly through their own subscription (see
    // createOpenAIOAuthModel), bypassing the backend entirely. Unconnected free
    // users are the ones who get a 403, which is why the other free roots keep
    // offering it and only Fable drops it.
    noThinkerGpt: true,
  }),
  id: 'base2-free-fable',
  displayName: 'Buffy the Claude Fable 5 Free Orchestrator',
}

export default definition
