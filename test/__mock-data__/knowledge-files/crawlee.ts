import { FileChange, Message } from 'common/src/actions'
import { ProjectFileContext } from 'common/src/util/file'

export const mockFileContext: ProjectFileContext = {
  currentWorkingDirectory: 'Users/me/Documents/manicode',
  fileTree: [
    {
      name: '.gitignore',
      type: 'file',
    },
    {
      name: '.manicodeignore',
      type: 'file',
    },
    {
      name: '.prettierrc',
      type: 'file',
    },
    {
      name: 'README.md',
      type: 'file',
    },
    {
      name: 'authentication_and_billing.knowledge.md',
      type: 'file',
    },
    {
      name: 'backend',
      type: 'directory',
      children: [
        {
          name: '.dockerignore',
          type: 'file',
        },
        {
          name: '.env.example',
          type: 'file',
        },
        {
          name: '.gitignore',
          type: 'file',
        },
        {
          name: 'Dockerfile',
          type: 'file',
        },
        {
          name: 'deploy.sh',
          type: 'file',
        },
        {
          name: 'jest.config.js',
          type: 'file',
        },
        {
          name: 'jest.setup.js',
          type: 'file',
        },
        {
          name: 'knowledge.md',
          type: 'file',
        },
        {
          name: 'package.json',
          type: 'file',
        },
        {
          name: 'src',
          type: 'directory',
          children: [
            {
              name: 'claude.ts',
              type: 'file',
            },
            {
              name: 'constants.ts',
              type: 'file',
            },
            {
              name: 'generate-diffs-prompt.ts',
              type: 'file',
            },
            {
              name: 'generate-diffs-via-expansion.ts',
              type: 'file',
            },
            {
              name: 'generate-knowledge-files.ts',
              type: 'file',
            },
            {
              name: 'generate-patch.ts',
              type: 'file',
            },
            {
              name: 'index.ts',
              type: 'file',
            },
            {
              name: 'main-prompt.ts',
              type: 'file',
            },
            {
              name: 'openai-api.ts',
              type: 'file',
            },
            {
              name: 'process-stream.ts',
              type: 'file',
            },
            {
              name: 'request-files-prompt.ts',
              type: 'file',
            },
            {
              name: 'system-prompt.ts',
              type: 'file',
            },
            {
              name: 'tools.ts',
              type: 'file',
            },
            {
              name: 'util',
              type: 'directory',
              children: [
                {
                  name: 'debug.ts',
                  type: 'file',
                },
                {
                  name: 'token-counter.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'websockets',
              type: 'directory',
              children: [
                {
                  name: 'server.ts',
                  type: 'file',
                },
                {
                  name: 'switchboard.ts',
                  type: 'file',
                },
                {
                  name: 'websocket-action.ts',
                  type: 'file',
                },
              ],
            },
          ],
        },
        {
          name: 'tsconfig.json',
          type: 'file',
        },
      ],
    },
    {
      name: 'bun.lockb',
      type: 'file',
    },
    {
      name: 'common',
      type: 'directory',
      children: [
        {
          name: 'package.json',
          type: 'file',
        },
        {
          name: 'src',
          type: 'directory',
          children: [
            {
              name: 'actions.ts',
              type: 'file',
            },
            {
              name: 'codemap',
              type: 'directory',
              children: [
                {
                  name: 'languages.ts',
                  type: 'file',
                },
                {
                  name: 'parse.ts',
                  type: 'file',
                },
                {
                  name: 'test-langs',
                  type: 'directory',
                  children: [
                    {
                      name: 'test.c',
                      type: 'file',
                    },
                    {
                      name: 'test.cpp',
                      type: 'file',
                    },
                    {
                      name: 'test.cs',
                      type: 'file',
                    },
                    {
                      name: 'test.go',
                      type: 'file',
                    },
                    {
                      name: 'test.java',
                      type: 'file',
                    },
                    {
                      name: 'test.js',
                      type: 'file',
                    },
                    {
                      name: 'test.php',
                      type: 'file',
                    },
                    {
                      name: 'test.py',
                      type: 'file',
                    },
                    {
                      name: 'test.rb',
                      type: 'file',
                    },
                    {
                      name: 'test.rs',
                      type: 'file',
                    },
                    {
                      name: 'test.ts',
                      type: 'file',
                    },
                  ],
                },
                {
                  name: 'tree-sitter-queries',
                  type: 'directory',
                  children: [
                    {
                      name: 'readme.md',
                      type: 'file',
                    },
                    {
                      name: 'tree-sitter-c-tags.scm',
                      type: 'file',
                    },
                    {
                      name: 'tree-sitter-c_sharp-tags.scm',
                      type: 'file',
                    },
                    {
                      name: 'tree-sitter-cpp-tags.scm',
                      type: 'file',
                    },
                    {
                      name: 'tree-sitter-go-tags.scm',
                      type: 'file',
                    },
                    {
                      name: 'tree-sitter-java-tags.scm',
                      type: 'file',
                    },
                    {
                      name: 'tree-sitter-javascript-tags.scm',
                      type: 'file',
                    },
                    {
                      name: 'tree-sitter-php-tags.scm',
                      type: 'file',
                    },
                    {
                      name: 'tree-sitter-python-tags.scm',
                      type: 'file',
                    },
                    {
                      name: 'tree-sitter-ruby-tags.scm',
                      type: 'file',
                    },
                    {
                      name: 'tree-sitter-rust-tags.scm',
                      type: 'file',
                    },
                    {
                      name: 'tree-sitter-typescript-tags.scm',
                      type: 'file',
                    },
                  ],
                },
                {
                  name: 'tree-sitter.d.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'constants.ts',
              type: 'file',
            },
            {
              name: 'project-file-tree.ts',
              type: 'file',
            },
            {
              name: 'util',
              type: 'directory',
              children: [
                {
                  name: 'array.ts',
                  type: 'file',
                },
                {
                  name: 'changes.ts',
                  type: 'file',
                },
                {
                  name: 'file.ts',
                  type: 'file',
                },
                {
                  name: 'object.ts',
                  type: 'file',
                },
                {
                  name: 'patch.ts',
                  type: 'file',
                },
                {
                  name: 'promise.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'websockets',
              type: 'directory',
              children: [
                {
                  name: 'websocket-client.ts',
                  type: 'file',
                },
                {
                  name: 'websocket-schema.ts',
                  type: 'file',
                },
              ],
            },
          ],
        },
        {
          name: 'tsconfig.json',
          type: 'file',
        },
      ],
    },
    {
      name: 'exported-tokens.json',
      type: 'file',
    },
    {
      name: 'knowledge.md',
      type: 'file',
    },
    {
      name: 'musings.knowledge.md',
      type: 'file',
    },
    {
      name: 'npm-app',
      type: 'directory',
      children: [
        {
          name: 'README.md',
          type: 'file',
        },
        {
          name: 'clean-package.js',
          type: 'file',
        },
        {
          name: 'knowledge.md',
          type: 'file',
        },
        {
          name: 'package.json',
          type: 'file',
        },
        {
          name: 'src',
          type: 'directory',
          children: [
            {
              name: 'chat-storage.ts',
              type: 'file',
            },
            {
              name: 'cli.ts',
              type: 'file',
            },
            {
              name: 'client.ts',
              type: 'file',
            },
            {
              name: 'config.ts',
              type: 'file',
            },
            {
              name: 'fingerprint.ts',
              type: 'file',
            },
            {
              name: 'index.ts',
              type: 'file',
            },
            {
              name: 'manifold-api.ts',
              type: 'file',
            },
            {
              name: 'menu.ts',
              type: 'file',
            },
            {
              name: 'project-files.ts',
              type: 'file',
            },
            {
              name: 'tool-handlers.ts',
              type: 'file',
            },
            {
              name: 'web-scraper.ts',
              type: 'file',
            },
          ],
        },
        {
          name: 'storage',
          type: 'directory',
          children: [
            {
              name: 'key_value_stores',
              type: 'directory',
              children: [
                {
                  name: 'default',
                  type: 'directory',
                  children: [],
                },
              ],
            },
            {
              name: 'request_queues',
              type: 'directory',
              children: [
                {
                  name: 'default',
                  type: 'directory',
                  children: [],
                },
              ],
            },
          ],
        },
        {
          name: 'tsconfig.json',
          type: 'file',
        },
      ],
    },
    {
      name: 'package.json',
      type: 'file',
    },
    {
      name: 'python-app',
      type: 'directory',
      children: [
        {
          name: 'LICENSE',
          type: 'file',
        },
        {
          name: 'README.md',
          type: 'file',
        },
        {
          name: 'knowledge.md',
          type: 'file',
        },
        {
          name: 'pyproject.toml',
          type: 'file',
        },
        {
          name: 'src',
          type: 'directory',
          children: [
            {
              name: 'manicode',
              type: 'directory',
              children: [
                {
                  name: '__init__.py',
                  type: 'file',
                },
                {
                  name: '__pycache__',
                  type: 'directory',
                  children: [
                    {
                      name: '__init__.cpython-39.pyc',
                      type: 'file',
                    },
                  ],
                },
              ],
            },
            {
              name: 'manicode.egg-info',
              type: 'directory',
              children: [
                {
                  name: 'PKG-INFO',
                  type: 'file',
                },
                {
                  name: 'SOURCES.txt',
                  type: 'file',
                },
                {
                  name: 'dependency_links.txt',
                  type: 'file',
                },
                {
                  name: 'entry_points.txt',
                  type: 'file',
                },
                {
                  name: 'top_level.txt',
                  type: 'file',
                },
              ],
            },
          ],
        },
      ],
    },
    {
      name: 'scripts',
      type: 'directory',
      children: [
        {
          name: 'bump-version.ts',
          type: 'file',
        },
        {
          name: 'bun.lockb',
          type: 'file',
        },
        {
          name: 'generate-fine-tuning-dataset.ts',
          type: 'file',
        },
        {
          name: 'package.json',
          type: 'file',
        },
        {
          name: 'tsconfig.json',
          type: 'file',
        },
      ],
    },
    {
      name: 'start-dev.sh',
      type: 'file',
    },
    {
      name: 'test',
      type: 'directory',
      children: [
        {
          name: '__mock-data__',
          type: 'directory',
          children: [
            {
              name: 'actions',
              type: 'directory',
              children: [
                {
                  name: 'expected.ts',
                  type: 'file',
                },
                {
                  name: 'new.ts',
                  type: 'file',
                },
                {
                  name: 'old.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'app',
              type: 'directory',
              children: [
                {
                  name: 'expected.ts',
                  type: 'file',
                },
                {
                  name: 'new.ts',
                  type: 'file',
                },
                {
                  name: 'old.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'delete-comment',
              type: 'directory',
              children: [
                {
                  name: 'expected.ts',
                  type: 'file',
                },
                {
                  name: 'new.ts',
                  type: 'file',
                },
                {
                  name: 'old.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'duplicate-imports',
              type: 'directory',
              children: [
                {
                  name: 'expected.ts',
                  type: 'file',
                },
                {
                  name: 'new.ts',
                  type: 'file',
                },
                {
                  name: 'old.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'existing-comments',
              type: 'directory',
              children: [
                {
                  name: 'expected.ts',
                  type: 'file',
                },
                {
                  name: 'new.ts',
                  type: 'file',
                },
                {
                  name: 'old.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'graph',
              type: 'directory',
              children: [
                {
                  name: 'expected.ts',
                  type: 'file',
                },
                {
                  name: 'new.ts',
                  type: 'file',
                },
                {
                  name: 'old.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'hallucinated',
              type: 'directory',
              children: [
                {
                  name: 'expected.ts',
                  type: 'file',
                },
                {
                  name: 'new.ts',
                  type: 'file',
                },
                {
                  name: 'old.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'indentation',
              type: 'directory',
              children: [
                {
                  name: 'expected.ts',
                  type: 'file',
                },
                {
                  name: 'new.ts',
                  type: 'file',
                },
                {
                  name: 'old.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'knowledge-files',
              type: 'directory',
              children: [
                {
                  name: 'cache-expiration.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'many-updates',
              type: 'directory',
              children: [
                {
                  name: 'expected.ts',
                  type: 'file',
                },
                {
                  name: 'new.ts',
                  type: 'file',
                },
                {
                  name: 'old.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'missing-line-actions',
              type: 'directory',
              children: [
                {
                  name: 'expected.ts',
                  type: 'file',
                },
                {
                  name: 'new.ts',
                  type: 'file',
                },
                {
                  name: 'old.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'schema',
              type: 'directory',
              children: [
                {
                  name: 'expected.ts',
                  type: 'file',
                },
                {
                  name: 'new.ts',
                  type: 'file',
                },
                {
                  name: 'old.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'simple',
              type: 'directory',
              children: [
                {
                  name: 'expected.ts',
                  type: 'file',
                },
                {
                  name: 'new.ts',
                  type: 'file',
                },
                {
                  name: 'old.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'system-prompt',
              type: 'directory',
              children: [
                {
                  name: 'expected.ts',
                  type: 'file',
                },
                {
                  name: 'new.ts',
                  type: 'file',
                },
                {
                  name: 'old.ts',
                  type: 'file',
                },
              ],
            },
          ],
        },
        {
          name: '__src__',
          type: 'directory',
          children: [
            {
              name: 'diff-prompt.test.ts',
              type: 'file',
            },
            {
              name: 'generate-knowledge-files.test.ts',
              type: 'file',
            },
            {
              name: 'generate-patch.test.ts',
              type: 'file',
            },
            {
              name: 'main-prompt.test.ts',
              type: 'file',
            },
            {
              name: 'manifold-project.test.ts',
              type: 'file',
            },
            {
              name: 'patch.test.ts',
              type: 'file',
            },
            {
              name: 'process-stream.test.ts',
              type: 'file',
            },
            {
              name: 'score-tests.ts',
              type: 'file',
            },
            {
              name: 'setup.ts',
              type: 'file',
            },
          ],
        },
        {
          name: 'bunfig.toml',
          type: 'file',
        },
        {
          name: 'package.json',
          type: 'file',
        },
        {
          name: 'tsconfig.json',
          type: 'file',
        },
      ],
    },
    {
      name: 'todo.knowledge.md',
      type: 'file',
    },
    {
      name: 'tsconfig.json',
      type: 'file',
    },
  ],
  fileTokenScores: {
    '.gitignore': {},
    '.manicodeignore': {},
    '.prettierrc': {},
    'README.md': {},
    'authentication_and_billing.knowledge.md': {},
    'backend/.dockerignore': {},
    'backend/.env.example': {},
    'backend/.gitignore': {},
    'backend/Dockerfile': {},
    'backend/deploy.sh': {},
    'backend/jest.config.js': {},
    'backend/jest.setup.js': {},
    'backend/knowledge.md': {},
    'backend/package.json': {},
    'backend/src/claude.ts': {
      models: 1.2756477605939975,
      promptClaudeStream: 3.044071057880673,
      promptClaude: 3.328723629405636,
      promptClaudeWithContinuation: 1.2756477605939975,
    },
    'backend/src/constants.ts': {
      RATE_LIMIT_POLICY: 0.14829104003789312,
    },
    'backend/src/generate-diffs-prompt.ts': {
      generateExpandedFileWithDiffBlocks: 4.987981645339687,
      generateDiffBlocks: 2.9459823118803516,
    },
    'backend/src/generate-diffs-via-expansion.ts': {
      expandNewContent: 3.9485535176648794,
    },
    'backend/src/generate-knowledge-files.ts': {
      generateKnowledgeFiles: 3.2040556851884627,
    },
    'backend/src/generate-patch.ts': {
      generatePatch: 3.260551418852098,
    },
    'backend/src/index.ts': {},
    'backend/src/main-prompt.ts': {
      mainPrompt: 2.919429342306116,
      getRelevantFileInfoMessage: 1.7242619990901342,
      updateFileContext: 1.7242619990901342,
      processFileBlock: 3.6185574201739965,
    },
    'backend/src/openai-api.ts': {
      promptOpenAI: 3.0702795580141005,
      promptOpenAIWithContinuation: 3.0702795580141005,
    },
    'backend/src/process-stream.ts': {},
    'backend/src/request-files-prompt.ts': {
      requestRelevantFiles: 3.9212536839853986,
      getRelevantFiles: 1.3310839386064968,
      topLevelDirectories: 1.3310839386064968,
      getExampleFileList: 1.3310839386064968,
      generateNonObviousRequestFilesPrompt: 1.3310839386064968,
      generateKeyRequestFilesPrompt: 1.3310839386064968,
    },
    'backend/src/system-prompt.ts': {
      getSearchSystemPrompt: 4.773914318612662,
      getAgentSystemPrompt: 3.3872349113713067,
      knowledgeFilesPrompt: 2.000555504129951,
      getRelevantFilesPrompt: 3.3872349113713067,
    },
    'backend/src/tools.ts': {
      getTools: 2.6053777856571236,
      DEFAULT_TOOLS: 0.9984440607850333,
    },
    'backend/src/util/debug.ts': {
      DEBUG_MODE: 0.3656509454897687,
      debugLog: 1.8687958607139188,
      clearDebugLog: 0.3656509454897687,
    },
    'backend/src/util/token-counter.ts': {
      countTokens: 1.2968841558128552,
      countTokensForFiles: 0.786534719817593,
    },
    'backend/src/websockets/server.ts': {
      MessageParseError: 0.7167229817000064,
      serializeError: 0.7167229817000064,
      parseMessage: 0.7167229817000064,
      processMessage: 0.7167229817000064,
      listen: 0.7167229817000064,
      sendMessage: 1.2135174957078831,
    },
    'backend/src/websockets/switchboard.ts': {
      Switchboard: 0.635184087735273,
      getClient: 0.3751499544919713,
      getAll: 0.3751499544919713,
      getSubscribers: 0.3751499544919713,
      connect: 0.3751499544919713,
      disconnect: 0.3751499544919713,
      markSeen: 0.3751499544919713,
      identify: 0.3751499544919713,
      deidentify: 0.3751499544919713,
      subscribe: 0.3751499544919713,
      unsubscribe: 1.337390589217878,
    },
    'backend/src/websockets/websocket-action.ts': {
      subscribeToAction: 1.0610843071323905,
      onWebsocketAction: 1.7965719029576102,
      requestFiles: 2.53205949878283,
      requestFile: 2.53205949878283,
    },
    'backend/tsconfig.json': {},
    'bun.lockb': {},
    'common/package.json': {},
    'common/src/actions.ts': {
      FileChangeSchema: 0.8550878507329176,
      CHANGES: 0.8550878507329176,
      ToolCallSchema: 0.8550878507329176,
      CLIENT_ACTIONS: 0.8550878507329176,
      CLIENT_ACTION_SCHEMA: 0.8550878507329176,
      SERVER_ACTIONS: 0.8550878507329176,
      SERVER_ACTION_SCHEMA: 0.8550878507329176,
    },
    'common/src/codemap/languages.ts': {
      getLanguageConfig: 2.761147870196878,
    },
    'common/src/codemap/parse.ts': {
      DEBUG_PARSING: 0.8354986189350809,
      getFileTokenScores: 1.7533876688623948,
      parseTokens: 0.8354986189350809,
      parseFile: 0.8354986189350809,
    },
    'common/src/codemap/test-langs/test.c': {
      Greeter: 0.3287649480356627,
      create_greeter: 0.3287649480356627,
      greet: 0.3287649480356627,
      free_greeter: 0.3287649480356627,
      print_greeting: 0.5566474448335192,
      main: 0.3287649480356627,
    },
    'common/src/codemap/test-langs/test.cpp': {
      greet: 0.29580146559145953,
      Greeting: 0.29580146559145953,
      printGreeting: 0.29580146559145953,
      main: 0.29580146559145953,
    },
    'common/src/codemap/test-langs/test.cs': {
      IGreeter: 0.29580146559145953,
      Greet: 0.29580146559145953,
      Greeting: 0.29580146559145953,
      PrintGreeting: 0.29580146559145953,
      Main: 0.29580146559145953,
    },
    'common/src/codemap/test-langs/test.go': {
      Greeter: 0.1659862434495759,
      string: 0.1659862434495759,
      Greeting: 0.1659862434495759,
      Greet: 0.1659862434495759,
      PrintGreeting: 0.1659862434495759,
      main: 0.1659862434495759,
    },
    'common/src/codemap/test-langs/test.java': {
      Greeter: 0.28245008504511326,
      greet: 0.28245008504511326,
      Greeting: 0.28245008504511326,
      printGreeting: 0.28245008504511326,
      main: 0.28245008504511326,
    },
    'common/src/codemap/test-langs/test.js': {
      greet: 0.3587119667194399,
      Greeting: 0.3587119667194399,
      printGreeting: 0.3587119667194399,
      createGreeter: 0.3587119667194399,
    },
    'common/src/codemap/test-langs/test.php': {
      greet: 0.29580146559145953,
      Greeting: 0.29580146559145953,
      __construct: 0.29580146559145953,
      printGreeting: 0.29580146559145953,
      createGreeter: 0.29580146559145953,
    },
    'common/src/codemap/test-langs/test.py': {
      Greeter: 0.2536476641600791,
      greet: 0.2536476641600791,
      Greeting: 0.2536476641600791,
      print_greeting: 0.42946282742825387,
    },
    'common/src/codemap/test-langs/test.rb': {
      Greeter: 0.25109837670360796,
      greet: 0.25109837670360796,
      prefix: 0.25109837670360796,
      Greeting: 0.25109837670360796,
      initialize: 0.25109837670360796,
      print_greeting: 0.4251465085588929,
    },
    'common/src/codemap/test-langs/test.rs': {
      Greeter: 0.28994343076581225,
      Greeting: 0.28994343076581225,
      new: 0.6084788468237248,
      greet: 0.28994343076581225,
      main: 0.28994343076581225,
    },
    'common/src/codemap/test-langs/test.ts': {
      Greeting: 0.3050809602367711,
      greet: 0.3050809602367711,
      printGreeting: 0.3050809602367711,
      createGreeter: 0.3050809602367711,
    },
    'common/src/codemap/tree-sitter-queries/readme.md': {},
    'common/src/codemap/tree-sitter-queries/tree-sitter-c-tags.scm': {},
    'common/src/codemap/tree-sitter-queries/tree-sitter-c_sharp-tags.scm': {},
    'common/src/codemap/tree-sitter-queries/tree-sitter-cpp-tags.scm': {},
    'common/src/codemap/tree-sitter-queries/tree-sitter-go-tags.scm': {},
    'common/src/codemap/tree-sitter-queries/tree-sitter-java-tags.scm': {},
    'common/src/codemap/tree-sitter-queries/tree-sitter-javascript-tags.scm':
      {},
    'common/src/codemap/tree-sitter-queries/tree-sitter-php-tags.scm': {},
    'common/src/codemap/tree-sitter-queries/tree-sitter-python-tags.scm': {},
    'common/src/codemap/tree-sitter-queries/tree-sitter-ruby-tags.scm': {},
    'common/src/codemap/tree-sitter-queries/tree-sitter-rust-tags.scm': {},
    'common/src/codemap/tree-sitter-queries/tree-sitter-typescript-tags.scm':
      {},
    'common/src/codemap/tree-sitter.d.ts': {},
    'common/src/constants.ts': {
      STOP_MARKER: 0.695546631234341,
      SKIPPED_TERMINAL_COMMANDS: 0.695546631234341,
    },
    'common/src/project-file-tree.ts': {
      getProjectFileTree: 1.8463688069343935,
      buildTree: 0.8798046294230922,
      parseGitignore: 0.8798046294230922,
      getAllFilePaths: 2.2957955555516514,
    },
    'common/src/util/array.ts': {
      filterDefined: 0.4670579267615085,
      buildArray: 1.2187586613943497,
      groupConsecutive: 0.4670579267615085,
    },
    'common/src/util/changes.ts': {
      applyChanges: 2.4044067558037523,
      applyAndRevertChanges: 1.3819208032579984,
    },
    'common/src/util/file.ts': {
      FileTreeNodeSchema: 0.5564373049874729,
      ProjectFileContextSchema: 0.5564373049874729,
      createFileBlock: 2.580525944365354,
      createFileBlockWithoutPath: 0.5564373049874729,
      fileRegex: 0.5564373049874729,
      fileWithNoPathRegex: 0.5564373049874729,
      parseFileBlocks: 1.4519885995269681,
      parseFileBlocksWithoutPath: 0.5564373049874729,
      printFileTree: 0.9421302540979142,
      printFileTreeWithTokens: 1.1677461661200754,
    },
    'common/src/util/object.ts': {
      removeUndefinedProps: 1.0109874830039345,
      removeNullOrUndefinedProps: 0.5971054936107728,
      addObjects: 0.5971054936107728,
      subtractObjects: 0.5971054936107728,
      hasChanges: 0.5971054936107728,
      hasSignificantDeepChanges: 0.5971054936107728,
      filterObject: 1.2530929265228052,
      assert: 0.5971054936107728,
    },
    'common/src/util/patch.ts': {
      applyPatch: 5.78969920740265,
    },
    'common/src/util/promise.ts': {
      mapAsync: 1.1183569906194901,
    },
    'common/src/websockets/websocket-client.ts': {
      formatState: 0.711796992181887,
      APIRealtimeClient: 2.275774837477926,
      state: 0.711796992181887,
      close: 0.711796992181887,
      connect: 0.711796992181887,
      waitAndReconnect: 0.711796992181887,
      receiveMessage: 0.711796992181887,
      sendMessage: 1.2051770704438114,
      sendAction: 2.275774837477926,
      identify: 0.711796992181887,
      subscribe: 0.711796992181887,
    },
    'common/src/websockets/websocket-schema.ts': {
      CLIENT_MESSAGE_SCHEMAS: 0.5955320903657728,
      CLIENT_MESSAGE_SCHEMA: 0.5955320903657728,
      SERVER_MESSAGE_SCHEMAS: 0.5955320903657728,
      SERVER_MESSAGE_SCHEMA: 0.5955320903657728,
    },
    'common/tsconfig.json': {},
    'exported-tokens.json': {},
    'knowledge.md': {},
    'musings.knowledge.md': {},
    'npm-app/README.md': {},
    'npm-app/clean-package.js': {},
    'npm-app/knowledge.md': {},
    'npm-app/package.json': {},
    'npm-app/src/chat-storage.ts': {
      ChatStorage: 1.7717634180723674,
      ensureDirectoryExists: 0.6346404257248834,
      getFilePath: 0.6346404257248834,
      createChat: 0.6346404257248834,
      getChat: 0.6346404257248834,
      addMessage: 0.6346404257248834,
      deleteChat: 0.6346404257248834,
      listChats: 0.6346404257248834,
      saveChat: 0.6346404257248834,
      generateChatId: 0.6346404257248834,
      getCurrentChat: 0.6346404257248834,
      setCurrentChat: 0.6346404257248834,
      getCurrentVersion: 0.6346404257248834,
      navigateVersion: 0.6346404257248834,
      saveFilesChanged: 0.6346404257248834,
      saveCurrentFileState: 0.6346404257248834,
      addNewFileState: 0.6346404257248834,
    },
    'npm-app/src/cli.ts': {
      CLI: 1.4931982040990786,
      onWebSocketError: 0.8819069134942297,
      detectPasting: 0.8819069134942297,
      handleInput: 0.8819069134942297,
      setPrompt: 0.8819069134942297,
      printInitialPrompt: 0.8819069134942297,
      handleUndo: 0.8819069134942297,
      handleRedo: 0.8819069134942297,
      navigateFileVersion: 0.8819069134942297,
      handleStopResponse: 0.8819069134942297,
      handleExit: 0.8819069134942297,
      handleEscKey: 0.8819069134942297,
      applyAndDisplayCurrentFileVersion: 0.8819069134942297,
      startLoadingAnimation: 0.8819069134942297,
      stopLoadingAnimation: 0.8819069134942297,
      handleUserInput: 2.9125726259144327,
      sendUserInputAndAwaitResponse: 0.8819069134942297,
    },
    'npm-app/src/client.ts': {
      Client: 1.9412412267183203,
      connect: 1.1465283402452509,
      setupSubscriptions: 1.1465283402452509,
      checkNpmVersion: 1.1465283402452509,
      sendUserInput: 1.1465283402452509,
      subscribeToResponse: 1.1465283402452509,
      warmContextCache: 1.1465283402452509,
    },
    'npm-app/src/config.ts': {
      websocketUrl: 0.3632373815194687,
      fingerprintId: 0.3632373815194687,
      initFingerprint: 0.6150143483936656,
    },
    'npm-app/src/fingerprint.ts': {
      FINGERPRINTING_INFO: 0.9378748862299282,
      calculateFingerprint: 1.5879602193381825,
    },
    'npm-app/src/index.ts': {
      manicode: 1.109708530700346,
    },
    'npm-app/src/manifold-api.ts': {
      searchManifoldMarkets: 1.4854007711474697,
    },
    'npm-app/src/menu.ts': {
      displayMenu: 5.233094699354542,
    },
    'npm-app/src/project-files.ts': {
      initProjectRoot: 1.6271750185860758,
      getCurrentWorkingDirectory: 2.2933142587893487,
      setCurrentWorkingDirectory: 1.6271750185860758,
      getCurrentDirectory: 0.9610357783828033,
      getProjectRoot: 2.507763195317703,
      getProjectFileContext: 3.563568911298773,
      getGitChanges: 0.9610357783828033,
      getChangesSinceLastFileVersion: 1.6271750185860758,
      getFiles: 3.072647210344943,
      getExistingFiles: 2.2933142587893487,
      getExistingFilesWithScrapedContent: 0.9610357783828033,
      setFiles: 1.6271750185860758,
      getFileBlocks: 2.6829807345671455,
      deleteFile: 0.9610357783828033,
    },
    'npm-app/src/tool-handlers.ts': {
      handleUpdateFileContext: 0.9740233373390015,
      handleScrapeWebPage: 0.9740233373390015,
      handleSearchManifoldMarkets: 0.9740233373390015,
      handleRunTerminalCommand: 1.649164867415119,
      formatResult: 0.9740233373390015,
      toolHandlers: 0.9740233373390015,
    },
    'npm-app/src/web-scraper.ts': {
      scrapeWebPage: 1.57151023163337,
      parseUrlsFromContent: 1.57151023163337,
      getScrapedContentBlocks: 1.57151023163337,
    },
    'npm-app/tsconfig.json': {},
    'package.json': {},
    'python-app/LICENSE': {},
    'python-app/README.md': {},
    'python-app/knowledge.md': {},
    'python-app/pyproject.toml': {},
    'python-app/src/manicode/__init__.py': {
      main: 0.31387297087950994,
    },
    'python-app/src/manicode/__pycache__/__init__.cpython-39.pyc': {},
    'python-app/src/manicode.egg-info/PKG-INFO': {},
    'python-app/src/manicode.egg-info/SOURCES.txt': {},
    'python-app/src/manicode.egg-info/dependency_links.txt': {},
    'python-app/src/manicode.egg-info/entry_points.txt': {},
    'python-app/src/manicode.egg-info/top_level.txt': {},
    'scripts/bump-version.ts': {
      incrementVersion: 0.8889735555481955,
    },
    'scripts/bun.lockb': {},
    'scripts/generate-fine-tuning-dataset.ts': {
      saveProgress: 1.9541851224744737,
      loadProgress: 1.9541851224744737,
      generateClaudeSketch: 1.9541851224744737,
      createDataset: 1.9541851224744737,
      createTrainingAndValidationDatasets: 1.9541851224744737,
      main: 1.9541851224744737,
    },
    'scripts/package.json': {},
    'scripts/tsconfig.json': {},
    'start-dev.sh': {},
    'test/__mock-data__/actions/expected.ts': {
      CHANGES: 0.6372818690991596,
      ToolCallSchema: 0.6372818690991596,
      CLIENT_ACTIONS: 0.6372818690991596,
      CLIENT_ACTION_SCHEMA: 0.6372818690991596,
      SERVER_ACTIONS: 0.6372818690991596,
      SERVER_ACTION_SCHEMA: 0.6372818690991596,
    },
    'test/__mock-data__/actions/new.ts': {
      CLIENT_ACTIONS: 0.7183574718083399,
      SERVER_ACTIONS: 0.7183574718083399,
    },
    'test/__mock-data__/actions/old.ts': {
      CHANGES: 0.6341191604001978,
      ToolCallSchema: 0.6341191604001978,
      CLIENT_ACTIONS: 0.6341191604001978,
      CLIENT_ACTION_SCHEMA: 0.6341191604001978,
      SERVER_ACTIONS: 0.6341191604001978,
      SERVER_ACTION_SCHEMA: 0.6341191604001978,
    },
    'test/__mock-data__/app/expected.ts': {
      cacheController: 2.206698234261847,
      app: 2.206698234261847,
    },
    'test/__mock-data__/app/new.ts': {},
    'test/__mock-data__/app/old.ts': {
      cacheController: 2.202442303136901,
      app: 2.202442303136901,
    },
    'test/__mock-data__/delete-comment/expected.ts': {
      deleteComment: 0.3934605916618092,
    },
    'test/__mock-data__/delete-comment/new.ts': {
      deleteComment: 0.3934605916618092,
    },
    'test/__mock-data__/delete-comment/old.ts': {
      deleteComment: 0.517108526206176,
    },
    'test/__mock-data__/duplicate-imports/expected.ts': {
      searchManifoldMarkets: 1.1625777672033408,
      getTools: 1.7917370307347458,
      executeToolCall: 0.6866371574495145,
    },
    'test/__mock-data__/duplicate-imports/new.ts': {
      searchManifoldMarkets: 1.1625777672033408,
      getTools: 1.7917370307347458,
      executeToolCall: 0.6866371574495145,
    },
    'test/__mock-data__/duplicate-imports/old.ts': {
      getTools: 1.3493625931253181,
    },
    'test/__mock-data__/existing-comments/expected.ts': {
      manicode: 1.6092140273245312,
      promptUser: 4.199144092121396,
      sendUserInputAndAwaitResponse: 1.6092140273245312,
    },
    'test/__mock-data__/existing-comments/new.ts': {},
    'test/__mock-data__/existing-comments/old.ts': {
      manicode: 1.6266114413344601,
      promptUser: 4.244541563817217,
      sendUserInputAndAwaitResponse: 1.6266114413344601,
    },
    'test/__mock-data__/graph/expected.ts': {
      loadGraphData: 0.7459586966016832,
      createD3Graph: 0.7459586966016832,
      ticked: 0.7459586966016832,
      drawLink: 0.7459586966016832,
      drawNode: 0.7459586966016832,
      drawLabel: 0.7459586966016832,
      zoomed: 0.7459586966016832,
      highlightNodes: 0.7459586966016832,
      setSelectedNode: 0.7459586966016832,
      resetGraph: 0.7459586966016832,
      zoomToNode: 0.7459586966016832,
      findNodeAtPosition: 0.7459586966016832,
    },
    'test/__mock-data__/graph/new.ts': {
      loadGraphData: 0.7459586966016832,
      createD3Graph: 0.7459586966016832,
      ticked: 0.7459586966016832,
      drawLink: 0.7459586966016832,
      drawNode: 0.7459586966016832,
      drawLabel: 0.7459586966016832,
      zoomed: 0.7459586966016832,
      highlightNodes: 0.7459586966016832,
      setSelectedNode: 0.7459586966016832,
      resetGraph: 0.7459586966016832,
      zoomToNode: 0.7459586966016832,
      findNodeAtPosition: 0.7459586966016832,
    },
    'test/__mock-data__/graph/old.ts': {
      loadGraphData: 0.8192738002941923,
      createD3Graph: 0.8192738002941923,
      ticked: 0.8192738002941923,
      highlightNodes: 0.8192738002941923,
      setSelectedNode: 0.8192738002941923,
      resetGraph: 0.8192738002941923,
      zoomToNode: 0.8192738002941923,
      resetZoom: 0.8192738002941923,
      drag: 0.8192738002941923,
      dragstarted: 0.8192738002941923,
      dragged: 0.8192738002941923,
      dragended: 0.8192738002941923,
    },
    'test/__mock-data__/hallucinated/expected.ts': {
      processChunk: 1.0817262541406476,
      streamResponse: 1.0817262541406476,
      mainPrompt: 1.8315217573359084,
      getRelevantFileInfoMessage: 1.0817262541406476,
      updateFileContext: 1.0817262541406476,
      processFileBlock: 2.2701240099144857,
    },
    'test/__mock-data__/hallucinated/new.ts': {
      processChunk: 0.6126173103557732,
      streamResponse: 0.6126173103557732,
    },
    'test/__mock-data__/hallucinated/old.ts': {
      mainPrompt: 2.020644281450439,
      getRelevantFileInfoMessage: 1.1934250634857309,
      updateFileContext: 1.1934250634857309,
      processFileBlock: 2.5045365038356735,
    },
    'test/__mock-data__/indentation/expected.ts': {
      manicode: 1.6113989760936935,
      promptUser: 4.204845580276375,
      sendUserInputAndAwaitResponse: 1.6113989760936935,
    },
    'test/__mock-data__/indentation/new.ts': {},
    'test/__mock-data__/indentation/old.ts': {
      manicode: 1.5960415217754953,
      promptUser: 4.164771256739994,
      sendUserInputAndAwaitResponse: 1.5960415217754953,
    },
    'test/__mock-data__/knowledge-files/cache-expiration.ts': {
      mockFileContext: 3.3773915128689693,
      messages: 3.3773915128689693,
      expectedFiles: 3.3773915128689693,
    },
    'test/__mock-data__/many-updates/expected.ts': {
      ChatClient: 0.7061252126127833,
      connect: 0.7061252126127833,
      setupSubscriptions: 0.7061252126127833,
      sendUserInput: 0.7061252126127833,
      subscribeToResponse: 0.7061252126127833,
    },
    'test/__mock-data__/many-updates/new.ts': {
      ChatClient: 0.7061252126127833,
      connect: 0.7061252126127833,
      setupSubscriptions: 0.7061252126127833,
      sendUserInput: 0.7061252126127833,
      subscribeToResponse: 0.7061252126127833,
    },
    'test/__mock-data__/many-updates/old.ts': {
      ChatClient: 0.6757329074564218,
      connect: 0.6757329074564218,
      setupSubscriptions: 0.6757329074564218,
      sendUserInput: 0.6757329074564218,
      subscribeToResponse: 0.6757329074564218,
      handleReadFiles: 0.6757329074564218,
      handleScrapeWebPage: 0.6757329074564218,
    },
    'test/__mock-data__/missing-line-actions/expected.ts': {
      CHANGES: 0.6710886400000003,
      ToolCallSchema: 0.6710886400000003,
      CLIENT_ACTIONS: 0.6710886400000003,
      CLIENT_ACTION_SCHEMA: 0.6710886400000003,
      SERVER_ACTIONS: 0.6710886400000003,
      SERVER_ACTION_SCHEMA: 0.6710886400000003,
    },
    'test/__mock-data__/missing-line-actions/new.ts': {
      CLIENT_ACTIONS: 0.43749626759921767,
      CLIENT_ACTION_SCHEMA: 0.43749626759921767,
      SERVER_ACTIONS: 0.43749626759921767,
      SERVER_ACTION_SCHEMA: 0.43749626759921767,
    },
    'test/__mock-data__/missing-line-actions/old.ts': {
      CHANGES: 0.6372818690991596,
      ToolCallSchema: 0.6372818690991596,
      CLIENT_ACTIONS: 0.6372818690991596,
      CLIENT_ACTION_SCHEMA: 0.6372818690991596,
      SERVER_ACTIONS: 0.6372818690991596,
      SERVER_ACTION_SCHEMA: 0.6372818690991596,
    },
    'test/__mock-data__/schema/expected.ts': {
      DEFAULT_CACHE_STRATEGY: 3.7739414173459567,
      API: 3.7739414173459567,
    },
    'test/__mock-data__/schema/new.ts': {},
    'test/__mock-data__/schema/old.ts': {
      DEFAULT_CACHE_STRATEGY: 3.7627372122626386,
      API: 3.7627372122626386,
    },
    'test/__mock-data__/simple/expected.ts': {},
    'test/__mock-data__/simple/new.ts': {},
    'test/__mock-data__/simple/old.ts': {},
    'test/__mock-data__/system-prompt/expected.ts': {
      getSystemPrompt: 2.977180243984713,
    },
    'test/__mock-data__/system-prompt/new.ts': {},
    'test/__mock-data__/system-prompt/old.ts': {
      getSystemPrompt: 2.977180243984713,
    },
    'test/__src__/diff-prompt.test.ts': {},
    'test/__src__/generate-knowledge-files.test.ts': {},
    'test/__src__/generate-patch.test.ts': {},
    'test/__src__/main-prompt.test.ts': {},
    'test/__src__/manifold-project.test.ts': {
      readMockFile: 1.5339344456138408,
      getProjectFileContext: 5.68790592953601,
      runMainPrompt: 1.5339344456138408,
      extractErrorFiles: 1.5339344456138408,
      runTerminalCommand: 1.5339344456138408,
    },
    'test/__src__/patch.test.ts': {},
    'test/__src__/process-stream.test.ts': {},
    'test/__src__/score-tests.ts': {
      projectTest: 2.1156255205744725,
    },
    'test/__src__/setup.ts': {},
    'test/bunfig.toml': {},
    'test/package.json': {},
    'test/tsconfig.json': {},
    'todo.knowledge.md': {},
    'tsconfig.json': {},
  },
  knowledgeFiles: {
    'authentication_and_billing.knowledge.md':
      '# Authentication and Billing System for Manicode\n\n## Overview\n\nThis document outlines the planned features and implementation strategy for adding authentication, database integration, and billing features to the Manicode project.\n\n## Planned Features\n\n1. Authentication for the console app\n2. Database integration (PostgreSQL)\n3. OAuth integration (Google and GitHub)\n4. Referral system\n5. Stripe integration for billing\n6. Usage tracking and limits\n\n## Implementation Details\n\n### 1. Authentication for Console App\n\n- Implement user authentication in the console application\n- Store user credentials securely in the database\n- Provide login/logout functionality\n\n### 2. Database Integration (PostgreSQL)\n\n- Set up a PostgreSQL database on the server\n- Create tables for user information, referrals, and usage data\n- Implement database connection and query functions in the backend\n\n### 3. OAuth Integration (Google and GitHub)\n\n- Implement OAuth flow for Google and GitHub\n- Create a simple web interface for OAuth redirection\n- Handle OAuth callback and token storage\n\n### 4. Referral System\n\n- Generate unique referral links for users\n- Track referrals and associate them with user accounts\n- Implement a system to award credits based on successful referrals ($10 per referral)\n\n### 5. Stripe Integration for Billing\n\n- Set up Stripe account and integrate Stripe API\n- Implement payment processing for paid plans\n- Store billing information securely\n\n### 6. Usage Tracking and Limits\n\n- Implement a system to track user usage (e.g., API calls, processing time)\n- Enforce usage limits based on user plan (e.g., $10 of credits for free tier)\n- Notify users when approaching usage limits\n- Implement automatic plan upgrades or service suspension when limits are reached\n\n## Implementation Plan\n\n1. Set up PostgreSQL database\n   - Create database schema\n   - Implement database connection in the backend\n\n2. Implement basic authentication for console app\n   - Create user registration and login functionality\n   - Store user credentials securely in the database\n\n3. Develop simple web interface for OAuth\n   - Set up a basic web server\n   - Create login page with Google and GitHub options\n\n4. Implement OAuth flow\n   - Handle OAuth redirects and callbacks\n   - Store OAuth tokens securely\n\n5. Integrate OAuth with console app\n   - Implement browser redirection from console app\n   - Handle OAuth token retrieval and storage\n\n6. Develop referral system\n   - Generate and store referral links\n   - Track referrals and associate with user accounts\n\n7. Implement usage tracking\n   - Create system to log and calculate user usage\n   - Store usage data in the database\n\n8. Integrate Stripe for billing\n   - Set up Stripe account and API integration\n   - Implement payment processing for paid plans\n\n9. Enforce usage limits\n   - Implement checks for usage limits\n   - Create notification system for approaching limits\n   - Develop automatic plan upgrades or service suspension\n\n10. Refine and test the entire system\n    - Conduct thorough testing of all components\n    - Optimize performance and security\n\n## Considerations\n\n- Security: Ensure all user data, especially authentication and billing information, is encrypted and stored securely.\n- Scalability: Design the database and backend to handle a growing number of users and increased usage.\n- User Experience: Make the authentication process as smooth as possible, especially when redirecting to the browser for OAuth.\n- Error Handling: Implement robust error handling and provide clear feedback to users.\n- Documentation: Keep documentation up-to-date as new features are implemented.\n\n',
    'backend/knowledge.md':
      "# Manicode Backend\n\nThis document provides an overview of the Manicode backend architecture, key components, and important concepts.\n\n## Table of Contents\n\n1. [Architecture Overview](#architecture-overview)\n2. [Key Technologies](#key-technologies)\n3. [Main Components](#main-components)\n4. [WebSocket Communication](#websocket-communication)\n5. [Claude Integration](#claude-integration)\n6. [File Management](#file-management)\n7. [Tool Handling](#tool-handling)\n8. [Error Handling and Debugging](#error-handling-and-debugging)\n9. [Build and Deployment](#build-and-deployment)\n10. [Security Considerations](#security-considerations)\n11. [TODO List](#todo-list)\n12. [Automatic URL Detection and Scraping](#automatic-url-detection-and-scraping)\n\n## Architecture Overview\n\nThe Manicode backend is built on Node.js using TypeScript. It uses an Express server for HTTP requests and a WebSocket server for real-time communication with clients. The backend integrates with the Claude AI model to process user inputs and generate code changes.\n\n## Key Technologies\n\n- **TypeScript**: The primary language used for backend development.\n- **Node.js**: The runtime environment for executing the backend server.\n- **Express**: Web application framework for handling HTTP requests.\n- **WebSocket (ws)**: Library for real-time, bidirectional communication between client and server.\n- **Anthropic AI SDK**: Used for integrating with the Claude AI model.\n\n## Main Components\n\n1. **Express Server (index.ts)**: The main entry point for the backend application. It sets up the Express server and initializes the WebSocket server.\n\n2. **WebSocket Server (websockets/server.ts)**: Handles real-time communication with clients. It manages connections, message parsing, and routing of WebSocket messages.\n\n3. **Claude Integration (claude.ts)**: Provides functions for interacting with the Claude AI model, including streaming responses and handling tool calls.\n\n4. **Main Prompt Handler (main-prompt.ts)**: Processes user inputs, generates responses, and manages file changes and tool calls.\n\n5. **System Prompt Generator (system-prompt.ts)**: Creates the initial prompt for the AI assistant with project-specific context and instructions.\n\n6. **File Diff Generation (generate-diffs-prompt.ts, generate-diffs-via-expansion.ts)**: Generates diffs for file changes and handles expansion of shortened file content.\n\n7. **Relevant File Request (request-files-prompt.ts)**: Determines which files are relevant for a given user request.\n\n8. **Tools Definition (tools.ts)**: Defines the available tools that can be used by the AI assistant.\n\n## WebSocket Communication\n\nThe backend uses WebSockets for real-time, bidirectional communication with clients. Key concepts include:\n\n- **Message Types**: Various message types (e.g., 'identify', 'subscribe', 'action') for different operations.\n- **Action Handling**: The `websocket-action.ts` file processes incoming action messages and triggers appropriate responses.\n- **Subscription Management**: Clients can subscribe to specific topics for targeted updates.\n\n## Claude Integration\n\nThe backend integrates with the Claude AI model to process user inputs and generate code changes. Important aspects include:\n\n- **Streaming Responses**: Responses from Claude are streamed in real-time to the client.\n- **Tool Calls**: The AI can make tool calls (e.g., reading files) during its processing.\n- **File Change Management**: The backend processes AI-suggested file changes and applies them to the project.\n\n## File Management\n\nThe backend handles file operations for the Manicode project:\n\n- **Reading Files**: The `read_files` tool allows the AI to access project file contents.\n- **Applying Changes**: The `applyChanges` function in `prompts.ts` processes and applies file modifications suggested by the AI.\n\n## Development Guidelines\n\n1. **Type Safety**: Utilize TypeScript's type system to ensure code reliability and catch errors early.\n2. **Error Handling**: Implement proper error handling and logging throughout the application.\n3. **Code Organization**: Keep related functionality grouped in appropriate modules and files.\n4. **Documentation**: Maintain clear and up-to-date documentation, including this knowledge file.\n5. **Testing**: Implement unit tests for critical components and functions.\n6. **Environment Variables**: Use environment variables for configuration and sensitive information.\n7. **Code Style**: Follow consistent coding style and use tools like Prettier for formatting.\n\n## Web Scraping\n\nThe backend now includes a web scraping tool that allows the AI assistant to retrieve content from external web pages. This functionality is useful for gathering information from documentation, APIs, or other web-based resources.\n\n- **Tool Name**: `scrape_web_page`\n- **Input**: A URL of the web page to scrape\n- **Output**: The content of the scraped web page\n\n## Tool Handling\n\nThe backend implements a tool handling system that allows the AI assistant to perform various actions:\n\n1. **Tool Definition**: Tools are defined in `tools.ts`, specifying their name, description, and input schema.\n2. **Available Tools**: Current tools include read_files, scrape_web_page, search_manifold_markets, and run_terminal_command.\n3. **Tool Execution**: When the AI makes a tool call, the backend processes it and provides the results back to the AI.\n\n## Error Handling and Debugging\n\n1. **Logging**: The `debug.ts` file provides logging functionality for debugging purposes.\n2. **Error Catching**: WebSocket errors are caught and logged in both server and client code.\n3. **Graceful Degradation**: The system attempts to handle errors gracefully, providing meaningful error messages when possible.\n\n## Build and Deployment\n\n1. **Build Process**: The backend uses TypeScript compilation to build the project.\n2. **Docker Support**: A Dockerfile is provided for containerization of the backend.\n3. **Deployment Script**: The `deploy.sh` script automates the build and deployment process to Google Cloud Platform.\n\n## Security Considerations\n\n1. **Environment Variables**: Sensitive information (e.g., API keys) is stored in environment variables.\n2. **Input Validation**: User input is validated and sanitized before processing.\n3. **File Access Restrictions**: File operations are restricted to the project directory to prevent unauthorized access.\n\n## TODO List\n\n1. Implement authentication and authorization for WebSocket connections.\n2. Add more comprehensive error handling and logging.\n3. Implement rate limiting for AI requests to manage resource usage.\n4. Create a robust testing suite for backend components.\n5. Optimize the file diff generation process for better reliability and performance.\n\n## Debugging Docker Issues\n\n- When encountering \"Cannot find module\" errors in a Docker container, it's important to verify the contents of the container itself, not just the local build.\n- SSH access to the machine running the Docker container provides valuable debugging capabilities.\n- The `dist` directory being correct locally doesn't guarantee it's correct inside the container.\n- If a container is continuously restarting, it often indicates that the application is crashing immediately after starting. This prevents executing commands inside the container directly.\n- The absence of the `dist` directory in the Docker container can cause \"Cannot find module\" errors, even if the directory exists locally.\n\n## Git and Docker Best Practices\n\n- The `dist` directory should be ignored by Git to avoid checking in build files.\n- However, the `dist` directory needs to be included in the Docker image for the application to run correctly.\n- The build process should occur before creating the Docker image to ensure the latest compiled files are included.\n\n## Prompts\n\nThe backend uses several prompts to guide the AI assistant's behavior:\n\n1. **System Prompt**: Initializes the AI assistant with project-specific context and instructions.\n2. **Request Files Prompt**: Determines which files are relevant to a user's request.\n3. **Main Prompt**: Processes the user's input and generates responses, including code changes.\n\n### Request Files Prompt\n\n- Located in `src/request-files-prompt.ts`\n- Purpose: Identify all potentially relevant files for a user's request\n- Key features:\n  - Uses chain-of-thought reasoning to consider all possible relevant files\n  - Aims to be comprehensive, requesting up to 100 files or more if necessary\n  - Considers indirect dependencies and files that provide context\n  - Outputs a thought process and a list of file paths\n\nThe Request Files Prompt is executed before the Main Prompt to ensure that all necessary files are loaded into the system context before processing the user's request.\n\n## File Diff Generation\n\nThe backend uses two main strategies for generating file diffs:\n\n1. **Diff Blocks Generation**: Implemented in `generate-diffs-prompt.ts`.\n2. **Diff via Expansion**: Implemented in `generate-diffs-via-expansion.ts`.\n",
    'knowledge.md':
      "# Manicode\n\nManicode is a tool for editing codebases via natural language instruction to Manny, an expert AI programming assistant.\n\n## File Change Management\n\nManicode uses the generate diffs by expansion strategy for managing file changes. This approach has Haiku expand a file with placeholders into the full file, and then generates string patches instead of search and replace blocks.\n\nKey points:\n- The FileChanges type is an array of string patches.\n- The mainPrompt function uses the generatePatch function from generate-diffs-via-expansion.ts to create patches.\n- The client-side code applies patches using the applyPatch function from the 'diff' library.\n\nThis change improves the accuracy and reliability of file modifications, especially for complex changes or when dealing with large files.\n\n## Project Goals\n\n1. **Developer Productivity**: Reduce the time and effort required for common programming tasks, allowing developers to focus on higher-level problem-solving.\n\n2. **Learning and Adaptation**: Develop a system that learns from user interactions and improves its assistance over time.\n\n3. **Focus on power users**: Make expert software engineers move even faster.\n\n## Key Technologies\n\n- **TypeScript**: The primary programming language used throughout the project.\n- **Node.js**: The runtime environment for executing the application.\n- **WebSockets**: Used for real-time communication between the client and server.\n- **Claude AI**: Powers Manny, the AI programming assistant.\n\n## Project Structure\n\nThere are three top-level code directories:\n- `common`: Contains shared code and utilities used across the project.\n- `backend`: Houses the server-side code and API implementation.\n- `src`: Contains the main application source code.\n\n## Main Components\n\n1. **Claude Integration**: Processes natural language instructions and generates code changes.\n2. **WebSocket Server**: Handles real-time communication between the client and the backend.\n3. **File Management**: Reads, parses, and modifies project files.\n4. **Action Handling**: Processes various client and server actions.\n5. **Message History**: Manages conversation history between the user and Manny.\n6. **Chat Storage**: Persists chat sessions and allows users to manage multiple conversations.\n7. **Knowledge Management**: Handles the creation, updating, and organization of knowledge files.\n8. **Terminal Command Execution**: Allows Manny to run shell commands in the user's terminal.\n\n## Important Files\n\n- `backend/src/claude.ts`: Interacts with the Claude AI model.\n- `backend/src/server.ts`: Sets up the WebSocket server.\n- `common/src/actions.ts`: Defines schemas for client and server actions.\n- `src/project-files.ts`: Handles project file operations.\n- `src/index.ts`: Contains main application logic and user input handling.\n- `knowledge.md`: Stores project-wide knowledge and best practices.\n\n## Development Guidelines\n\n1. Use TypeScript for all new code to maintain type safety.\n2. Follow existing code structure and naming conventions.\n3. Ensure alternating user and Manny messages in conversation history.\n4. Update knowledge files for significant changes or new features.\n5. Write clear, concise comments and documentation for complex logic.\n6. Remember that imports automatically remove 'src' from the path. When editing files, always include 'src' in the file path if it's part of the actual directory structure.\n\n## Knowledge Management\n\n- Knowledge is stored in `knowledge.md` files, which can be created in relevant directories throughout the project.\n- Manny automatically updates knowledge files when learning new information or correcting mistakes.\n- Developers are encouraged to review and commit knowledge file changes to share insights across the team.\n\n## Terminal Command Execution\n\nManny can now execute terminal commands using the `run_terminal_command` tool. This feature allows Manny to perform various tasks such as:\n\n- Searching files with grep\n- Installing dependencies\n- Running build or test scripts\n- Checking versions of installed tools\n- Performing git operations\n- Creating, moving, or deleting files and directories\n\n## Important Constraints\n\n- **Max Tokens Limit**: The context for Claude AI has a maximum limit of 200,000 tokens. This is an important constraint to consider when designing prompts and managing project file information.\n\n## WebSocket Communication Flow\n\n1. Client connects to the WebSocket server.\n2. Client sends user input and file context to the server.\n3. Server processes the input using Claude AI.\n4. Server streams response chunks back to the client.\n5. Client receives and displays the response in real-time.\n6. Server sends file changes to the client for application.\n\n## File Versioning System\n\n- The ChatStorage class manages file versions for each chat session.\n- Users can navigate between file versions using CTRL+U (undo) and CTRL+R (redo).\n- File versions are stored as snapshots of the entire file state at each change.\n\n## Tool Handling System\n\n- Tools are defined in `backend/src/tools.ts` and implemented in `npm-app/src/tool-handlers.ts`.\n- Available tools: read_files, scrape_web_page, search_manifold_markets, run_terminal_command.\n- The backend uses tool calls to request additional information or perform actions.\n- The client-side handles tool calls and sends results back to the server.\n\n## CLI Interface Features\n\n- Non-canonical mode for improved key handling.\n- Navigation using arrow keys for input and command history.\n- File version control using CTRL+U and CTRL+R.\n- ESC key to toggle menu or stop AI response.\n- CTRL+C to exit the application.\n\n## Build and Publish Process\n\n- The `prepublishOnly` script runs `clean-package.js` before publishing.\n- `clean-package.js` modifies `package.json` to remove unnecessary information.\n- The `postpublish` script restores the original `package.json`.\n- NODE_ENV is set to 'production' for the published package at runtime.\n\n## Error Handling and Debugging\n\n- The `debug.ts` file provides logging functionality for debugging.\n- Error messages are logged to the console and, in some cases, to a debug log file.\n- WebSocket errors are caught and logged in the server and client code.\n\n## Security Considerations\n\n- The project uses environment variables for sensitive information (e.g., API keys).\n- WebSocket connections should be secured in production (e.g., using WSS).\n- User input is validated and sanitized before processing.\n- File operations are restricted to the project directory to prevent unauthorized access.\n\n## TODO\n- Implement authentication and authorization for WebSocket connections.\n- Add more comprehensive error handling and logging.\n- Implement rate limiting for AI requests to manage resource usage.\n- Create a robust testing suite for all components.\n\n# Code guide\n\n- We don't specify return types for functions, since Typescript will infer them. \n- Always include 'src' in file paths when it's part of the actual directory structure, even though imports automatically remove it. \n\n## Python Package\n\nA Python package for Manicode has been created as a skeleton in python-app. Key points:\n\n- It's currently a placeholder that prints a message about the package coming soon and suggests installing the npm version.\n\n- The Python package is intended to be developed further in the future to provide similar functionality to the npm version.\n\n## Version Checking\n\nThe Manicode backend implements a version checking mechanism to ensure clients are using the latest version:\n\n1. The client sends its version using the 'check-npm-version' action.\n2. The server compares this version with the one in backend/package.json.\n3. The server responds with a 'npm-version-status' action, indicating if the client is up-to-date.\n4. The backend/package.json version is updated during the build process by the build-version-info.js script, which copies the version from npm-app/package.json.\n\nTo maintain correct versioning:\n- Always update the version in npm-app/package.json when making releases.\n- Run `bun run build` to ensure backend/package.json is updated before deployment.\n- Implement proper error handling for version mismatches in both client and server code.\n",
    'musings.knowledge.md':
      "This file contains various ideas about how Manicode could work. Most of them are not what we'll end up doing, but it gives some flavor of the strategy.\n\n\n- Gather knowledge from users\n    - Through terminal\n        - [Manilearn.sh](http://Manilearn.sh) that just asks you questions\n        - Have an npm package so you can do `yarn manicode` or `yarn manilearn`? Or executable.\n        - Or, make manilearn an exclusively web app thing?\n            - Manicode should still send new knowledge as it learns when the user teaches it something it got wrong. It should condense that knowledge into a few sentences and an example of wrong and right.\n    - Through web app\n        - Add long form knowledge or short points\n            - Use markdown. With an editor that lets you insert code snippets\n        - Search over existing knowledge and edit or remove it\n        - Edit code from your browser???\n            - It could just create changes and you could approve them.\n            - You keep telling it to tweak stuff in just text. When satisfied, you hit the commit button. There is no commit message; that is generated. (commit message ends with “—manicode”)\n            - Might not be worth even having a terminal. You could just connect to github. Then you have permanent access to the files\n                - Some day it should just represent the code diffs itself and not use github except to read the current state of files.\n- Use it to prompt claude sonnet 3.5 in a repl, with learnings for how to get it to edit files\n- Have own script to gather info from codebase\n    - File structure\n    - Exported tokens\n    - Claude summary of each directory, computed recursively\n    - Try to find database schema. If not, ask for a file where it exists, or let them paste it in.\n    - Try to find api schema. If not ask where it is.\n    - Overall knowledge of tech stack and how the technologies are used.\n    \n\n## Problems\n\n- ~~It’s hard to get it to edit the files properly~~\n    - It defaults to a lazy style of specifying the changes where it writes the line it’s adding and adds a comment saying “// the next part is the same as before”\n    - When you do force it into a framework, like with <replace> and <with> blocks, it is more likely to forget imports and other small changes\n    - Should try again with getting it to specify things naturally and then translate that into replace blocks with another claude call?\n        - [J] I did this, and it seems to be working.\n    - Add it to the system prompt to ingrain the replace-with structure?\n    - Use <A> and <B> tags in hopes that it will be less lazy?\n- [x]  It cuts off after a long change\n- What’s the app structure of Manicode?\n    - Users should use it as a console application\n    - They should install it as an npm package (later: python package)\n    - It has a basic console application that communicates with the server\n        - has to reveal a significant portion of the algorithm\n            - Unless we upload their whole codebase to the server?\n        - Upload files to our server vs. thin wrapper calls to claude that go through our server\n            - The latter still does upload files to our server. It applies the edits locally (which we might still do under the previous approach). It does reveal the prompts\n        - Call claude directly. Can’t leak our key, but they could set theirs\n            - This is a bad user experience, so no\n        - Winner is upload files to server.\n            - But we can do it just-in-time?\n                - Send list of files and exports up on init\n                - Send files when claude asks for them\n            - Vs. Maintain files\n                - We might move in this direction over time. But it’s easier to start with just-in-time fetching of files\n    - Node application on client\n        - Reads files, Reads user input\n        - Maintains a websocket with server where we send files and user input, and receive claude’s output chats + file updates\n    - Server\n        - Maintains websockets with clients\n        - Makes calls to Claude\n\n## Stages\n\n- Discussion\n    \n    I want to maximize learning while not doing duplicate work. I’m working toward an application that other people can try out. Their dogfooding will be important.\n    \n    I’m already confident enough that I want to build out this prototype app.\n    \n    - Seems like the tool calls will be necessary for external use. So I want to try that\n    - The way the app tracks lessons will be key to how it is used. So I can also try implementing that to get some iteration in there.\n    - Only after that should I ship the prototype, and have manifold people start using it (they can add knowledge) to get feedback.\n- [x]  Local manicode script\n- [x]  Set up server\n- [x]  Make claude calls via server\n    - Just a user prompt and file information sent via websocket\n    - Server then runs all the claude calls, and streams the response, including file changes to apply\n- [x]  Tool calls to fetch the files\n    - Necessary for codebases where I can’t load all the files into context (unlike manicode)\n- [ ]  Track lessons\n    - Go to non-canonical mode for terminal.\n    - Set up menu system\n        - Can cancel out of an ongoing prompt.\n        - Use up and down arrows to go through history of prompts\n        - After prompt finishes, you have menu options\n            - Space: continue\n            - r: revert change\n            - l: add a lesson based on this change and possibly previous changes in the conversation\n            - Esc: back to prompt creation\n                - Esc: main menu\n                    - l: lessons. You can type a lesson or scroll through history of lessons\n                    - Space: go to a new prompt\n                    - Esc: quit application\n    - Save lessons locally? .manicode file\n        - A lot simpler techically than trying to merge your knowledge with other team members\n        - You know all the knowledge added. It conforms to your own style.\n        - But, most of the codebase knowledge is in common. You are just creating more work for each engineer.\n            - Allow users to export and import lessons!\n        - Alternately, users commit their lessons to a tracked file (lessons.manicode.md). People can view and modify the lessons others have added. (or they can add to git ignore)\n            - This is great. It’s super transparent, and can use existing coding tools like git, or text editors to update the lessons.\n            - It supports the single player and multiplayer use cases.\n            - Markdown file with lessons separated by dividers: ‘—-’\n            - Can create lessons in any directory and they are all added in, with the path.\n                - Allows you to better organize your knowledge if you have hundreds of lessons. Makes it easier for you to find and update stuff.\n            - Users will rapidly iterate to create the best knowledge. It’s basically prompt engineering lol\n                - What about lessons within the code? A long comment that can be added to knowledge.\n        - Potentially just called `knowledge.md`, so every application can use it and update it.\n            - Wait, this is very similar to README.md!\n                - But also, it’s not for exactly the same purpose. It’s for the machine. I think that means it could be worth having it’s own file.\n            - Could just give up on discrete lessons, and have the llm update the knowledge file for you in markdown. Hierarchical info is better anyway, with the headings.\n                - Track your progress by the number of characters of knowledge instead!\n        - Manicode is good at editing files!\n        - `knowledge.md` files should be created in the relevant directory for the info.\n            - Manicode will edit your .gitignore to include them (if you startup without any pre-existing knowledge files), but recommend you actually commit them.\n                - Or, maybe it won’t. Because knowledge files are such a good idea.\n        - Manicode should not ask, it should just add knowledge whenever it feels like. That’s an even better experience.\n        - You can run manicode from any directory, and it only sees inside the directory it is run from.\n            - E.g. if you want to cd into backend to reduce the scope of what it can see and change\n        - To start, there’re no user settings. No saved data. You pay a subscription which limits your usage per month.\n        - We should prompt manicode to freely edit knowledge files when it learns something. You can just tell it it did something wrong and it will unprompted add knowledge. You of course review the changes as file diffs.\n            - It can use a tool call? Or, nope, it just adds knowledge files and edits them all the time.\n        - You put in a credit card. It charges based on usage. $20 at a time. It emails you when it charges again. No subscription plan! Just pay for what you use, man.\n            - Simply charge 2x of what anthropic charges. Done.\n            - Subscriptions are annoying and are stealing from you when you don’t use it all.\n            - Alternately, you get a bill at the end of the month and pay then. That’s what cloud compute companies do. This is a better user experience. Maybe with a one-time activation fee ($10).\n        - Signup is email & credit card\n            - You get a private key which you use to bill your credit card. Can spread among your team. Or regenerate it.\n- [ ]  Npm package\n    - Install -g manicode and run it in manifold codebase\n    - Host a prod server\n- [ ]  Add postgres\n\n## Ideas\n\n- Use “tools” to have the llm able to ask for a file, we send it to our server, and then add it to the claude call’s context, and continue generating\n- Console application can turn off canonical mode (I think that’s what it was?) and then accept more rich input\n- Effort modes: 1 minutes, 15 minutes, 2 hours\n    - Response instantly, or work hard to come up with good design and a fuller implementation\n- Use [Greptile](https://www.greptile.com/) to index the code base and ask it knowledge questions to become context\n- Focus on learning after usage and ask for how to do better\n    - Explicitly ask the user to list out separate lessons. Have gpt compile the learnings with the rest of the context to produce knowledge entries\n        - Enter up to 3 lessons\n    - Tell them this is how it will improve. It won’t make the mistake again! (probably)\n    - Show ‘x%’ rating toward becoming a seasoned engineer, and increase it with every bit of knowledge (Every percent is one piece of knowldge)\n        - “5% trained - Junior engineer”\n        - Give a new title every 10%. After 100%, keep giving new titles on larger intervals\n        - New idea: 1% per commit to a knowledge file\n- Viral\n    - Share manicode rank\n    - Share wins: Your prompt, and the result\n    - Refer friends. Get $15 credit each\n\n\n\nWish list\n- Give the assistant full command of the terminal so it can run stuff like `yarn add` or `git commit`\n- Use the up and down arrow keys to scroll through previous messages. Use escape to show menu, and keys to navigate (e.g. to create a new chat, exit, etc.)\n- Add a rigorous testing suite to make sure each prompt is working as intended across many cases.\n- Save conversations locally in a file. Maybe .manicode? Include a setting for setting the root directory (and thus defaulting to running manicode in that directory so it can always see the whole project)?\n",
    'npm-app/knowledge.md':
      "# Manicode Project Structure\n\n## Overview\n\nManicode is an AI-powered development assistant that runs from the command line. It has access to all files in your project and can carry out various tasks.\n\n## Project Structure\n\n### Root Directory\n\n- `package.json`: Defines the project dependencies, scripts, and metadata.\n- `tsconfig.json`: TypeScript configuration file.\n- `README.md`: Project documentation and usage instructions.\n\n### Source Code (`src/`)\n\nThe `src/` directory contains the main TypeScript source files:\n\n- `index.ts`: Entry point of the application. Sets up the main `manicode` function.\n- `chat-client.ts`: Implements the `ChatClient` class for handling WebSocket communication.\n- `config.ts`: Contains configuration-related functions and constants.\n- `chat-storage.ts`: Manages chat storage functionality.\n- `cli.ts`: Implements the Command Line Interface.\n- `project-files.ts`: Handles project file operations.\n\n### Build Output (`dist/`)\n\nThe `dist/` directory contains the compiled JavaScript files and is created during the build process.\n\n## Project File Handling\n\n- Manny can only view files that are not gitignored. This is partially to save tokens when we list out all the files.\n- Multiple `.gitignore` files can exist throughout the project structure.\n- When traversing the project structure, we need to accumulate and apply ignore patterns from all encountered `.gitignore` files.\n\n## Key Components\n\n1. **ChatClient**: Manages WebSocket communication with the server, handles subscriptions, and processes messages.\n\n2. **ChatStorage**: Responsible for storing and managing chat data.\n\n3. **CLI**: Implements the command-line interface for user interaction.\n\n4. **Config**: Handles environment variables and configuration settings.\n\n## Build Process\n\nThe build process is defined in `package.json`:\n\n1. Builds the `common` project (located in a sibling directory).\n2. Builds the `npm-app` project using TypeScript.\n3. Copies necessary files from the `common` project and the current project to the `dist/` directory.\n\n## Dependencies\n\n- ts-pattern: Used for pattern matching in TypeScript. Installed to improve type safety and readability when checking message types.\n\n- The project depends on a `common` package (version 1.0.0) which is likely a shared library.\n- Uses `lodash` for utility functions.\n- TypeScript is used for development.\n\n## TypeScript Configuration\n\n- The project uses CommonJS modules.\n- Strict type checking is enabled.\n- The `common/*` path is mapped to `../common/dist/*` for importing shared components.\n\n## Usage\n\nManicode can be started by running the `manicode` command in the terminal after installation. It provides a menu interface (accessible by pressing `Esc`) and allows navigation through file versions using arrow keys.\n\n## Knowledge Management\n\nManicode encourages storing knowledge alongside code using `knowledge.md` files. These files provide context, guidance, and tips for the AI as it performs tasks.\n\n## Build and Publish Process\n\nWhen publishing the Manicode package, we use a custom process to ensure that only necessary information is included in the published package and that the environment is set correctly:\n\n1. The `prepublishOnly` script runs `clean-package.js` before publishing.\n2. `clean-package.js` does the following:\n   - Saves the current `package.json` to `temp.package.json`.\n   - Modifies the original `package.json` by removing `devDependencies`, `peerDependencies`, and unnecessary `scripts`.\n   - Writes the modified `package.json` back to its original location.\n   - Adds `process.env.NODE_ENV = 'production';` as the second line of `dist/index.js`.\n3. npm publishes the package using the modified `package.json`.\n4. The `postpublish` script restores the original `package.json` from `temp.package.json` and then deletes the temporary file.\n\nThis approach ensures that:\n\n- The published package only includes necessary dependencies and scripts.\n- The development environment remains intact after publishing.\n- NODE_ENV is set to 'production' for the published package at runtime.\n\nTo publish the package:\n\n```bash\nnpm publish\n```\n\nThis will automatically run the `prepublishOnly` and `postpublish` scripts to handle the `package.json` modifications, environment setting, and cleanup.\n\nRemember to increment the version number in `package.json` before publishing a new version.\n\n## Package Management\n\nManicode uses Bun as its package manager. Always use Bun commands for managing dependencies instead of npm.\n\nKey points:\n\n- Use `bun add <package-name>` to install new packages.\n- Use `bun remove <package-name>` to remove packages.\n- Use `bun install` to install all dependencies after cloning the repository.\n\n## CLI Functionality\n\nThe CLI (Command Line Interface) has been updated to provide a more standard terminal experience:\n\n1. **Input Handling**: Uses the `readline` module for improved key handling.\n2. **Navigation**:\n   - Left and right arrow keys move the cursor within the input.\n   - Up and down arrow keys navigate through command history.\n3. **File Version Control**:\n   - `Ctrl+U`: Undo file changes (navigate to previous version)\n   - `Ctrl+R`: Redo file changes (navigate to next version)\n4. **Application Control**:\n   - `Ctrl+C`: Exit the application\n   - `Esc`: Toggle menu or stop the current AI response\n5. **Input Submission**: Press Enter to submit the current input.\n\nThese changes aim to provide a more intuitive and familiar experience for users while maintaining the unique features of Manicode.\n\n## Note on Project Evolution\n\nAs an AI-powered tool, Manicode is designed to learn and evolve. It can update knowledge files as it works, improving its understanding and capabilities over time.\n\n## WebSocket Communication\n\nThe `Client` class in `client.ts` manages WebSocket communication with the server:\n\n- Connects to the WebSocket server specified in the configuration.\n- Sends user input and receives responses from the AI.\n- Handles tool calls and their responses.\n- Manages the response stream, allowing for real-time updates and the ability to stop ongoing responses.\n\n## File Management\n\nThe `project-files.ts` module handles all file-related operations:\n\n- Reads and writes files within the project directory.\n- Traverses the project structure, respecting `.gitignore` files.\n- Applies changes to files based on AI suggestions.\n- Manages file versioning for undo/redo functionality.\n\n## Tool Handlers\n\nThe `tool-handlers.ts` file implements handlers for various tools:\n\n- `read_files`: Reads contents of specified files.\n- `scrape_web_page`: Retrieves content from a given URL.\n- `search_manifold_markets`: Searches for relevant prediction markets.\n- `run_terminal_command`: Executes shell commands in the user's terminal.\n\nThese tools extend Manicode's capabilities, allowing it to gather information and perform actions beyond simple code manipulation.\n\n## Error Handling\n\nError handling is implemented throughout the application:\n\n- WebSocket connection errors are caught and logged.\n- File read/write errors are handled gracefully.\n- Tool execution errors are captured and reported back to the AI.\n\nDevelopers should continue to improve error handling to ensure a smooth user experience and easier debugging.\n\n## Security Considerations\n\n- The application runs commands in the user's terminal, which could potentially be dangerous. Users should be cautious when using Manicode on sensitive projects.\n- File operations are restricted to the project directory to prevent unauthorized access to the user's system.\n- Web scraping and external API calls (e.g., Manifold Markets) should be used responsibly and in compliance with the respective services' terms of use.\n\n## Future Improvements\n\n1. Implement user authentication for the WebSocket connection.\n2. Add more robust error handling and user-friendly error messages.\n3. Implement a caching system for frequently accessed files to improve performance.\n4. Create a comprehensive test suite to ensure reliability across different environments.\n5. Enhance the CLI with more features, such as chat history browsing and export/import functionality.\n\n## User Input ID System\n\n1. Each user input generates a unique user input ID (using nanoid) on the client-side.\n2. The user input ID is passed to the server with the user input.\n3. All related responses, including tool calls and response chunks, include this user input ID.\n4. The user input ID remains consistent for all interactions related to a single user input.\n\nThis system allows for better tracking and correlation of user inputs with their corresponding responses and tool calls, while avoiding potential conflicts with individual message IDs.\n\n## Version Checking\n\n- The `Client` class in `client.ts` includes a subscription to 'npm-version-status' that checks if the current version is up to date.\n- If a newer version is available, a warning is displayed in yellow text.\n- Users are instructed to update using the command: `npm install -g manicode`\n- The version check is performed as part of the WebSocket subscription setup.\n\n## End of Document\n",
    'python-app/knowledge.md':
      '# Manicode Project Knowledge\n\n## Project Structure\n\nThe Manicode project follows the modern Python packaging structure:\n\n- `pyproject.toml`: Contains project metadata and build system requirements.\n- `src/manicode/`: Source code directory.\n- `tests/`: Directory for test files (currently empty).\n- `dist/`: Contains distribution files after building the package.\n- `LICENSE`: MIT License file.\n- `README.md`: Project description and usage instructions.\n\n## Build System\n\n- Uses `setuptools` as the build backend.\n- Configured to use the `src` layout for better separation of source code.\n\n## Package Information\n\n- Name: manicode\n- Description: An AI-powered coding assistant (coming soon)\n- Requires Python 3.6 or later\n\n## Distribution\n\n- The project can be built using the `build` package: `python -m build`\n- This creates both source (.tar.gz) and wheel (.whl) distributions in the `dist/` directory.\n\n## Development\n\n- For local development, install the package in editable mode: `pip install -e .`\n- Remember to update the version in `pyproject.toml` when making new releases.\n\n## Next Steps\n\n- Implement the main functionality of the AI-powered coding assistant.\n- Add tests in the `tests/` directory.\n- Update `README.md` with detailed usage instructions as features are developed.\n\n## Important Notes\n\n- The package currently uses a console script entry point, which should be implemented in the `manicode/__init__.py` file.\n- The project is in a pre-alpha state and not yet ready for public release.\n\nRemember to keep this knowledge file updated as the project evolves.\n',
    'todo.knowledge.md':
      "[x] Should indicate if diff is still generating somehow...\n    - send to client the file changes still planned. Wait for them before allowing user input?\n- Improve speed by prompting it to rely more on diffs instead of reproducing the whole file\n[x] Prompt engineer it to automatically make knowledge changes when you correct it\n[x] it's doing a poor job loading all the relevant files into context. Need to add more explicity steps for this.\n[x] Indenting fails when it makes multiple changes with different indent levels.\n[x] More chain of thought for main prompt. <planning> blocks, <code_review>, <brainstorm>, etc.\n[x] Delete files\n[x] Shift + Enter, and pasting in stuff with new lines. Update: not really possible\n\n[x] Failed to replace in the new contents (but did expand it for the old content):\n// ... (keep the existing setup code)\n[x] Continuation 2 led to infinite responses\n[x] cancelling before the prompt starts being genereated leads to error of two user messages in a row\n- Show commands available in a bar under the input (not sure if this is possible)\n[x] Escalate when old diff does not match. Got case where a helper function in the middle of two others was moved up, but diff didn't match because it ignored the helper function.\n[x] Stuck in loop: Prompting claude num messages: 21, continuing to generate\n[x] Backspace after typing more than one line is buggy\n\n[x] Dawson's case of wanting it to scrape documentation from a url and answer questions with it.\n- x% knowledge written in menu based on number of commits to knowledge files\n[x] How it could run bash:\n1. First, let's build the `common` package:\n\n```bash\ncd common\nyarn build\ncd ..\n```\nImportant. Can use commandline to search for code. Could move files.\n\n[x] Try asking first if the complete file is listed, and then automatically generate diffs.\n\n[] create some structure in a knowledge file for users to initially fill out.\n- Project overview\n - Goals\n - Project structure\n - Coding do's and don'ts\n\n [] reverting doesn't work with created files\n [x] File paths using too much context?\n [x] Error on server didn't print the error (or maybe it did and the terminal overwrote it...)\n [x] Change ip address to be from api.manicode.ai\n\nNotes from Janna & Stephen test\n[x] backspace on windows doesn't clear the char, just moves cursor\n[x] Tried to do left arrow and it didn't work\n[x] Failed to apply any edits. They all failed even after a second attempt. This was on Windows\n[x] CTRL-C doesn't work\n\n[] Kill if it continues too far without user prompt.\n[] Prompt it not to generate the whole file when just making a local edit. Consider just reproducting the function edited. Or a block a code.\n    - Before editing a file, get it to say what changes it will make and then edit just those sections.\n[x] Consider confirming with the user whether to go ahead and make a change if not that confident or want more input from the user\n[] Force updates: run the command to update app.\n[] Store previous user input's and always include that history in system prompt.\n    - Can also allow you to press up arrow to go through whole history\n[x] Changes prompt is printing object for most previous messages in message history\n[x] It keeps requesting files that are already in its context. Need to highlight those paths again somewhere?\n    - Requests a file before editing that it just got.\n[] Knowledge files should be treated more like regular files, but with system prompts to frequently include them\n\n\n-- Instead, of below, apply edits immediately. Track all changes for a message via an id. Fix conccurent request by subscribing/unsubscribing to response with id.\n[x] Give it a new marker token that will await all file changes, so then it can run tsc or tests, etc.\n    - It is using grep to see if changes went through, but they haven't so gets in a loop.\n    - Realized we could just apply the edits before the tool call. We were already passing them through.\n[x] Was able to start a concurrent request after cancelling the last one...\n[] Changes behavior like removing if guard if statements at the top, removing cases of logs/errors, adds <form>. It should only do the minimal change and assume existing code is there for a reason.\n[x] Terminal command that doesn't finish bricks manicode\n[x] Easy to forget to run it in root directory.\n[x] Allow pasting new lines based on timing strategy\n[] It's not saving useful info like that this is a Windows machine and it shouldn't be using grep into a knowledge file.\n[x] Budget of tokens when reading files, and skip files that put it over the limit.\n[x] Still does too many extra things\n[x] Doesn't consistently request new files when it needs to\n[x] Scrape urls by default, like we request files by default\n[x] The user may have edited files since your last change. Please try to notice and perserve those changes. Don't overwrite these please!\n[x] Show a message when manicode is out of date. Or figure out how to automatically update.\n[] The \"// add this blah\" comments are really annoying. Strip them out in the diff step\n[x] The comprehensive files list generates a huge amount of thinking that is probably slow\n[x] Try a lower temperature. Might prevent it from doing random stuff. \n    - apparently it's been 0 this whole time, huh (for claude)\n    - Also openai defaults to 0\n[] Add current file diff from main into context (git status/git diff?)\n\n[] It thought that update_file_context would create a file? (a knowledge file?)\n[] Claude doesn't leave a comment that there's more code in between when it should. Then lots gets deleted\n[] Try using the native stop marker feature\n[] Use tree sitter to include exported tokens ttps://github.com/tree-sitter/node-tree-sitter\n    See how github implemented code search: ttps://docs.github.com/en/repositories/working-with-files/using-files/navigating-code-on-github#precise-and-search-based-navigation\n[] Multiple file blocks for the same file could fail to patch\n[] Still hallucinating without getting the file: Totally destroyed my package .json by removing random scripts & dependencies, changing a bunch of stuff around\n[] Create tests for the full user input. Set up fake project data for this.\n[] Use gpt-4o mini to grade tests\n\n[] Updated a function in a file, but didn't include comments at the top or bottom for existing code\n[] Looks in wrong directory for a file, e.g. web/components/comments instead of web/components/buttons\n    web/components/profile/profile-comments.tsx instead of web/components/comments/profile-comments.tsx\n[] Ari: editing is failing: deleting sections of code it shouldn't.\n    - [J] Removes commented out code, other comments\n[] Doesn't give up control after running terminal commands. Just keeps running more\n[] Says reconnected, but actually doesn't go after\n[] Run in a containerls\n    - Maybe distribute as brew package which would have more permissions?\n    - Check files being edited to be within project dir (no '..')\n[x] Send a command, then just run it. if it goes through, print.\n    - thefuck util that could change \n    - should look more like shell\n    - could have two panel one for you, other shows claude's response. Claude's commands go on your side\n[] Got file path wrong: backend instead of npm-app for project-files\n[] Still is overwritting a user's change every time",
  },
  files: {
    'npm-app/src/web-scraper.ts':
      "import { CheerioCrawler, Dataset } from 'crawlee'\nimport * as cheerio from 'cheerio'\n\n// Global cache for scraped web pages\nconst scrapedPagesCache: Record<string, string> = {}\n\nexport async function scrapeWebPage(url: string) {\n  // Check if the page is already in the cache\n  if (scrapedPagesCache[url] !== undefined) {\n    return scrapedPagesCache[url]\n  }\n\n  try {\n    const crawler = new CheerioCrawler({\n      maxRequestsPerCrawl: 1,\n      async requestHandler({ $, request }) {\n        const content = $('body').text()\n        await Dataset.pushData({ url: request.url, content })\n      },\n    })\n\n    await crawler.run([url])\n\n    const dataset = await Dataset.open()\n    const { items } = await dataset.getData()\n\n    // Extract the main content (you may need to adjust this selector based on the target websites)\n    if (items.length > 0) {\n      const content = items[0].content as string\n      // Store the scraped content in the cache\n      scrapedPagesCache[url] = content\n      return content\n    }\n\n    return ''\n  } catch (error) {\n    // console.error(\n    //   `Error scraping web page ${url}:`,\n    //   error instanceof Error ? error.message : error\n    // )\n    scrapedPagesCache[url] = ''\n    return ''\n  }\n}\n\nexport function parseUrlsFromContent(content: string): string[] {\n  const urlRegex = /https?:\\/\\/[^\\s]+/g\n  return content.match(urlRegex) || []\n}\n\nexport async function getScrapedContentBlocks(urls: string[]) {\n  const blocks: string[] = []\n  for (const url of urls) {\n    const scrapedContent = await scrapeWebPage(url)\n    if (scrapedContent) {\n      blocks.push(\n        `<web_scraped_content url=\"${url}\">\\n${scrapedContent}\\n</web_scraped_content>`\n      )\n    }\n  }\n  return blocks\n}\n",
    'npm-app/package.json':
      '{\n  "name": "manicode",\n  "version": "1.0.61",\n  "description": "AI dev assistant",\n  "license": "MIT",\n  "main": "dist/index.js",\n  "types": "dist/index.d.ts",\n  "bin": {\n    "manicode": "dist/index.js"\n  },\n  "scripts": {\n    "prebuild": "bun clean && cd ../common && bun run build",\n    "build": "tsc && tsc-alias",\n    "postbuild": "mkdir -p dist/common && cp -r ../common/dist/* dist/common && tsc-alias",\n    "clean": "rm -rf dist && (rm tsconfig.tsbuildinfo || true)",\n    "prepublishOnly": "bun run build && bun run clean-package.js",\n    "postpublish": "echo \\"const fs=require(\'fs\');fs.copyFileSync(\'temp.package.json\',\'package.json\');fs.unlinkSync(\'temp.package.json\');\\" | bun run -",\n    "format": "prettier --write \\"**/*.{ts,tsx,json,md}\\"",\n    "start-js": "bun run dist/index.js ..",\n    "start": "ts-node src/index.ts ..",\n    "start-manifold": "ts-node src/index.ts ../../manifold",\n    "start-litestar": "ts-node src/index.ts ../test/__mock-projects__/litestar",\n    "start-jpcsp": "ts-node src/index.ts ../test/__mock-projects__/jpcsp",\n    "start-vscode": "ts-node src/index.ts ../test/__mock-projects__/vscode",\n    "start-nushell": "ts-node src/index.ts ../test/__mock-projects__/nushell",\n    "start-prod": "NODE_ENV=production ts-node src/index.ts",\n    "ssh": "gcloud compute ssh manicode-backend --zone=us-east4-a"\n  },\n  "files": [\n    "dist",\n    "README.md"\n  ],\n  "dependencies": {\n    "@types/diff": "5.2.1",\n    "cheerio": "1.0.0",\n    "crawlee": "^3.11.3",\n    "diff": "5.2.0",\n    "ignore": "5.3.2",\n    "lodash": "*",\n    "nanoid": "5.0.7",\n    "picocolors": "1.1.0",\n    "systeminformation": "5.23.4",\n    "tree-sitter": "0.21.1",\n    "tree-sitter-c": "0.23.0",\n    "tree-sitter-c-sharp": "0.23.0",\n    "tree-sitter-cpp": "0.23.0",\n    "tree-sitter-go": "0.23.1",\n    "tree-sitter-java": "0.23.2",\n    "tree-sitter-javascript": "0.23.0",\n    "tree-sitter-php": "0.23.2",\n    "tree-sitter-python": "0.23.2",\n    "tree-sitter-ruby": "0.23.0",\n    "tree-sitter-rust": "0.23.0",\n    "tree-sitter-typescript": "0.23.0",\n    "ts-pattern": "^5.3.1",\n    "ws": "8.18.0",\n    "zod": "3.23.8"\n  },\n  "devDependencies": {\n    "@types/lodash": "^4.17.7",\n    "@types/node": "^22.1.0",\n    "@types/systeminformation": "^3.54.1",\n    "@types/ws": "^8.2.0",\n    "typescript": "5.5.4"\n  },\n  "peerDependencies": {\n    "@types/lodash": "*",\n    "@types/node": "*",\n    "typescript": "*"\n  }\n}\n',
    'npm-app/src/tool-handlers.ts':
      "import { spawn } from 'child_process'\nimport path from 'path'\nimport { green } from 'picocolors'\n\nimport { scrapeWebPage } from './web-scraper'\nimport { searchManifoldMarkets } from './manifold-api'\nimport {\n  getCurrentWorkingDirectory,\n  setCurrentWorkingDirectory,\n} from './project-files'\n\nexport type ToolHandler = (input: any, id: string) => Promise<string>\n\nexport const handleUpdateFileContext: ToolHandler = async (\n  input: { prompt: string },\n  id: string\n) => {\n  return ''\n}\n\nexport const handleScrapeWebPage: ToolHandler = async (\n  input: { url: string },\n  id: string\n) => {\n  const { url } = input\n  const content = await scrapeWebPage(url)\n  if (!content) {\n    return `<web_scraping_error url=\"${url}\">Failed to scrape the web page.</web_scraping_error>`\n  }\n  return `<web_scraped_content url=\"${url}\">${content}</web_scraped_content>`\n}\n\nexport const handleSearchManifoldMarkets: ToolHandler = async (\n  input: { query: string; limit?: number },\n  id: string\n) => {\n  const { query, limit = 5 } = input\n  try {\n    const markets = await searchManifoldMarkets(query, limit)\n    return JSON.stringify(markets)\n  } catch (error) {\n    const message = error instanceof Error ? error.message : error\n    return `<manifold_search_error>Failed to search Manifold markets: ${message}</manifold_search_error>`\n  }\n}\n\nexport const handleRunTerminalCommand = async (\n  input: { command: string },\n  id: string,\n  mode: 'user' | 'assistant'\n): Promise<string> => {\n  const { command } = input\n  return new Promise((resolve) => {\n    let stdout = ''\n    let stderr = ''\n    const MAX_EXECUTION_TIME = 10_000\n\n    if (mode === 'assistant') {\n      console.log()\n      console.log(green(`> ${command}`))\n    }\n    const childProcess = spawn(command, {\n      shell: true,\n      cwd: getCurrentWorkingDirectory(),\n    })\n\n    const timer = setTimeout(() => {\n      if (mode === 'assistant') {\n        childProcess.kill()\n        resolve(\n          formatResult(\n            stdout,\n            stderr,\n            `Command timed out after ${MAX_EXECUTION_TIME / 1000} seconds. Partial results shown.`\n          )\n        )\n      }\n    }, MAX_EXECUTION_TIME)\n\n    childProcess.stdout.on('data', (data) => {\n      process.stdout.write(data.toString())\n      stdout += data.toString()\n    })\n\n    childProcess.stderr.on('data', (data) => {\n      const dataStr = data.toString()\n      if (\n        mode === 'user' &&\n        (dataStr.includes('command not found') ||\n          dataStr.includes('syntax error') ||\n          dataStr.includes(\n            'is not recognized as an internal or external command'\n          ))\n      ) {\n        resolve('command not found')\n      } else {\n        process.stderr.write(data.toString())\n        stderr += data.toString()\n      }\n    })\n\n    childProcess.on('close', (code) => {\n      if (command.startsWith('cd ') && code === 0) {\n        const newWorkingDirectory = command.split(' ')[1]\n        setCurrentWorkingDirectory(\n          path.join(getCurrentWorkingDirectory(), newWorkingDirectory)\n        )\n      }\n\n      clearTimeout(timer)\n      resolve(formatResult(stdout, stderr, 'Command completed', code))\n      if (mode === 'assistant') {\n        console.log(green(`Command finished with exit code: ${code}`))\n      }\n    })\n\n    childProcess.on('error', (error) => {\n      clearTimeout(timer)\n      resolve(\n        `<terminal_command_error>Failed to execute command: ${error.message}</terminal_command_error>`\n      )\n    })\n  })\n}\n\nfunction formatResult(\n  stdout: string,\n  stderr: string,\n  status?: string,\n  exitCode?: number | null\n): string {\n  let result = '<terminal_command_result>\\n'\n  result += `<stdout>${stdout}</stdout>\\n`\n  result += `<stderr>${stderr}</stderr>\\n`\n  if (status !== undefined) {\n    result += `<status>${status}</status>\\n`\n  }\n  if (exitCode !== undefined && exitCode !== null) {\n    result += `<exit_code>${exitCode}</exit_code>\\n`\n  }\n  result += '</terminal_command_result>'\n  return result\n}\n\nexport const toolHandlers: Record<string, ToolHandler> = {\n  update_file_context: handleUpdateFileContext,\n  scrape_web_page: handleScrapeWebPage,\n  search_manifold_markets: handleSearchManifoldMarkets,\n  run_terminal_command: ((input, id) =>\n    handleRunTerminalCommand(input, id, 'assistant')) as ToolHandler,\n}\n",
    'npm-app/src/index.ts':
      "#!/usr/bin/env node\n\nimport fs from 'fs'\nimport path from 'path'\nimport { yellow } from 'picocolors'\n\nimport { initFingerprint } from './config'\nimport { CLI } from './cli'\nimport { getProjectFileContext, initProjectRoot } from './project-files'\n\nasync function manicode(projectDir: string | undefined) {\n  const dir = initProjectRoot(projectDir)\n\n  // Preload stuff.\n  const fingerprintPromise = initFingerprint()\n  const initProjectFileContextPromise = await getProjectFileContext([], {})\n\n  const readyPromise = Promise.all([\n    fingerprintPromise,\n    initProjectFileContextPromise,\n  ])\n\n  const cli = new CLI(readyPromise)\n\n  console.log(\n    `Manicode will read and write files in \"${dir}\". Type \"help\" for a list of commands`\n  )\n\n  const gitDir = path.join(dir, '.git')\n  if (!fs.existsSync(gitDir)) {\n    console.warn(\n      yellow(\n        'Warning: No .git directory found. Make sure you are at the top level of your project.'\n      )\n    )\n  }\n\n  cli.printInitialPrompt()\n}\n\nif (require.main === module) {\n  const arg = process.argv[2]\n  if (arg === '--help' || arg === '-h') {\n    console.log('Usage: manicode [project-directory]')\n    console.log(\n      'If no project directory is specified, Manicode will use the current directory.'\n    )\n    console.log()\n    console.log(\n      'Manicode allows you to interact with your codebase using natural language.'\n    )\n    process.exit(0)\n  }\n\n  manicode(arg)\n}\n",
    'npm-app/src/project-files.ts':
      "import fs from 'fs'\nimport path from 'path'\nimport { exec } from 'child_process'\nimport { promisify } from 'util'\nimport { createPatch } from 'diff'\n\nimport { createFileBlock, ProjectFileContext } from 'common/util/file'\nimport { filterObject } from 'common/util/object'\nimport { parseUrlsFromContent, getScrapedContentBlocks } from './web-scraper'\nimport { getProjectFileTree, getAllFilePaths } from 'common/project-file-tree'\nimport { getFileTokenScores } from 'common/codemap/parse'\n\nconst execAsync = promisify(exec)\n\nlet projectRoot: string\n\nexport function initProjectRoot(dir: string | undefined) {\n  projectRoot = path.resolve(dir || getCurrentDirectory())\n  return projectRoot\n}\n\nlet currentWorkingDirectory: string = ''\n\nexport function getCurrentWorkingDirectory(): string {\n  return currentWorkingDirectory || getProjectRoot()\n}\n\nexport function setCurrentWorkingDirectory(directory: string) {\n  currentWorkingDirectory = directory\n}\n\nfunction getCurrentDirectory() {\n  try {\n    return process.cwd()\n  } catch (error) {\n    throw new Error(\n      'Failed to get current working directory. Is this directory deleted?',\n      { cause: error }\n    )\n  }\n}\n\nexport function getProjectRoot() {\n  return projectRoot\n}\n\nlet cachedProjectFileContext: ProjectFileContext | undefined\n\nexport const getProjectFileContext = async (\n  fileList: string[],\n  lastFileVersion: Record<string, string>\n) => {\n  const root = getProjectRoot()\n  const cwd = getCurrentWorkingDirectory()\n\n  const contextRoot = path.relative(root, cwd).startsWith('..') ? cwd : root\n\n  const files = getFiles(fileList)\n  const gitChanges = await getGitChanges()\n  const changesSinceLastChat = getChangesSinceLastFileVersion(lastFileVersion)\n  const updatedProps = {\n    files,\n    gitChanges,\n    changesSinceLastChat,\n  }\n\n  if (\n    !cachedProjectFileContext ||\n    cachedProjectFileContext.currentWorkingDirectory !== contextRoot\n  ) {\n    const fileTree = getProjectFileTree(contextRoot)\n    const knowledgeFilePaths = getAllFilePaths(fileTree).filter((filePath) =>\n      filePath.endsWith('knowledge.md')\n    )\n    const knowledgeFiles =\n      await getExistingFilesWithScrapedContent(knowledgeFilePaths)\n\n    const allFilePaths = getAllFilePaths(fileTree)\n    const fileTokenScores = await getFileTokenScores(contextRoot, allFilePaths)\n\n    cachedProjectFileContext = {\n      currentWorkingDirectory: contextRoot,\n      fileTree,\n      fileTokenScores,\n      knowledgeFiles,\n      ...updatedProps,\n    }\n  } else {\n    cachedProjectFileContext = {\n      ...cachedProjectFileContext,\n      ...updatedProps,\n    }\n  }\n\n  return cachedProjectFileContext\n}\n\nasync function getGitChanges() {\n  try {\n    const { stdout: status } = await execAsync('git status', {\n      cwd: projectRoot,\n    })\n    const { stdout: diff } = await execAsync('git diff', { cwd: projectRoot })\n    const { stdout: diffCached } = await execAsync('git diff --cached', {\n      cwd: projectRoot,\n    })\n    const { stdout: shortLogOutput } = await execAsync(\n      'git shortlog HEAD~10..HEAD',\n      {\n        cwd: projectRoot,\n      }\n    )\n    const shortLogLines = shortLogOutput.trim().split('\\n')\n    const lastCommitMessages = shortLogLines\n      .slice(1)\n      .reverse()\n      .map((line) => line.trim())\n      .join('\\n')\n\n    return { status, diff, diffCached, lastCommitMessages }\n  } catch (error) {\n    return { status: '', diff: '', diffCached: '', lastCommitMessages: '' }\n  }\n}\n\nexport function getChangesSinceLastFileVersion(\n  lastFileVersion: Record<string, string>\n) {\n  const changes = Object.entries(lastFileVersion)\n    .map(([filePath, file]) => {\n      const fullFilePath = path.join(getProjectRoot(), filePath)\n      try {\n        const currentContent = fs.readFileSync(fullFilePath, 'utf8')\n        if (currentContent === file) {\n          return [filePath, null] as const\n        }\n        return [filePath, createPatch(filePath, file, currentContent)] as const\n      } catch (error) {\n        // console.error(`Error reading file ${fullFilePath}:`, error)\n        return [filePath, null] as const\n      }\n    })\n    .filter(([_, diff]) => diff !== null) as [string, string][]\n  return Object.fromEntries(changes)\n}\n\nexport function getFiles(filePaths: string[]) {\n  const result: Record<string, string | null> = {}\n  for (const filePath of filePaths) {\n    const fullPath = path.join(projectRoot, filePath)\n    try {\n      const content = fs.readFileSync(fullPath, 'utf8')\n      result[filePath] = content\n    } catch (error) {\n      result[filePath] = null\n    }\n  }\n  return result\n}\n\nexport function getExistingFiles(filePaths: string[]) {\n  return filterObject(getFiles(filePaths), (value) => value !== null) as Record<\n    string,\n    string\n  >\n}\n\nexport async function getExistingFilesWithScrapedContent(\n  filePaths: string[]\n): Promise<Record<string, string>> {\n  const files = getExistingFiles(filePaths)\n  const result: Record<string, string> = {}\n\n  for (const [filePath, content] of Object.entries(files)) {\n    result[filePath] = content\n\n    if (filePath.endsWith('knowledge.md')) {\n      const scrapedBlocks = await getScrapedContentBlocks(\n        parseUrlsFromContent(content)\n      )\n      for (const block of scrapedBlocks) {\n        result[filePath] += `\\n\\n${block}`\n      }\n    }\n  }\n\n  return result\n}\n\nexport function setFiles(files: Record<string, string>) {\n  for (const [filePath, content] of Object.entries(files)) {\n    const fullPath = path.join(projectRoot, filePath)\n    fs.writeFileSync(fullPath, content, 'utf8')\n  }\n}\n\nexport function getFileBlocks(filePaths: string[]) {\n  const result: Record<string, string> = {}\n\n  for (const filePath of filePaths) {\n    const fullPath = path.join(projectRoot, filePath)\n    try {\n      const content = fs.readFileSync(fullPath, 'utf8')\n      result[filePath] = content\n    } catch (error) {\n      const fileDoesNotExist =\n        error instanceof Error &&\n        error.message.includes('no such file or directory')\n\n      result[filePath] = fileDoesNotExist\n        ? '[FILE_DOES_NOT_EXIST]'\n        : '[FILE_READ_ERROR]'\n\n      if (!fileDoesNotExist) {\n        console.error(\n          `Error reading file ${fullPath}:`,\n          error instanceof Error ? error.message : error\n        )\n      }\n    }\n  }\n\n  const fileBlocks = filePaths.map((filePath) =>\n    createFileBlock(filePath, result[filePath])\n  )\n\n  return fileBlocks.join('\\n')\n}\n\n/*\nfunction getExportedTokensForFiles(\n  filePaths: string[]\n): Record<string, string[]> {\n  const result: Record<string, string[]> = {}\n  const fullFilePaths = filePaths.map((filePath) =>\n    path.join(projectRoot, filePath)\n  )\n  const program = ts.createProgram(fullFilePaths, {})\n\n  for (let i = 0; i < filePaths.length; i++) {\n    const filePath = filePaths[i]\n    const fullFilePath = fullFilePaths[i]\n    const sourceFile = program.getSourceFile(fullFilePath)\n    if (sourceFile) {\n      try {\n        const exportedTokens = getExportedTokens(sourceFile)\n        result[filePath] = exportedTokens\n      } catch (error) {\n        console.error(`Error processing file ${fullFilePath}:`, error)\n        result[filePath] = []\n      }\n    } else {\n      // console.error(`Could not find source file: ${fullFilePath}`)\n      result[filePath] = []\n    }\n  }\n\n  return result\n}\n\nfunction getExportedTokens(sourceFile: ts.SourceFile): string[] {\n  const exportedTokens: string[] = []\n\n  function visit(node: ts.Node) {\n    if (ts.isExportDeclaration(node)) {\n      if (node.exportClause && ts.isNamedExports(node.exportClause)) {\n        node.exportClause.elements.forEach((element) => {\n          exportedTokens.push(element.name.text)\n        })\n      }\n    } else if (\n      ts.isFunctionDeclaration(node) ||\n      ts.isClassDeclaration(node) ||\n      ts.isVariableStatement(node)\n    ) {\n      if (\n        node.modifiers?.some(\n          (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword\n        )\n      ) {\n        if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) {\n          if (node.name) {\n            exportedTokens.push(node.name.text)\n          }\n        } else if (ts.isVariableStatement(node)) {\n          node.declarationList.declarations.forEach((declaration) => {\n            if (ts.isIdentifier(declaration.name)) {\n              exportedTokens.push(declaration.name.text)\n            }\n          })\n        }\n      }\n    }\n\n    ts.forEachChild(node, visit)\n  }\n\n  visit(sourceFile)\n\n  return exportedTokens\n}\n*/\n\nexport const deleteFile = (fullPath: string): boolean => {\n  try {\n    if (fs.existsSync(fullPath)) {\n      fs.unlinkSync(fullPath)\n      return true\n    }\n    return false\n  } catch (error) {\n    console.error(`Error deleting file ${fullPath}:`, error)\n    return false\n  }\n}\n",
    'npm-app/src/client.ts':
      "import { green } from 'picocolors'\n\nimport packageJson from '../package.json'\nimport { APIRealtimeClient } from 'common/websockets/websocket-client'\nimport {\n  getFiles,\n  getProjectFileContext,\n  getProjectRoot,\n} from './project-files'\nimport { applyChanges } from 'common/util/changes'\nimport { ChatStorage } from './chat-storage'\nimport { FileChanges, Message } from 'common/actions'\nimport { toolHandlers } from './tool-handlers'\nimport { STOP_MARKER } from 'common/constants'\nimport { fingerprintId } from './config'\nimport { parseUrlsFromContent, getScrapedContentBlocks } from './web-scraper'\nimport { uniq } from 'lodash'\n\nexport class Client {\n  private webSocket: APIRealtimeClient\n  private chatStorage: ChatStorage\n  private currentUserInputId: string | undefined\n\n  constructor(\n    websocketUrl: string,\n    chatStorage: ChatStorage,\n    onWebSocketError: () => void\n  ) {\n    this.webSocket = new APIRealtimeClient(websocketUrl, onWebSocketError)\n    this.chatStorage = chatStorage\n  }\n\n  async connect() {\n    await this.webSocket.connect()\n    this.setupSubscriptions()\n    this.checkNpmVersion()\n  }\n\n  private setupSubscriptions() {\n    this.webSocket.subscribe('tool-call', async (a) => {\n      const { response, changes, data, userInputId } = a\n      if (userInputId !== this.currentUserInputId) {\n        return\n      }\n\n      const filesChanged = uniq(changes.map((change) => change.filePath))\n      this.chatStorage.saveFilesChanged(filesChanged)\n\n      applyChanges(getProjectRoot(), changes)\n\n      const { id, name, input } = data\n\n      const currentChat = this.chatStorage.getCurrentChat()\n      const messages = currentChat.messages\n      if (messages[messages.length - 1].role === 'assistant') {\n        // Probably the last response from the assistant was cancelled and added immediately.\n        return\n      }\n\n      const assistantMessage: Message = {\n        role: 'assistant',\n        content: [\n          {\n            type: 'text',\n            text: response,\n          },\n          {\n            type: 'tool_use',\n            id,\n            name,\n            input,\n          },\n        ],\n      }\n      this.chatStorage.addMessage(\n        this.chatStorage.getCurrentChat(),\n        assistantMessage\n      )\n\n      const handler = toolHandlers[name]\n      if (handler) {\n        const content = await handler(input, id)\n        const toolResultMessage: Message = {\n          role: 'user',\n          content: [\n            {\n              type: 'tool_result',\n              tool_use_id: id,\n              content,\n            },\n          ],\n        }\n        this.chatStorage.addMessage(\n          this.chatStorage.getCurrentChat(),\n          toolResultMessage\n        )\n        await this.sendUserInput(changes, userInputId)\n      } else {\n        console.error(`No handler found for tool: ${name}`)\n      }\n    })\n\n    this.webSocket.subscribe('read-files', (a) => {\n      const { filePaths } = a\n      const files = getFiles(filePaths)\n\n      this.webSocket.sendAction({\n        type: 'read-files-response',\n        files,\n      })\n    })\n\n    this.webSocket.subscribe('npm-version-status', (action) => {\n      const { isUpToDate, latestVersion } = action\n      if (!isUpToDate) {\n        console.warn(\n          green(\n            `\\nThere's a new version of Manicode! Please update to ensure proper functionality.\\nUpdate now by running: npm install -g manicode`\n          )\n        )\n      }\n    })\n  }\n\n  private checkNpmVersion() {\n    this.webSocket.sendAction({\n      type: 'check-npm-version',\n      version: packageJson.version,\n    })\n  }\n\n  async sendUserInput(previousChanges: FileChanges, userInputId: string) {\n    this.currentUserInputId = userInputId\n    const currentChat = this.chatStorage.getCurrentChat()\n    const { messages, fileVersions } = currentChat\n    const messageText = messages\n      .map((m) => JSON.stringify(m.content))\n      .join('\\n')\n    const filesContent = messageText.match(/<files>(.*?)<\\/files>/gs)\n    const lastFilesContent = filesContent\n      ? filesContent[filesContent.length - 1]\n      : ''\n    const fileList = lastFilesContent\n      .replace(/<\\/?files>/g, '')\n      .trim()\n      .split(', ')\n      .filter((str) => str)\n\n    const lastMessage = messages[messages.length - 1]\n    if (\n      lastMessage.role === 'user' &&\n      typeof lastMessage.content === 'string'\n    ) {\n      const urls = parseUrlsFromContent(lastMessage.content)\n      const blocks = await getScrapedContentBlocks(urls)\n      lastMessage.content += '\\n\\n' + blocks.join('\\n\\n')\n    }\n\n    const currentFileVersion =\n      fileVersions[fileVersions.length - 1]?.files ?? {}\n    const fileContext = await getProjectFileContext(\n      fileList,\n      currentFileVersion\n    )\n    this.webSocket.sendAction({\n      type: 'user-input',\n      userInputId,\n      messages,\n      fileContext,\n      previousChanges,\n      fingerprintId,\n    })\n  }\n\n  subscribeToResponse(\n    onChunk: (chunk: string) => void,\n    userInputId: string,\n    onStreamStart: () => void\n  ) {\n    let responseBuffer = ''\n    let resolveResponse: (value: {\n      response: string\n      changes: FileChanges\n      wasStoppedByUser: boolean\n    }) => void\n    let rejectResponse: (reason?: any) => void\n    let unsubscribeChunks: () => void\n    let unsubscribeComplete: () => void\n    let streamStarted = false\n\n    const responsePromise = new Promise<{\n      response: string\n      changes: FileChanges\n      wasStoppedByUser: boolean\n    }>((resolve, reject) => {\n      resolveResponse = resolve\n      rejectResponse = reject\n    })\n\n    const stopResponse = () => {\n      this.currentUserInputId = undefined\n      unsubscribeChunks()\n      unsubscribeComplete()\n      resolveResponse({\n        response: responseBuffer + '\\n[RESPONSE_STOPPED_BY_USER]',\n        changes: [],\n        wasStoppedByUser: true,\n      })\n    }\n\n    unsubscribeChunks = this.webSocket.subscribe('response-chunk', (a) => {\n      if (a.userInputId !== userInputId) return\n      const { chunk } = a\n\n      if (!streamStarted) {\n        streamStarted = true\n        onStreamStart()\n      }\n\n      responseBuffer += chunk\n      onChunk(chunk)\n\n      // Print a message when the response is complete, before the file changes are generated.\n      if (responseBuffer.includes(STOP_MARKER)) {\n        if (responseBuffer.includes('<' + '/file>'))\n          console.log('\\n\\nGenerating file changes. Please wait...')\n      }\n    })\n\n    unsubscribeComplete = this.webSocket.subscribe('response-complete', (a) => {\n      if (a.userInputId !== userInputId) return\n      unsubscribeChunks()\n      unsubscribeComplete()\n      resolveResponse({ ...a, wasStoppedByUser: false })\n      this.currentUserInputId = undefined\n    })\n\n    return {\n      responsePromise,\n      stopResponse,\n    }\n  }\n\n  public async warmContextCache() {\n    const fileContext = await getProjectFileContext([], {})\n\n    return new Promise<void>((resolve) => {\n      this.webSocket.subscribe('warm-context-cache-response', () => {\n        resolve()\n      })\n\n      this.webSocket\n        .sendAction({\n          type: 'warm-context-cache',\n          fileContext,\n          fingerprintId,\n        })\n        .catch((e) => {\n          // console.error('Error warming context cache', e)\n          resolve()\n        })\n\n      // If it takes too long, resolve the promise to avoid hanging the CLI.\n      setTimeout(() => {\n        resolve()\n      }, 15_000)\n    })\n  }\n}\n",
    'npm-app/src/chat-storage.ts':
      "import * as fs from 'fs'\nimport * as path from 'path'\nimport { Message } from 'common/actions'\nimport { getExistingFiles, getProjectRoot } from './project-files'\n\nconst MANICODE_DIR = '.manicode'\nconst CHATS_DIR = 'chats'\n\ninterface Chat {\n  id: string\n  messages: Message[]\n  fileVersions: FileVersion[]\n  createdAt: string\n  updatedAt: string\n}\n\ninterface FileVersion {\n  files: Record<string, string>\n}\n\nexport class ChatStorage {\n  private baseDir: string\n  private currentChat: Chat\n  private currentVersionIndex: number\n\n  constructor() {\n    this.baseDir = path.join(getProjectRoot(), MANICODE_DIR, CHATS_DIR)\n    // this.ensureDirectoryExists()\n    this.currentChat = this.createChat()\n    this.currentVersionIndex = -1\n  }\n\n  private ensureDirectoryExists(): void {\n    if (!fs.existsSync(this.baseDir)) {\n      fs.mkdirSync(this.baseDir, { recursive: true })\n    }\n  }\n\n  private getFilePath(chatId: string): string {\n    return path.join(this.baseDir, `${chatId}.json`)\n  }\n\n  createChat(messages: Message[] = []): Chat {\n    const chat: Chat = {\n      id: this.generateChatId(),\n      messages,\n      fileVersions: [],\n      createdAt: new Date().toISOString(),\n      updatedAt: new Date().toISOString(),\n    }\n\n    this.saveChat(chat)\n    return chat\n  }\n\n  getChat(chatId: string): Chat | null {\n    const filePath = this.getFilePath(chatId)\n    if (fs.existsSync(filePath)) {\n      const fileContent = fs.readFileSync(filePath, 'utf-8')\n      return JSON.parse(fileContent) as Chat\n    }\n    return null\n  }\n\n  addMessage(chat: Chat, message: Message) {\n    chat.messages.push(message)\n    chat.updatedAt = new Date().toISOString()\n    this.saveChat(chat)\n  }\n\n  deleteChat(chatId: string): boolean {\n    const filePath = this.getFilePath(chatId)\n    if (fs.existsSync(filePath)) {\n      fs.unlinkSync(filePath)\n      return true\n    }\n    return false\n  }\n\n  listChats(): Chat[] {\n    const chatFiles = fs\n      .readdirSync(this.baseDir)\n      .filter((file) => file.endsWith('.json'))\n    return chatFiles.map((file) => {\n      const filePath = path.join(this.baseDir, file)\n      const fileContent = fs.readFileSync(filePath, 'utf-8')\n      return JSON.parse(fileContent) as Chat\n    })\n  }\n\n  private saveChat(chat: Chat): void {\n    const filePath = this.getFilePath(chat.id)\n    // fs.writeFileSync(filePath, JSON.stringify(chat, null, 2))\n  }\n\n  private generateChatId(): string {\n    const now = new Date()\n    const datePart = now.toISOString().split('T')[0] // YYYY-MM-DD\n    const timePart = now\n      .toISOString()\n      .split('T')[1]\n      .replace(/:/g, '-')\n      .split('.')[0] // HH-MM-SS\n    const randomPart = Math.random().toString(36).substr(2, 5)\n    return `${datePart}_${timePart}_${randomPart}`\n  }\n\n  getCurrentChat(): Chat {\n    return this.currentChat\n  }\n\n  setCurrentChat(chatId: string) {\n    const chat = this.getChat(chatId)\n    if (chat) {\n      this.currentChat = chat\n      this.currentVersionIndex = chat.fileVersions.length - 1\n    } else {\n      throw new Error(`Chat with id ${chatId} not found`)\n    }\n  }\n\n  getCurrentVersion(): FileVersion | null {\n    if (\n      this.currentVersionIndex >= 0 &&\n      this.currentVersionIndex < this.currentChat.fileVersions.length\n    ) {\n      return this.currentChat.fileVersions[this.currentVersionIndex]\n    }\n    return null\n  }\n\n  navigateVersion(direction: 'undo' | 'redo'): boolean {\n    if (direction === 'undo' && this.currentVersionIndex >= 0) {\n      this.currentVersionIndex--\n      return true\n    } else if (\n      direction === 'redo' &&\n      this.currentVersionIndex < this.currentChat.fileVersions.length - 1\n    ) {\n      this.currentVersionIndex++\n      return true\n    }\n    return false\n  }\n\n  saveFilesChanged(filesChanged: string[]) {\n    let currentVersion = this.getCurrentVersion()\n    if (!currentVersion) {\n      this.addNewFileState({})\n      currentVersion = this.getCurrentVersion() as FileVersion\n    }\n    const newFilesChanged = filesChanged.filter((f) => !currentVersion.files[f])\n    const updatedFiles = getExistingFiles(newFilesChanged)\n    currentVersion.files = { ...currentVersion.files, ...updatedFiles }\n    return Object.keys(currentVersion.files)\n  }\n\n  saveCurrentFileState(files: Record<string, string>) {\n    const currentVersion = this.getCurrentVersion()\n    if (currentVersion) {\n      currentVersion.files = files\n    } else {\n      this.addNewFileState(files)\n    }\n  }\n\n  addNewFileState(files: Record<string, string>) {\n    const newVersion: FileVersion = {\n      files,\n    }\n    this.currentChat.fileVersions.push(newVersion)\n    this.currentVersionIndex = this.currentChat.fileVersions.length - 1\n  }\n}\n",
    'npm-app/src/config.ts':
      "import { calculateFingerprint } from './fingerprint'\n\nconst isProduction = process.env.NODE_ENV === 'production'\nexport const websocketUrl = isProduction\n  ? 'ws://api.manicode.ai:4242/ws'\n  : 'ws://localhost:4242/ws'\n\nexport let fingerprintId: string\nexport const initFingerprint = async () => {\n  fingerprintId = await calculateFingerprint()\n  return fingerprintId\n}\n",
    'backend/src/claude.ts':
      "import Anthropic from '@anthropic-ai/sdk'\nimport { TextBlockParam, Tool } from '@anthropic-ai/sdk/resources'\nimport { removeUndefinedProps } from 'common/util/object'\nimport { Message, ToolCall } from 'common/actions'\nimport { STOP_MARKER } from 'common/constants'\nimport { debugLog } from './util/debug'\nimport { RATE_LIMIT_POLICY } from './constants'\n\nexport const models = {\n  sonnet: 'claude-3-5-sonnet-20240620' as const,\n  haiku: 'claude-3-haiku-20240307' as const,\n}\n\nexport type model_types = (typeof models)[keyof typeof models]\n\nexport type System = string | Array<TextBlockParam>\n\nexport const promptClaudeStream = async function* (\n  messages: Message[],\n  options: {\n    system?: System\n    tools?: Tool[]\n    model?: model_types\n    maxTokens?: number\n    userId: string\n    ignoreHelicone?: boolean\n  }\n): AsyncGenerator<string | ToolCall, void, unknown> {\n  const {\n    model = models.sonnet,\n    system,\n    tools,\n    userId,\n    maxTokens,\n    ignoreHelicone = false,\n  } = options\n\n  const apiKey = process.env.ANTHROPIC_API_KEY\n\n  if (!apiKey) {\n    throw new Error('Missing ANTHROPIC_API_KEY')\n  }\n\n  const anthropic = new Anthropic({\n    apiKey,\n    ...(ignoreHelicone\n      ? {}\n      : {\n          baseURL: 'https://anthropic.helicone.ai/',\n        }),\n    defaultHeaders: {\n      'anthropic-beta': 'prompt-caching-2024-07-31',\n      ...(ignoreHelicone\n        ? {}\n        : {\n            'Helicone-Auth': `Bearer ${process.env.HELICONE_API_KEY}`,\n            'Helicone-User-Id': userId,\n            'Helicone-RateLimit-Policy': RATE_LIMIT_POLICY,\n            'Helicone-LLM-Security-Enabled': 'true',\n          }),\n    },\n  })\n\n  const stream = anthropic.messages.stream(\n    removeUndefinedProps({\n      model,\n      max_tokens: maxTokens ?? 4096,\n      temperature: 0,\n      messages,\n      system,\n      tools,\n    })\n  )\n\n  let toolInfo = {\n    name: '',\n    id: '',\n    json: '',\n  }\n  for await (const chunk of stream) {\n    const { type } = chunk\n\n    if (type === 'content_block_delta' && chunk.delta.type === 'text_delta') {\n      yield chunk.delta.text\n    }\n\n    // For Tool use!\n    if (\n      type === 'content_block_start' &&\n      chunk.content_block.type === 'tool_use'\n    ) {\n      const { name, id } = chunk.content_block\n      toolInfo = {\n        name,\n        id,\n        json: '',\n      }\n    }\n    if (\n      type === 'content_block_delta' &&\n      chunk.delta.type === 'input_json_delta'\n    ) {\n      toolInfo.json += chunk.delta.partial_json\n    }\n    if (type === 'message_delta' && chunk.delta.stop_reason === 'tool_use') {\n      const { name, id, json } = toolInfo\n      const input = JSON.parse(json)\n      yield { name, id, input }\n    }\n    // if (type === 'message_start') {\n    //   console.log('message start', chunk)\n    // }\n  }\n}\n\nexport const promptClaude = async (\n  messages: Message[],\n  options: {\n    userId: string\n    system?: string | Array<TextBlockParam>\n    tools?: Tool[]\n    model?: model_types\n    maxTokens?: number\n    ignoreHelicone?: boolean\n  }\n) => {\n  let fullResponse = ''\n  for await (const chunk of promptClaudeStream(messages, options)) {\n    fullResponse += chunk\n  }\n  return fullResponse\n}\n\nexport async function promptClaudeWithContinuation(\n  messages: Message[],\n  options: {\n    userId: string\n    system?: string\n    model?: model_types\n    ignoreHelicone?: boolean\n  }\n) {\n  let fullResponse = ''\n  let continuedMessage: Message | null = null\n  let isComplete = false\n\n  // Add the instruction to end with the stop market to the system prompt\n  if (options.system) {\n    options.system += `\\n\\nAlways end your response with \"${STOP_MARKER}\".`\n  } else {\n    options.system = `Always end your response with \"${STOP_MARKER}\".`\n  }\n\n  while (!isComplete) {\n    const messagesWithContinuedMessage = continuedMessage\n      ? [...messages, continuedMessage]\n      : messages\n    debugLog(\n      'prompt claude with continuation',\n      messagesWithContinuedMessage.length\n    )\n    const stream = promptClaudeStream(messagesWithContinuedMessage, options)\n\n    for await (const chunk of stream) {\n      fullResponse += chunk\n    }\n\n    if (continuedMessage) {\n      debugLog('Continuation response:', fullResponse)\n      console.log('got continuation response')\n    }\n\n    if (fullResponse.includes(STOP_MARKER)) {\n      isComplete = true\n      fullResponse = fullResponse.replace(STOP_MARKER, '')\n    } else {\n      continuedMessage = {\n        role: 'assistant',\n        content: fullResponse,\n      }\n    }\n  }\n\n  return { response: fullResponse }\n}\n",
    'test/__mock-data__/app/expected.ts':
      "import { hrtime } from 'node:process'\nimport * as cors from 'cors'\nimport * as crypto from 'crypto'\nimport * as express from 'express'\nimport { ErrorRequestHandler, RequestHandler } from 'express'\n\nimport { log, metrics } from 'shared/utils'\nimport { withMonitoringContext } from 'shared/monitoring/context'\nimport { APIError, pathWithPrefix } from 'common/api/utils'\nimport { health } from './health'\nimport { updateMe } from './update-me'\nimport { placeBet } from './place-bet'\nimport { cancelBet } from './cancel-bet'\nimport { sellShares } from './sell-shares'\nimport { claimmanalink } from './claim-manalink'\nimport { createMarket } from './create-market'\nimport { createComment } from './create-comment'\nimport { creategroup } from './create-group'\nimport { resolveMarket } from './resolve-market'\nimport { closeMarket } from './close-market'\nimport { unsubscribe } from './unsubscribe'\nimport { stripewebhook, createcheckoutsession } from './stripe-endpoints'\nimport { getMe } from './get-me'\nimport { saveTwitchCredentials } from './save-twitch-credentials'\nimport { addLiquidity } from './add-liquidity'\nimport { validateiap } from './validate-iap'\nimport { markallnotifications } from './mark-all-notifications'\nimport { updatememberrole } from './update-group-member-role'\nimport { updategroupprivacy } from './update-group-privacy'\nimport { registerdiscordid } from './register-discord-id'\nimport { getuserisgroupmember } from './get-user-is-group-member'\nimport { completequest } from './complete-quest'\nimport { getsupabasetoken } from './get-supabase-token'\nimport { updateUserEmbedding } from './update-user-embedding'\nimport { deleteMarket } from './delete-market'\nimport { saveTopic } from './save-topic'\nimport { boostmarket } from './boost-market'\nimport { redeemboost } from './redeem-market-ad-reward'\nimport { followtopic } from './follow-topic'\nimport { editcomment } from 'api/edit-comment'\nimport {\n  supabasesearchgroups,\n  supabasesearchmygroups,\n} from './supabase-search-groups'\nimport { leagueActivity } from './league-activity'\nimport { updategroup } from './update-group'\nimport { updateUserDisinterestEmbedding } from 'api/update-user-disinterests'\nimport { awardBounty } from './award-bounty'\nimport { addBounty } from './add-bounty'\nimport { cancelbounty } from './cancel-bounty'\nimport { createAnswerCPMM } from './create-answer-cpmm'\nimport { createportfolio } from './create-portfolio'\nimport { updateportfolio } from './update-portfolio'\nimport { searchgiphy } from './search-giphy'\nimport { manachantweet } from './manachan-tweet'\nimport { managram } from './managram'\nimport { leavereview } from './leave-review'\nimport { getusercontractmetricswithcontracts } from './get-user-contract-metrics-with-contracts'\nimport { castpollvote } from './cast-poll-vote'\nimport { getsimilargroupstocontract } from 'api/get-similar-groups-to-contract'\nimport { followUser } from './follow-user'\nimport { report } from './report'\nimport { createdashboard } from './create-dashboard'\nimport { getyourdashboards } from './get-your-dashboards'\nimport { followdashboard } from './follow-dashboard'\nimport { supabasesearchdashboards } from './supabase-search-dashboards'\nimport { getyourfolloweddashboards } from './get-your-followed-dashboards'\nimport { updatedashboard } from './update-dashboard'\nimport { deletedashboard } from './delete-dashboard'\nimport { setnews } from './set-news'\nimport { getnews } from './get-news'\nimport {\n  getdashboardfromslug,\n  getDashboardFromSlug,\n} from './get-dashboard-from-slug'\nimport { unresolve } from './unresolve'\nimport { referuser } from 'api/refer-user'\nimport { banuser } from 'api/ban-user'\nimport { updateMarket } from 'api/update-market'\nimport { createprivateusermessage } from 'api/create-private-user-message'\nimport { createprivateusermessagechannel } from 'api/create-private-user-message-channel'\nimport { createlover } from 'api/love/create-lover'\nimport { updatelover } from 'api/love/update-lover'\nimport { createcommentonlover } from 'api/love/create-comment-on-lover'\nimport { hidecommentonlover } from 'api/love/hide-comment-on-lover'\nimport { searchlocation } from './search-location'\nimport { searchnearcity } from './search-near-city'\nimport { leaveprivateusermessagechannel } from 'api/leave-private-user-message-channel'\nimport { updateprivateusermessagechannel } from 'api/update-private-user-message-channel'\nimport { editanswercpmm } from 'api/edit-answer'\nimport { createlovecompatibilityquestion } from 'api/love/create-love-compatibility-question'\nimport { getCompatibleLovers } from './love/compatible-lovers'\nimport { API, type APIPath } from 'common/api/schema'\nimport { getMarkets } from 'api/markets'\nimport { createchartannotation } from 'api/create-chart-annotation'\nimport { deletechartannotation } from 'api/delete-chart-annotation'\nimport { assertUnreachable } from 'common/util/types'\nimport { hideComment } from './hide-comment'\nimport { pinComment } from './pin-comment'\nimport { getManagrams } from './get-managrams'\nimport { getGroups } from './get-groups'\nimport { getComments } from './get-comments'\nimport { getBets } from './get-bets'\nimport { getDisplayUser, getUser } from './get-user'\nimport { getUsers } from './get-users'\nimport { getMarket } from './get-market'\nimport { getGroup } from './get-group'\nimport { getPositions } from './get-positions'\nimport { getLeagues } from './get-leagues'\nimport { getContract } from './get-contract'\nimport { addOrRemoveTopicFromContract } from './add-topic-to-market'\nimport { searchUsers } from './supabase-search-users'\nimport {\n  searchMarketsLite,\n  searchMarketsFull,\n} from './supabase-search-contract'\nimport { post } from 'api/post'\nimport { fetchLinkPreview } from './fetch-link-preview'\nimport { type APIHandler, typedEndpoint } from './helpers/endpoint'\nimport { requestloan } from 'api/request-loan'\nimport { removePinnedPhoto } from './love/remove-pinned-photo'\nimport { getHeadlines, getPoliticsHeadlines } from './get-headlines'\nimport { getadanalytics } from 'api/get-ad-analytics'\nimport { getCompatibilityQuestions } from './love/get-compatibililty-questions'\nimport { addOrRemoveReaction } from './reaction'\nimport { likeLover } from './love/like-lover'\nimport { shipLovers } from './love/ship-lovers'\nimport { createManalink } from './create-manalink'\nimport { getLikesAndShips } from './love/get-likes-and-ships'\nimport { hasFreeLike } from './love/has-free-like'\nimport { starLover } from './love/star-lover'\nimport { getLovers } from './love/get-lovers'\nimport { unlistAndCancelUserContracts } from './unlist-and-cancel-user-contracts'\nimport { getGroupsWithTopContracts } from 'api/get-topics-with-markets'\nimport { getBalanceChanges } from 'api/get-balance-changes'\nimport { getLoverAnswers } from './love/get-lover-answers'\nimport { placeMultiBet } from 'api/place-multi-bet'\nimport { deletetv, settv } from './set-tv'\nimport { getPartnerStats } from './get-partner-stats'\nimport { getSeenMarketIds } from 'api/get-seen-market-ids'\nimport { recordContractView } from 'api/record-contract-view'\nimport { createPublicChatMessage } from 'api/create-public-chat-message'\nimport { getFollowedGroups } from './get-followed-groups'\nimport { getUniqueBetGroupCount } from 'api/get-unique-bet-groups'\nimport { deleteGroup } from './delete-group'\nimport { recordContractInteraction } from 'api/record-contract-interaction'\nimport { getUserPortfolio } from './get-user-portfolio'\nimport { createuser } from 'api/create-user'\nimport { verifyPhoneNumber } from 'api/verify-phone-number'\nimport { requestOTP } from 'api/request-phone-otp'\nimport { multiSell } from 'api/multi-sell'\nimport { convertSpiceToMana } from './convert-sp-to-mana'\nimport { donate } from './donate'\nimport { getFeed } from 'api/get-feed'\nimport { getManaSupply } from './get-mana-supply'\nimport { getUserPortfolioHistory } from './get-user-portfolio-history'\nimport { deleteMe } from './delete-me'\nimport { updateModReport } from './update-mod-report'\nimport { getModReports } from './get-mod-reports'\nimport { searchContractPositions } from 'api/search-contract-positions'\nimport { blockUser, unblockUser } from './block-user'\nimport { blockGroup, unblockGroup } from './block-group'\nimport { blockMarket, unblockMarket } from './block-market'\nimport { getTxnSummaryStats } from 'api/get-txn-summary-stats'\nimport { getManaSummaryStats } from 'api/get-mana-summary-stats'\nimport { register } from 'api/gidx/register'\nimport { uploadDocument } from 'api/gidx/upload-document'\nimport { callbackGIDX } from 'api/gidx/callback'\nimport { getVerificationStatus } from 'api/gidx/get-verification-status'\nimport { getCurrentPrivateUser } from './get-current-private-user'\nimport { updatePrivateUser } from './update-private-user'\nimport { setPushToken } from './push-token'\nimport { updateNotifSettings } from './update-notif-settings'\nimport { getVerificationDocuments } from 'api/gidx/get-verification-documents'\nimport { getMonitorStatus } from 'api/gidx/get-monitor-status'\nimport { getBestComments } from 'api/get-best-comments'\nimport { recordCommentView } from 'api/record-comment-view'\nimport {\n  getChannelMemberships,\n  getChannelMessages,\n  getLastSeenChannelTime,\n  setChannelLastSeenTime,\n} from 'api/get-private-messages'\nimport { getNotifications } from 'api/get-notifications'\nimport { getContractTopics } from './get-contract-topics'\nimport { getRelatedMarkets } from 'api/get-related-markets'\nimport { getUserLimitOrdersWithContracts } from 'api/get-user-limit-orders-with-contracts'\nimport { getInterestingGroupsFromViews } from 'api/get-interesting-groups-from-views'\nimport { deleteComment } from './delete-comment'\n\nconst allowCorsUnrestricted: RequestHandler = cors({})\n\nfunction cacheController(policy?: string): RequestHandler {\n  return (_req, res, next) => {\n    if (policy) res.appendHeader('Cache-Control', policy)\n    next()\n  }\n}\nconst ignoredEndpoints = [\n  '/get-channel-messages',\n  '/v0/user/by-id/',\n  '/get-channel-memberships',\n  '/v0/get-mod-reports',\n  '/get-channel-seen-time',\n]\n\nconst requestMonitoring: RequestHandler = (req, _res, next) => {\n  const traceContext = req.get('X-Cloud-Trace-Context')\n  const traceId = traceContext\n    ? traceContext.split('/')[0]\n    : crypto.randomUUID()\n  const context = { endpoint: req.path, traceId }\n  withMonitoringContext(context, () => {\n    const startTs = hrtime.bigint()\n    const isLocalhost = req.get('host')?.includes('localhost')\n    if (\n      !isLocalhost ||\n      (isLocalhost && !ignoredEndpoints.some((e) => req.path.startsWith(e)))\n    ) {\n      log(`${req.method} ${req.url}`)\n    }\n    metrics.inc('http/request_count', { endpoint: req.path })\n    next()\n    const endTs = hrtime.bigint()\n    const latencyMs = Number(endTs - startTs) / 1e6\n    metrics.push('http/request_latency', latencyMs, { endpoint: req.path })\n  })\n}\n\nconst apiErrorHandler: ErrorRequestHandler = (error, _req, res, _next) => {\n  if (error instanceof APIError) {\n    log.info(error)\n    if (!res.headersSent) {\n      const output: { [k: string]: unknown } = { message: error.message }\n      if (error.details != null) {\n        output.details = error.details\n      }\n      res.status(error.code).json(output)\n    }\n  } else {\n    log.error(error)\n    if (!res.headersSent) {\n      res.status(500).json({ message: error.stack, error })\n    }\n  }\n}\n\nconst apiRoute = (endpoint: RequestHandler) => {\n  return [\n    allowCorsUnrestricted,\n    express.json(),\n    endpoint,\n    apiErrorHandler,\n  ] as const\n}\n\nexport const app = express()\napp.use(requestMonitoring)\n\napp.options('*', allowCorsUnrestricted)\n\n// we define the handlers in this object in order to typecheck that every API has a handler\nconst handlers: { [k in APIPath]: APIHandler<k> } = {\n  bet: placeBet,\n  'multi-bet': placeMultiBet,\n  'bet/cancel/:betId': cancelBet,\n  'market/:contractId/sell': sellShares,\n  bets: getBets,\n  'get-notifications': getNotifications,\n  'get-channel-memberships': getChannelMemberships,\n  'get-channel-messages': getChannelMessages,\n  'get-channel-seen-time': getLastSeenChannelTime,\n  'set-channel-seen-time': setChannelLastSeenTime,\n  'get-contract': getContract,\n  comment: createComment,\n  'hide-comment': hideComment,\n  'pin-comment': pinComment,\n  comments: getComments,\n  market: createMarket,\n  'market/:contractId/group': addOrRemoveTopicFromContract,\n  'market/:contractId/groups': getContractTopics,\n  'group/:slug': getGroup,\n  'group/by-id/:id': getGroup,\n  'group/by-id/:id/markets': ({ id, limit }, ...rest) =>\n    getMarkets({ groupId: id, limit }, ...rest),\n  'group/:slug/delete': deleteGroup,\n  'group/by-id/:id/delete': deleteGroup,\n  'group/:slug/block': blockGroup,\n  'group/:slug/unblock': unblockGroup,\n  groups: getGroups,\n  'market/:id': getMarket,\n  'market/:id/lite': ({ id }) => getMarket({ id, lite: true }),\n  'slug/:slug': getMarket,\n  'market/:contractId/update': updateMarket,\n  'market/:contractId/close': closeMarket,\n  'market/:contractId/resolve': resolveMarket,\n  'market/:contractId/add-liquidity': addLiquidity,\n  'market/:contractId/add-bounty': addBounty,\n  'market/:contractId/award-bounty': awardBounty,\n  'market/:contractId/answer': createAnswerCPMM,\n  'market/:contractId/block': blockMarket,\n  'market/:contractId/unblock': unblockMarket,\n  'get-user-limit-orders-with-contracts': getUserLimitOrdersWithContracts,\n  'get-interesting-groups-from-views': getInterestingGroupsFromViews,\n  leagues: getLeagues,\n  markets: getMarkets,\n  'search-markets': searchMarketsLite,\n  'search-markets-full': searchMarketsFull,\n  managram: managram,\n  managrams: getManagrams,\n  manalink: createManalink,\n  donate: donate,\n  'convert-sp-to-mana': convertSpiceToMana,\n  'market/:id/positions': getPositions,\n  me: getMe,\n  'me/update': updateMe,\n  'me/delete': deleteMe,\n  'me/private': getCurrentPrivateUser,\n  'me/private/update': updatePrivateUser,\n  'user/by-id/:id': getUser,\n  'user/by-id/:id/lite': getDisplayUser,\n  'user/:username': getUser,\n  'user/:username/lite': getDisplayUser,\n  'user/:username/bets': (...props) => getBets(...props),\n  'user/by-id/:id/block': blockUser,\n  'user/by-id/:id/unblock': unblockUser,\n  users: getUsers,\n  'search-users': searchUsers,\n  react: addOrRemoveReaction,\n  'save-twitch': saveTwitchCredentials,\n  'set-push-token': setPushToken,\n  'update-notif-settings': updateNotifSettings,\n  headlines: getHeadlines,\n  'politics-headlines': getPoliticsHeadlines,\n  'compatible-lovers': getCompatibleLovers,\n  post: post,\n  'fetch-link-preview': fetchLinkPreview,\n  'request-loan': requestloan,\n  'remove-pinned-photo': removePinnedPhoto,\n  'get-related-markets': getRelatedMarkets,\n  'unlist-and-cancel-user-contracts': unlistAndCancelUserContracts,\n  'get-ad-analytics': getadanalytics,\n  'get-compatibility-questions': getCompatibilityQuestions,\n  'like-lover': likeLover,\n  'ship-lovers': shipLovers,\n  'get-likes-and-ships': getLikesAndShips,\n  'has-free-like': hasFreeLike,\n  'star-lover': starLover,\n  'get-lovers': getLovers,\n  'get-lover-answers': getLoverAnswers,\n  'set-news': setnews,\n  'update-user-embedding': updateUserEmbedding,\n  'search-groups': supabasesearchgroups,\n  'search-my-groups': supabasesearchmygroups,\n  'get-groups-with-top-contracts': getGroupsWithTopContracts,\n  'get-balance-changes': getBalanceChanges,\n  'get-partner-stats': getPartnerStats,\n  'get-seen-market-ids': getSeenMarketIds,\n  'record-contract-view': recordContractView,\n  'get-dashboard-from-slug': getDashboardFromSlug,\n  'create-public-chat-message': createPublicChatMessage,\n  unresolve: unresolve,\n  'get-followed-groups': getFollowedGroups,\n  'unique-bet-group-count': getUniqueBetGroupCount,\n  'record-contract-interaction': recordContractInteraction,\n  'get-user-portfolio': getUserPortfolio,\n  'get-user-portfolio-history': getUserPortfolioHistory,\n  createuser: createuser,\n  'verify-phone-number': verifyPhoneNumber,\n  'request-otp': requestOTP,\n  'multi-sell': multiSell,\n  'get-feed': getFeed,\n  'get-mana-supply': getManaSupply,\n  'update-mod-report': updateModReport,\n  'get-mod-reports': getModReports,\n  'search-contract-positions': searchContractPositions,\n  'get-txn-summary-stats': getTxnSummaryStats,\n  'get-mana-summary-stats': getManaSummaryStats,\n  'register-gidx': register,\n  'get-verification-status-gidx': getVerificationStatus,\n  'upload-document-gidx': uploadDocument,\n  'callback-gidx': callbackGIDX,\n  'get-verification-documents-gidx': getVerificationDocuments,\n  'get-monitor-status-gidx': getMonitorStatus,\n  'get-best-comments': getBestComments,\n  'record-comment-view': recordCommentView,\n  'delete-comment': deleteComment,\n}\n\nObject.entries(handlers).forEach(([path, handler]) => {\n  const api = API[path as APIPath]\n  const cache = cacheController((api as any).cache)\n  const url = '/' + pathWithPrefix(path as APIPath)\n\n  const apiRoute = [\n    url,\n    express.json(),\n    allowCorsUnrestricted,\n    cache,\n    typedEndpoint(path as any, handler as any),\n    apiErrorHandler,\n  ] as const\n\n  if (api.method === 'POST') {\n    app.post(...apiRoute)\n  } else if (api.method === 'GET') {\n    app.get(...apiRoute)\n    // } else if (api.method === 'PUT') {\n    //   app.put(...apiRoute)\n  } else {\n    assertUnreachable(api, 'Unsupported API method')\n  }\n})\n\napp.get('/health', ...apiRoute(health))\napp.get('/unsubscribe', ...apiRoute(unsubscribe))\napp.post('/editcomment', ...apiRoute(editcomment))\n\napp.post('/claimmanalink', ...apiRoute(claimmanalink))\napp.post('/creategroup', ...apiRoute(creategroup))\napp.post('/updategroup', ...apiRoute(updategroup))\napp.post('/validateIap', ...apiRoute(validateiap))\napp.post('/markallnotifications', ...apiRoute(markallnotifications))\napp.post('/updatememberrole', ...apiRoute(updatememberrole))\napp.post('/updategroupprivacy', ...apiRoute(updategroupprivacy))\napp.post('/registerdiscordid', ...apiRoute(registerdiscordid))\napp.post('/getuserisgroupmember', ...apiRoute(getuserisgroupmember))\napp.post('/completequest', ...apiRoute(completequest))\napp.post(\n  '/update-user-disinterest-embedding',\n  ...apiRoute(updateUserDisinterestEmbedding)\n)\napp.get('/getsupabasetoken', ...apiRoute(getsupabasetoken))\napp.post('/delete-market', ...apiRoute(deleteMarket))\napp.post('/save-topic', ...apiRoute(saveTopic))\napp.post('/boost-market', ...apiRoute(boostmarket))\napp.post('/redeem-boost', ...apiRoute(redeemboost))\n\napp.post('/createcheckoutsession', allowCorsUnrestricted, createcheckoutsession)\napp.post(\n  '/stripewebhook',\n  allowCorsUnrestricted,\n  express.raw({ type: '*/*' }),\n  stripewebhook\n)\napp.post('/follow-topic', ...apiRoute(followtopic))\napp.post('/league-activity', ...apiRoute(leagueActivity))\napp.post('/cancel-bounty', ...apiRoute(cancelbounty))\napp.post('/edit-answer-cpmm', ...apiRoute(editanswercpmm))\napp.post('/createportfolio', ...apiRoute(createportfolio))\napp.post('/updateportfolio', ...apiRoute(updateportfolio))\napp.post('/searchgiphy', ...apiRoute(searchgiphy))\napp.post('/manachantweet', ...apiRoute(manachantweet))\napp.post('/refer-user', ...apiRoute(referuser))\napp.post('/leave-review', ...apiRoute(leavereview))\napp.post(\n  '/get-user-contract-metrics-with-contracts',\n  ...apiRoute(getusercontractmetricswithcontracts)\n)\napp.post('/cast-poll-vote', ...apiRoute(castpollvote))\napp.post(\n  '/get-similar-groups-to-contract',\n  ...apiRoute(getsimilargroupstocontract)\n)\napp.post('/follow-user', ...apiRoute(followUser))\napp.post('/report', ...apiRoute(report))\n\napp.post('/settv', ...apiRoute(settv))\napp.post('/deletetv', ...apiRoute(deletetv))\n\napp.post('/createdashboard', ...apiRoute(createdashboard))\napp.post('/getyourdashboards', ...apiRoute(getyourdashboards))\napp.post('/followdashboard', ...apiRoute(followdashboard))\napp.post('/supabasesearchdashboards', ...apiRoute(supabasesearchdashboards))\napp.post('/getyourfolloweddashboards', ...apiRoute(getyourfolloweddashboards))\napp.post('/updatedashboard', ...apiRoute(updatedashboard))\napp.post('/delete-dashboard', ...apiRoute(deletedashboard))\napp.get('/get-news-dashboards', ...apiRoute(getnews))\napp.post('/getdashboardfromslug', ...apiRoute(getdashboardfromslug))\napp.post('/ban-user', ...apiRoute(banuser))\napp.post('/create-private-user-message', ...apiRoute(createprivateusermessage))\napp.post(\n  '/create-private-user-message-channel',\n  ...apiRoute(createprivateusermessagechannel)\n)\napp.post(\n  '/leave-private-user-message-channel',\n  ...apiRoute(leaveprivateusermessagechannel)\n)\napp.post(\n  '/update-private-user-message-channel',\n  ...apiRoute(updateprivateusermessagechannel)\n)\napp.post('/create-lover', ...apiRoute(createlover))\napp.post('/update-lover', ...apiRoute(updatelover))\napp.post('/create-comment-on-lover', ...apiRoute(createcommentonlover))\napp.post('/hide-comment-on-lover', ...apiRoute(hidecommentonlover))\napp.post('/searchlocation', ...apiRoute(searchlocation))\napp.post('/searchnearcity', ...apiRoute(searchnearcity))\napp.post(\n  '/createlovecompatibilityquestion',\n  ...apiRoute(createlovecompatibilityquestion)\n)\napp.post('/create-chart-annotation', ...apiRoute(createchartannotation))\napp.post('/delete-chart-annotation', ...apiRoute(deletechartannotation))\n\n// mqp: definitely don't enable this in production since there's no authorization\n// import { broadcastTest } from 'api/broadcast-test'\n// app.post('/broadcast-test', ...apiRoute(broadcastTest))\n\n// Catch 404 errors - this should be the last route\napp.use(allowCorsUnrestricted, (req, res) => {\n  res\n    .status(404)\n    .set('Content-Type', 'application/json')\n    .json({\n      message: `The requested route '${req.path}' does not exist. Please check your URL for any misspellings or refer to app.ts`,\n    })\n})\n",
    'scripts/generate-fine-tuning-dataset.ts':
      "import { execSync } from 'child_process'\nimport * as fs from 'fs'\nimport * as path from 'path'\nimport { promptClaude } from '../backend/src/claude'\nimport { countTokens } from '../backend/src/util/token-counter'\nimport dotenv from 'dotenv'\nimport { shuffle } from 'lodash'\nimport { mapAsync } from '../common/src/util/promise'\n\ndotenv.config({ path: path.resolve(__dirname, '../backend/.env') })\n\nconst MANICODE_PROJECT_PATH = '/Users/jahooma/manicode'\n\nconst PROJECTS_LIST = [\n  {\n    name: 'pytorch',\n    path: `${MANICODE_PROJECT_PATH}/test/__mock-projects__/pytorch`,\n  },\n  {\n    name: 'linux',\n    path: `${MANICODE_PROJECT_PATH}/test/__mock-projects__/linux`,\n  },\n  {\n    name: 'jpcsp',\n    path: `${MANICODE_PROJECT_PATH}/test/__mock-projects__/jpcsp`,\n  },\n  {\n    name: 'litestar',\n    path: `${MANICODE_PROJECT_PATH}/test/__mock-projects__/litestar`,\n  },\n  {\n    name: 'nushell',\n    path: `${MANICODE_PROJECT_PATH}/test/__mock-projects__/nushell`,\n  },\n  {\n    name: 'vscode',\n    path: `${MANICODE_PROJECT_PATH}/test/__mock-projects__/vscode`,\n  },\n  {\n    name: 'manifold',\n    path: '/Users/jahooma/manifold',\n  },\n]\n\nconst NUMBER_OF_COMMITS = 5000\nconst FILES_TO_PROCESS = 1000\nconst PARALLEL_PROCESSES = 5\n\nconst BLACK_LIST_STRINGS = [\n  'This file was automatically generated',\n  'This autogenerated file',\n]\n\ninterface DatasetEntry {\n  filePath: string\n  oldFile: string\n  newFile: string\n  patch: string\n  claudeSketch: string\n}\n\ninterface Progress {\n  [projectName: string]: DatasetEntry[]\n}\n\nconst PROGRESS_FILE = `${MANICODE_PROJECT_PATH}/dataset_progress.json`\n\nfunction saveProgress(projectName: string, dataset: DatasetEntry[]) {\n  const progress = loadProgress()\n  progress[projectName] = dataset\n  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2))\n}\n\nfunction loadProgress(): Progress {\n  if (fs.existsSync(PROGRESS_FILE)) {\n    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'))\n  }\n  return {}\n}\n\nasync function generateClaudeSketch(\n  oldContent: string,\n  newContent: string,\n  patch: string\n): Promise<string> {\n  const prompt = `\nYou are an expert programmer tasked with explaining how to modify an old version of a file into a new version. Your explanation should be clear and concise, suitable for a human to understand and follow.\n\nHere's the old version of the file:\n\n\\`\\`\\`\n${oldContent}\n\\`\\`\\`\n\nHere's the new version of the file:\n\n\\`\\`\\`\n${newContent}\n\\`\\`\\`\n\nHere's the patch showing the differences:\n\n\\`\\`\\`\n${patch}\n\\`\\`\\`\n\nPlease provide a sketch of how to turn the old file into the new file. First, explain the changes in a <discussion> block. Then, write out the new file in a <file> block, but use comments like \"// ... existing code ...\" (or \"# ... existing code ...\" or similar for different languages) for sections that were unchanged. Don't leave excessive comments.\n`\n\n  const response = await promptClaude([{ role: 'user', content: prompt }], {\n    userId: 'fine-tuning-dataset-generator',\n    ignoreHelicone: true,\n  })\n\n  // Extract the content from the <file> block\n  const fileContentMatch = response.match(/<file>([\\s\\S]*?)<\\/file>/)\n  return fileContentMatch ? fileContentMatch[1].trim() : ''\n}\n\nasync function createDataset(\n  project: { name: string; path: string },\n  datasetSoFar: DatasetEntry[]\n) {\n  console.log(`Creating dataset for project: ${project.name}`)\n  const dataset: DatasetEntry[] = datasetSoFar.concat()\n\n  // Create tmp directory if it doesn't exist\n  const tmpDir = path.join(process.cwd(), 'tmp')\n  if (!fs.existsSync(tmpDir)) {\n    fs.mkdirSync(tmpDir)\n  }\n\n  // Change to the project directory\n  try {\n    process.chdir(project.path)\n    console.log(`Changed to directory: ${project.path}`)\n  } catch (error) {\n    console.error(`Failed to change to directory ${project.path}:`, error)\n    return\n  }\n\n  // Get the last n commit hashes\n  const allCommitHashes = execSync(\n    `git log -n ${NUMBER_OF_COMMITS} --pretty=format:\"%H\"`\n  )\n    .toString()\n    .split('\\n')\n\n  const allChangedFiles = allCommitHashes.flatMap((commitHash) =>\n    execSync(`git diff-tree --no-commit-id --name-only -r ${commitHash}`)\n      .toString()\n      .split('\\n')\n      .filter(\n        (file) =>\n          file.endsWith('.ts') ||\n          file.endsWith('.tsx') ||\n          file.endsWith('.py') ||\n          file.endsWith('.js') ||\n          file.endsWith('.jsx') ||\n          file.endsWith('.java') ||\n          file.endsWith('.go') ||\n          file.endsWith('.c') ||\n          file.endsWith('.cpp') ||\n          file.endsWith('.h') ||\n          file.endsWith('.hpp') ||\n          file.endsWith('.rs') ||\n          file.endsWith('.rb') ||\n          file.endsWith('.php') ||\n          file.endsWith('.md')\n      )\n  )\n\n  const alreadyProcessedFiles = new Set(dataset.map((entry) => entry.filePath))\n  const shuffledFiles = [...new Set(allChangedFiles)]\n    .sort(() => 0.5 - Math.random())\n    .filter((file) => !alreadyProcessedFiles.has(file))\n\n  console.log(`Randomly selected ${shuffledFiles.length} files to process.`)\n\n  await mapAsync(\n    shuffledFiles,\n    async (file) => {\n      if (dataset.length >= FILES_TO_PROCESS) return\n      try {\n        console.log(`Processing file: ${file}`)\n        const commitHash = execSync(\n          `git log -n 1 --pretty=format:\"%H\" -- ${file}`\n        ).toString()\n\n        // Check the number of lines changed\n        const diffStats = execSync(\n          `git diff ${commitHash}^ ${commitHash} -- ${file} | grep -E \"^[-+]\" | wc -l`\n        )\n          .toString()\n          .trim()\n        const linesChanged = parseInt(diffStats, 10)\n\n        if (linesChanged < 10) {\n          console.log(`Skipping ${file}: Only ${linesChanged} lines changed`)\n          return\n        }\n\n        // Get the file content before and after the commit\n        const oldContent = execSync(`git show ${commitHash}^:${file}`)\n          .toString()\n          .replace(/\\r\\n/g, '\\n')\n        const newContent = execSync(`git show ${commitHash}:${file}`)\n          .toString()\n          .replace(/\\r\\n/g, '\\n')\n\n        // Check if the file contains any blacklisted strings\n        if (\n          BLACK_LIST_STRINGS.some(\n            (str) => oldContent.includes(str) || newContent.includes(str)\n          )\n        ) {\n          console.log(`Skipping ${file}: Contains blacklisted string`)\n          return\n        }\n\n        if (\n          countTokens(oldContent) > 50_000 ||\n          countTokens(newContent) > 50_000\n        ) {\n          console.log(`Skipping ${file}: File too large`)\n          return\n        }\n\n        // Generate the git diff patch\n        const patch = execSync(\n          `git diff ${commitHash}^ ${commitHash} -- ${file}`\n        )\n          .toString()\n          // Remove everything up to the first @@\n          .replace(/^[\\s\\S]*?(?=@@)/m, '')\n          .replace(/\\r\\n/g, '\\n')\n\n        // Generate Claude sketch\n        console.log(`Generating Claude sketch for ${file}`)\n        const claudeSketch = await generateClaudeSketch(\n          oldContent,\n          newContent,\n          patch\n        )\n        if (!claudeSketch) {\n          console.log(`Skipping ${file}: Claude sketch is empty`)\n          return\n        }\n\n        // Save Claude's sketch to a file in the tmp directory\n        const sketchFileName = `${project.name}_${commitHash}_${file.replace(/\\//g, '_')}.txt`\n        const sketchFilePath = path.join(tmpDir, sketchFileName)\n        fs.writeFileSync(sketchFilePath, claudeSketch)\n        console.log(`Saved Claude's sketch to ${sketchFilePath}`)\n\n        dataset.push({\n          filePath: file,\n          oldFile: oldContent,\n          newFile: newContent,\n          patch: patch,\n          claudeSketch: claudeSketch,\n        })\n        console.log(`Added entry ${dataset.length} for ${file} to dataset.`)\n        if (dataset.length % PARALLEL_PROCESSES === 0) {\n          console.log(`Saving progress for ${project.name}`)\n          saveProgress(project.name, dataset)\n        }\n      } catch (error: any) {\n        console.error(`Error processing file ${file}:`, error.message)\n      }\n    },\n    PARALLEL_PROCESSES\n  )\n\n  process.chdir(MANICODE_PROJECT_PATH)\n\n  // Save the dataset to a JSON file\n  const outputPath = path.join(\n    process.cwd(),\n    `fine_tuning_dataset_${project.name}.json`\n  )\n  fs.writeFileSync(outputPath, JSON.stringify(dataset, null, 2))\n\n  console.log(`Dataset created with ${dataset.length} entries.`)\n  console.log(`Dataset saved to: ${outputPath}`)\n\n  // Create fine-tuning-data-[project-name].jsonl\n  const jsonlOutputPath = path.join(\n    process.cwd(),\n    `fine-tuning-data-${project.name}.jsonl`\n  )\n  const jsonlContent = dataset\n    .map((entry) => {\n      const oldFileWithLineNumbers = entry.oldFile\n        .split('\\n')\n        .map((line, index) => `${index + 1}|${line}`)\n        .join('\\n')\n      const conversation = {\n        messages: [\n          {\n            role: 'user',\n            content: `\nHere's an old file:\n\n\\`\\`\\`\n${oldFileWithLineNumbers}\n\\`\\`\\`\n\nAnd here's a sketch of the changes:\n\n\\`\\`\\`\n${entry.claudeSketch}\n\\`\\`\\`\n\nPlease produce a patch file based on this change.\n`.trim(),\n          },\n          {\n            role: 'assistant',\n            content: entry.patch,\n          },\n        ],\n      }\n      return JSON.stringify(conversation)\n    })\n    .join('\\n')\n\n  fs.writeFileSync(jsonlOutputPath, jsonlContent)\n  console.log(`JSONL file for fine-tuning created at: ${jsonlOutputPath}`)\n}\n\nfunction createTrainingAndValidationDatasets() {\n  const currentDate = new Date().toISOString().split('T')[0]\n  const allData: string[] = []\n\n  // Read all JSONL files\n  PROJECTS_LIST.forEach((project) => {\n    const jsonlPath = path.join(\n      process.cwd(),\n      `fine-tuning-data-${project.name}.jsonl`\n    )\n    const jsonlContent = fs.readFileSync(jsonlPath, 'utf-8')\n    const jsonlData = jsonlContent\n      .split('\\n')\n      .filter((line) => line.trim() !== '')\n    allData.push(...jsonlData)\n  })\n\n  // Shuffle the data\n  const shuffledData = shuffle(allData)\n\n  // Split into training and validation sets\n  const splitIndex = Math.floor(shuffledData.length * 0.9)\n  const trainingData = shuffledData.slice(0, splitIndex)\n  const validationData = shuffledData.slice(splitIndex)\n\n  // Write training data\n  const trainingOutputPath = path.join(\n    process.cwd(),\n    `fine-tuning-training-data-${currentDate}.jsonl`\n  )\n  fs.writeFileSync(trainingOutputPath, trainingData.join('\\n'))\n  console.log(`Training data saved to: ${trainingOutputPath}`)\n\n  // Write validation data\n  const validationOutputPath = path.join(\n    process.cwd(),\n    `fine-tuning-validation-data-${currentDate}.jsonl`\n  )\n  fs.writeFileSync(validationOutputPath, validationData.join('\\n'))\n  console.log(`Validation data saved to: ${validationOutputPath}`)\n}\n\nasync function main() {\n  if (!process.env.ANTHROPIC_API_KEY) {\n    console.error(\n      'Error: ANTHROPIC_API_KEY is not set. Please set this environment variable before running the script.'\n    )\n    return\n  }\n\n  const progress = loadProgress()\n  for (const project of PROJECTS_LIST) {\n    await createDataset(project, progress[project.name] || [])\n  }\n  createTrainingAndValidationDatasets()\n}\n\nmain().catch(console.error)\n",
    'test/__src__/generate-knowledge-files.test.ts':
      "import { expect, describe, it, mock } from 'bun:test'\nimport { WebSocket } from 'ws'\n\nimport { generateKnowledgeFiles } from 'backend/generate-knowledge-files'\nimport {\n  messages as cacheExpirationMessages,\n  mockFileContext as cacheExpirationFileContext,\n  expectedFiles as cacheExpirationExpectedFiles,\n} from 'test/__mock-data__/knowledge-files/cache-expiration'\nimport { ProjectFileContext } from 'common/util/file'\nimport { FileChange, Message } from 'common/actions'\n\nconst CLAUDE_CALL_TIMEOUT = 1000 * 150\nconst mockWs = {\n  send: mock(),\n} as unknown as WebSocket\n\nconst runGenKnowledgeFilesTest = async (\n  fileContext: ProjectFileContext,\n  messages: Message[],\n  expectedFiles: FileChange[]\n) => {\n  const responses = await generateKnowledgeFiles(\n    'userId',\n    mockWs,\n    '',\n    fileContext,\n    messages\n  )\n  const fileChanges = await Promise.all(responses)\n  expect(fileChanges.length).toBeGreaterThanOrEqual(expectedFiles.length)\n}\n\ndescribe('generateKnowledgeFiles', () => {\n  it(\n    'should not generate knowledge files for a cache expiration change',\n    async () => {\n      await runGenKnowledgeFilesTest(\n        cacheExpirationFileContext,\n        cacheExpirationMessages,\n        cacheExpirationExpectedFiles\n      )\n    },\n    CLAUDE_CALL_TIMEOUT\n  )\n\n  it(\n    'should generate a knowledge file for web scraping library change',\n    async () => {\n      await runGenKnowledgeFilesTest(mockFileContext, messages, [])\n    },\n    CLAUDE_CALL_TIMEOUT\n  )\n})\n",
    'common/src/project-file-tree.ts':
      "import fs from 'fs'\nimport path from 'path'\nimport * as ignore from 'ignore'\nimport { FileTreeNode } from './util/file'\n\nexport function getProjectFileTree(projectRoot: string): FileTreeNode[] {\n  const defaultIgnore = ignore.default()\n  defaultIgnore.add('.git')\n\n  function buildTree(dir: string, parentIgnore: ignore.Ignore): FileTreeNode[] {\n    const currentIgnore = parseGitignore(dir)\n    const mergedIgnore = ignore.default().add(parentIgnore).add(currentIgnore)\n    const children: FileTreeNode[] = []\n\n    try {\n      const files = fs.readdirSync(dir)\n      for (const file of files) {\n        const filePath = path.join(dir, file)\n        const relativeFilePath = path.relative(projectRoot, filePath)\n\n        if (mergedIgnore.ignores(relativeFilePath)) {\n          continue\n        }\n\n        try {\n          const stats = fs.statSync(filePath)\n          if (stats.isDirectory()) {\n            children.push({\n              name: file,\n              type: 'directory',\n              children: buildTree(filePath, mergedIgnore),\n            })\n          } else {\n            children.push({\n              name: file,\n              type: 'file',\n            })\n          }\n        } catch (error: any) {\n          // Don't print errors, you probably just don't have access to the file.\n          // console.error(`Error processing file ${filePath}:`, error)\n        }\n      }\n    } catch (error: any) {\n      // Don't print errors, you probably just don't have access to the directory.\n      // console.error(`Error reading directory ${dir}:`, error)\n    }\n\n    return children\n  }\n\n  return buildTree(projectRoot, defaultIgnore)\n}\n\nfunction parseGitignore(dirPath: string): ignore.Ignore {\n  const ig = ignore.default()\n  const gitignorePath = path.join(dirPath, '.gitignore')\n  const manicodeignorePath = path.join(dirPath, '.manicodeignore')\n\n  if (fs.existsSync(gitignorePath)) {\n    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8')\n    const lines = gitignoreContent.split('\\n')\n    for (const line of lines) {\n      ig.add(line.startsWith('/') ? line.slice(1) : line)\n    }\n  }\n\n  if (fs.existsSync(manicodeignorePath)) {\n    const manicodeignoreContent = fs.readFileSync(manicodeignorePath, 'utf8')\n    const lines = manicodeignoreContent.split('\\n')\n    for (const line of lines) {\n      ig.add(line.startsWith('/') ? line.slice(1) : line)\n    }\n  }\n\n  return ig\n}\n\nexport function getAllFilePaths(\n  nodes: FileTreeNode[],\n  basePath: string = ''\n): string[] {\n  return nodes.flatMap((node) => {\n    if (node.type === 'file') {\n      return [path.join(basePath, node.name)]\n    }\n    return getAllFilePaths(node.children || [], path.join(basePath, node.name))\n  })\n}",
    'common/src/util/file.ts':
      "import { z } from 'zod'\n\nexport const FileTreeNodeSchema: z.ZodType<FileTreeNode> = z.object({\n  name: z.string(),\n  type: z.enum(['file', 'directory']),\n  children: z.lazy(() => z.array(FileTreeNodeSchema).optional()),\n})\n\nexport interface FileTreeNode {\n  name: string\n  type: 'file' | 'directory'\n  children?: FileTreeNode[]\n}\n\nexport const ProjectFileContextSchema = z.object({\n  currentWorkingDirectory: z.string(),\n  fileTree: z.array(z.custom<FileTreeNode>()),\n  fileTokenScores: z.record(z.string(), z.record(z.string(), z.number())),\n  knowledgeFiles: z.record(z.string(), z.string()),\n  files: z.record(z.string(), z.string().nullable()),\n  gitChanges: z.object({\n    status: z.string(),\n    diff: z.string(),\n    diffCached: z.string(),\n    lastCommitMessages: z.string(),\n  }),\n  changesSinceLastChat: z.record(z.string(), z.string()),\n})\n\nexport type ProjectFileContext = z.infer<typeof ProjectFileContextSchema>\n\nexport const createFileBlock = (filePath: string, content: string) => {\n  return (\n    '<' +\n    `file path=\"${filePath}\">\n${content}\n</file` +\n    '>'\n  )\n}\nexport const createFileBlockWithoutPath = (content: string) => {\n  return (\n    '<' +\n    `file>\n${content}\n</file` +\n    '>'\n  )\n}\n\nexport const fileRegex = /<file path=\"([^\"]+)\">([\\s\\S]*?)<\\/file>/g\nexport const fileWithNoPathRegex = /<file>([\\s\\S]*?)<\\/file>/g\n\nexport const parseFileBlocks = (fileBlocks: string) => {\n  let fileMatch\n  const files: Record<string, string> = {}\n  while ((fileMatch = fileRegex.exec(fileBlocks)) !== null) {\n    const [, filePath, fileContent] = fileMatch\n    files[filePath] = fileContent.startsWith('\\n')\n      ? fileContent.slice(1)\n      : fileContent\n  }\n  return files\n}\n\nexport const parseFileBlocksWithoutPath = (fileBlocks: string) => {\n  let fileMatch\n  const files: string[] = []\n  while ((fileMatch = fileWithNoPathRegex.exec(fileBlocks)) !== null) {\n    const [, fileContent] = fileMatch\n    files.push(\n      fileContent.startsWith('\\n') ? fileContent.slice(1) : fileContent\n    )\n  }\n  return files\n}\n\nexport function printFileTree(\n  nodes: FileTreeNode[],\n  depth: number = 0\n): string {\n  let result = ''\n  const indentation = ' '.repeat(depth)\n  for (const node of nodes) {\n    result += `${indentation}${node.name}${node.type === 'directory' ? '/' : ''}\\n`\n    if (node.type === 'directory' && node.children) {\n      result += printFileTree(node.children, depth + 1)\n    }\n  }\n  return result\n}\n\nexport function printFileTreeWithTokens(\n  nodes: FileTreeNode[],\n  fileTokenScores: Record<string, Record<string, number>>,\n  path: string[] = []\n): string {\n  let result = ''\n  const depth = path.length\n  const indentToken = ' '\n  const indentation = indentToken.repeat(depth)\n  const indentationWithFile = indentToken.repeat(depth + 1)\n  for (const node of nodes) {\n    result += `${indentation}${node.name}${node.type === 'directory' ? '/' : ''}`\n    path.push(node.name)\n    const filePath = path.join('/')\n    const tokenScores = fileTokenScores[filePath]\n    if (node.type === 'file' && tokenScores) {\n      const tokens = Object.keys(tokenScores)\n      if (tokens.length > 0) {\n        result += `\\n${indentationWithFile}${tokens.join(' ')}`\n      }\n    }\n    result += '\\n'\n    if (node.type === 'directory' && node.children) {\n      result += printFileTreeWithTokens(node.children, fileTokenScores, path)\n    }\n    path.pop()\n  }\n  return result\n}\n",
    'backend/src/tools.ts':
      "import { Tool } from '@anthropic-ai/sdk/resources'\n\nexport const getTools = (): Tool[] => {\n  return [\n    {\n      name: 'update_file_context',\n      description: `Updates the context with a the set of existing files you want to read. Another assistant will try to choose files that will be helpful based on the message history. You should also provide a prompt that describes in natural language what files to add or remove from the context. Do not use this tool to create a new file, only to read existing files.`,\n      input_schema: {\n        type: 'object',\n        properties: {\n          prompt: {\n            type: 'string',\n            description:\n              'A prompt that describes in natural language what files to add or remove from the context. You can list specific files, or give general instructions about what files to include.',\n          },\n        },\n        required: ['prompt'],\n      },\n    } as Tool,\n    {\n      name: 'scrape_web_page',\n      description: `Retrieves the content of a web page given a URL. This tool is helpful when you need to gather information from external sources, such as documentation, APIs, or other web-based resources. Use this tool when the user asks for information that might be available on a specific website or when you need to reference external documentation to answer a question or solve a problem.`,\n      input_schema: {\n        type: 'object',\n        properties: {\n          url: {\n            type: 'string',\n            description: 'The URL of the web page to scrape',\n          },\n        },\n        required: ['url'],\n      },\n    } as Tool,\n    {\n      name: 'run_terminal_command',\n      description: `Executes a command in the terminal and returns the result. This tool allows the assistant to run shell commands, which can be useful for various tasks such as grepping for code references, installing dependencies, running scripts, or performing system operations. Use this tool when you need to execute a specific command in the user's terminal.`,\n      input_schema: {\n        type: 'object',\n        properties: {\n          command: {\n            type: 'string',\n            description: 'The command to run in the terminal',\n          },\n        },\n        required: ['command'],\n      },\n    } as Tool,\n    // {\n    //   name: 'search_manifold_markets',\n    //   description: `Searches for relevant markets on Manifold and returns a list of Yes/No markets with their probabilities. This tool should be used when the user wants to know about a future event, like who will win the next presidential election. You can search for a relevant prediction market, which is a question about the future, and get the market's forecast as a probability which you can interpret.`,\n    //   input_schema: {\n    //     type: 'object',\n    //     properties: {\n    //       query: {\n    //         type: 'string',\n    //         description: 'The search query for finding relevant binary markets',\n    //       },\n    //       limit: {\n    //         type: 'number',\n    //         description: 'The maximum number of markets to return (default: 5)',\n    //       },\n    //     },\n    //   },\n    // } as Tool,\n  ]\n}\n\nexport const DEFAULT_TOOLS: Tool[] = getTools()\n",
    'test/__src__/process-stream.test.ts':
      "import { test, expect, mock } from 'bun:test'\nimport { processStreamWithFiles } from 'backend/process-stream'\n\ntest('processStreamWithFiles basic functionality', async () => {\n  const mockStream = async function* () {\n    yield 'before'\n    yield '<file path=\"test.txt\">file content</file>'\n    yield 'after'\n  }\n  const onFileStart = mock((filePath: string) => {})\n  const onFile = mock((filePath: string, content: string) => {})\n  const result = []\n  for await (const chunk of processStreamWithFiles(\n    mockStream(),\n    onFileStart,\n    onFile\n  )) {\n    result.push(chunk)\n  }\n  expect(result).toEqual([\n    'before',\n    `<file path=\\\"test.txt\\\">`,\n    '</file>',\n    'after',\n  ])\n  expect(onFileStart).toHaveBeenCalledWith('test.txt')\n  expect(onFile).toHaveBeenCalledWith('test.txt', 'file content')\n})\n",
  },
  gitChanges: {
    status:
      'On branch me/knowledge-files\nYour branch is ahead of \'origin/me/knowledge-files\' by 1 commit.\n  (use "git push" to publish your local commits)\n\nChanges to be committed:\n  (use "git restore --staged <file>..." to unstage)\n\tmodified:   test/__mock-data__/knowledge-files/cache-expiration.ts\n\tmodified:   test/__src__/generate-knowledge-files.test.ts\n\nChanges not staged for commit:\n  (use "git add <file>..." to update what will be committed)\n  (use "git restore <file>..." to discard changes in working directory)\n\tmodified:   backend/src/generate-knowledge-files.ts\n\tmodified:   bun.lockb\n\tmodified:   npm-app/package.json\n\tmodified:   npm-app/src/web-scraper.ts\n\n',
    diff: 'diff --git a/backend/src/generate-knowledge-files.ts b/backend/src/generate-knowledge-files.ts\nindex a4c3c71..a09a5e2 100644\n--- a/backend/src/generate-knowledge-files.ts\n+++ b/backend/src/generate-knowledge-files.ts\n@@ -5,6 +5,7 @@ import { processFileBlock } from \'./main-prompt\'\n import { promptClaude } from \'./claude\'\n import { getRelevantFilesPrompt, knowledgeFilesPrompt } from \'./system-prompt\'\n import { DEFAULT_TOOLS } from \'./tools\'\n+import { debugLog } from \'./util/debug\'\n \n export async function generateKnowledgeFiles(\n   userId: string,\n@@ -13,6 +14,11 @@ export async function generateKnowledgeFiles(\n   fileContext: ProjectFileContext,\n   initialMessages: Message[]\n ): Promise<Promise<FileChange>[]> {\n+  debugLog(\'generateKnowledgeFiles\', {\n+    fullResponse,\n+    fileContext,\n+    initialMessages,\n+  })\n   const systemPrompt = `\n     You are an assistant that helps developers create knowledge files for their codebase. You are helpful and concise, knowing exactly when enough information has been gathered to create a knowledge file. Here\'s some more information on knowledge files:\n     ${knowledgeFilesPrompt}\ndiff --git a/bun.lockb b/bun.lockb\nindex 618be04..2122b7e 100755\nBinary files a/bun.lockb and b/bun.lockb differ\ndiff --git a/npm-app/package.json b/npm-app/package.json\nindex 4ac3233..75cb609 100644\n--- a/npm-app/package.json\n+++ b/npm-app/package.json\n@@ -32,8 +32,8 @@\n   ],\n   "dependencies": {\n     "@types/diff": "5.2.1",\n-    "axios": "1.7.4",\n     "cheerio": "1.0.0",\n+    "crawlee": "^3.11.3",\n     "diff": "5.2.0",\n     "ignore": "5.3.2",\n     "lodash": "*",\ndiff --git a/npm-app/src/web-scraper.ts b/npm-app/src/web-scraper.ts\nindex ce679ce..8bf5d82 100644\n--- a/npm-app/src/web-scraper.ts\n+++ b/npm-app/src/web-scraper.ts\n@@ -1,4 +1,4 @@\n-import axios from \'axios\'\n+import { CheerioCrawler, Dataset } from \'crawlee\'\n import * as cheerio from \'cheerio\'\n \n // Global cache for scraped web pages\n@@ -11,17 +11,28 @@ export async function scrapeWebPage(url: string) {\n   }\n \n   try {\n-    const response = await axios.get(url)\n-    const html = response.data\n-    const $ = cheerio.load(html)\n+    const crawler = new CheerioCrawler({\n+      maxRequestsPerCrawl: 1,\n+      async requestHandler({ $, request }) {\n+        const content = $(\'body\').text()\n+        await Dataset.pushData({ url: request.url, content })\n+      },\n+    })\n \n-    // Extract the main content (you may need to adjust this selector based on the target websites)\n-    const content = $(\'body\').text()\n+    await crawler.run([url])\n \n-    // Store the scraped content in the cache\n-    scrapedPagesCache[url] = content\n+    const dataset = await Dataset.open()\n+    const { items } = await dataset.getData()\n \n-    return content\n+    // Extract the main content (you may need to adjust this selector based on the target websites)\n+    if (items.length > 0) {\n+      const content = items[0].content as string\n+      // Store the scraped content in the cache\n+      scrapedPagesCache[url] = content\n+      return content\n+    }\n+\n+    return \'\'\n   } catch (error) {\n     // console.error(\n     //   `Error scraping web page ${url}:`,\n',
    diffCached:
      "diff --git a/test/__mock-data__/knowledge-files/cache-expiration.ts b/test/__mock-data__/knowledge-files/cache-expiration.ts\nindex cc2af1c..e5c74e1 100644\n--- a/test/__mock-data__/knowledge-files/cache-expiration.ts\n+++ b/test/__mock-data__/knowledge-files/cache-expiration.ts\n@@ -1,4 +1,4 @@\n-import { Message } from 'common/src/actions'\n+import { FileChange, Message } from 'common/src/actions'\n import { ProjectFileContext } from 'common/src/util/file'\n \n export const mockFileContext: ProjectFileContext = {\n@@ -1617,3 +1617,5 @@ export const messages: Message[] = [\n     content: \"now let's update it to every 4 hours\\n\\n\",\n   },\n ]\n+\n+export const expectedFiles: FileChange[] = []\ndiff --git a/test/__src__/generate-knowledge-files.test.ts b/test/__src__/generate-knowledge-files.test.ts\nindex 1dd0a8e..7dd9b6e 100644\n--- a/test/__src__/generate-knowledge-files.test.ts\n+++ b/test/__src__/generate-knowledge-files.test.ts\n@@ -3,8 +3,9 @@ import { WebSocket } from 'ws'\n \n import { generateKnowledgeFiles } from 'backend/generate-knowledge-files'\n import {\n-  messages,\n-  mockFileContext,\n+  messages as cacheExpirationMessages,\n+  mockFileContext as cacheExpirationFileContext,\n+  expectedFiles as cacheExpirationExpectedFiles,\n } from 'test/__mock-data__/knowledge-files/cache-expiration'\n import { ProjectFileContext } from 'common/util/file'\n import { FileChange, Message } from 'common/actions'\n@@ -32,7 +33,19 @@ const runGenKnowledgeFilesTest = async (\n \n describe('generateKnowledgeFiles', () => {\n   it(\n-    'should not generate knowledge files for a cache change',\n+    'should not generate knowledge files for a cache expiration change',\n+    async () => {\n+      await runGenKnowledgeFilesTest(\n+        cacheExpirationFileContext,\n+        cacheExpirationMessages,\n+        cacheExpirationExpectedFiles\n+      )\n+    },\n+    CLAUDE_CALL_TIMEOUT\n+  )\n+\n+  it(\n+    'should generate a knowledge file for web scraping library change',\n     async () => {\n       await runGenKnowledgeFilesTest(mockFileContext, messages, [])\n     },\n",
    lastCommitMessages:
      "Add edits made by assistant into the response message\nJames Grugett (1):\n\nfeat: initial test\nfix: toolcall check\nfeat: don't generate knowledge file if previous call was a `tool_use`\nfix: added back james await fix\nMerge branch 'main' into me/knowledge-files\nfix: prompt engineering\nfix: better chain of thought prompting\nfix: better prompting\nfix: weird knowledge file overwrite issue\nfix: stop using editing files prompt",
  },
  changesSinceLastChat: {},
}

export const messages: Message[] = [
  {
    role: 'user',
    content:
      'i want to improve my `npm-app/web-scraper.ts` by using a package called `crawlee` instead of axios. can you help me replace the existing axios call with a crawlee invocation that scrapes a url?\n\n',
  },
  {
    role: 'assistant',
    content: [
      {
        type: 'text',
        text: "Reading the following files...<files>npm-app/src/web-scraper.ts, npm-app/package.json, npm-app/src/tool-handlers.ts, npm-app/src/index.ts, npm-app/src/project-files.ts, npm-app/src/client.ts, npm-app/src/chat-storage.ts, npm-app/src/config.ts, backend/src/claude.ts, test/__mock-data__/app/expected.ts, scripts/generate-fine-tuning-dataset.ts, test/__src__/generate-knowledge-files.test.ts, common/src/project-file-tree.ts, common/src/util/file.ts, backend/src/tools.ts, test/__src__/process-stream.test.ts</files>\n\nCertainly! I'll help you replace the axios call with a crawlee invocation in the `npm-app/web-scraper.ts` file. First, let's update the file to use crawlee instead of axios. We'll need to install the crawlee package and make some changes to the code.\n\nLet's start by installing the crawlee package:",
      },
      {
        type: 'tool_use',
        id: 'toolu_01H37Zd89hgQW88vyr7Myg4C',
        name: 'run_terminal_command',
        input: {
          command: 'cd npm-app && bun add crawlee',
        },
      },
    ],
  },
  {
    role: 'user',
    content: [
      {
        type: 'tool_result',
        tool_use_id: 'toolu_01H37Zd89hgQW88vyr7Myg4C',
        content:
          '<terminal_command_result>\n<stdout>\ninstalled crawlee@3.11.3 with binaries:\n - crawlee\n\n2 packages installed [1078.00ms]\n</stdout>\n<stderr>bun add v1.1.26 (0a37423b)\nResolving dependencies\nResolved, downloaded and extracted [230]\nSaved lockfile\n</stderr>\n<status>Command completed</status>\n<exit_code>0</exit_code>\n</terminal_command_result>',
      },
    ],
  },
  {
    role: 'assistant',
    content:
      '\n\nGreat! Now that we have installed crawlee, let\'s update the `npm-app/src/web-scraper.ts` file to use crawlee instead of axios:\n\n<file path="npm-app/src/web-scraper.ts">import { CheerioCrawler, Dataset } from \'crawlee\'\nimport * as cheerio from \'cheerio\'\n\n// Global cache for scraped web pages\nconst scrapedPagesCache: Record<string, string> = {}\n\nexport async function scrapeWebPage(url: string) {\n  // Check if the page is already in the cache\n  if (scrapedPagesCache[url] !== undefined) {\n    return scrapedPagesCache[url]\n  }\n\n  try {\n    const crawler = new CheerioCrawler({\n      maxRequestsPerCrawl: 1,\n      async requestHandler({ $, request }) {\n        const content = $(\'body\').text()\n        await Dataset.pushData({ url: request.url, content })\n      },\n    })\n\n    await crawler.run([url])\n\n    const dataset = await Dataset.open()\n    const { items } = await dataset.getData()\n\n    if (items.length > 0) {\n      const content = items[0].content as string\n      // Store the scraped content in the cache\n      scrapedPagesCache[url] = content\n      return content\n    }\n\n    return \'\'\n  } catch (error) {\n    scrapedPagesCache[url] = \'\'\n    return \'\'\n  }\n}\n\n// ... rest of the file remains unchanged\n\nexport function parseUrlsFromContent(content: string): string[] {\n  const urlRegex = /https?:\\/\\/[^\\s]+/g\n  return content.match(urlRegex) || []\n}\n\nexport async function getScrapedContentBlocks(urls: string[]) {\n  const blocks: string[] = []\n  for (const url of urls) {\n    const scrapedContent = await scrapeWebPage(url)\n    if (scrapedContent) {\n      blocks.push(\n        `<web_scraped_content url="${url}">\\n${scrapedContent}\\n</web_scraped_content>`\n      )\n    }\n  }\n  return blocks\n}\n</file>\n\nNow, let\'s update the `npm-app/package.json` file to remove the axios dependency since we\'re no longer using it:\n\n<file path="npm-app/package.json">{\n  "name": "manicode",\n  "version": "1.0.61",\n  "description": "AI dev assistant",\n  "license": "MIT",\n  "main": "dist/index.js",\n  "types": "dist/index.d.ts",\n  "bin": {\n    "manicode": "dist/index.js"\n  },\n  "scripts": {\n    "prebuild": "bun clean && cd ../common && bun run build",\n    "build": "tsc && tsc-alias",\n    "postbuild": "mkdir -p dist/common && cp -r ../common/dist/* dist/common && tsc-alias",\n    "clean": "rm -rf dist && (rm tsconfig.tsbuildinfo || true)",\n    "prepublishOnly": "bun run build && bun run clean-package.js",\n    "postpublish": "echo \\"const fs=require(\'fs\');fs.copyFileSync(\'temp.package.json\',\'package.json\');fs.unlinkSync(\'temp.package.json\');\\" | bun run -",\n    "format": "prettier --write \\"**/*.{ts,tsx,json,md}\\"",\n    "start-js": "bun run dist/index.js ..",\n    "start": "ts-node src/index.ts ..",\n    "start-manifold": "ts-node src/index.ts ../../manifold",\n    "start-litestar": "ts-node src/index.ts ../test/__mock-projects__/litestar",\n    "start-jpcsp": "ts-node src/index.ts ../test/__mock-projects__/jpcsp",\n    "start-vscode": "ts-node src/index.ts ../test/__mock-projects__/vscode",\n    "start-nushell": "ts-node src/index.ts ../test/__mock-projects__/nushell",\n    "start-prod": "NODE_ENV=production ts-node src/index.ts",\n    "ssh": "gcloud compute ssh manicode-backend --zone=us-east4-a"\n  },\n  "files": [\n    "dist",\n    "README.md"\n  ],\n  "dependencies": {\n    "@types/diff": "5.2.1",\n    "cheerio": "1.0.0",\n    "crawlee": "^3.11.3",\n    "diff": "5.2.0",\n    "ignore": "5.3.2",\n    "lodash": "*",\n    "nanoid": "5.0.7",\n    "picocolors": "1.1.0",\n    "systeminformation": "5.23.4",\n    "tree-sitter": "0.21.1",\n    "tree-sitter-c": "0.23.0",\n    "tree-sitter-c-sharp": "0.23.0",\n    "tree-sitter-cpp": "0.23.0",\n    "tree-sitter-go": "0.23.1",\n    "tree-sitter-java": "0.23.2",\n    "tree-sitter-javascript": "0.23.0",\n    "tree-sitter-php": "0.23.2",\n    "tree-sitter-python": "0.23.2",\n    "tree-sitter-ruby": "0.23.0",\n    "tree-sitter-rust": "0.23.0",\n    "tree-sitter-typescript": "0.23.0",\n    "ts-pattern": "^5.3.1",\n    "ws": "8.18.0",\n    "zod": "3.23.8"\n  },\n  "devDependencies": {\n    "@types/lodash": "^4.17.7",\n    "@types/node": "^22.1.0",\n    "@types/systeminformation": "^3.54.1",\n    "@types/ws": "^8.2.0",\n    "typescript": "5.5.4"\n  },\n  "peerDependencies": {\n    "@types/lodash": "*",\n    "@types/node": "*",\n    "typescript": "*"\n  }\n}\n</file>\n\nThese changes replace the axios-based web scraping with a crawlee-based implementation. The new implementation uses CheerioCrawler from crawlee to fetch and parse the web page content. It maintains the same caching mechanism and overall structure of the original code.\n\nHere\'s a summary of the changes:\n\n1. Installed the crawlee package.\n2. Updated `npm-app/src/web-scraper.ts` to use CheerioCrawler instead of axios.\n3. Removed the axios dependency from `npm-app/package.json`.\n\nThe new implementation should provide similar functionality to the previous one, but with the added benefits of using crawlee, which is a more robust and feature-rich web scraping library.\n\nIs there anything else you\'d like me to modify or explain about these changes?\n\n',
  },
  {
    role: 'user',
    content:
      "great, now let's add a cache so we can refresh the webpage at regular intervals, but not every time we need it\n\n",
  },
]

export const expectedFiles: FileChange[] = [
  {
    type: 'patch',
    filePath: 'npm-app/knowledge.md',
    content: `
    # Web Scraping and Caching in Manicode
    
    ## Crawlee Integration
    
    Manicode uses the \`crawlee\` library for web scraping instead of axios. This provides more robust and feature-rich web scraping capabilities.
    
    ## Caching Mechanism
    
    The web scraper implements a caching system with timed refreshes. This approach offers several benefits:
    
    1. Reduced load on external servers: By caching results, we minimize repeated requests to the same URLs.
    2. Improved performance: Cached results can be returned quickly without making a new web request.
    3. Balance between data freshness and efficiency: Regular cache refreshes ensure data doesn't become stale while still maintaining performance benefits.
    
    The cache refresh interval should be set based on the specific needs of the project, considering factors such as:
    - How frequently the scraped data typically changes
    - The acceptable level of data staleness
    - The volume of web scraping requests made by the application
    
    Developers should be aware of this caching mechanism when working with or debugging the web scraper, as it may affect the immediacy of data updates.
    `,
  },
]
