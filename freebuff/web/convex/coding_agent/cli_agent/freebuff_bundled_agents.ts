import base2Free from '../../../../../agents/base2/base2-free'
import base2FreeDeepseek from '../../../../../agents/base2/base2-free-deepseek'
import base2FreeDeepseekFlash from '../../../../../agents/base2/base2-free-deepseek-flash'
import base2FreeKimi from '../../../../../agents/base2/base2-free-kimi'
import basher from '../../../../../agents/basher'
import browserUse from '../../../../../agents/browser-use/browser-use'
import contextPruner from '../../../../../agents/context-pruner'
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

export const bundledAgentDefinitions = [
  base2Free,
  base2FreeDeepseek,
  base2FreeDeepseekFlash,
  base2FreeKimi,
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
