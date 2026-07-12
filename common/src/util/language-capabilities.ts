export const SUPPORTED_LANGUAGE_IDS = [
  'typescript',
  'python',
  'rust',
  'go',
  'java',
  'csharp',
  'cpp',
  'ruby',
  'php',
  'swift',
  'kotlin',
  'gdscript',
] as const

export type SupportedLanguageId = (typeof SUPPORTED_LANGUAGE_IDS)[number]

export type LanguageToolRole =
  | 'parser'
  | 'languageServer'
  | 'formatter'
  | 'linter'
  | 'typeChecker'
  | 'compiler'
  | 'testRunner'
  | 'importOrganizer'

export type LanguageToolMetadata = Readonly<
  Record<LanguageToolRole, readonly string[]>
>

export type LanguageValidationStage =
  | 'syntax'
  | 'format'
  | 'lint'
  | 'typecheck'
  | 'compile'
  | 'test'

export type LanguageValidationMetadata = {
  /** Cheap checks suitable for edited files or their nearest package. */
  focused: readonly LanguageValidationStage[]
  /** Broader checks suitable before declaring a repository-level task done. */
  project: readonly LanguageValidationStage[]
}

export type LanguageCapability = {
  id: SupportedLanguageId
  displayName: string
  /** Source-file suffixes, normalized to lowercase and including the dot. */
  extensions: readonly `.${string}`[]
  /** Exact, case-sensitive manifest filenames. */
  manifestNames: readonly string[]
  /** Case-insensitive project-file suffixes such as .csproj. */
  manifestExtensions: readonly `.${string}`[]
  /** Unambiguous names that may scope a natural-language task. */
  taskAliases: readonly string[]
  /** One-line summary used in compact prompts and UI surfaces. */
  guidance: string
  /** Bundled guidance: never requires files to exist in the user's repo. */
  idiomGuidance: readonly string[]
  tools: LanguageToolMetadata
  validation: LanguageValidationMetadata
}

const tools = (
  metadata: Partial<Record<LanguageToolRole, readonly string[]>>,
): LanguageToolMetadata => ({
  parser: [],
  languageServer: [],
  formatter: [],
  linter: [],
  typeChecker: [],
  compiler: [],
  testRunner: [],
  importOrganizer: [],
  ...metadata,
})

/**
 * Canonical runtime registry for language detection, prompt guidance, and
 * validation/tool discovery. Consumers should derive lookup maps from this
 * registry instead of maintaining parallel extension or manifest tables.
 */
