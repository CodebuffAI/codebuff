import { FileChange, Message } from 'common/src/actions'
import { ProjectFileContext } from 'common/src/util/file'

export const mockFileContext: ProjectFileContext = {
  currentWorkingDirectory: '/Users/me/Documents/manicode',
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
                {
                  name: 'tools.ts',
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
                {
                  name: 'crawlee.ts',
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
          name: 'bun.lockb',
          type: 'file',
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
      generateKnowledgeFiles: 3.2341413751451915,
    },
    'backend/src/generate-patch.ts': {
      generatePatch: 3.260551418852098,
    },
    'backend/src/index.ts': {},
    'backend/src/main-prompt.ts': {
      mainPrompt: 2.9064444180083515,
      getRelevantFileInfoMessage: 1.716592893623786,
      updateFileContext: 1.716592893623786,
      processFileBlock: 3.602462941199226,
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
      getSearchSystemPrompt: 4.763410644019523,
      getAgentSystemPrompt: 3.379782240270602,
      knowledgeFilesPrompt: 1.9961538365216809,
      getRelevantFilesPrompt: 3.379782240270602,
    },
    'backend/src/util/debug.ts': {
      DEBUG_MODE: 0.3656509454897687,
      debugLog: 1.8747415355448414,
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
      createFileBlock: 2.594979674015323,
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
    'common/src/util/tools.ts': {
      didClientUseTool: 1.278283318562035,
      getTools: 1.8015919171240695,
      DEFAULT_TOOLS: 0.7549747200000004,
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
      getTools: 1.638518376957167,
      executeToolCall: 0.6866371574495145,
    },
    'test/__mock-data__/duplicate-imports/new.ts': {
      searchManifoldMarkets: 1.1625777672033408,
      getTools: 1.638518376957167,
      executeToolCall: 0.6866371574495145,
    },
    'test/__mock-data__/duplicate-imports/old.ts': {
      getTools: 1.233973160172815,
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
      processChunk: 1.1092554959679735,
      streamResponse: 1.1092554959679735,
      mainPrompt: 1.8781328155187982,
      getRelevantFileInfoMessage: 1.1092554959679735,
      updateFileContext: 1.1092554959679735,
      processFileBlock: 2.3278972151110278,
    },
    'test/__mock-data__/hallucinated/new.ts': {
      processChunk: 0.6126173103557732,
      streamResponse: 0.6126173103557732,
    },
    'test/__mock-data__/hallucinated/old.ts': {
      mainPrompt: 2.04840713317586,
      getRelevantFileInfoMessage: 1.2098222509506975,
      updateFileContext: 1.2098222509506975,
      processFileBlock: 2.538947842949247,
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
    'test/__mock-data__/knowledge-files/crawlee.ts': {
      mockFileContext: 3.4393292800000017,
      messages: 3.4393292800000017,
      expectedFiles: 3.4393292800000017,
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
    'test/bun.lockb': {},
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
      'This file contains various ideas about how Manicode could work. Most of them are not what we\'ll end up doing, but it gives some flavor of the strategy.\n\n\n- Gather knowledge from users\n    - Through terminal\n        - [Manilearn.sh](http://Manilearn.sh) that just asks you questions\n        - Have an npm package so you can do `yarn manicode` or `yarn manilearn`? Or executable.\n        - Or, make manilearn an exclusively web app thing?\n            - Manicode should still send new knowledge as it learns when the user teaches it something it got wrong. It should condense that knowledge into a few sentences and an example of wrong and right.\n    - Through web app\n        - Add long form knowledge or short points\n            - Use markdown. With an editor that lets you insert code snippets\n        - Search over existing knowledge and edit or remove it\n        - Edit code from your browser???\n            - It could just create changes and you could approve them.\n            - You keep telling it to tweak stuff in just text. When satisfied, you hit the commit button. There is no commit message; that is generated. (commit message ends with “—manicode”)\n            - Might not be worth even having a terminal. You could just connect to github. Then you have permanent access to the files\n                - Some day it should just represent the code diffs itself and not use github except to read the current state of files.\n- Use it to prompt claude sonnet 3.5 in a repl, with learnings for how to get it to edit files\n- Have own script to gather info from codebase\n    - File structure\n    - Exported tokens\n    - Claude summary of each directory, computed recursively\n    - Try to find database schema. If not, ask for a file where it exists, or let them paste it in.\n    - Try to find api schema. If not ask where it is.\n    - Overall knowledge of tech stack and how the technologies are used.\n    \n\n## Problems\n\n- ~~It’s hard to get it to edit the files properly~~\n    - It defaults to a lazy style of specifying the changes where it writes the line it’s adding and adds a comment saying “// the next part is the same as before”\n    - When you do force it into a framework, like with <replace> and <with> blocks, it is more likely to forget imports and other small changes\n    - Should try again with getting it to specify things naturally and then translate that into replace blocks with another claude call?\n        - [J] I did this, and it seems to be working.\n    - Add it to the system prompt to ingrain the replace-with structure?\n    - Use <A> and <B> tags in hopes that it will be less lazy?\n- [x]  It cuts off after a long change\n- What’s the app structure of Manicode?\n    - Users should use it as a console application\n    - They should install it as an npm package (later: python package)\n    - It has a basic console application that communicates with the server\n        - has to reveal a significant portion of the algorithm\n            - Unless we upload their whole codebase to the server?\n        - Upload files to our server vs. thin wrapper calls to claude that go through our server\n            - The latter still does upload files to our server. It applies the edits locally (which we might still do under the previous approach). It does reveal the prompts\n        - Call claude directly. Can’t leak our key, but they could set theirs\n            - This is a bad user experience, so no\n        - Winner is upload files to server.\n            - But we can do it just-in-time?\n                - Send list of files and exports up on init\n                - Send files when claude asks for them\n            - Vs. Maintain files\n                - We might move in this direction over time. But it’s easier to start with just-in-time fetching of files\n    - Node application on client\n        - Reads files, Reads user input\n        - Maintains a websocket with server where we send files and user input, and receive claude’s output chats + file updates\n    - Server\n        - Maintains websockets with clients\n        - Makes calls to Claude\n\n## Stages\n\n- Discussion\n    \n    I want to maximize learning while not doing duplicate work. I’m working toward an application that other people can try out. Their dogfooding will be important.\n    \n    I’m already confident enough that I want to build out this prototype app.\n    \n    - Seems like the tool calls will be necessary for external use. So I want to try that\n    - The way the app tracks lessons will be key to how it is used. So I can also try implementing that to get some iteration in there.\n    - Only after that should I ship the prototype, and have manifold people start using it (they can add knowledge) to get feedback.\n- [x]  Local manicode script\n- [x]  Set up server\n- [x]  Make claude calls via server\n    - Just a user prompt and file information sent via websocket\n    - Server then runs all the claude calls, and streams the response, including file changes to apply\n- [x]  Tool calls to fetch the files\n    - Necessary for codebases where I can’t load all the files into context (unlike manicode)\n- [ ]  Track lessons\n    - Go to non-canonical mode for terminal.\n    - Set up menu system\n        - Can cancel out of an ongoing prompt.\n        - Use up and down arrows to go through history of prompts\n        - After prompt finishes, you have menu options\n            - Space: continue\n            - r: revert change\n            - l: add a lesson based on this change and possibly previous changes in the conversation\n            - Esc: back to prompt creation\n                - Esc: main menu\n                    - l: lessons. You can type a lesson or scroll through history of lessons\n                    - Space: go to a new prompt\n                    - Esc: quit application\n    - Save lessons locally? .manicode file\n        - A lot simpler techically than trying to merge your knowledge with other team members\n        - You know all the knowledge added. It conforms to your own style.\n        - But, most of the codebase knowledge is in common. You are just creating more work for each engineer.\n            - Allow users to export and import lessons!\n        - Alternately, users commit their lessons to a tracked file (lessons.manicode.md). People can view and modify the lessons others have added. (or they can add to git ignore)\n            - This is great. It’s super transparent, and can use existing coding tools like git, or text editors to update the lessons.\n            - It supports the single player and multiplayer use cases.\n            - Markdown file with lessons separated by dividers: ‘—-’\n            - Can create lessons in any directory and they are all added in, with the path.\n                - Allows you to better organize your knowledge if you have hundreds of lessons. Makes it easier for you to find and update stuff.\n            - Users will rapidly iterate to create the best knowledge. It’s basically prompt engineering lol\n                - What about lessons within the code? A long comment that can be added to knowledge.\n        - Potentially just called `knowledge.md`, so every application can use it and update it.\n            - Wait, this is very similar to README.md!\n                - But also, it’s not for exactly the same purpose. It’s for the machine. I think that means it could be worth having it’s own file.\n            - Could just give up on discrete lessons, and have the llm update the knowledge file for you in markdown. Hierarchical info is better anyway, with the headings.\n                - Track your progress by the number of characters of knowledge instead!\n        - Manicode is good at editing files!\n        - `knowledge.md` files should be created in the relevant directory for the info.\n            - Manicode will edit your .gitignore to include them (if you startup without any pre-existing knowledge files), but recommend you actually commit them.\n                - Or, maybe it won’t. Because knowledge files are such a good idea.\n        - Manicode should not ask, it should just add knowledge whenever it feels like. That’s an even better experience.\n        - You can run manicode from any directory, and it only sees inside the directory it is run from.\n            - E.g. if you want to cd into backend to reduce the scope of what it can see and change\n        - To start, there’re no user settings. No saved data. You pay a subscription which limits your usage per month.\n        - We should prompt manicode to freely edit knowledge files when it learns something. You can just tell it it did something wrong and it will unprompted add knowledge. You of course review the changes as file diffs.\n            - It can use a tool call? Or, nope, it just adds knowledge files and edits them all the time.\n        - You put in a credit card. It charges based on usage. $20 at a time. It emails you when it charges again. No subscription plan! Just pay for what you use, man.\n            - Simply charge 2x of what anthropic charges. Done.\n            - Subscriptions are annoying and are stealing from you when you don’t use it all.\n            - Alternately, you get a bill at the end of the month and pay then. That’s what cloud compute companies do. This is a better user experience. Maybe with a one-time activation fee ($10).\n        - Signup is email & credit card\n            - You get a private key which you use to bill your credit card. Can spread among your team. Or regenerate it.\n- [ ]  Npm package\n    - Install -g manicode and run it in manifold codebase\n    - Host a prod server\n- [ ]  Add postgres\n\n## Ideas\n\n- Use “tools” to have the llm able to ask for a file, we send it to our server, and then add it to the claude call’s context, and continue generating\n- Console application can turn off canonical mode (I think that’s what it was?) and then accept more rich input\n- Effort modes: 1 minutes, 15 minutes, 2 hours\n    - Response instantly, or work hard to come up with good design and a fuller implementation\n- Use [Greptile](https://www.greptile.com/) to index the code base and ask it knowledge questions to become context\n- Focus on learning after usage and ask for how to do better\n    - Explicitly ask the user to list out separate lessons. Have gpt compile the learnings with the rest of the context to produce knowledge entries\n        - Enter up to 3 lessons\n    - Tell them this is how it will improve. It won’t make the mistake again! (probably)\n    - Show ‘x%’ rating toward becoming a seasoned engineer, and increase it with every bit of knowledge (Every percent is one piece of knowldge)\n        - “5% trained - Junior engineer”\n        - Give a new title every 10%. After 100%, keep giving new titles on larger intervals\n        - New idea: 1% per commit to a knowledge file\n- Viral\n    - Share manicode rank\n    - Share wins: Your prompt, and the result\n    - Refer friends. Get $15 credit each\n\n\n\nWish list\n- Give the assistant full command of the terminal so it can run stuff like `yarn add` or `git commit`\n- Use the up and down arrow keys to scroll through previous messages. Use escape to show menu, and keys to navigate (e.g. to create a new chat, exit, etc.)\n- Add a rigorous testing suite to make sure each prompt is working as intended across many cases.\n- Save conversations locally in a file. Maybe .manicode? Include a setting for setting the root directory (and thus defaulting to running manicode in that directory so it can always see the whole project)?\n\n\n<web_scraped_content url="http://Manilearn.sh)">\nwindow.location="http://dnserrorassist.att.net/search/?q="+escape(window.location)+"&r="+escape(document.referrer)+"&t=0&srchgdeCid=aaaaaaaa&bc=";\n</web_scraped_content>',
    'npm-app/knowledge.md':
      "# Manicode Project Structure\n\n## Overview\n\nManicode is an AI-powered development assistant that runs from the command line. It has access to all files in your project and can carry out various tasks.\n\n## Project Structure\n\n### Root Directory\n\n- `package.json`: Defines the project dependencies, scripts, and metadata.\n- `tsconfig.json`: TypeScript configuration file.\n- `README.md`: Project documentation and usage instructions.\n\n### Source Code (`src/`)\n\nThe `src/` directory contains the main TypeScript source files:\n\n- `index.ts`: Entry point of the application. Sets up the main `manicode` function.\n- `chat-client.ts`: Implements the `ChatClient` class for handling WebSocket communication.\n- `config.ts`: Contains configuration-related functions and constants.\n- `chat-storage.ts`: Manages chat storage functionality.\n- `cli.ts`: Implements the Command Line Interface.\n- `project-files.ts`: Handles project file operations.\n\n### Build Output (`dist/`)\n\nThe `dist/` directory contains the compiled JavaScript files and is created during the build process.\n\n## Project File Handling\n\n- Manny can only view files that are not gitignored. This is partially to save tokens when we list out all the files.\n- Multiple `.gitignore` files can exist throughout the project structure.\n- When traversing the project structure, we need to accumulate and apply ignore patterns from all encountered `.gitignore` files.\n\n## Key Components\n\n1. **ChatClient**: Manages WebSocket communication with the server, handles subscriptions, and processes messages.\n\n2. **ChatStorage**: Responsible for storing and managing chat data.\n\n3. **CLI**: Implements the command-line interface for user interaction.\n\n4. **Config**: Handles environment variables and configuration settings.\n\n## Build Process\n\nThe build process is defined in `package.json`:\n\n1. Builds the `common` project (located in a sibling directory).\n2. Builds the `npm-app` project using TypeScript.\n3. Copies necessary files from the `common` project and the current project to the `dist/` directory.\n\n## Dependencies\n\n- ts-pattern: Used for pattern matching in TypeScript. Installed to improve type safety and readability when checking message types.\n\n- The project depends on a `common` package (version 1.0.0) which is likely a shared library.\n- Uses `lodash` for utility functions.\n- TypeScript is used for development.\n\n## TypeScript Configuration\n\n- The project uses CommonJS modules.\n- Strict type checking is enabled.\n- The `common/*` path is mapped to `../common/dist/*` for importing shared components.\n\n## Usage\n\nManicode can be started by running the `manicode` command in the terminal after installation. It provides a menu interface (accessible by pressing `Esc`) and allows navigation through file versions using arrow keys.\n\n## Knowledge Management\n\nManicode encourages storing knowledge alongside code using `knowledge.md` files. These files provide context, guidance, and tips for the AI as it performs tasks.\n\n## Build and Publish Process\n\nWhen publishing the Manicode package, we use a custom process to ensure that only necessary information is included in the published package and that the environment is set correctly:\n\n1. The `prepublishOnly` script runs `clean-package.js` before publishing.\n2. `clean-package.js` does the following:\n   - Saves the current `package.json` to `temp.package.json`.\n   - Modifies the original `package.json` by removing `devDependencies`, `peerDependencies`, and unnecessary `scripts`.\n   - Writes the modified `package.json` back to its original location.\n   - Adds `process.env.NODE_ENV = 'production';` as the second line of `dist/index.js`.\n3. npm publishes the package using the modified `package.json`.\n4. The `postpublish` script restores the original `package.json` from `temp.package.json` and then deletes the temporary file.\n\nThis approach ensures that:\n\n- The published package only includes necessary dependencies and scripts.\n- The development environment remains intact after publishing.\n- NODE_ENV is set to 'production' for the published package at runtime.\n\nTo publish the package:\n\n```bash\nnpm publish\n```\n\nThis will automatically run the `prepublishOnly` and `postpublish` scripts to handle the `package.json` modifications, environment setting, and cleanup.\n\nRemember to increment the version number in `package.json` before publishing a new version.\n\n## Package Management\n\nManicode uses Bun as its package manager. Always use Bun commands for managing dependencies instead of npm.\n\nKey points:\n\n- Use `bun add <package-name>` to install new packages.\n- Use `bun remove <package-name>` to remove packages.\n- Use `bun install` to install all dependencies after cloning the repository.\n\n## CLI Functionality\n\nThe CLI (Command Line Interface) has been updated to provide a more standard terminal experience:\n\n1. **Input Handling**: Uses the `readline` module for improved key handling.\n2. **Navigation**:\n   - Left and right arrow keys move the cursor within the input.\n   - Up and down arrow keys navigate through command history.\n3. **File Version Control**:\n   - `Ctrl+U`: Undo file changes (navigate to previous version)\n   - `Ctrl+R`: Redo file changes (navigate to next version)\n4. **Application Control**:\n   - `Ctrl+C`: Exit the application\n   - `Esc`: Toggle menu or stop the current AI response\n5. **Input Submission**: Press Enter to submit the current input.\n\nThese changes aim to provide a more intuitive and familiar experience for users while maintaining the unique features of Manicode.\n\n## Note on Project Evolution\n\nAs an AI-powered tool, Manicode is designed to learn and evolve. It can update knowledge files as it works, improving its understanding and capabilities over time.\n\n## WebSocket Communication\n\nThe `Client` class in `client.ts` manages WebSocket communication with the server:\n\n- Connects to the WebSocket server specified in the configuration.\n- Sends user input and receives responses from the AI.\n- Handles tool calls and their responses.\n- Manages the response stream, allowing for real-time updates and the ability to stop ongoing responses.\n\n## File Management\n\nThe `project-files.ts` module handles all file-related operations:\n\n- Reads and writes files within the project directory.\n- Traverses the project structure, respecting `.gitignore` files.\n- Applies changes to files based on AI suggestions.\n- Manages file versioning for undo/redo functionality.\n\n## Tool Handlers\n\nThe `tool-handlers.ts` file implements handlers for various tools:\n\n- `read_files`: Reads contents of specified files.\n- `scrape_web_page`: Retrieves content from a given URL.\n- `search_manifold_markets`: Searches for relevant prediction markets.\n- `run_terminal_command`: Executes shell commands in the user's terminal.\n\nThese tools extend Manicode's capabilities, allowing it to gather information and perform actions beyond simple code manipulation.\n\n## Error Handling\n\nError handling is implemented throughout the application:\n\n- WebSocket connection errors are caught and logged.\n- File read/write errors are handled gracefully.\n- Tool execution errors are captured and reported back to the AI.\n\nDevelopers should continue to improve error handling to ensure a smooth user experience and easier debugging.\n\n## Security Considerations\n\n- The application runs commands in the user's terminal, which could potentially be dangerous. Users should be cautious when using Manicode on sensitive projects.\n- File operations are restricted to the project directory to prevent unauthorized access to the user's system.\n- Web scraping and external API calls (e.g., Manifold Markets) should be used responsibly and in compliance with the respective services' terms of use.\n\n## Future Improvements\n\n1. Implement user authentication for the WebSocket connection.\n2. Add more robust error handling and user-friendly error messages.\n3. Implement a caching system for frequently accessed files to improve performance.\n4. Create a comprehensive test suite to ensure reliability across different environments.\n5. Enhance the CLI with more features, such as chat history browsing and export/import functionality.\n\n## User Input ID System\n\n1. Each user input generates a unique user input ID (using nanoid) on the client-side.\n2. The user input ID is passed to the server with the user input.\n3. All related responses, including tool calls and response chunks, include this user input ID.\n4. The user input ID remains consistent for all interactions related to a single user input.\n\nThis system allows for better tracking and correlation of user inputs with their corresponding responses and tool calls, while avoiding potential conflicts with individual message IDs.\n\n## Version Checking\n\n- The `Client` class in `client.ts` includes a subscription to 'npm-version-status' that checks if the current version is up to date.\n- If a newer version is available, a warning is displayed in yellow text.\n- Users are instructed to update using the command: `npm install -g manicode`\n- The version check is performed as part of the WebSocket subscription setup.\n\n## End of Document\n",
    'python-app/knowledge.md':
      '# Manicode Project Knowledge\n\n## Project Structure\n\nThe Manicode project follows the modern Python packaging structure:\n\n- `pyproject.toml`: Contains project metadata and build system requirements.\n- `src/manicode/`: Source code directory.\n- `tests/`: Directory for test files (currently empty).\n- `dist/`: Contains distribution files after building the package.\n- `LICENSE`: MIT License file.\n- `README.md`: Project description and usage instructions.\n\n## Build System\n\n- Uses `setuptools` as the build backend.\n- Configured to use the `src` layout for better separation of source code.\n\n## Package Information\n\n- Name: manicode\n- Description: An AI-powered coding assistant (coming soon)\n- Requires Python 3.6 or later\n\n## Distribution\n\n- The project can be built using the `build` package: `python -m build`\n- This creates both source (.tar.gz) and wheel (.whl) distributions in the `dist/` directory.\n\n## Development\n\n- For local development, install the package in editable mode: `pip install -e .`\n- Remember to update the version in `pyproject.toml` when making new releases.\n\n## Next Steps\n\n- Implement the main functionality of the AI-powered coding assistant.\n- Add tests in the `tests/` directory.\n- Update `README.md` with detailed usage instructions as features are developed.\n\n## Important Notes\n\n- The package currently uses a console script entry point, which should be implemented in the `manicode/__init__.py` file.\n- The project is in a pre-alpha state and not yet ready for public release.\n\nRemember to keep this knowledge file updated as the project evolves.\n',
    'todo.knowledge.md':
      "[x] Should indicate if diff is still generating somehow...\n    - send to client the file changes still planned. Wait for them before allowing user input?\n- Improve speed by prompting it to rely more on diffs instead of reproducing the whole file\n[x] Prompt engineer it to automatically make knowledge changes when you correct it\n[x] it's doing a poor job loading all the relevant files into context. Need to add more explicity steps for this.\n[x] Indenting fails when it makes multiple changes with different indent levels.\n[x] More chain of thought for main prompt. <planning> blocks, <code_review>, <brainstorm>, etc.\n[x] Delete files\n[x] Shift + Enter, and pasting in stuff with new lines. Update: not really possible\n\n[x] Failed to replace in the new contents (but did expand it for the old content):\n// ... (keep the existing setup code)\n[x] Continuation 2 led to infinite responses\n[x] cancelling before the prompt starts being genereated leads to error of two user messages in a row\n- Show commands available in a bar under the input (not sure if this is possible)\n[x] Escalate when old diff does not match. Got case where a helper function in the middle of two others was moved up, but diff didn't match because it ignored the helper function.\n[x] Stuck in loop: Prompting claude num messages: 21, continuing to generate\n[x] Backspace after typing more than one line is buggy\n\n[x] Dawson's case of wanting it to scrape documentation from a url and answer questions with it.\n- x% knowledge written in menu based on number of commits to knowledge files\n[x] How it could run bash:\n1. First, let's build the `common` package:\n\n```bash\ncd common\nyarn build\ncd ..\n```\nImportant. Can use commandline to search for code. Could move files.\n\n[x] Try asking first if the complete file is listed, and then automatically generate diffs.\n\n[] create some structure in a knowledge file for users to initially fill out.\n- Project overview\n - Goals\n - Project structure\n - Coding do's and don'ts\n\n [] reverting doesn't work with created files\n [x] File paths using too much context?\n [x] Error on server didn't print the error (or maybe it did and the terminal overwrote it...)\n [x] Change ip address to be from api.manicode.ai\n\nNotes from Janna & Stephen test\n[x] backspace on windows doesn't clear the char, just moves cursor\n[x] Tried to do left arrow and it didn't work\n[x] Failed to apply any edits. They all failed even after a second attempt. This was on Windows\n[x] CTRL-C doesn't work\n\n[] Kill if it continues too far without user prompt.\n[] Prompt it not to generate the whole file when just making a local edit. Consider just reproducting the function edited. Or a block a code.\n    - Before editing a file, get it to say what changes it will make and then edit just those sections.\n[x] Consider confirming with the user whether to go ahead and make a change if not that confident or want more input from the user\n[] Force updates: run the command to update app.\n[] Store previous user input's and always include that history in system prompt.\n    - Can also allow you to press up arrow to go through whole history\n[x] Changes prompt is printing object for most previous messages in message history\n[x] It keeps requesting files that are already in its context. Need to highlight those paths again somewhere?\n    - Requests a file before editing that it just got.\n[] Knowledge files should be treated more like regular files, but with system prompts to frequently include them\n\n\n-- Instead, of below, apply edits immediately. Track all changes for a message via an id. Fix conccurent request by subscribing/unsubscribing to response with id.\n[x] Give it a new marker token that will await all file changes, so then it can run tsc or tests, etc.\n    - It is using grep to see if changes went through, but they haven't so gets in a loop.\n    - Realized we could just apply the edits before the tool call. We were already passing them through.\n[x] Was able to start a concurrent request after cancelling the last one...\n[] Changes behavior like removing if guard if statements at the top, removing cases of logs/errors, adds <form>. It should only do the minimal change and assume existing code is there for a reason.\n[x] Terminal command that doesn't finish bricks manicode\n[x] Easy to forget to run it in root directory.\n[x] Allow pasting new lines based on timing strategy\n[] It's not saving useful info like that this is a Windows machine and it shouldn't be using grep into a knowledge file.\n[x] Budget of tokens when reading files, and skip files that put it over the limit.\n[x] Still does too many extra things\n[x] Doesn't consistently request new files when it needs to\n[x] Scrape urls by default, like we request files by default\n[x] The user may have edited files since your last change. Please try to notice and perserve those changes. Don't overwrite these please!\n[x] Show a message when manicode is out of date. Or figure out how to automatically update.\n[] The \"// add this blah\" comments are really annoying. Strip them out in the diff step\n[x] The comprehensive files list generates a huge amount of thinking that is probably slow\n[x] Try a lower temperature. Might prevent it from doing random stuff. \n    - apparently it's been 0 this whole time, huh (for claude)\n    - Also openai defaults to 0\n[] Add current file diff from main into context (git status/git diff?)\n\n[] It thought that update_file_context would create a file? (a knowledge file?)\n[] Claude doesn't leave a comment that there's more code in between when it should. Then lots gets deleted\n[] Try using the native stop marker feature\n[] Use tree sitter to include exported tokens ttps://github.com/tree-sitter/node-tree-sitter\n    See how github implemented code search: ttps://docs.github.com/en/repositories/working-with-files/using-files/navigating-code-on-github#precise-and-search-based-navigation\n[] Multiple file blocks for the same file could fail to patch\n[] Still hallucinating without getting the file: Totally destroyed my package .json by removing random scripts & dependencies, changing a bunch of stuff around\n[] Create tests for the full user input. Set up fake project data for this.\n[] Use gpt-4o mini to grade tests\n\n[] Updated a function in a file, but didn't include comments at the top or bottom for existing code\n[] Looks in wrong directory for a file, e.g. web/components/comments instead of web/components/buttons\n    web/components/profile/profile-comments.tsx instead of web/components/comments/profile-comments.tsx\n[] Ari: editing is failing: deleting sections of code it shouldn't.\n    - [J] Removes commented out code, other comments\n[] Doesn't give up control after running terminal commands. Just keeps running more\n[] Says reconnected, but actually doesn't go after\n[] Run in a containerls\n    - Maybe distribute as brew package which would have more permissions?\n    - Check files being edited to be within project dir (no '..')\n[x] Send a command, then just run it. if it goes through, print.\n    - thefuck util that could change \n    - should look more like shell\n    - could have two panel one for you, other shows claude's response. Claude's commands go on your side\n[] Got file path wrong: backend instead of npm-app for project-files\n[] Still is overwritting a user's change every time",
  },
  files: {
    'npm-app/src/web-scraper.ts':
      "import axios from 'axios'\nimport * as cheerio from 'cheerio'\n\n// Global cache for scraped web pages\nconst scrapedPagesCache: Record<string, { content: string; timestamp: number }> = {}\n\n// Cache refresh interval in milliseconds (e.g., 1 hour)\nconst CACHE_REFRESH_INTERVAL = 60 * 60 * 1000\n\nexport async function scrapeWebPage(url: string) {\n  const now = Date.now()\n\n  // Check if the page is already in the cache and not expired\n  if (scrapedPagesCache[url] && now - scrapedPagesCache[url].timestamp < CACHE_REFRESH_INTERVAL) {\n    return scrapedPagesCache[url].content\n  }\n\n  try {\n    const response = await axios.get(url)\n    const html = response.data\n    const $ = cheerio.load(html)\n\n    // Extract the main content (you may need to adjust this selector based on the target websites)\n    const content = $('body').text()\n\n    // Store the scraped content in the cache with the current timestamp\n    scrapedPagesCache[url] = { content, timestamp: now }\n\n    return content\n  } catch (error) {\n    // console.error(\n    //   error instanceof Error ? error.message : error\n    // )\n    scrapedPagesCache[url] = ''\n    return { content: '', timestamp: now }\n  }\n}\n\n\nexport function parseUrlsFromContent(content: string): string[] {\n  const urlRegex = /https?:\\/\\/[^\\s]+/g\n  return content.match(urlRegex) || []\n}\n\nexport async function getScrapedContentBlocks(urls: string[]) {\n  const blocks: string[] = []\n  for (const url of urls) {\n    const scrapedContent = await scrapeWebPage(url)\n    if (scrapedContent) {\n      blocks.push(\n        `<web_scraped_content url=\"${url}\">\\n${scrapedContent}\\n</web_scraped_content>`\n      )\n    }\n  }\n  return blocks\n}\n",
    'npm-app/src/client.ts':
      "import { green } from 'picocolors'\n\nimport packageJson from '../package.json'\nimport { APIRealtimeClient } from 'common/websockets/websocket-client'\nimport {\n  getFiles,\n  getProjectFileContext,\n  getProjectRoot,\n} from './project-files'\nimport { applyChanges } from 'common/util/changes'\nimport { ChatStorage } from './chat-storage'\nimport { FileChanges, Message } from 'common/actions'\nimport { toolHandlers } from './tool-handlers'\nimport { STOP_MARKER } from 'common/constants'\nimport { fingerprintId } from './config'\nimport { parseUrlsFromContent, getScrapedContentBlocks } from './web-scraper'\nimport { uniq } from 'lodash'\n\nexport class Client {\n  private webSocket: APIRealtimeClient\n  private chatStorage: ChatStorage\n  private currentUserInputId: string | undefined\n\n  constructor(\n    websocketUrl: string,\n    chatStorage: ChatStorage,\n    onWebSocketError: () => void\n  ) {\n    this.webSocket = new APIRealtimeClient(websocketUrl, onWebSocketError)\n    this.chatStorage = chatStorage\n  }\n\n  async connect() {\n    await this.webSocket.connect()\n    this.setupSubscriptions()\n    this.checkNpmVersion()\n  }\n\n  private setupSubscriptions() {\n    this.webSocket.subscribe('tool-call', async (a) => {\n      const { response, changes, data, userInputId } = a\n      if (userInputId !== this.currentUserInputId) {\n        return\n      }\n\n      const filesChanged = uniq(changes.map((change) => change.filePath))\n      this.chatStorage.saveFilesChanged(filesChanged)\n\n      applyChanges(getProjectRoot(), changes)\n\n      const { id, name, input } = data\n\n      const currentChat = this.chatStorage.getCurrentChat()\n      const messages = currentChat.messages\n      if (messages[messages.length - 1].role === 'assistant') {\n        // Probably the last response from the assistant was cancelled and added immediately.\n        return\n      }\n\n      const assistantMessage: Message = {\n        role: 'assistant',\n        content: [\n          {\n            type: 'text',\n            text: response,\n          },\n          {\n            type: 'tool_use',\n            id,\n            name,\n            input,\n          },\n        ],\n      }\n      this.chatStorage.addMessage(\n        this.chatStorage.getCurrentChat(),\n        assistantMessage\n      )\n\n      const handler = toolHandlers[name]\n      if (handler) {\n        const content = await handler(input, id)\n        const toolResultMessage: Message = {\n          role: 'user',\n          content: [\n            {\n              type: 'tool_result',\n              tool_use_id: id,\n              content,\n            },\n          ],\n        }\n        this.chatStorage.addMessage(\n          this.chatStorage.getCurrentChat(),\n          toolResultMessage\n        )\n        await this.sendUserInput(changes, userInputId)\n      } else {\n        console.error(`No handler found for tool: ${name}`)\n      }\n    })\n\n    this.webSocket.subscribe('read-files', (a) => {\n      const { filePaths } = a\n      const files = getFiles(filePaths)\n\n      this.webSocket.sendAction({\n        type: 'read-files-response',\n        files,\n      })\n    })\n\n    this.webSocket.subscribe('npm-version-status', (action) => {\n      const { isUpToDate, latestVersion } = action\n      if (!isUpToDate) {\n        console.warn(\n          green(\n            `\\nThere's a new version of Manicode! Please update to ensure proper functionality.\\nUpdate now by running: npm install -g manicode`\n          )\n        )\n      }\n    })\n  }\n\n  private checkNpmVersion() {\n    this.webSocket.sendAction({\n      type: 'check-npm-version',\n      version: packageJson.version,\n    })\n  }\n\n  async sendUserInput(previousChanges: FileChanges, userInputId: string) {\n    this.currentUserInputId = userInputId\n    const currentChat = this.chatStorage.getCurrentChat()\n    const { messages, fileVersions } = currentChat\n    const messageText = messages\n      .map((m) => JSON.stringify(m.content))\n      .join('\\n')\n    const filesContent = messageText.match(/<files>(.*?)<\\/files>/gs)\n    const lastFilesContent = filesContent\n      ? filesContent[filesContent.length - 1]\n      : ''\n    const fileList = lastFilesContent\n      .replace(/<\\/?files>/g, '')\n      .trim()\n      .split(', ')\n      .filter((str) => str)\n\n    const lastMessage = messages[messages.length - 1]\n    if (\n      lastMessage.role === 'user' &&\n      typeof lastMessage.content === 'string'\n    ) {\n      const urls = parseUrlsFromContent(lastMessage.content)\n      const blocks = await getScrapedContentBlocks(urls)\n      lastMessage.content += '\\n\\n' + blocks.join('\\n\\n')\n    }\n\n    const currentFileVersion =\n      fileVersions[fileVersions.length - 1]?.files ?? {}\n    const fileContext = await getProjectFileContext(\n      fileList,\n      currentFileVersion\n    )\n    this.webSocket.sendAction({\n      type: 'user-input',\n      userInputId,\n      messages,\n      fileContext,\n      previousChanges,\n      fingerprintId,\n    })\n  }\n\n  subscribeToResponse(\n    onChunk: (chunk: string) => void,\n    userInputId: string,\n    onStreamStart: () => void\n  ) {\n    let responseBuffer = ''\n    let resolveResponse: (value: {\n      response: string\n      changes: FileChanges\n      wasStoppedByUser: boolean\n    }) => void\n    let rejectResponse: (reason?: any) => void\n    let unsubscribeChunks: () => void\n    let unsubscribeComplete: () => void\n    let streamStarted = false\n\n    const responsePromise = new Promise<{\n      response: string\n      changes: FileChanges\n      wasStoppedByUser: boolean\n    }>((resolve, reject) => {\n      resolveResponse = resolve\n      rejectResponse = reject\n    })\n\n    const stopResponse = () => {\n      this.currentUserInputId = undefined\n      unsubscribeChunks()\n      unsubscribeComplete()\n      resolveResponse({\n        response: responseBuffer + '\\n[RESPONSE_STOPPED_BY_USER]',\n        changes: [],\n        wasStoppedByUser: true,\n      })\n    }\n\n    unsubscribeChunks = this.webSocket.subscribe('response-chunk', (a) => {\n      if (a.userInputId !== userInputId) return\n      const { chunk } = a\n\n      if (!streamStarted) {\n        streamStarted = true\n        onStreamStart()\n      }\n\n      responseBuffer += chunk\n      onChunk(chunk)\n\n      // Print a message when the response is complete, before the file changes are generated.\n      if (responseBuffer.includes(STOP_MARKER)) {\n        if (responseBuffer.includes('<' + '/file>'))\n          console.log('\\n\\nGenerating file changes. Please wait...')\n      }\n    })\n\n    unsubscribeComplete = this.webSocket.subscribe('response-complete', (a) => {\n      if (a.userInputId !== userInputId) return\n      unsubscribeChunks()\n      unsubscribeComplete()\n      resolveResponse({ ...a, wasStoppedByUser: false })\n      this.currentUserInputId = undefined\n    })\n\n    return {\n      responsePromise,\n      stopResponse,\n    }\n  }\n\n  public async warmContextCache() {\n    const fileContext = await getProjectFileContext([], {})\n\n    return new Promise<void>((resolve) => {\n      this.webSocket.subscribe('warm-context-cache-response', () => {\n        resolve()\n      })\n\n      this.webSocket\n        .sendAction({\n          type: 'warm-context-cache',\n          fileContext,\n          fingerprintId,\n        })\n        .catch((e) => {\n          // console.error('Error warming context cache', e)\n          resolve()\n        })\n\n      // If it takes too long, resolve the promise to avoid hanging the CLI.\n      setTimeout(() => {\n        resolve()\n      }, 15_000)\n    })\n  }\n}\n",
    'npm-app/src/project-files.ts':
      "import fs from 'fs'\nimport path from 'path'\nimport { exec } from 'child_process'\nimport { promisify } from 'util'\nimport { createPatch } from 'diff'\n\nimport { createFileBlock, ProjectFileContext } from 'common/util/file'\nimport { filterObject } from 'common/util/object'\nimport { parseUrlsFromContent, getScrapedContentBlocks } from './web-scraper'\nimport { getProjectFileTree, getAllFilePaths } from 'common/project-file-tree'\nimport { getFileTokenScores } from 'common/codemap/parse'\n\nconst execAsync = promisify(exec)\n\nlet projectRoot: string\n\nexport function initProjectRoot(dir: string | undefined) {\n  projectRoot = path.resolve(dir || getCurrentDirectory())\n  return projectRoot\n}\n\nlet currentWorkingDirectory: string = ''\n\nexport function getCurrentWorkingDirectory(): string {\n  return currentWorkingDirectory || getProjectRoot()\n}\n\nexport function setCurrentWorkingDirectory(directory: string) {\n  currentWorkingDirectory = directory\n}\n\nfunction getCurrentDirectory() {\n  try {\n    return process.cwd()\n  } catch (error) {\n    throw new Error(\n      'Failed to get current working directory. Is this directory deleted?',\n      { cause: error }\n    )\n  }\n}\n\nexport function getProjectRoot() {\n  return projectRoot\n}\n\nlet cachedProjectFileContext: ProjectFileContext | undefined\n\nexport const getProjectFileContext = async (\n  fileList: string[],\n  lastFileVersion: Record<string, string>\n) => {\n  const root = getProjectRoot()\n  const cwd = getCurrentWorkingDirectory()\n\n  const contextRoot = path.relative(root, cwd).startsWith('..') ? cwd : root\n\n  const files = getFiles(fileList)\n  const gitChanges = await getGitChanges()\n  const changesSinceLastChat = getChangesSinceLastFileVersion(lastFileVersion)\n  const updatedProps = {\n    files,\n    gitChanges,\n    changesSinceLastChat,\n  }\n\n  if (\n    !cachedProjectFileContext ||\n    cachedProjectFileContext.currentWorkingDirectory !== contextRoot\n  ) {\n    const fileTree = getProjectFileTree(contextRoot)\n    const knowledgeFilePaths = getAllFilePaths(fileTree).filter((filePath) =>\n      filePath.endsWith('knowledge.md')\n    )\n    const knowledgeFiles =\n      await getExistingFilesWithScrapedContent(knowledgeFilePaths)\n\n    const allFilePaths = getAllFilePaths(fileTree)\n    const fileTokenScores = await getFileTokenScores(contextRoot, allFilePaths)\n\n    cachedProjectFileContext = {\n      currentWorkingDirectory: contextRoot,\n      fileTree,\n      fileTokenScores,\n      knowledgeFiles,\n      ...updatedProps,\n    }\n  } else {\n    cachedProjectFileContext = {\n      ...cachedProjectFileContext,\n      ...updatedProps,\n    }\n  }\n\n  return cachedProjectFileContext\n}\n\nasync function getGitChanges() {\n  try {\n    const { stdout: status } = await execAsync('git status', {\n      cwd: projectRoot,\n    })\n    const { stdout: diff } = await execAsync('git diff', { cwd: projectRoot })\n    const { stdout: diffCached } = await execAsync('git diff --cached', {\n      cwd: projectRoot,\n    })\n    const { stdout: shortLogOutput } = await execAsync(\n      'git shortlog HEAD~10..HEAD',\n      {\n        cwd: projectRoot,\n      }\n    )\n    const shortLogLines = shortLogOutput.trim().split('\\n')\n    const lastCommitMessages = shortLogLines\n      .slice(1)\n      .reverse()\n      .map((line) => line.trim())\n      .join('\\n')\n\n    return { status, diff, diffCached, lastCommitMessages }\n  } catch (error) {\n    return { status: '', diff: '', diffCached: '', lastCommitMessages: '' }\n  }\n}\n\nexport function getChangesSinceLastFileVersion(\n  lastFileVersion: Record<string, string>\n) {\n  const changes = Object.entries(lastFileVersion)\n    .map(([filePath, file]) => {\n      const fullFilePath = path.join(getProjectRoot(), filePath)\n      try {\n        const currentContent = fs.readFileSync(fullFilePath, 'utf8')\n        if (currentContent === file) {\n          return [filePath, null] as const\n        }\n        return [filePath, createPatch(filePath, file, currentContent)] as const\n      } catch (error) {\n        // console.error(`Error reading file ${fullFilePath}:`, error)\n        return [filePath, null] as const\n      }\n    })\n    .filter(([_, diff]) => diff !== null) as [string, string][]\n  return Object.fromEntries(changes)\n}\n\nexport function getFiles(filePaths: string[]) {\n  const result: Record<string, string | null> = {}\n  for (const filePath of filePaths) {\n    const fullPath = path.join(projectRoot, filePath)\n    try {\n      const content = fs.readFileSync(fullPath, 'utf8')\n      result[filePath] = content\n    } catch (error) {\n      result[filePath] = null\n    }\n  }\n  return result\n}\n\nexport function getExistingFiles(filePaths: string[]) {\n  return filterObject(getFiles(filePaths), (value) => value !== null) as Record<\n    string,\n    string\n  >\n}\n\nexport async function getExistingFilesWithScrapedContent(\n  filePaths: string[]\n): Promise<Record<string, string>> {\n  const files = getExistingFiles(filePaths)\n  const result: Record<string, string> = {}\n\n  for (const [filePath, content] of Object.entries(files)) {\n    result[filePath] = content\n\n    if (filePath.endsWith('knowledge.md')) {\n      const scrapedBlocks = await getScrapedContentBlocks(\n        parseUrlsFromContent(content)\n      )\n      for (const block of scrapedBlocks) {\n        result[filePath] += `\\n\\n${block}`\n      }\n    }\n  }\n\n  return result\n}\n\nexport function setFiles(files: Record<string, string>) {\n  for (const [filePath, content] of Object.entries(files)) {\n    const fullPath = path.join(projectRoot, filePath)\n    fs.writeFileSync(fullPath, content, 'utf8')\n  }\n}\n\nexport function getFileBlocks(filePaths: string[]) {\n  const result: Record<string, string> = {}\n\n  for (const filePath of filePaths) {\n    const fullPath = path.join(projectRoot, filePath)\n    try {\n      const content = fs.readFileSync(fullPath, 'utf8')\n      result[filePath] = content\n    } catch (error) {\n      const fileDoesNotExist =\n        error instanceof Error &&\n        error.message.includes('no such file or directory')\n\n      result[filePath] = fileDoesNotExist\n        ? '[FILE_DOES_NOT_EXIST]'\n        : '[FILE_READ_ERROR]'\n\n      if (!fileDoesNotExist) {\n        console.error(\n          `Error reading file ${fullPath}:`,\n          error instanceof Error ? error.message : error\n        )\n      }\n    }\n  }\n\n  const fileBlocks = filePaths.map((filePath) =>\n    createFileBlock(filePath, result[filePath])\n  )\n\n  return fileBlocks.join('\\n')\n}\n\n/*\nfunction getExportedTokensForFiles(\n  filePaths: string[]\n): Record<string, string[]> {\n  const result: Record<string, string[]> = {}\n  const fullFilePaths = filePaths.map((filePath) =>\n    path.join(projectRoot, filePath)\n  )\n  const program = ts.createProgram(fullFilePaths, {})\n\n  for (let i = 0; i < filePaths.length; i++) {\n    const filePath = filePaths[i]\n    const fullFilePath = fullFilePaths[i]\n    const sourceFile = program.getSourceFile(fullFilePath)\n    if (sourceFile) {\n      try {\n        const exportedTokens = getExportedTokens(sourceFile)\n        result[filePath] = exportedTokens\n      } catch (error) {\n        console.error(`Error processing file ${fullFilePath}:`, error)\n        result[filePath] = []\n      }\n    } else {\n      // console.error(`Could not find source file: ${fullFilePath}`)\n      result[filePath] = []\n    }\n  }\n\n  return result\n}\n\nfunction getExportedTokens(sourceFile: ts.SourceFile): string[] {\n  const exportedTokens: string[] = []\n\n  function visit(node: ts.Node) {\n    if (ts.isExportDeclaration(node)) {\n      if (node.exportClause && ts.isNamedExports(node.exportClause)) {\n        node.exportClause.elements.forEach((element) => {\n          exportedTokens.push(element.name.text)\n        })\n      }\n    } else if (\n      ts.isFunctionDeclaration(node) ||\n      ts.isClassDeclaration(node) ||\n      ts.isVariableStatement(node)\n    ) {\n      if (\n        node.modifiers?.some(\n          (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword\n        )\n      ) {\n        if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) {\n          if (node.name) {\n            exportedTokens.push(node.name.text)\n          }\n        } else if (ts.isVariableStatement(node)) {\n          node.declarationList.declarations.forEach((declaration) => {\n            if (ts.isIdentifier(declaration.name)) {\n              exportedTokens.push(declaration.name.text)\n            }\n          })\n        }\n      }\n    }\n\n    ts.forEachChild(node, visit)\n  }\n\n  visit(sourceFile)\n\n  return exportedTokens\n}\n*/\n\nexport const deleteFile = (fullPath: string): boolean => {\n  try {\n    if (fs.existsSync(fullPath)) {\n      fs.unlinkSync(fullPath)\n      return true\n    }\n    return false\n  } catch (error) {\n    console.error(`Error deleting file ${fullPath}:`, error)\n    return false\n  }\n}\n",
    'npm-app/src/tool-handlers.ts':
      "import { spawn } from 'child_process'\nimport path from 'path'\nimport { green } from 'picocolors'\n\nimport { scrapeWebPage } from './web-scraper'\nimport { searchManifoldMarkets } from './manifold-api'\nimport {\n  getCurrentWorkingDirectory,\n  setCurrentWorkingDirectory,\n} from './project-files'\n\nexport type ToolHandler = (input: any, id: string) => Promise<string>\n\nexport const handleUpdateFileContext: ToolHandler = async (\n  input: { prompt: string },\n  id: string\n) => {\n  return ''\n}\n\nexport const handleScrapeWebPage: ToolHandler = async (\n  input: { url: string },\n  id: string\n) => {\n  const { url } = input\n  const content = await scrapeWebPage(url)\n  if (!content) {\n    return `<web_scraping_error url=\"${url}\">Failed to scrape the web page.</web_scraping_error>`\n  }\n  return `<web_scraped_content url=\"${url}\">${content}</web_scraped_content>`\n}\n\nexport const handleSearchManifoldMarkets: ToolHandler = async (\n  input: { query: string; limit?: number },\n  id: string\n) => {\n  const { query, limit = 5 } = input\n  try {\n    const markets = await searchManifoldMarkets(query, limit)\n    return JSON.stringify(markets)\n  } catch (error) {\n    const message = error instanceof Error ? error.message : error\n    return `<manifold_search_error>Failed to search Manifold markets: ${message}</manifold_search_error>`\n  }\n}\n\nexport const handleRunTerminalCommand = async (\n  input: { command: string },\n  id: string,\n  mode: 'user' | 'assistant'\n): Promise<string> => {\n  const { command } = input\n  return new Promise((resolve) => {\n    let stdout = ''\n    let stderr = ''\n    const MAX_EXECUTION_TIME = 10_000\n\n    if (mode === 'assistant') {\n      console.log()\n      console.log(green(`> ${command}`))\n    }\n    const childProcess = spawn(command, {\n      shell: true,\n      cwd: getCurrentWorkingDirectory(),\n    })\n\n    const timer = setTimeout(() => {\n      if (mode === 'assistant') {\n        childProcess.kill()\n        resolve(\n          formatResult(\n            stdout,\n            stderr,\n            `Command timed out after ${MAX_EXECUTION_TIME / 1000} seconds. Partial results shown.`\n          )\n        )\n      }\n    }, MAX_EXECUTION_TIME)\n\n    childProcess.stdout.on('data', (data) => {\n      process.stdout.write(data.toString())\n      stdout += data.toString()\n    })\n\n    childProcess.stderr.on('data', (data) => {\n      const dataStr = data.toString()\n      if (\n        mode === 'user' &&\n        (dataStr.includes('command not found') ||\n          dataStr.includes('syntax error') ||\n          dataStr.includes(\n            'is not recognized as an internal or external command'\n          ))\n      ) {\n        resolve('command not found')\n      } else {\n        process.stderr.write(data.toString())\n        stderr += data.toString()\n      }\n    })\n\n    childProcess.on('close', (code) => {\n      if (command.startsWith('cd ') && code === 0) {\n        const newWorkingDirectory = command.split(' ')[1]\n        setCurrentWorkingDirectory(\n          path.join(getCurrentWorkingDirectory(), newWorkingDirectory)\n        )\n      }\n\n      clearTimeout(timer)\n      resolve(formatResult(stdout, stderr, 'Command completed', code))\n      if (mode === 'assistant') {\n        console.log(green(`Command finished with exit code: ${code}`))\n      }\n    })\n\n    childProcess.on('error', (error) => {\n      clearTimeout(timer)\n      resolve(\n        `<terminal_command_error>Failed to execute command: ${error.message}</terminal_command_error>`\n      )\n    })\n  })\n}\n\nfunction formatResult(\n  stdout: string,\n  stderr: string,\n  status?: string,\n  exitCode?: number | null\n): string {\n  let result = '<terminal_command_result>\\n'\n  result += `<stdout>${stdout}</stdout>\\n`\n  result += `<stderr>${stderr}</stderr>\\n`\n  if (status !== undefined) {\n    result += `<status>${status}</status>\\n`\n  }\n  if (exitCode !== undefined && exitCode !== null) {\n    result += `<exit_code>${exitCode}</exit_code>\\n`\n  }\n  result += '</terminal_command_result>'\n  return result\n}\n\nexport const toolHandlers: Record<string, ToolHandler> = {\n  update_file_context: handleUpdateFileContext,\n  scrape_web_page: handleScrapeWebPage,\n  search_manifold_markets: handleSearchManifoldMarkets,\n  run_terminal_command: ((input, id) =>\n    handleRunTerminalCommand(input, id, 'assistant')) as ToolHandler,\n}\n",
    'npm-app/src/chat-storage.ts':
      "import * as fs from 'fs'\nimport * as path from 'path'\nimport { Message } from 'common/actions'\nimport { getExistingFiles, getProjectRoot } from './project-files'\n\nconst MANICODE_DIR = '.manicode'\nconst CHATS_DIR = 'chats'\n\ninterface Chat {\n  id: string\n  messages: Message[]\n  fileVersions: FileVersion[]\n  createdAt: string\n  updatedAt: string\n}\n\ninterface FileVersion {\n  files: Record<string, string>\n}\n\nexport class ChatStorage {\n  private baseDir: string\n  private currentChat: Chat\n  private currentVersionIndex: number\n\n  constructor() {\n    this.baseDir = path.join(getProjectRoot(), MANICODE_DIR, CHATS_DIR)\n    // this.ensureDirectoryExists()\n    this.currentChat = this.createChat()\n    this.currentVersionIndex = -1\n  }\n\n  private ensureDirectoryExists(): void {\n    if (!fs.existsSync(this.baseDir)) {\n      fs.mkdirSync(this.baseDir, { recursive: true })\n    }\n  }\n\n  private getFilePath(chatId: string): string {\n    return path.join(this.baseDir, `${chatId}.json`)\n  }\n\n  createChat(messages: Message[] = []): Chat {\n    const chat: Chat = {\n      id: this.generateChatId(),\n      messages,\n      fileVersions: [],\n      createdAt: new Date().toISOString(),\n      updatedAt: new Date().toISOString(),\n    }\n\n    this.saveChat(chat)\n    return chat\n  }\n\n  getChat(chatId: string): Chat | null {\n    const filePath = this.getFilePath(chatId)\n    if (fs.existsSync(filePath)) {\n      const fileContent = fs.readFileSync(filePath, 'utf-8')\n      return JSON.parse(fileContent) as Chat\n    }\n    return null\n  }\n\n  addMessage(chat: Chat, message: Message) {\n    chat.messages.push(message)\n    chat.updatedAt = new Date().toISOString()\n    this.saveChat(chat)\n  }\n\n  deleteChat(chatId: string): boolean {\n    const filePath = this.getFilePath(chatId)\n    if (fs.existsSync(filePath)) {\n      fs.unlinkSync(filePath)\n      return true\n    }\n    return false\n  }\n\n  listChats(): Chat[] {\n    const chatFiles = fs\n      .readdirSync(this.baseDir)\n      .filter((file) => file.endsWith('.json'))\n    return chatFiles.map((file) => {\n      const filePath = path.join(this.baseDir, file)\n      const fileContent = fs.readFileSync(filePath, 'utf-8')\n      return JSON.parse(fileContent) as Chat\n    })\n  }\n\n  private saveChat(chat: Chat): void {\n    const filePath = this.getFilePath(chat.id)\n    // fs.writeFileSync(filePath, JSON.stringify(chat, null, 2))\n  }\n\n  private generateChatId(): string {\n    const now = new Date()\n    const datePart = now.toISOString().split('T')[0] // YYYY-MM-DD\n    const timePart = now\n      .toISOString()\n      .split('T')[1]\n      .replace(/:/g, '-')\n      .split('.')[0] // HH-MM-SS\n    const randomPart = Math.random().toString(36).substr(2, 5)\n    return `${datePart}_${timePart}_${randomPart}`\n  }\n\n  getCurrentChat(): Chat {\n    return this.currentChat\n  }\n\n  setCurrentChat(chatId: string) {\n    const chat = this.getChat(chatId)\n    if (chat) {\n      this.currentChat = chat\n      this.currentVersionIndex = chat.fileVersions.length - 1\n    } else {\n      throw new Error(`Chat with id ${chatId} not found`)\n    }\n  }\n\n  getCurrentVersion(): FileVersion | null {\n    if (\n      this.currentVersionIndex >= 0 &&\n      this.currentVersionIndex < this.currentChat.fileVersions.length\n    ) {\n      return this.currentChat.fileVersions[this.currentVersionIndex]\n    }\n    return null\n  }\n\n  navigateVersion(direction: 'undo' | 'redo'): boolean {\n    if (direction === 'undo' && this.currentVersionIndex >= 0) {\n      this.currentVersionIndex--\n      return true\n    } else if (\n      direction === 'redo' &&\n      this.currentVersionIndex < this.currentChat.fileVersions.length - 1\n    ) {\n      this.currentVersionIndex++\n      return true\n    }\n    return false\n  }\n\n  saveFilesChanged(filesChanged: string[]) {\n    let currentVersion = this.getCurrentVersion()\n    if (!currentVersion) {\n      this.addNewFileState({})\n      currentVersion = this.getCurrentVersion() as FileVersion\n    }\n    const newFilesChanged = filesChanged.filter((f) => !currentVersion.files[f])\n    const updatedFiles = getExistingFiles(newFilesChanged)\n    currentVersion.files = { ...currentVersion.files, ...updatedFiles }\n    return Object.keys(currentVersion.files)\n  }\n\n  saveCurrentFileState(files: Record<string, string>) {\n    const currentVersion = this.getCurrentVersion()\n    if (currentVersion) {\n      currentVersion.files = files\n    } else {\n      this.addNewFileState(files)\n    }\n  }\n\n  addNewFileState(files: Record<string, string>) {\n    const newVersion: FileVersion = {\n      files,\n    }\n    this.currentChat.fileVersions.push(newVersion)\n    this.currentVersionIndex = this.currentChat.fileVersions.length - 1\n  }\n}\n",
    'npm-app/src/config.ts':
      "import { calculateFingerprint } from './fingerprint'\n\nconst isProduction = process.env.NODE_ENV === 'production'\nexport const websocketUrl = isProduction\n  ? 'ws://api.manicode.ai:4242/ws'\n  : 'ws://localhost:4242/ws'\n\nexport let fingerprintId: string\nexport const initFingerprint = async () => {\n  fingerprintId = await calculateFingerprint()\n  return fingerprintId\n}\n",
    'npm-app/src/fingerprint.ts':
      "// Modified from: https://github.com/andsmedeiros/hw-fingerprint\n\nimport { createHash } from 'node:crypto'\nimport { EOL, endianness } from 'node:os'\nimport {\n  system,\n  bios,\n  baseboard,\n  cpu,\n  osInfo,\n  // @ts-ignore\n} from 'systeminformation'\n\nexport const FINGERPRINTING_INFO = (async function () {\n  const { manufacturer, model, serial, uuid } = await system()\n  const { vendor, version: biosVersion, releaseDate } = await bios()\n  const {\n    manufacturer: boardManufacturer,\n    model: boardModel,\n    serial: boardSerial,\n  } = await baseboard()\n  const {\n    manufacturer: cpuManufacturer,\n    brand,\n    speedMax,\n    cores,\n    physicalCores,\n    socket,\n  } = await cpu()\n  const { platform, arch } = await osInfo()\n\n  return {\n    EOL,\n    endianness: endianness(),\n    manufacturer,\n    model,\n    serial,\n    uuid,\n    vendor,\n    biosVersion,\n    releaseDate,\n    boardManufacturer,\n    boardModel,\n    boardSerial,\n    cpuManufacturer,\n    brand,\n    speedMax: speedMax.toFixed(2),\n    cores,\n    physicalCores,\n    socket,\n    platform,\n    arch,\n  } as Record<string, any>\n})()\n\nexport async function calculateFingerprint() {\n  const fingerprintString = JSON.stringify(await FINGERPRINTING_INFO)\n  const fingerprintHash = createHash('sha256').update(fingerprintString)\n  return fingerprintHash.digest().toString('base64url')\n}\n",
    'npm-app/src/index.ts':
      "#!/usr/bin/env node\n\nimport fs from 'fs'\nimport path from 'path'\nimport { yellow } from 'picocolors'\n\nimport { initFingerprint } from './config'\nimport { CLI } from './cli'\nimport { getProjectFileContext, initProjectRoot } from './project-files'\n\nasync function manicode(projectDir: string | undefined) {\n  const dir = initProjectRoot(projectDir)\n\n  // Preload stuff.\n  const fingerprintPromise = initFingerprint()\n  const initProjectFileContextPromise = await getProjectFileContext([], {})\n\n  const readyPromise = Promise.all([\n    fingerprintPromise,\n    initProjectFileContextPromise,\n  ])\n\n  const cli = new CLI(readyPromise)\n\n  console.log(\n    `Manicode will read and write files in \"${dir}\". Type \"help\" for a list of commands`\n  )\n\n  const gitDir = path.join(dir, '.git')\n  if (!fs.existsSync(gitDir)) {\n    console.warn(\n      yellow(\n        'Warning: No .git directory found. Make sure you are at the top level of your project.'\n      )\n    )\n  }\n\n  cli.printInitialPrompt()\n}\n\nif (require.main === module) {\n  const arg = process.argv[2]\n  if (arg === '--help' || arg === '-h') {\n    console.log('Usage: manicode [project-directory]')\n    console.log(\n      'If no project directory is specified, Manicode will use the current directory.'\n    )\n    console.log()\n    console.log(\n      'Manicode allows you to interact with your codebase using natural language.'\n    )\n    process.exit(0)\n  }\n\n  manicode(arg)\n}\n",
    'backend/src/index.ts':
      "import express from 'express'\nimport dotenv from 'dotenv'\nimport http from 'http'\nimport { listen as webSocketListen } from './websockets/server'\nimport { debugLog } from './util/debug'\n\ndotenv.config()\n\nconst app = express()\nconst port = process.env.PORT || 4242\n\napp.use(express.json())\n\napp.get('/', (req, res) => {\n  res.send('Manicode Backend Server')\n})\n\napp.use(\n  (\n    err: Error,\n    req: express.Request,\n    res: express.Response,\n    next: express.NextFunction\n  ) => {\n    console.error(err.stack)\n    res.status(500).send('Something broke!')\n  }\n)\n\nconsole.log('init server')\nconst server = http.createServer(app)\n\nserver.listen(port, () => {\n  console.log(`Server is running on port ${port}`)\n  debugLog(`Server started on port ${port}`)\n})\n\nwebSocketListen(server, '/ws')\n\nprocess.on('SIGINT', () => {\n  process.exit()\n})\n",
    'backend/src/claude.ts':
      "import Anthropic from '@anthropic-ai/sdk'\nimport { TextBlockParam, Tool } from '@anthropic-ai/sdk/resources'\nimport { removeUndefinedProps } from 'common/util/object'\nimport { Message, ToolCall } from 'common/actions'\nimport { STOP_MARKER } from 'common/constants'\nimport { debugLog } from './util/debug'\nimport { RATE_LIMIT_POLICY } from './constants'\n\nexport const models = {\n  sonnet: 'claude-3-5-sonnet-20240620' as const,\n  haiku: 'claude-3-haiku-20240307' as const,\n}\n\nexport type model_types = (typeof models)[keyof typeof models]\n\nexport type System = string | Array<TextBlockParam>\n\nexport const promptClaudeStream = async function* (\n  messages: Message[],\n  options: {\n    system?: System\n    tools?: Tool[]\n    model?: model_types\n    maxTokens?: number\n    userId: string\n    ignoreHelicone?: boolean\n  }\n): AsyncGenerator<string | ToolCall, void, unknown> {\n  const {\n    model = models.sonnet,\n    system,\n    tools,\n    userId,\n    maxTokens,\n    ignoreHelicone = false,\n  } = options\n\n  const apiKey = process.env.ANTHROPIC_API_KEY\n\n  if (!apiKey) {\n    throw new Error('Missing ANTHROPIC_API_KEY')\n  }\n\n  const anthropic = new Anthropic({\n    apiKey,\n    ...(ignoreHelicone\n      ? {}\n      : {\n          baseURL: 'https://anthropic.helicone.ai/',\n        }),\n    defaultHeaders: {\n      'anthropic-beta': 'prompt-caching-2024-07-31',\n      ...(ignoreHelicone\n        ? {}\n        : {\n            'Helicone-Auth': `Bearer ${process.env.HELICONE_API_KEY}`,\n            'Helicone-User-Id': userId,\n            'Helicone-RateLimit-Policy': RATE_LIMIT_POLICY,\n            'Helicone-LLM-Security-Enabled': 'true',\n          }),\n    },\n  })\n\n  const stream = anthropic.messages.stream(\n    removeUndefinedProps({\n      model,\n      max_tokens: maxTokens ?? 4096,\n      temperature: 0,\n      messages,\n      system,\n      tools,\n    })\n  )\n\n  let toolInfo = {\n    name: '',\n    id: '',\n    json: '',\n  }\n  for await (const chunk of stream) {\n    const { type } = chunk\n\n    if (type === 'content_block_delta' && chunk.delta.type === 'text_delta') {\n      yield chunk.delta.text\n    }\n\n    // For Tool use!\n    if (\n      type === 'content_block_start' &&\n      chunk.content_block.type === 'tool_use'\n    ) {\n      const { name, id } = chunk.content_block\n      toolInfo = {\n        name,\n        id,\n        json: '',\n      }\n    }\n    if (\n      type === 'content_block_delta' &&\n      chunk.delta.type === 'input_json_delta'\n    ) {\n      toolInfo.json += chunk.delta.partial_json\n    }\n    if (type === 'message_delta' && chunk.delta.stop_reason === 'tool_use') {\n      const { name, id, json } = toolInfo\n      const input = JSON.parse(json)\n      yield { name, id, input }\n    }\n    // if (type === 'message_start') {\n    //   console.log('message start', chunk)\n    // }\n  }\n}\n\nexport const promptClaude = async (\n  messages: Message[],\n  options: {\n    userId: string\n    system?: string | Array<TextBlockParam>\n    tools?: Tool[]\n    model?: model_types\n    maxTokens?: number\n    ignoreHelicone?: boolean\n  }\n) => {\n  let fullResponse = ''\n  for await (const chunk of promptClaudeStream(messages, options)) {\n    fullResponse += chunk\n  }\n  return fullResponse\n}\n\nexport async function promptClaudeWithContinuation(\n  messages: Message[],\n  options: {\n    userId: string\n    system?: string\n    model?: model_types\n    ignoreHelicone?: boolean\n  }\n) {\n  let fullResponse = ''\n  let continuedMessage: Message | null = null\n  let isComplete = false\n\n  // Add the instruction to end with the stop market to the system prompt\n  if (options.system) {\n    options.system += `\\n\\nAlways end your response with \"${STOP_MARKER}\".`\n  } else {\n    options.system = `Always end your response with \"${STOP_MARKER}\".`\n  }\n\n  while (!isComplete) {\n    const messagesWithContinuedMessage = continuedMessage\n      ? [...messages, continuedMessage]\n      : messages\n    debugLog(\n      'prompt claude with continuation',\n      messagesWithContinuedMessage.length\n    )\n    const stream = promptClaudeStream(messagesWithContinuedMessage, options)\n\n    for await (const chunk of stream) {\n      fullResponse += chunk\n    }\n\n    if (continuedMessage) {\n      debugLog('Continuation response:', fullResponse)\n      console.log('got continuation response')\n    }\n\n    if (fullResponse.includes(STOP_MARKER)) {\n      isComplete = true\n      fullResponse = fullResponse.replace(STOP_MARKER, '')\n    } else {\n      continuedMessage = {\n        role: 'assistant',\n        content: fullResponse,\n      }\n    }\n  }\n\n  return { response: fullResponse }\n}\n",
    'backend/src/openai-api.ts':
      "import OpenAI from 'openai'\nimport { RATE_LIMIT_POLICY } from './constants'\nimport { STOP_MARKER } from 'common/constants'\nimport { Stream } from 'openai/streaming'\n\nexport type OpenAIMessage = OpenAI.Chat.ChatCompletionMessageParam\n\nlet openai: OpenAI | null = null\n\nconst getOpenAI = (userId: string) => {\n  if (!openai) {\n    openai = new OpenAI({\n      apiKey: process.env.OPEN_AI_KEY,\n      baseURL: 'https://oai.helicone.ai/v1',\n      defaultHeaders: {\n        'Helicone-Auth': `Bearer ${process.env.HELICONE_API_KEY}`,\n        'Helicone-User-Id': userId,\n        'Helicone-RateLimit-Policy': RATE_LIMIT_POLICY,\n        // 'Helicone-LLM-Security-Enabled': 'true',\n      },\n    })\n  }\n\n  return openai\n}\n\nconst timeoutPromise = (ms: number) =>\n  new Promise((_, reject) =>\n    setTimeout(() => reject(new Error('OpenAI API request timed out')), ms)\n  )\n\nexport async function promptOpenAI(\n  userId: string,\n  messages: OpenAIMessage[],\n  model: string\n) {\n  const openai = getOpenAI(userId)\n  try {\n    const response = await Promise.race([\n      openai.chat.completions.create({\n        model,\n        messages,\n        temperature: 0,\n      }),\n      timeoutPromise(200000) as Promise<OpenAI.Chat.ChatCompletion>,\n    ])\n\n    if (\n      response.choices &&\n      response.choices.length > 0 &&\n      response.choices[0].message\n    ) {\n      return response.choices[0].message.content || ''\n    } else {\n      throw new Error('No response from OpenAI')\n    }\n  } catch (error) {\n    console.error(\n      'Error calling OpenAI API:',\n      error && typeof error === 'object' && 'message' in error\n        ? error.message\n        : 'Unknown error'\n    )\n    throw error\n  }\n}\n\nexport async function promptOpenAIWithContinuation(\n  messages: OpenAIMessage[],\n  options: { model: string; userId: string }\n) {\n  const { model, userId } = options\n  let fullResponse = ''\n  let continuedMessage: OpenAIMessage | null = null\n  let isComplete = false\n\n  // Add the instruction to end with the stop marker to the last user message\n  const lastUserMessageIndex = messages.findLastIndex(\n    (msg) => msg.role === 'user'\n  )\n  if (lastUserMessageIndex !== -1) {\n    messages[lastUserMessageIndex].content +=\n      `\\n\\nAlways end your response with \"${STOP_MARKER}\".`\n  } else {\n    messages.push({\n      role: 'user',\n      content: `Always end your response with \"${STOP_MARKER}\".`,\n    })\n  }\n\n  const openai = getOpenAI(userId)\n\n  while (!isComplete) {\n    const messagesWithContinuedMessage = continuedMessage\n      ? [...messages, continuedMessage]\n      : messages\n\n    try {\n      const stream = await Promise.race([\n        openai.chat.completions.create({\n          model,\n          messages: messagesWithContinuedMessage,\n          stream: true,\n          temperature: 0,\n        }),\n        timeoutPromise(120000) as Promise<\n          Stream<OpenAI.Chat.Completions.ChatCompletionChunk>\n        >,\n      ])\n\n      for await (const chunk of stream) {\n        if (chunk.choices[0]?.delta?.content) {\n          fullResponse += chunk.choices[0].delta.content\n        }\n      }\n\n      if (continuedMessage) {\n        console.log('got continuation response')\n      }\n\n      if (fullResponse.includes(STOP_MARKER)) {\n        isComplete = true\n        fullResponse = fullResponse.replace(STOP_MARKER, '')\n      } else {\n        continuedMessage = {\n          role: 'assistant',\n          content: fullResponse,\n        }\n        messages.push({\n          role: 'user',\n          content: `You got cut off, but please continue from the very next line of your response. Do not repeat anything you have just said. Just continue as if there were no interruption from the very last character of your last response. (Alternatively, just end your response with the following marker if you were done generating and want to allow the user to give further guidance: ${STOP_MARKER})`,\n        })\n      }\n    } catch (error) {\n      console.error(\n        'Error calling OpenAI API:',\n        error && typeof error === 'object' && 'message' in error\n          ? error.message\n          : 'Unknown error'\n      )\n      throw error\n    }\n  }\n\n  return fullResponse\n}\n",
    'backend/src/websockets/server.ts':
      "import { Server as HttpServer } from 'node:http'\nimport { Server as WebSocketServer, RawData, WebSocket } from 'ws'\nimport { isError } from 'lodash'\nimport {\n  ClientMessage,\n  ServerMessage,\n  CLIENT_MESSAGE_SCHEMA,\n} from 'common/websockets/websocket-schema'\nimport { Switchboard } from './switchboard'\nimport { onWebsocketAction } from './websocket-action'\n\nconst SWITCHBOARD = new Switchboard()\n\n// if a connection doesn't ping for this long, we assume the other side is toast\nconst CONNECTION_TIMEOUT_MS = 60 * 1000\n\nconst LOCAL_DEV = process.env.GOOGLE_CLOUD_PROJECT == null\n\nexport class MessageParseError extends Error {\n  details?: unknown\n  constructor(message: string, details?: unknown) {\n    super(message)\n    this.name = 'MessageParseError'\n    this.details = details\n  }\n}\n\nfunction serializeError(err: unknown) {\n  return isError(err) ? err.message : 'Unexpected error.'\n}\n\nfunction parseMessage(data: RawData): ClientMessage {\n  let messageObj: any\n  try {\n    messageObj = JSON.parse(data.toString())\n  } catch (err) {\n    console.error(err)\n    throw new MessageParseError('Message was not valid UTF-8 encoded JSON.')\n  }\n  const result = CLIENT_MESSAGE_SCHEMA.safeParse(messageObj)\n  if (!result.success) {\n    const issues = result.error.issues.map((i) => {\n      return {\n        field: i.path.join('.') || null,\n        error: i.message,\n      }\n    })\n    console.error(issues, result.error.errors)\n    throw new MessageParseError('Error parsing message.', issues)\n  } else {\n    return result.data\n  }\n}\n\nfunction processMessage(ws: WebSocket, data: RawData): ServerMessage<'ack'> {\n  try {\n    const msg = parseMessage(data)\n    const { type, txid } = msg\n    try {\n      switch (type) {\n        case 'identify': {\n          SWITCHBOARD.identify(ws, msg.uid)\n          break\n        }\n        case 'subscribe': {\n          SWITCHBOARD.subscribe(ws, ...msg.topics)\n          break\n        }\n        case 'unsubscribe': {\n          SWITCHBOARD.unsubscribe(ws, ...msg.topics)\n          break\n        }\n        case 'ping': {\n          SWITCHBOARD.markSeen(ws)\n          break\n        }\n        case 'action': {\n          onWebsocketAction(ws, msg)\n          break\n        }\n        default:\n          throw new Error(\"Unknown message type; shouldn't be possible here.\")\n      }\n    } catch (err) {\n      console.error(err)\n      return { type: 'ack', txid, success: false, error: serializeError(err) }\n    }\n    return { type: 'ack', txid, success: true }\n  } catch (err) {\n    console.error(err)\n    return { type: 'ack', success: false, error: serializeError(err) }\n  }\n}\n\nexport function listen(server: HttpServer, path: string) {\n  console.log('listen on websocket')\n  const wss = new WebSocketServer({ server, path })\n  let deadConnectionCleaner: NodeJS.Timeout | undefined\n  wss.on('listening', () => {\n    console.log(`Web socket server listening on ${path}.`)\n    deadConnectionCleaner = setInterval(function ping() {\n      const now = Date.now()\n      try {\n        for (const ws of wss.clients) {\n          const lastSeen = SWITCHBOARD.getClient(ws).lastSeen\n          if (lastSeen < now - CONNECTION_TIMEOUT_MS) {\n            ws.terminate()\n          }\n        }\n      } catch (error) {\n        console.error('Error in deadConnectionCleaner', error)\n      }\n    }, CONNECTION_TIMEOUT_MS)\n  })\n  wss.on('error', (err) => {\n    console.error('Error on websocket server.', { error: err })\n  })\n  wss.on('connection', (ws) => {\n    // todo: should likely kill connections that haven't sent any ping for a long time\n    console.log('WS client connected.')\n    SWITCHBOARD.connect(ws)\n    ws.on('message', (data) => {\n      const result = processMessage(ws, data)\n      // mqp: check ws.readyState before sending?\n      ws.send(JSON.stringify(result))\n    })\n    ws.on('close', (code, reason) => {\n      console.log(`WS client disconnected.`, {\n        code,\n        reason: reason.toString(),\n      })\n      SWITCHBOARD.disconnect(ws)\n    })\n    ws.on('error', (err) => {\n      console.error('Error on websocket connection.', { error: err })\n    })\n  })\n  wss.on('close', function close() {\n    clearInterval(deadConnectionCleaner)\n  })\n  return wss\n}\n\nexport const sendMessage = (ws: WebSocket, server: ServerMessage) => {\n  ws.send(JSON.stringify(server))\n}\n",
    'backend/src/constants.ts':
      "export const RATE_LIMIT_POLICY = '2000;w=86400;u=cents;s=user'\n",
    'common/src/util/file.ts':
      "import { z } from 'zod'\n\nexport const FileTreeNodeSchema: z.ZodType<FileTreeNode> = z.object({\n  name: z.string(),\n  type: z.enum(['file', 'directory']),\n  children: z.lazy(() => z.array(FileTreeNodeSchema).optional()),\n})\n\nexport interface FileTreeNode {\n  name: string\n  type: 'file' | 'directory'\n  children?: FileTreeNode[]\n}\n\nexport const ProjectFileContextSchema = z.object({\n  currentWorkingDirectory: z.string(),\n  fileTree: z.array(z.custom<FileTreeNode>()),\n  fileTokenScores: z.record(z.string(), z.record(z.string(), z.number())),\n  knowledgeFiles: z.record(z.string(), z.string()),\n  files: z.record(z.string(), z.string().nullable()),\n  gitChanges: z.object({\n    status: z.string(),\n    diff: z.string(),\n    diffCached: z.string(),\n    lastCommitMessages: z.string(),\n  }),\n  changesSinceLastChat: z.record(z.string(), z.string()),\n})\n\nexport type ProjectFileContext = z.infer<typeof ProjectFileContextSchema>\n\nexport const createFileBlock = (filePath: string, content: string) => {\n  return (\n    '<' +\n    `file path=\"${filePath}\">\n${content}\n</file` +\n    '>'\n  )\n}\nexport const createFileBlockWithoutPath = (content: string) => {\n  return (\n    '<' +\n    `file>\n${content}\n</file` +\n    '>'\n  )\n}\n\nexport const fileRegex = /<file path=\"([^\"]+)\">([\\s\\S]*?)<\\/file>/g\nexport const fileWithNoPathRegex = /<file>([\\s\\S]*?)<\\/file>/g\n\nexport const parseFileBlocks = (fileBlocks: string) => {\n  let fileMatch\n  const files: Record<string, string> = {}\n  while ((fileMatch = fileRegex.exec(fileBlocks)) !== null) {\n    const [, filePath, fileContent] = fileMatch\n    files[filePath] = fileContent.startsWith('\\n')\n      ? fileContent.slice(1)\n      : fileContent\n  }\n  return files\n}\n\nexport const parseFileBlocksWithoutPath = (fileBlocks: string) => {\n  let fileMatch\n  const files: string[] = []\n  while ((fileMatch = fileWithNoPathRegex.exec(fileBlocks)) !== null) {\n    const [, fileContent] = fileMatch\n    files.push(\n      fileContent.startsWith('\\n') ? fileContent.slice(1) : fileContent\n    )\n  }\n  return files\n}\n\nexport function printFileTree(\n  nodes: FileTreeNode[],\n  depth: number = 0\n): string {\n  let result = ''\n  const indentation = ' '.repeat(depth)\n  for (const node of nodes) {\n    result += `${indentation}${node.name}${node.type === 'directory' ? '/' : ''}\\n`\n    if (node.type === 'directory' && node.children) {\n      result += printFileTree(node.children, depth + 1)\n    }\n  }\n  return result\n}\n\nexport function printFileTreeWithTokens(\n  nodes: FileTreeNode[],\n  fileTokenScores: Record<string, Record<string, number>>,\n  path: string[] = []\n): string {\n  let result = ''\n  const depth = path.length\n  const indentToken = ' '\n  const indentation = indentToken.repeat(depth)\n  const indentationWithFile = indentToken.repeat(depth + 1)\n  for (const node of nodes) {\n    result += `${indentation}${node.name}${node.type === 'directory' ? '/' : ''}`\n    path.push(node.name)\n    const filePath = path.join('/')\n    const tokenScores = fileTokenScores[filePath]\n    if (node.type === 'file' && tokenScores) {\n      const tokens = Object.keys(tokenScores)\n      if (tokens.length > 0) {\n        result += `\\n${indentationWithFile}${tokens.join(' ')}`\n      }\n    }\n    result += '\\n'\n    if (node.type === 'directory' && node.children) {\n      result += printFileTreeWithTokens(node.children, fileTokenScores, path)\n    }\n    path.pop()\n  }\n  return result\n}\n",
    'test/__src__/manifold-project.test.ts':
      "import { mock } from 'bun:test'\nimport path from 'path'\nimport fs from 'fs'\nimport { range } from 'lodash'\nimport { WebSocket } from 'ws'\n\nimport { ScoreTestContext } from './score-tests'\nimport * as mainPromptModule from 'backend/main-prompt'\nimport { ProjectFileContext } from 'common/util/file'\nimport { applyAndRevertChanges } from 'common/util/changes'\nimport { Message } from 'common/actions'\nimport {\n  getProjectFileTree,\n  getAllFilePaths,\n} from 'common/src/project-file-tree'\nimport { getFileTokenScores } from 'common/src/codemap/parse'\nimport { EventEmitter } from 'events'\nimport { FileChanges } from 'common/actions'\nimport { projectTest } from './score-tests'\n\nconst DEBUG_MODE = true\nconst mockProjectRoot = path.join(__dirname, '../__mock-projects__/manifold')\n\nprojectTest('manifold project', async (getContext) => {\n  const { currentWorkingDirectory } = await getProjectFileContext()\n  await runTerminalCommand(\n    `cd ${currentWorkingDirectory}/backend/api && yarn compile`\n  )\n\n  const tests = [\n    { description: 'test full file path', fn: testFullFilePath },\n    // { description: 'test delete comment', fn: testDeleteComment },\n    // {\n    //   description: 'test delete comment without knowledge',\n    //   fn: testDeleteCommentWithoutKnowledge,\n    // },\n  ]\n\n  // Run each test multiple times all in parallel\n  const repeatCount = 2\n  await Promise.all(\n    tests.map(async ({ description, fn }) => {\n      const scoreTestContext = getContext(description)\n      await Promise.all(range(repeatCount).map(() => fn(scoreTestContext)))\n    })\n  )\n})\n\nconst testFullFilePath = async ({ expectTrue }: ScoreTestContext) => {\n  const fileContext = await getProjectFileContext()\n  const { changes } = await runMainPrompt(fileContext, [\n    {\n      role: 'user',\n      content:\n        'Can you add a console.log statement to components/like-button.ts with all the props?',\n    },\n  ])\n\n  console.log('changes', changes)\n  const filePathToPatch = Object.fromEntries(\n    changes.map((change) => [change.filePath, change.content])\n  )\n  const filesChanged = Object.keys(filePathToPatch)\n\n  expectTrue(\n    'includes like-button.tsx file',\n    filesChanged.includes('web/components/contract/like-button.tsx')\n  )\n\n  const likeButtonFile =\n    filePathToPatch['web/components/contract/like-button.tsx']\n  expectTrue(\n    'like-button.tsx includes console.log',\n    !!likeButtonFile && likeButtonFile.includes('console.log(')\n  )\n}\n\nconst testDeleteComment = async ({\n  expectTrue,\n  incrementScore,\n}: ScoreTestContext) => {\n  const fileContext = await getProjectFileContext()\n  const { changes } = await runMainPrompt(fileContext, [\n    {\n      role: 'user',\n      content: 'Add an endpoint to delete a comment',\n    },\n  ])\n\n  const filePathToPatch = Object.fromEntries(\n    changes.map((change) => [change.filePath, change.content])\n  )\n  const filesChanged = Object.keys(filePathToPatch)\n  expectTrue(\n    'includes delete-comment.ts file',\n    filesChanged.includes('backend/api/src/delete-comment.ts')\n  )\n  expectTrue(\n    'includes app.ts file',\n    filesChanged.includes('backend/api/src/app.ts')\n  )\n  expectTrue(\n    'includes schema.ts file',\n    filesChanged.includes('common/src/api/schema.ts')\n  )\n\n  const deleteCommentFile = filePathToPatch['backend/api/src/delete-comment.ts']\n  expectTrue(\n    'delete-comment.ts references comment_id',\n    !!deleteCommentFile && deleteCommentFile.includes('comment_id')\n  )\n  expectTrue(\n    'delete-comment.ts references isAdmin',\n    !!deleteCommentFile && deleteCommentFile.includes('isAdmin')\n  )\n\n  await applyAndRevertChangesSequentially(\n    fileContext.currentWorkingDirectory,\n    changes,\n    async () => {\n      const compileResult = await runTerminalCommand(\n        `cd ${fileContext.currentWorkingDirectory}/backend/api && yarn compile`\n      )\n      const errorFiles = extractErrorFiles(compileResult.stdout)\n      const scoreChange = Math.max(3 - errorFiles.length, 0)\n      incrementScore(\n        scoreChange,\n        3,\n        `${errorFiles.join(', ')}: ${errorFiles.length} files with type errors`\n      )\n    }\n  )\n}\n\nconst testDeleteCommentWithoutKnowledge = async ({\n  expectTrue,\n  incrementScore,\n}: ScoreTestContext) => {\n  const fileContext = await getProjectFileContext()\n  fileContext.knowledgeFiles = {}\n\n  const { changes } = await runMainPrompt(fileContext, [\n    {\n      role: 'user',\n      content: 'Add an endpoint to delete a comment',\n    },\n  ])\n\n  const filePathToPatch = Object.fromEntries(\n    changes.map((change) => [change.filePath, change.content])\n  )\n  const filesChanged = Object.keys(filePathToPatch)\n\n  expectTrue(\n    'includes delete-comment.ts file',\n    filesChanged.includes('backend/api/src/delete-comment.ts')\n  )\n  expectTrue(\n    'includes app.ts file',\n    filesChanged.includes('backend/api/src/app.ts')\n  )\n  expectTrue(\n    'includes schema.ts file',\n    filesChanged.includes('common/src/api/schema.ts')\n  )\n\n  const deleteCommentFile = filePathToPatch['backend/api/src/delete-comment.ts']\n  expectTrue(\n    'delete-comment.ts references comment_id',\n    !!deleteCommentFile && deleteCommentFile.includes('comment_id')\n  )\n  expectTrue(\n    'delete-comment.ts references isAdmin',\n    !!deleteCommentFile && deleteCommentFile.includes('isAdmin')\n  )\n\n  await applyAndRevertChangesSequentially(\n    fileContext.currentWorkingDirectory,\n    changes,\n    async () => {\n      const compileResult = await runTerminalCommand(\n        `cd ${fileContext.currentWorkingDirectory}/backend/api && yarn compile`\n      )\n      const errorFiles = extractErrorFiles(compileResult.stdout)\n      const scoreChange = Math.max(3 - errorFiles.length, 0)\n      incrementScore(\n        scoreChange,\n        3,\n        `${errorFiles.join(', ')}: ${errorFiles.length} files with type errors`\n      )\n    }\n  )\n}\n\nmock.module('backend/websockets/websocket-action', () => ({\n  requestFiles: (ws: WebSocket, filePaths: string[]) => {\n    const files: Record<string, string | null> = {}\n    for (const filePath of filePaths) {\n      files[filePath] = readMockFile(filePath)\n    }\n    return Promise.resolve(files)\n  },\n}))\n\nfunction readMockFile(filePath: string): string | null {\n  const fullPath = path.join(mockProjectRoot, filePath)\n  try {\n    return fs.readFileSync(fullPath, 'utf-8')\n  } catch (error) {\n    return null\n  }\n}\n\nasync function getProjectFileContext(): Promise<ProjectFileContext> {\n  const fileTree = getProjectFileTree(mockProjectRoot)\n  const allFilePaths = getAllFilePaths(fileTree)\n  const knowledgeFilePaths = allFilePaths.filter((filePath) =>\n    filePath.endsWith('knowledge.md')\n  )\n  const knowledgeFiles: Record<string, string> = {}\n  for (const filePath of knowledgeFilePaths) {\n    const content = readMockFile(filePath)\n    if (content !== null) {\n      knowledgeFiles[filePath] = content\n    }\n  }\n  const fileTokenScores = await getFileTokenScores(\n    mockProjectRoot,\n    allFilePaths\n  )\n  return {\n    currentWorkingDirectory: mockProjectRoot,\n    gitChanges: {\n      status: '',\n      diff: '',\n      diffCached: '',\n      lastCommitMessages: '',\n    },\n    files: {},\n    knowledgeFiles,\n    fileTokenScores,\n    fileTree,\n  }\n}\n\nasync function runMainPrompt(\n  fileContext: ProjectFileContext,\n  messages: Message[]\n) {\n  const mockWs = new EventEmitter() as WebSocket\n  mockWs.send = mock()\n  mockWs.close = mock()\n\n  return await mainPromptModule.mainPrompt(\n    mockWs,\n    messages,\n    fileContext,\n    'test-user-id',\n    (chunk: string) => {\n      if (DEBUG_MODE) {\n        process.stdout.write(chunk)\n      }\n    }\n  )\n}\n\nfunction extractErrorFiles(output: string): string[] {\n  const lines = output.split('\\n')\n  return lines\n    .filter((line) => line.includes(': error TS'))\n    .map((line) => line.split('(')[0].trim())\n}\n\nasync function runTerminalCommand(command: string) {\n  return new Promise<{ stdout: string; stderr: string; exitCode: number }>(\n    (resolve) => {\n      const { exec } = require('child_process')\n      exec(command, (error: Error | null, stdout: string, stderr: string) => {\n        resolve({\n          stdout,\n          stderr,\n          exitCode: error && 'code' in error ? (error.code as number) : 0,\n        })\n      })\n    }\n  )\n}\n\nconst applyAndRevertChangesSequentially = (() => {\n  const queue: Array<() => Promise<void>> = []\n  let isProcessing = false\n\n  const processQueue = async () => {\n    if (isProcessing || queue.length === 0) return\n    isProcessing = true\n    const nextOperation = queue.shift()\n    if (nextOperation) {\n      await nextOperation()\n    }\n    isProcessing = false\n    processQueue()\n  }\n\n  return async (\n    projectRoot: string,\n    changes: FileChanges,\n    onApply: () => Promise<void>\n  ) => {\n    return new Promise<void>((resolve, reject) => {\n      queue.push(async () => {\n        try {\n          await applyAndRevertChanges(projectRoot, changes, onApply)\n          resolve()\n        } catch (error) {\n          reject(error)\n        }\n      })\n      processQueue()\n    })\n  }\n})()\n",
    'common/src/util/promise.ts':
      'export const mapAsync = <T, U>(\n  items: T[],\n  f: (item: T, index: number) => Promise<U>,\n  maxConcurrentRequests = 20\n) => {\n  let index = 0\n  let currRequests = 0\n  const results: U[] = []\n\n  return new Promise((resolve: (results: U[]) => void, reject) => {\n    const doWork = () => {\n      while (index < items.length && currRequests < maxConcurrentRequests) {\n        const itemIndex = index\n        f(items[itemIndex], itemIndex)\n          .then((data) => {\n            results[itemIndex] = data\n            currRequests--\n            if (index === items.length && currRequests === 0) resolve(results)\n            else doWork()\n          })\n          .catch(reject)\n\n        index++\n        currRequests++\n      }\n    }\n\n    if (items.length === 0) resolve([])\n    else doWork()\n  })\n}\n',
    'common/src/util/object.ts':
      "import { isEqual, mapValues, union } from 'lodash'\n\nexport const removeUndefinedProps = <T extends object>(obj: T): T => {\n  const newObj: any = {}\n\n  for (const key of Object.keys(obj)) {\n    if ((obj as any)[key] !== undefined) newObj[key] = (obj as any)[key]\n  }\n\n  return newObj\n}\n\nexport const removeNullOrUndefinedProps = <T extends object>(\n  obj: T,\n  exceptions?: string[]\n): T => {\n  const newObj: any = {}\n\n  for (const key of Object.keys(obj)) {\n    if (\n      ((obj as any)[key] !== undefined && (obj as any)[key] !== null) ||\n      (exceptions ?? []).includes(key)\n    )\n      newObj[key] = (obj as any)[key]\n  }\n  return newObj\n}\n\nexport const addObjects = <T extends { [key: string]: number }>(\n  obj1: T,\n  obj2: T\n) => {\n  const keys = union(Object.keys(obj1), Object.keys(obj2))\n  const newObj = {} as any\n\n  for (const key of keys) {\n    newObj[key] = (obj1[key] ?? 0) + (obj2[key] ?? 0)\n  }\n\n  return newObj as T\n}\n\nexport const subtractObjects = <T extends { [key: string]: number }>(\n  obj1: T,\n  obj2: T\n) => {\n  const keys = union(Object.keys(obj1), Object.keys(obj2))\n  const newObj = {} as any\n\n  for (const key of keys) {\n    newObj[key] = (obj1[key] ?? 0) - (obj2[key] ?? 0)\n  }\n\n  return newObj as T\n}\n\nexport const hasChanges = <T extends object>(obj: T, partial: Partial<T>) => {\n  const currValues = mapValues(partial, (_, key: keyof T) => obj[key])\n  return !isEqual(currValues, partial)\n}\n\nexport const hasSignificantDeepChanges = <T extends object>(\n  obj: T,\n  partial: Partial<T>,\n  epsilonForNumbers: number\n): boolean => {\n  const compareValues = (currValue: any, partialValue: any): boolean => {\n    if (typeof currValue === 'number' && typeof partialValue === 'number') {\n      return Math.abs(currValue - partialValue) > epsilonForNumbers\n    }\n    if (typeof currValue === 'object' && typeof partialValue === 'object') {\n      return hasSignificantDeepChanges(\n        currValue,\n        partialValue,\n        epsilonForNumbers\n      )\n    }\n    return !isEqual(currValue, partialValue)\n  }\n\n  for (const key in partial) {\n    if (Object.prototype.hasOwnProperty.call(partial, key)) {\n      if (compareValues(obj[key], partial[key])) {\n        return true\n      }\n    }\n  }\n\n  return false\n}\n\nexport const filterObject = <T extends object>(obj: T, predicate: (value: any, key: keyof T) => boolean): { [P in keyof T]: T[P] } => {\n  const result = {} as { [P in keyof T]: T[P] }\n  for (const key in obj) {\n    if (Object.prototype.hasOwnProperty.call(obj, key)) {\n      if (predicate(obj[key], key)) {\n        result[key] = obj[key]\n      }\n    }\n  }\n  return result\n}\n\n/**\n * Asserts that a condition is true. If the condition is false, it throws an error with the provided message.\n * @param condition The condition to check\n * @param message The error message to display if the condition is false\n * @throws {Error} If the condition is false\n */\nexport function assert(condition: boolean, message: string): asserts condition {\n  if (!condition) {\n    throw new Error(`Assertion failed: ${message}`);\n  }\n}\n",
  },
  gitChanges: {
    status:
      'On branch user/knowledge-files\nYour branch is up to date with \'origin/user/knowledge-files\'.\n\nChanges to be committed:\n  (use "git restore --staged <file>..." to unstage)\n\tmodified:   backend/src/generate-knowledge-files.ts\n\tmodified:   backend/src/system-prompt.ts\n\tmodified:   test/__src__/generate-knowledge-files.test.ts\n\nChanges not staged for commit:\n  (use "git add <file>..." to update what will be committed)\n  (use "git restore <file>..." to discard changes in working directory)\n\tmodified:   backend/src/generate-knowledge-files.ts\n\tmodified:   npm-app/knowledge.md\n\tmodified:   npm-app/src/web-scraper.ts\n\tmodified:   test/__src__/generate-knowledge-files.test.ts\n\n',
    diff: "diff --git a/backend/src/generate-knowledge-files.ts b/backend/src/generate-knowledge-files.ts\nindex 749b0f3..aa3bcec 100644\n--- a/backend/src/generate-knowledge-files.ts\n+++ b/backend/src/generate-knowledge-files.ts\n@@ -14,11 +14,11 @@ export async function generateKnowledgeFiles(\n   fileContext: ProjectFileContext,\n   initialMessages: Message[]\n ): Promise<Promise<FileChange>[]> {\n-  // debugLog('generateKnowledgeFiles', {\n-  //   fullResponse,\n-  //   fileContext,\n-  //   initialMessages,\n-  // })\n+  debugLog('generateKnowledgeFiles', {\n+    fullResponse,\n+    fileContext,\n+    initialMessages,\n+  })\n   const systemPrompt = `\n     You are an assistant that helps developers create knowledge files for their codebase. You are helpful and concise, knowing exactly when enough information has been gathered to create a knowledge file. Here's some more information on knowledge files:\n     ${knowledgeFilesPrompt}\ndiff --git a/npm-app/knowledge.md b/npm-app/knowledge.md\nindex 65ec72e..e294158 100644\n--- a/npm-app/knowledge.md\n+++ b/npm-app/knowledge.md\n@@ -163,6 +163,15 @@ The `tool-handlers.ts` file implements handlers for various tools:\n \n These tools extend Manicode's capabilities, allowing it to gather information and perform actions beyond simple code manipulation.\n \n+## Web Scraping\n+\n+The `web-scraper.ts` module now includes a caching mechanism for scraped web pages:\n+\n+- Scraped content is cached for a configurable interval (default: 1 hour).\n+- The `CACHE_REFRESH_INTERVAL` constant in `web-scraper.ts` determines how long cached content remains valid.\n+- This optimization reduces unnecessary web requests while keeping content relatively up-to-date.\n+\n+\n ## Error Handling\n \n Error handling is implemented throughout the application:\ndiff --git a/npm-app/src/web-scraper.ts b/npm-app/src/web-scraper.ts\nindex ce679ce..ae5d4bc 100644\n--- a/npm-app/src/web-scraper.ts\n+++ b/npm-app/src/web-scraper.ts\n@@ -2,12 +2,17 @@ import axios from 'axios'\n import * as cheerio from 'cheerio'\n \n // Global cache for scraped web pages\n-const scrapedPagesCache: Record<string, string> = {}\n+const scrapedPagesCache: Record<string, { content: string; timestamp: number }> = {}\n+\n+// Cache refresh interval in milliseconds (e.g., 1 hour)\n+const CACHE_REFRESH_INTERVAL = 60 * 60 * 1000\n \n export async function scrapeWebPage(url: string) {\n-  // Check if the page is already in the cache\n-  if (scrapedPagesCache[url] !== undefined) {\n-    return scrapedPagesCache[url]\n+  const now = Date.now()\n+\n+  // Check if the page is already in the cache and not expired\n+  if (scrapedPagesCache[url] && now - scrapedPagesCache[url].timestamp < CACHE_REFRESH_INTERVAL) {\n+    return scrapedPagesCache[url].content\n   }\n \n   try {\n@@ -18,20 +23,20 @@ export async function scrapeWebPage(url: string) {\n     // Extract the main content (you may need to adjust this selector based on the target websites)\n     const content = $('body').text()\n \n-    // Store the scraped content in the cache\n-    scrapedPagesCache[url] = content\n+    // Store the scraped content in the cache with the current timestamp\n+    scrapedPagesCache[url] = { content, timestamp: now }\n \n     return content\n   } catch (error) {\n     // console.error(\n-    //   `Error scraping web page ${url}:`,\n     //   error instanceof Error ? error.message : error\n     // )\n     scrapedPagesCache[url] = ''\n-    return ''\n+    return { content: '', timestamp: now }\n   }\n }\n \n+\n export function parseUrlsFromContent(content: string): string[] {\n   const urlRegex = /https?:\\/\\/[^\\s]+/g\n   return content.match(urlRegex) || []\ndiff --git a/test/__src__/generate-knowledge-files.test.ts b/test/__src__/generate-knowledge-files.test.ts\nindex 5f2bda6..19b68c9 100644\n--- a/test/__src__/generate-knowledge-files.test.ts\n+++ b/test/__src__/generate-knowledge-files.test.ts\n@@ -52,15 +52,15 @@ describe('generateKnowledgeFiles', () => {\n     CLAUDE_CALL_TIMEOUT\n   )\n \n-  it(\n-    'should generate a knowledge file for web scraping library change',\n-    async () => {\n-      await runGenKnowledgeFilesTest(\n-        crawleeFileContext,\n-        crawleeMessages,\n-        crawleeExpectedFiles\n-      )\n-    },\n-    CLAUDE_CALL_TIMEOUT\n-  )\n+  // it(\n+  //   'should generate a knowledge file for web scraping library change',\n+  //   async () => {\n+  //     await runGenKnowledgeFilesTest(\n+  //       crawleeFileContext,\n+  //       crawleeMessages,\n+  //       crawleeExpectedFiles\n+  //     )\n+  //   },\n+  //   CLAUDE_CALL_TIMEOUT\n+  // )\n })\n",
    diffCached:
      "diff --git a/backend/src/generate-knowledge-files.ts b/backend/src/generate-knowledge-files.ts\nindex 7a67eb9..749b0f3 100644\n--- a/backend/src/generate-knowledge-files.ts\n+++ b/backend/src/generate-knowledge-files.ts\n@@ -37,7 +37,7 @@ export async function generateKnowledgeFiles(\n     ${getRelevantFilesPrompt(fileContext)}\n     \n     <important>\n-    Reminder: a meaningful change is one that is not easily self-evident in the code. \n+    Reminder: a meaningful change is one that is not self-evident in the code. \n     If the change isn't important enough to warrant a new knowledge file, please do not output anything. We don't want to waste the user's time on irrelevant changes.\n     This is also meant to be helpful for future LLMs like yourself. Thus, please be concise and avoid unnecessary details. If the change is important, please provide a detailed description of what we're doing and why.\n     \n@@ -59,7 +59,7 @@ export async function generateKnowledgeFiles(\n     Think through this next step carefully by answering the following questions:\n     1. What was the last change asked?\n     2. Is this a minor implementation detail?\n-    3. If another developer read the code, would they quickly grasp at what this change does?\n+    3. If another senior developer read the code, would they quickly grasp at what this change does? Assume they have strong foundational knowledge.\n     4. If the answer to question 3 is \"no\", why not?\n \n     Evaluate your answer to question 4 objectively. Is it a good answer? Why or why not?\ndiff --git a/backend/src/system-prompt.ts b/backend/src/system-prompt.ts\nindex 1b82af2..f4bc988 100644\n--- a/backend/src/system-prompt.ts\n+++ b/backend/src/system-prompt.ts\n@@ -138,9 +138,9 @@ Knowledge files are your guide to the project. There are two types of knowledge\n \n 2. File-specific knowledge files: For knowledge specific to a particular file, create a knowledge file using the original filename followed by \\`.knowledge.md\\`. For example, for a file named \\`generate-diffs-haiku.ts\\`, create \\`generate-diffs-haiku.knowledge.md\\` in the same directory.\n \n-Whenever you think of a key concept or helpful tip that is not obvious from the code, you should add it to the appropriate knowledge file. If the knowledge file does not exist, you should create it.\n+Knowledge files contain key concepts or helpful tips that is not obvious from the code. For example, if the user wants to use a package manager aside from the default, because that is hard to find in the codebase, that is an appropriate piece of information to add to a knowledge file.\n \n-If a user corrects you or contradicts you or gives broad advice, you should update a knowledge file with a concise rule to follow or bit of advice so you won't make the mistake again.\n+If a user corrects you or contradicts you or gives broad advice, that is a good candidate for updating a knowledge file with a concise rule to follow or bit of advice so you won't make the mistake again.\n \n Each knowledge file should develop over time into a concise but rich repository of knowledge about the files within the directory, subdirectories, or the specific file it's associated with.\n \n@@ -345,8 +345,6 @@ ${\n \n ${bulletNumber++}. You may edit files to address the user's request and run commands in the terminal. However, if previous two previous commands have failed, you should not run anymore terminal commands.\n \n-If the user corrected you or gave feedback and it helped you understand something better, you must edit a knowledge file with a short note that condenses what you learned and what to do next time you so you don't make the same mistake again. Pure documentation of code doesn't need to be added to knowlege. But if the user says use yarn instead of npm, or to use one function instead of another, or to use a certain style, or that you should always write tests, then this is good information to add to a knoweldge file (create the file if it doesn't exist!). To edit a knowledge file, use a <file> block.\n-\n Do not write code except when editing files with <file> blocks.\n \n <important_instruction>\ndiff --git a/test/__src__/generate-knowledge-files.test.ts b/test/__src__/generate-knowledge-files.test.ts\nindex db5244c..5f2bda6 100644\n--- a/test/__src__/generate-knowledge-files.test.ts\n+++ b/test/__src__/generate-knowledge-files.test.ts\n@@ -32,7 +32,11 @@ const runGenKnowledgeFilesTest = async (\n     fileContext,\n     messages\n   )\n-  expect(responses.length).toBeLessThanOrEqual(expectedFiles.length)\n+  if (expectedFiles.length > 0) {\n+    expect(responses.length).toBeGreaterThanOrEqual(expectedFiles.length)\n+  } else {\n+    expect(responses.length).toBe(0)\n+  }\n }\n \n describe('generateKnowledgeFiles', () => {\n",
    lastCommitMessages:
      "Add edits made by assistant into the response message\nJames Grugett (1):\n\nfix: pr comments\ntweak: update prompt\nfix: dotenv, tests passing!\nfeat: initial tests\nfix: toolcall check\nfeat: don't generate knowledge file if previous call was a `tool_use`\nfix: added back james await fix\nMerge branch 'main' into user/knowledge-files\nfix: prompt engineering\nfix: better chain of thought prompting",
  },
  changesSinceLastChat: {},
}

export const messages: Message[] = [
  {
    role: 'user',
    content:
      "let's add a cache to `web-scraper` so we can refresh the webpage at regular intervals, but not every time we need it\n\n",
  },
  {
    role: 'assistant',
    content:
      "Reading the following files...<files>npm-app/src/web-scraper.ts, npm-app/src/client.ts, npm-app/src/project-files.ts, npm-app/src/tool-handlers.ts, npm-app/src/chat-storage.ts, npm-app/src/config.ts, npm-app/src/fingerprint.ts, npm-app/src/index.ts, backend/src/index.ts, backend/src/claude.ts, backend/src/openai-api.ts, backend/src/websockets/server.ts, backend/src/constants.ts, common/src/util/file.ts, test/__src__/manifold-project.test.ts, common/src/util/promise.ts, common/src/util/object.ts</files>\n\nCertainly! I'll add a cache to the `web-scraper` with a refresh mechanism at regular intervals. This will help optimize performance by reducing unnecessary web requests while keeping the content relatively up-to-date. I'll make minimal changes to the existing code to implement this feature.\n\nFirst, let's modify the `web-scraper.ts` file:\n\n<file path=\"npm-app/src/web-scraper.ts\">import axios from 'axios'\nimport * as cheerio from 'cheerio'\n\n// Global cache for scraped web pages\nconst scrapedPagesCache: Record<string, { content: string; timestamp: number }> = {}\n\n// Cache refresh interval in milliseconds (e.g., 1 hour)\nconst CACHE_REFRESH_INTERVAL = 60 * 60 * 1000\n\nexport async function scrapeWebPage(url: string) {\n  const now = Date.now()\n\n  // Check if the page is already in the cache and not expired\n  if (scrapedPagesCache[url] && now - scrapedPagesCache[url].timestamp < CACHE_REFRESH_INTERVAL) {\n    return scrapedPagesCache[url].content\n  }\n\n  try {\n    const response = await axios.get(url)\n    const html = response.data\n    const $ = cheerio.load(html)\n\n    // Extract the main content (you may need to adjust this selector based on the target websites)\n    const content = $('body').text()\n\n    // Store the scraped content in the cache with the current timestamp\n    scrapedPagesCache[url] = { content, timestamp: now }\n\n    return content\n  } catch (error) {\n    // console.error(\n    //   `Error scraping web page ${url}:`,\n    //   error instanceof Error ? error.message : error\n    // )\n    scrapedPagesCache[url] = { content: '', timestamp: now }\n    return ''\n  }\n}\n\n// ... (keep the existing functions unchanged)\n\n</file>\n\nThese changes implement a simple caching mechanism with a refresh interval. Here's what I've done:\n\n1. Modified the `scrapedPagesCache` to store both the content and a timestamp.\n2. Added a `CACHE_REFRESH_INTERVAL` constant set to 1 hour (60 * 60 * 1000 milliseconds).\n3. Updated the `scrapeWebPage` function to check if the cached content is still fresh before making a new request.\n4. When storing scraped content in the cache, we now include the current timestamp.\n\nThis implementation will cache the scraped content for 1 hour before refreshing it. You can adjust the `CACHE_REFRESH_INTERVAL` as needed for your specific use case.\n\nNow, let's update the knowledge file to reflect this change:\n\n<file path=\"npm-app/knowledge.md\">// ... (keep existing content)\n\n## Web Scraping\n\nThe `web-scraper.ts` module now includes a caching mechanism for scraped web pages:\n\n- Scraped content is cached for a configurable interval (default: 1 hour).\n- The `CACHE_REFRESH_INTERVAL` constant in `web-scraper.ts` determines how long cached content remains valid.\n- This optimization reduces unnecessary web requests while keeping content relatively up-to-date.\n\n// ... (keep the rest of the file unchanged)\n\n</file>\n\nThese changes add a simple caching mechanism to the web scraper while preserving the existing functionality. The cache will refresh content after the specified interval, balancing between performance and content freshness.\n\nIs there anything else you'd like me to modify or explain about this implementation?\n\n\n\n<edits_made_by_assistant>\n<file path=\"npm-app/src/web-scraper.ts\">\n@@ -2,13 +2,17 @@ import axios from 'axios'\n import * as cheerio from 'cheerio'\n \n // Global cache for scraped web pages\n-const scrapedPagesCache: Record<string, string> = {}\n+const scrapedPagesCache: Record<string, { content: string; timestamp: number }> = {}\n+\n+// Cache refresh interval in milliseconds (e.g., 1 hour)\n+const CACHE_REFRESH_INTERVAL = 60 * 60 * 1000\n \n export async function scrapeWebPage(url: string) {\n-  // Check if the page is already in the cache\n-  if (scrapedPagesCache[url] !== undefined) {\n-    return scrapedPagesCache[url]\n+  const now = Date.now()\n+\n+  // Check if the page is already in the cache and not expired\n+  if (scrapedPagesCache[url] && now - scrapedPagesCache[url].timestamp < CACHE_REFRESH_INTERVAL) {\n+    return scrapedPagesCache[url].content\n   }\n \n   try {\n@@ -18,8 +22,8 @@ export async function scrapeWebPage(url: string) {\n     // Extract the main content (you may need to adjust this selector based on the target websites)\n     const content = $('body').text()\n \n-    // Store the scraped content in the cache\n-    scrapedPagesCache[url] = content\n+    // Store the scraped content in the cache with the current timestamp\n+    scrapedPagesCache[url] = { content, timestamp: now }\n \n     return content\n   } catch (error) {\n@@ -27,7 +31,7 @@ export async function scrapeWebPage(url: string) {\n     //   error instanceof Error ? error.message : error\n     // )\n     scrapedPagesCache[url] = ''\n-    return ''\n+    return { content: '', timestamp: now }\n   }\n }\n \n\n</file>\n<file path=\"npm-app/knowledge.md\">\n@@ -163,6 +163,15 @@ The `tool-handlers.ts` file implements handlers for various tools:\n \n These tools extend Manicode's capabilities, allowing it to gather information and perform actions beyond simple code manipulation.\n \n+## Web Scraping\n+\n+The `web-scraper.ts` module now includes a caching mechanism for scraped web pages:\n+\n+- Scraped content is cached for a configurable interval (default: 1 hour).\n+- The `CACHE_REFRESH_INTERVAL` constant in `web-scraper.ts` determines how long cached content remains valid.\n+- This optimization reduces unnecessary web requests while keeping content relatively up-to-date.\n+\n+\n ## Error Handling\n \n Error handling is implemented throughout the application:\n\n</file>\n</edits_made_by_assistant>",
  },
  {
    role: 'user',
    content: "now let's update it to every 4 hours\n\n",
  },
]

export const expectedFiles: FileChange[] = []
