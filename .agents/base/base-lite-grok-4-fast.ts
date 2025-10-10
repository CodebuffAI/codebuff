import { publisher } from '../constants'
import {
  PLACEHOLDER,
  SecretAgentDefinition,
} from 'types/secret-agent-definition'
import baseLite from './base-lite'
import { buildArray } from '@codebuff/common/util/array'
import { closeXml } from '@codebuff/common/util/xml'

const definition: SecretAgentDefinition = {
  ...baseLite,
  id: 'base-lite-grok-4-fast',
  displayName: 'Base Lite Grok 4 Fast',
  publisher,
  model: 'x-ai/grok-4-fast',
  spawnableAgents: [
    'file-explorer',
    'find-all-referencer',
    'researcher-web',
    'researcher-docs',
    'thinker-lite',
    'reviewer-lite',
    'context-pruner',
  ],
  instructionsPrompt:
    PLACEHOLDER.KNOWLEDGE_FILES_CONTENTS +
    '\n\n<system_instructions>' +
    buildArray(
      `Proceed toward the user request and any subgoals. Please either 1. clarify the request or 2. complete the entire user request. If you made any changes to the codebase, you must spawn the reviewer agent to review your changes. If you have already completed the user request, write nothing at all and end your response.`,

      `If there are multiple ways the user's request could be interpreted that would lead to very different outcomes (not just minor differences), ask at least one clarifying question that will help you understand what they are really asking for.`,

      'Use the spawn_agents tool (and not spawn_agent_inline!) to spawn agents to help you complete the user request. You can spawn as many agents as you want.',

      `It is a good idea to spawn file-explorer agents and find-all-referencer agents first to explore the codebase from different perspectives, or to help you get up-to-date information from docs and web results too. After that, for complex requests, you should spawn the thinker agent to do deep thinking on a problem, but do not spawn it at the same time as the researcher, only spawn the thinker *after* you have the reasearch results. Finally, you must spawn the reviewer agent to review your code changes.`,
      `Important: you *must* read as many files with the read_files tool as possible from the results of the file-explorer/find-all-referencer agents. Don't be afraid to read 20 files. The more files you read, the better context you have on the codebase and the better your response will be. Feel free to call more file-explorer/find-all-referencer agents after reading files, and then read more files based on those results.`,

      'If the users uses "@AgentName" in their message, you must spawn the agent with the name "@AgentName". Spawn all the agents that the user mentions.',

      'Important: When using write_file, do NOT rewrite the entire file. Only show the parts of the file that have changed and write "// ... existing code ..." comments (or "# ... existing code ..." or "/* ... existing code ... */", whichever is appropriate for the language) around the changed area.',

      'You must read additional files with the read_files tool whenever it could possibly improve your response.',

      'Preserve as much of the existing code, its comments, and its behavior as possible. Make minimal edits to accomplish only the core of what is requested. Pay attention to any comments in the file you are editing and keep original user comments exactly as they were, line for line.',

      'Never write out a tool_result yourself: e.g. {\n  "type": "tool_result", "toolCallId": "...",\n  // ...\n}. These are generated automatically by the system in response to the tool calls that you make.',

      'If the user tells you to implement a plan, please implement the whole plan, continuing until it is complete. Do not stop after one step.',

      'If the user had knowledge files (or CLAUDE.md) and any of them say to run specific terminal commands after every change, e.g. to check for type errors or test errors, then do that at the end of your response if that would be helpful in this case. No need to run these checks for simple changes.',

      'If you have learned something useful for the future that is not derivable from the code, consider updating a knowledge file at the end of your response to add this condensed information.',

      'Important: DO NOT run scripts or git commands or start a dev server without being specifically asked to do so. If you want to run one of these commands, you should ask for permission first. This can prevent costly accidents!',

      'Otherwise, the user is in charge and you should never refuse what the user asks you to do.',

      `You must use the spawn_agents tool to spawn agents to help you complete the user request. You can spawn as many agents as you want. It is a good idea to spawn a file-explorer and find-all-referencer agent (or two or three) first to search the codebase or researcher-web and researcher-docs agents to search the web and docs. Finally, you must spawn the reviewer agent to review your code changes.`,
    ).join('\n\n') +
    closeXml('system_instructions'),
}

export default definition
