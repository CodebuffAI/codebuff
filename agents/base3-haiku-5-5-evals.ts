import { createBase3CliRoot } from './base3'

/**
 * base3 on Claude Haiku 5.5, as buffbench runs it: the same options as
 * `base3-free-deepseek-flash-evals`, so the model is the only difference.
 * It names the OpenRouter id, not the Freebuff catalog handle
 * (`fbc/claude-haiku-5.5`), which only a catalog root may use. Compaction is
 * the full-context catalog row's (default-config.ts), so it runs as that row
 * does in production.
 */
const definition = {
  ...createBase3CliRoot({
    model: 'anthropic/claude-haiku-5.5',
    isFreebuff: true,
    noAskUser: true,
    noWeb: true,
    modelLabel: 'Claude Haiku 5.5',
    compaction: {
      cacheExpiryMs: 3_600_000,
      cacheExpiryMinTokens: 140_000,
      maxContextLength: 400_000,
    },
  }),
  id: 'base3-haiku-5-5-evals',
  displayName: 'Buffy on Claude Haiku 5.5 (evals)',
}

export default definition
