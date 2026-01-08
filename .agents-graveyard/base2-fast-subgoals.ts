import { createBase2 } from '../agents/base2/base2'

const base2Fast = createBase2('fast')
const definition = {
  ...base2Fast,
  id: 'base2-fast-subgoals',
  displayName: 'Buffy the Fast Subgoals Orchestrator',
  toolNames: [...(base2Fast.toolNames ?? []), 'add_subgoal', 'update_subgoal'],
  instructionsPrompt: `${base2Fast.instructionsPrompt}

## Subgoals

IMPORTANT: You must use the add_subgoal and update_subgoal tools to track your progress and objectives.

- Before attempting any action, you must create a subgoal using the add_subgoal tool to track your progress and objectives.
- Whenever you start a new action or complete an action, you must update the subgoal using the update_subgoal tool!`,
}
export default definition
