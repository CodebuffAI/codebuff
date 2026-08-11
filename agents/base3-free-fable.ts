import { FREEBUFF_FABLE_5_MODEL_ID } from '@codebuff/common/constants/freebuff-models'

import { createBase3CliRoot } from './base3'

/**
 * Buffy on Claude Fable 5, the capacity-limited trial root.
 *
 * Reachable only while the server still advertises the offer (see
 * FREEBUFF_LIMITED_OFFER_MODEL_IDS); admission is what gates it, not this
 * definition. Provider routing is inherited from createBase3's anthropic/*
 * branch — the same Bedrock-only, data_collection:'deny' pin the paid Opus
 * roots use — so a provider outage cannot silently reroute a free frontier
 * model onto a differently-priced endpoint.
 *
 * CLI-only: Fable is a limited offer that Freebuff Web never surfaces, which is
 * why this is the one base3 root with no Web/Cloud twin.
 */
const definition = {
  ...createBase3CliRoot({
    model: FREEBUFF_FABLE_5_MODEL_ID,
    isFreebuff: true,
  }),
  id: 'base3-free-fable',
  displayName: 'Buffy on Claude Fable 5',
}

export default definition
