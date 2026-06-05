import { createBase2 } from '../../../../../agents/base2/base2'
import basher from '../../../../../agents/basher'
import browserUse from '../../../../../agents/browser-use/browser-use'
import contextPruner from '../../../../../agents/context-pruner'
import {
  FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
  FREEBUFF_KIMI_MODEL_ID,
  FREEBUFF_MIMO_V25_MODEL_ID,
  FREEBUFF_MIMO_V25_PRO_MODEL_ID,
  FREEBUFF_MINIMAX_MODEL_ID,
  DEFAULT_FREEBUFF_MODEL_ID,
} from '@codebuff/common/constants/freebuff-models'
import codeReviewerDeepseek from '../../../../../agents/reviewer/code-reviewer-deepseek'
import codeReviewerDeepseekFlash from '../../../../../agents/reviewer/code-reviewer-deepseek-flash'
import codeReviewerKimi from '../../../../../agents/reviewer/code-reviewer-kimi'
import codeReviewerLite from '../../../../../agents/reviewer/code-reviewer-lite'
import codeReviewerMinimax from '../../../../../agents/reviewer/code-reviewer-minimax'
import codeSearcher from '../../../../../agents/file-explorer/code-searcher'
import directoryLister from '../../../../../agents/file-explorer/directory-lister'
import fileLister from '../../../../../agents/file-explorer/file-lister'
import filePicker from '../../../../../agents/file-explorer/file-picker'
import globMatcher from '../../../../../agents/file-explorer/glob-matcher'
import researcherDocs from '../../../../../agents/researcher/researcher-docs'
import researcherWeb from '../../../../../agents/researcher/researcher-web'
import thinkerGpt from '../../../../../agents/thinker/thinker-gpt'
import thinkerWithFilesGemini from '../../../../../agents/thinker/thinker-with-files-gemini'
import tmuxCli from '../../../../../agents/tmux-cli'

import type { AgentDefinition } from '@codebuff/common/templates/initial-agents-dir/types/agent-definition'

const base2Free = {
  ...createBase2('free', { noReview: true }),
  id: 'base2-free',
  displayName: 'Buffy the Free Orchestrator',
}

const base2FreeDeepseek = {
  ...createBase2('free', {
    model: FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
    noReview: true,
  }),
  id: 'base2-free-deepseek',
  displayName: 'Buffy the DeepSeek Free Orchestrator',
}

const base2FreeDeepseekFlash = {
  ...createBase2('free', {
    model: FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
    noReview: true,
  }),
  id: 'base2-free-deepseek-flash',
  displayName: 'Buffy the DeepSeek Flash Free Orchestrator',
}

const base2FreeKimi = {
  ...createBase2('free', {
    model: FREEBUFF_KIMI_MODEL_ID,
    noReview: true,
  }),
  id: 'base2-free-kimi',
  displayName: 'Buffy the Kimi Free Orchestrator',
}

const base2FreeMimo = {
  ...createBase2('free', {
    model: FREEBUFF_MIMO_V25_MODEL_ID,
    noReview: true,
  }),
  id: 'base2-free-mimo',
  displayName: 'Buffy the MiMo Free Orchestrator',
}

const base2FreeMimoPro = {
  ...createBase2('free', {
    model: FREEBUFF_MIMO_V25_PRO_MODEL_ID,
    noReview: true,
  }),
  id: 'base2-free-mimo-pro',
  displayName: 'Buffy the MiMo Pro Free Orchestrator',
}

const base2FreeMinimax = {
  ...createBase2('free', {
    model: FREEBUFF_MINIMAX_MODEL_ID,
    noReview: true,
  }),
  id: 'base2-free-minimax',
  displayName: 'Buffy the MiniMax Free Orchestrator',
}

/**
 * Maps a Freebuff model id (as shown in the web/CLI model switcher) to the
 * bundled base2-free agent that pins that model. Used by executeFreebuff to
 * run the model the user selected. Models without an explicit variant fall
 * back to `base2-free`.
 */
export const FREEBUFF_MODEL_TO_AGENT_ID: Record<string, string> = {
  [FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID]: 'base2-free-deepseek',
  [FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID]: 'base2-free-deepseek-flash',
  [FREEBUFF_KIMI_MODEL_ID]: 'base2-free-kimi',
  [FREEBUFF_MIMO_V25_MODEL_ID]: 'base2-free-mimo',
  [FREEBUFF_MIMO_V25_PRO_MODEL_ID]: 'base2-free-mimo-pro',
  [FREEBUFF_MINIMAX_MODEL_ID]: 'base2-free-minimax',
}

/** Resolve a selected Freebuff model id to the bundled agent id to run. Falls
 *  back to the default model's agent for unknown/undefined selections. */
export function resolveFreebuffAgentId(modelId: string | undefined): string {
  if (modelId && FREEBUFF_MODEL_TO_AGENT_ID[modelId]) {
    return FREEBUFF_MODEL_TO_AGENT_ID[modelId]
  }
  return FREEBUFF_MODEL_TO_AGENT_ID[DEFAULT_FREEBUFF_MODEL_ID] ?? 'base2-free'
}

export const bundledAgentDefinitions = [
  base2Free,
  base2FreeDeepseek,
  base2FreeDeepseekFlash,
  base2FreeKimi,
  base2FreeMimo,
  base2FreeMimoPro,
  base2FreeMinimax,
  basher,
  browserUse,
  contextPruner,
  codeReviewerDeepseek,
  codeReviewerDeepseekFlash,
  codeReviewerKimi,
  codeReviewerLite,
  codeReviewerMinimax,
  codeSearcher,
  directoryLister,
  fileLister,
  filePicker,
  globMatcher,
  researcherDocs,
  researcherWeb,
  thinkerGpt,
  thinkerWithFilesGemini,
  tmuxCli,
] satisfies AgentDefinition[]
