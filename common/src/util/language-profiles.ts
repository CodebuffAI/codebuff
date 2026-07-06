import type { FileTreeNode } from './file'

export type SupportedLanguageId =
  | 'typescript'
  | 'python'
  | 'rust'
  | 'go'
  | 'java'
  | 'csharp'
  | 'cpp'
  | 'ruby'
  | 'php'
  | 'swift'
  | 'kotlin'

export type LanguageProfile = {
  id: SupportedLanguageId
  displayName: string
  idiomFile: `agents/idioms/${SupportedLanguageId}.md`
  guidance: string
}

const LANGUAGE_PROFILES: Record<SupportedLanguageId, LanguageProfile> = {
  typescript: {
    id: 'typescript',
    displayName: 'TypeScript/JavaScript',
    idiomFile: 'agents/idioms/typescript.md',
    guidance:
      'Favor typed, modular changes; preserve existing framework patterns, async boundaries, and lint/format conventions.',
  },
  python: {
    id: 'python',
    displayName: 'Python',
    idiomFile: 'agents/idioms/python.md',
    guidance:
      'Prefer simple, explicit code with clear names, context managers, standard typing, and project-local test/style conventions.',
  },
  rust: {
    id: 'rust',
    displayName: 'Rust',
    idiomFile: 'agents/idioms/rust.md',
    guidance:
      'Respect ownership and borrowing, return Result/Option idiomatically, and keep error handling explicit and precise.',
  },
  go: {
    id: 'go',
    displayName: 'Go',
    idiomFile: 'agents/idioms/go.md',
    guidance:
      'Keep code small and explicit, handle errors immediately, and follow package-level naming and interface conventions.',
  },
  java: {
    id: 'java',
    displayName: 'Java',
    idiomFile: 'agents/idioms/java.md',
    guidance:
      'Preserve package structure and build conventions; prefer clear types, small methods, and existing dependency-injection/test patterns.',
  },
  csharp: {
    id: 'csharp',
    displayName: 'C#/.NET',
    idiomFile: 'agents/idioms/csharp.md',
    guidance:
      'Follow existing .NET conventions, nullable annotations, async patterns, and project-level formatting/analyzer expectations.',
  },
  cpp: {
    id: 'cpp',
    displayName: 'C/C++',
    idiomFile: 'agents/idioms/cpp.md',
    guidance:
      'Respect ownership, RAII, const-correctness, and the project standard/version before changing APIs or memory behavior.',
  },
  ruby: {
    id: 'ruby',
    displayName: 'Ruby',
    idiomFile: 'agents/idioms/ruby.md',
    guidance:
      'Keep Ruby expressive and simple; preserve Rails/RSpec or project-local conventions, blocks, naming, and dependency boundaries.',
  },
  php: {
    id: 'php',
    displayName: 'PHP',
    idiomFile: 'agents/idioms/php.md',
    guidance:
      'Follow Composer/autoloading and framework conventions; keep types, exceptions, and array/object shapes explicit where the project does.',
  },
  swift: {
    id: 'swift',
    displayName: 'Swift',
    idiomFile: 'agents/idioms/swift.md',
    guidance:
      'Use Swift value semantics, optionals, protocols, and concurrency patterns idiomatically while preserving package conventions.',
  },
  kotlin: {
    id: 'kotlin',
    displayName: 'Kotlin',
    idiomFile: 'agents/idioms/kotlin.md',
    guidance:
      'Prefer null-safety, data classes, sealed types, coroutines, and Gradle conventions that match the surrounding code.',
  },
}

const LANGUAGE_ORDER: SupportedLanguageId[] = [
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
]

const EXTENSION_LANGUAGE_MAP: Record<string, SupportedLanguageId> = {
  '.cjs': 'typescript',
  '.cts': 'typescript',
  '.js': 'typescript',
  '.jsx': 'typescript',
  '.mjs': 'typescript',
  '.mts': 'typescript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.py': 'python',
  '.pyi': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.cs': 'csharp',
  '.c': 'cpp',
  '.cc': 'cpp',
  '.cpp': 'cpp',
  '.cxx': 'cpp',
  '.h': 'cpp',
  '.hh': 'cpp',
  '.hpp': 'cpp',
  '.hxx': 'cpp',
  '.rb': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
}

const MANIFEST_EXTENSION_LANGUAGE_MAP: Record<string, SupportedLanguageId> = {
  '.csproj': 'csharp',
  '.fsproj': 'csharp',
  '.vbproj': 'csharp',
  '.sln': 'csharp',
  '.gemspec': 'ruby',
}

const MANIFEST_LANGUAGE_MAP: Record<string, SupportedLanguageId> = {
  'package.json': 'typescript',
  'tsconfig.json': 'typescript',
  'jsconfig.json': 'typescript',
  'pyproject.toml': 'python',
  'requirements.txt': 'python',
  'setup.py': 'python',
  'setup.cfg': 'python',
  Pipfile: 'python',
  'Cargo.toml': 'rust',
  'Cargo.lock': 'rust',
  'go.mod': 'go',
  'go.sum': 'go',
  'pom.xml': 'java',
  'build.gradle': 'java',
  'settings.gradle': 'java',
  'gradle.properties': 'java',
  Gemfile: 'ruby',
  'Gemfile.lock': 'ruby',
  'composer.json': 'php',
  'composer.lock': 'php',
  'Package.swift': 'swift',
  'build.gradle.kts': 'kotlin',
  'settings.gradle.kts': 'kotlin',
}

function getFileExtension(name: string): string {
  const index = name.lastIndexOf('.')
  if (index <= 0) return ''
  return name.slice(index).toLowerCase()
}

function collectDetectedLanguages(
  nodes: FileTreeNode[],
  detected: Set<SupportedLanguageId>,
): void {
  for (const node of nodes) {
    if (node.type === 'directory') {
      collectDetectedLanguages(node.children ?? [], detected)
      continue
    }

    const extension = getFileExtension(node.name)
    const manifestLanguage =
      MANIFEST_LANGUAGE_MAP[node.name] ??
      MANIFEST_EXTENSION_LANGUAGE_MAP[extension]
    if (manifestLanguage) {
      detected.add(manifestLanguage)
      continue
    }

    const extensionLanguage = EXTENSION_LANGUAGE_MAP[extension]
    if (extensionLanguage) detected.add(extensionLanguage)
  }
}

export function detectLanguageProfiles(
  fileTree: FileTreeNode[],
): LanguageProfile[] {
  const detected = new Set<SupportedLanguageId>()
  collectDetectedLanguages(fileTree, detected)
  return LANGUAGE_ORDER.filter((id) => detected.has(id)).map(
    (id) => LANGUAGE_PROFILES[id],
  )
}

export function formatLanguageProfilePrompt(params: {
  profiles: LanguageProfile[]
}): string {
  const { profiles } = params
  if (profiles.length === 0) return ''

  const languages = profiles.map((profile) => profile.displayName).join(', ')
  const rows = profiles
    .map(
      (profile) =>
        `- ${profile.displayName}: ${profile.guidance} Before non-trivial ${profile.displayName} edits, \`read_files\` \`${profile.idiomFile}\`.`,
    )
    .join('\n')

  return `## Language profile\n\nDetected: ${languages}. Use language-native idioms and existing project conventions. Do not load every idiom file up front.\n\n${rows}\n`
}

export function formatLanguageProfilePromptForFileTree(
  fileTree: FileTreeNode[],
): string {
  return formatLanguageProfilePrompt({
    profiles: detectLanguageProfiles(fileTree),
  })
}
