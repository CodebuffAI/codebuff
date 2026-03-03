import { type SecretAgentDefinition } from '../types/secret-agent-definition'
import { createFileLister } from './file-lister'

const base = createFileLister()

const definition: SecretAgentDefinition = {
  id: 'file-lister-max',
  ...base,
  spawnerPrompt:
    'Lists up to 20 files that are relevant to the prompt within the given directories. Unless you know which directories are relevant, omit the directories parameter. This agent is great for finding files that could be relevant to the prompt.',
  instructionsPrompt: `Instructions:
- List out the full paths of 20 files that are relevant to the prompt, separated by newlines. Each file path is relative to the project root. Don't forget to include all the subdirectories in the path -- sometimes you have forgotten to include 'src' in the path. Make sure that the file paths are exactly correct.
- Do not write any introductory commentary.
- Do not write any analysis or any English text at all.
- Do not use any more tools. Do not call read_subtree again.

Here's an example response with made up file paths (these are not real file paths, just an example):
<example_response>
packages/core/src/index.ts
packages/core/src/api/server.ts
packages/core/src/api/routes/user.ts
packages/core/src/api/routes/auth.ts
packages/core/src/api/middleware/cors.ts
packages/core/src/utils/logger.ts
packages/core/src/utils/validator.ts
packages/core/src/utils/crypto.ts
packages/common/src/util/stringify.ts
packages/common/src/types/user.ts
packages/common/src/types/config.ts
packages/common/src/constants/index.ts
packages/common/src/constants/routes.ts
packages/utils/src/cli/parseArgs.ts
packages/utils/src/cli/format.ts
packages/utils/src/cli/prompt.ts
docs/routes/index.md
docs/routes/user.md
docs/api/auth.md
package.json
</example_response>

Again: Do not call any tools or write anything else other than the chosen file paths on new lines. Go.`.trim(),
}

export default definition