export const LANGUAGE_CAPABILITY_REGISTRY = {
  typescript: {
    id: 'typescript',
    displayName: 'TypeScript/JavaScript',
    extensions: ['.cjs', '.cts', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx'],
    manifestNames: ['package.json', 'tsconfig.json', 'jsconfig.json'],
    manifestExtensions: [],
    taskAliases: ['typescript', 'javascript', 'node.js', 'nodejs'],
    guidance:
      'Favor typed, modular changes; preserve existing framework patterns, async boundaries, and lint/format conventions.',
    idiomGuidance: [
      'Use precise types, unknown plus narrowing for untrusted inputs, and existing schemas instead of broad casts.',
      'Keep promises and side effects explicit, preserving the repository module, framework, and import style.',
      'Prefer small composable changes and validate with the project-selected typechecker, linter, formatter, and tests.',
    ],
    tools: tools({
      parser: ['tree-sitter-typescript', 'tree-sitter-javascript'],
      languageServer: ['tsserver', 'typescript-language-server'],
      formatter: ['prettier', 'biome'],
      linter: ['eslint', 'biome'],
      typeChecker: ['tsc'],
      compiler: ['tsc', 'bun'],
      testRunner: ['bun test', 'vitest', 'jest'],
      importOrganizer: ['tsserver', 'eslint', 'biome'],
    }),
    validation: {
      focused: ['syntax', 'format', 'lint', 'typecheck'],
      project: ['typecheck', 'test'],
    },
  },
  python: {
    id: 'python',
    displayName: 'Python',
    extensions: ['.py', '.pyi'],
    manifestNames: [
      'pyproject.toml',
      'requirements.txt',
      'setup.py',
      'setup.cfg',
      'Pipfile',
    ],
    manifestExtensions: [],
    taskAliases: ['python', 'pyright', 'pytest'],
    guidance:
      'Prefer simple, explicit code with clear names, context managers, standard typing, and project-local test/style conventions.',
    idiomGuidance: [
      'Use standard-library tools and narrow abstractions before introducing framework-independent machinery.',
      'Keep resource lifetimes in context managers, exception handling narrow, and type annotations aligned with local style.',
      'Preserve import grouping, formatter output, test patterns, and explicit state ownership.',
    ],
    tools: tools({
      parser: ['tree-sitter-python'],
      languageServer: ['pyright', 'pylsp'],
      formatter: ['ruff format', 'black'],
      linter: ['ruff', 'pylint'],
      typeChecker: ['pyright', 'mypy'],
      compiler: ['python'],
      testRunner: ['pytest', 'unittest'],
      importOrganizer: ['ruff', 'isort'],
    }),
    validation: {
      focused: ['syntax', 'format', 'lint', 'typecheck'],
      project: ['typecheck', 'test'],
    },
  },
  rust: {
    id: 'rust',
    displayName: 'Rust',
    extensions: ['.rs'],
    manifestNames: ['Cargo.toml', 'Cargo.lock'],
    manifestExtensions: [],
    taskAliases: ['rust', 'cargo', 'rustc'],
    guidance:
      'Respect ownership and borrowing, return Result/Option idiomatically, and keep error handling explicit and precise.',
    idiomGuidance: [
      'Let ownership and borrowing drive the design; clone only when the cost and intent are clear.',
      'Use Result, Option, propagation, matching, and existing error types instead of panics in normal control flow.',
      'Keep lifetimes and generics as simple as the surrounding API permits and preserve crate features and layout.',
    ],
    tools: tools({
      parser: ['tree-sitter-rust'],
      languageServer: ['rust-analyzer'],
      formatter: ['rustfmt'],
      linter: ['clippy'],
      typeChecker: ['cargo check'],
      compiler: ['rustc', 'cargo build'],
      testRunner: ['cargo test'],
      importOrganizer: ['rust-analyzer'],
    }),
    validation: {
      focused: ['syntax', 'format', 'lint', 'typecheck'],
      project: ['compile', 'test'],
    },
  },
  go: {
    id: 'go',
    displayName: 'Go',
    extensions: ['.go'],
    manifestNames: ['go.mod', 'go.sum'],
    manifestExtensions: [],
    taskAliases: ['golang', 'gofmt', 'gopls'],
    guidance:
      'Keep code small and explicit, handle errors immediately, and follow package-level naming and interface conventions.',
    idiomGuidance: [
      'Handle errors near the operation, return early when clearer, and prefer useful zero values.',
      'Define small interfaces at consumer boundaries and avoid abstracting concrete behavior prematurely.',
      'Preserve package organization, context propagation, exported-name comments, gofmt, vet, and table-test conventions.',
    ],
    tools: tools({
      parser: ['tree-sitter-go'],
      languageServer: ['gopls'],
      formatter: ['gofmt', 'goimports'],
      linter: ['go vet', 'staticcheck', 'golangci-lint'],
      typeChecker: ['go test'],
      compiler: ['go build'],
      testRunner: ['go test'],
      importOrganizer: ['goimports', 'gopls'],
    }),
    validation: {
      focused: ['syntax', 'format', 'lint', 'typecheck'],
      project: ['compile', 'test'],
    },
  },
  java: {
    id: 'java',
    displayName: 'Java',
    extensions: ['.java'],
    manifestNames: ['pom.xml'],
    manifestExtensions: [],
    taskAliases: ['java', 'maven', 'javac'],
    guidance:
      'Preserve package structure and build conventions; prefer clear types, small methods, and existing dependency-injection/test patterns.',
    idiomGuidance: [
      'Keep visibility, annotations, dependency injection, logging, and transaction boundaries consistent with nearby code.',
      'Prefer clear types, small methods, and immutable values where practical; use streams and optionals only when clearer.',
      'Preserve package layout, exception contracts, formatter output, build-tool configuration, and test style.',
    ],
    tools: tools({
      parser: ['tree-sitter-java'],
      languageServer: ['jdtls'],
      formatter: ['google-java-format', 'spotless'],
      linter: ['checkstyle', 'spotbugs'],
      typeChecker: ['javac'],
      compiler: ['javac', 'maven', 'gradle'],
      testRunner: ['maven test', 'gradle test'],
      importOrganizer: ['jdtls', 'spotless'],
    }),
    validation: {
      focused: ['syntax', 'format', 'lint', 'typecheck'],
      project: ['compile', 'test'],
    },
  },
  csharp: {
    id: 'csharp',
    displayName: 'C#/.NET',
    extensions: ['.cs'],
    manifestNames: [],
    manifestExtensions: ['.csproj'],
    taskAliases: ['c#', 'csharp', '.net', 'dotnet'],
    guidance:
      'Follow existing .NET conventions, nullable annotations, async patterns, and project-level formatting/analyzer expectations.',
    idiomGuidance: [
      'Preserve namespaces, nullable-reference settings, analyzers, dependency injection, logging, and public API contracts.',
      'Keep async/await and cancellation flow explicit, matching the surrounding framework and allocation expectations.',
      'Use records, classes, LINQ, exceptions, and result types consistently with the local design rather than mechanically.',
    ],
    tools: tools({
      parser: ['tree-sitter-c-sharp'],
      languageServer: ['Roslyn', 'csharp-ls'],
      formatter: ['dotnet format', 'csharpier'],
      linter: ['Roslyn analyzers', 'StyleCop'],
      typeChecker: ['dotnet build'],
      compiler: ['csc', 'dotnet build'],
      testRunner: ['dotnet test'],
      importOrganizer: ['Roslyn', 'dotnet format'],
    }),
    validation: {
      focused: ['syntax', 'format', 'lint', 'typecheck'],
      project: ['compile', 'test'],
    },
  },
  cpp: {
    id: 'cpp',
    displayName: 'C/C++',
    extensions: ['.c', '.cc', '.cpp', '.cxx', '.h', '.hh', '.hpp', '.hxx'],
    manifestNames: ['CMakeLists.txt'],
    manifestExtensions: [],
    taskAliases: ['c++', 'cpp', 'clang', 'cmake'],
    guidance:
      'Respect ownership, RAII, const-correctness, and the project standard/version before changing APIs or memory behavior.',
    idiomGuidance: [
      'Make ownership, lifetime, ABI, threading, allocation, and error behavior explicit at affected boundaries.',
      'Prefer RAII, const-correctness, value semantics, and standard-library facilities where the local standard permits.',
      'Preserve header/source boundaries, include order, namespaces, build flags, and avoid new raw owning pointers.',
    ],
    tools: tools({
      parser: ['tree-sitter-c', 'tree-sitter-cpp'],
      languageServer: ['clangd'],
      formatter: ['clang-format'],
      linter: ['clang-tidy', 'cppcheck'],
      typeChecker: ['clangd'],
      compiler: ['clang', 'clang++', 'gcc', 'g++', 'cmake'],
      testRunner: ['ctest'],
      importOrganizer: ['clangd'],
    }),
    validation: {
      focused: ['syntax', 'format', 'lint', 'compile'],
      project: ['compile', 'test'],
    },
  },
  ruby: {
    id: 'ruby',
    displayName: 'Ruby',
    extensions: ['.rb'],
    manifestNames: ['Gemfile', 'Gemfile.lock'],
    manifestExtensions: ['.gemspec'],
    taskAliases: ['ruby', 'rails', 'rspec'],
    guidance:
      'Keep Ruby expressive and simple; preserve Rails/RSpec or project-local conventions, blocks, naming, and dependency boundaries.',
    idiomGuidance: [
      'Prefer clear objects, blocks, enumerable helpers, guard clauses, and keyword arguments over framework-independent machinery.',
      'Keep metaprogramming and monkey patches narrow, unsurprising, and consistent with nearby patterns.',
      'Preserve Bundler, Rails, RSpec, RuboCop, transaction, validation, callback, and dependency conventions.',
    ],
    tools: tools({
      parser: ['tree-sitter-ruby'],
      languageServer: ['ruby-lsp', 'solargraph'],
      formatter: ['rubocop'],
      linter: ['rubocop'],
      typeChecker: ['steep', 'sorbet'],
      compiler: ['ruby'],
      testRunner: ['rspec', 'minitest'],
      importOrganizer: ['ruby-lsp'],
    }),
    validation: {
      focused: ['syntax', 'format', 'lint', 'typecheck'],
      project: ['test'],
    },
  },
  php: {
    id: 'php',
    displayName: 'PHP',
    extensions: ['.php'],
    manifestNames: ['composer.json', 'composer.lock'],
    manifestExtensions: [],
    taskAliases: ['php', 'composer', 'phpunit'],
    guidance:
      'Follow Composer/autoloading and framework conventions; keep types, exceptions, and array/object shapes explicit where the project does.',
    idiomGuidance: [
      'Preserve Composer autoloading, namespaces, framework boundaries, formatter output, and static-analysis expectations.',
      'Keep strict types, properties, returns, nullable values, array shapes, DTOs, and exceptions explicit at API boundaries.',
      'Prefer existing dependency-injection and service patterns over globals or mixed presentation, persistence, and domain logic.',
    ],
    tools: tools({
      parser: ['tree-sitter-php'],
      languageServer: ['intelephense', 'phpactor'],
      formatter: ['php-cs-fixer', 'phpcbf'],
      linter: ['phpcs', 'phpstan', 'psalm'],
      typeChecker: ['phpstan', 'psalm'],
      compiler: ['php'],
      testRunner: ['phpunit', 'pest'],
      importOrganizer: ['phpactor'],
    }),
    validation: {
      focused: ['syntax', 'format', 'lint', 'typecheck'],
      project: ['typecheck', 'test'],
    },
  },
  swift: {
    id: 'swift',
    displayName: 'Swift',
    extensions: ['.swift'],
    manifestNames: ['Package.swift'],
    manifestExtensions: [],
    taskAliases: ['swift', 'swiftui', 'sourcekit'],
    guidance:
      'Use Swift value semantics, optionals, protocols, and concurrency patterns idiomatically while preserving package conventions.',
    idiomGuidance: [
      'Prefer value semantics, optionals, protocols, extensions, guard, defer, and early exits where they clarify ownership and flow.',
      'Keep async/await, actors, MainActor, UIKit, and SwiftUI boundaries explicit and avoid unproven force unwraps or casts.',
      'Preserve SwiftPM/Xcode layout, formatter output, API availability, and surrounding test conventions.',
    ],
    tools: tools({
      parser: ['tree-sitter-swift'],
      languageServer: ['sourcekit-lsp'],
      formatter: ['swift-format'],
      linter: ['SwiftLint'],
      typeChecker: ['swiftc'],
      compiler: ['swiftc', 'swift build'],
      testRunner: ['swift test'],
      importOrganizer: ['sourcekit-lsp'],
    }),
    validation: {
      focused: ['syntax', 'format', 'lint', 'typecheck'],
      project: ['compile', 'test'],
    },
  },
  kotlin: {
    id: 'kotlin',
    displayName: 'Kotlin',
    extensions: ['.kt', '.kts'],
    manifestNames: [],
    manifestExtensions: [],
    taskAliases: ['kotlin', 'ktor', 'kotlinc'],
    guidance:
      'Prefer null-safety, data classes, sealed types, coroutines, and Gradle conventions that match the surrounding code.',
    idiomGuidance: [
      'Use null-safety, data/sealed types, extensions, and immutable values where they make the contract clearer.',
      'Keep suspend, flow, coroutine dispatcher, Android, Ktor, and Spring boundaries explicit; use scope functions sparingly.',
      'Preserve package layout, Gradle configuration, formatter output, and avoid Java-style boilerplate where local Kotlin is clearer.',
    ],
    tools: tools({
      parser: ['tree-sitter-kotlin'],
      languageServer: ['kotlin-language-server'],
      formatter: ['ktfmt', 'spotless'],
      linter: ['ktlint', 'detekt'],
      typeChecker: ['kotlinc'],
      compiler: ['kotlinc', 'gradle'],
      testRunner: ['gradle test'],
      importOrganizer: ['kotlin-language-server', 'spotless'],
    }),
    validation: {
      focused: ['syntax', 'format', 'lint', 'typecheck'],
      project: ['compile', 'test'],
    },
  },
  gdscript: {
    id: 'gdscript',
    displayName: 'GDScript',
    extensions: ['.gd'],
    manifestNames: ['project.godot'],
    manifestExtensions: [],
    taskAliases: ['gdscript', 'godot script'],
    guidance:
      'Follow Godot node conventions, use signals and typed variables where the project does, and preserve scene/resource references and @export patterns.',
    idiomGuidance: [
      'Preserve node inheritance, lifecycle hooks, signals, typed signatures, exports, onready initialization, and resource loading style.',
      'Keep res:// scene/resource references stable and use class_name or @tool only when the project depends on global/editor behavior.',
      'Match the project Godot version, static-typing level, node-reference style, and scene communication patterns.',
    ],
    tools: tools({
      parser: ['tree-sitter-gdscript'],
      languageServer: ['Godot language server'],
      formatter: ['gdformat'],
      linter: ['gdlint'],
      typeChecker: ['Godot language server'],
      compiler: ['godot --headless'],
      testRunner: ['GUT', 'GdUnit4'],
      importOrganizer: [],
    }),
    validation: {
      focused: ['syntax', 'format', 'lint', 'typecheck'],
      project: ['compile', 'test'],
    },
  },
} as const satisfies Record<SupportedLanguageId, LanguageCapability>

export function getLanguageCapability(
  id: SupportedLanguageId,
): LanguageCapability {
  return LANGUAGE_CAPABILITY_REGISTRY[id]
}
