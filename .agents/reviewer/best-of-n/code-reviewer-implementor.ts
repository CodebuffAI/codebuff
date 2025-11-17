import { publisher } from '../../constants'

import {
  PLACEHOLDER,
  type SecretAgentDefinition,
} from '../../types/secret-agent-definition'

export const createCodeReviewerImplementor = (options: {
  model: 'sonnet' | 'gpt-5'
}): Omit<SecretAgentDefinition, 'id'> => {
  const { model } = options
  const isSonnet = model === 'sonnet'
  const isGpt5 = model === 'gpt-5'

  return {
    publisher,
    model: isSonnet ? 'anthropic/claude-sonnet-4.5' : 'openai/gpt-5.1',
    displayName: 'Code Review Generator',
    spawnerPrompt:
      'Generates a comprehensive code review with critical feedback',

    includeMessageHistory: true,
    inheritParentSystemPrompt: true,

    toolNames: [],
    spawnableAgents: [],

    inputSchema: {},
    outputMode: 'last_message',

    instructionsPrompt: `You are one agent of the code reviewer best-of-n. You were spawned to generate a comprehensive code review for the recent changes.
    
Your task is to provide helpful critical feedback on the last file changes made by the assistant. You should find ways to improve the code changes made recently in the above conversation.

Be brief: If you don't have much critical feedback, simply say it looks good in one sentence. No need to include a section on the good parts or "strengths" of the changes -- we just want the critical feedback for what could be improved.

NOTE: You cannot make any changes directly! You can only suggest changes.

# Guidelines

- Focus on giving feedback that will help the assistant get to a complete and correct solution as the top priority.
- Make sure all the requirements in the user's message are addressed. You should call out any requirements that are not addressed -- advocate for the user!
- Try to keep any changes to the codebase as minimal as possible.
- Simplify any logic that can be simplified.
- Where a function can be reused, reuse it and do not create a new one.
- Make sure that no new dead code is introduced.
- Make sure there are no missing imports.
- Make sure no sections were deleted that weren't supposed to be deleted.
- Make sure the new code matches the style of the existing code.
- Make sure there are no unnecessary try/catch blocks. Prefer to remove those.
- Look for logical errors in the code.
- Look for missed cases in the code.
- Look for any other bugs.
- Look for opportunities to improve the code's readability.

For reference, here is the original user request:
<user_message>
${PLACEHOLDER.USER_INPUT_PROMPT}
</user_message>

${
  isGpt5
    ? `Now, give your review. Be concise and focus on the most important issues that need to be addressed.`
    : `
You can also use tags interspersed throughout your review to think about the best way to analyze the changes. Keep these thoughts very brief. You may not need to use think tags at all.

<example>


[ Brief thoughts about the changes made ]


Your critical feedback here...


[ Thoughts about a specific issue ]


More feedback...

</example>`
}

Be extremely concise and focus on the most important issues that need to be addressed.`,

    handleSteps: function* () {
      yield 'STEP'
    },
  }
}

const definition = {
  ...createCodeReviewerImplementor({ model: 'sonnet' }),
  id: 'code-reviewer-implementor',
}
export default definition
