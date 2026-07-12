import {
  LANGUAGE_CAPABILITY_REGISTRY,
  SUPPORTED_LANGUAGE_IDS,
  type LanguageCapability,
  type SupportedLanguageId,
} from './language-capabilities'

import type { FileTreeNode } from './file'

export {
  LANGUAGE_CAPABILITY_REGISTRY,
  SUPPORTED_LANGUAGE_IDS,
  getLanguageCapability,
} from './language-capabilities'
export type {
  LanguageCapability,
  LanguageToolMetadata,
  LanguageToolRole,
  LanguageValidationMetadata,
  LanguageValidationStage,
  SupportedLanguageId,
} from './language-capabilities'

/** Backwards-compatible name for callers that only need prompt fields. */
export type LanguageProfile = LanguageCapability

export type LanguageProfileSelection = {
  fileTree: FileTreeNode[]
  /** Files the task is expected to read or modify. */
  targetPaths?: readonly string[]
  /** Natural-language task text used only for explicit language signals. */
  taskText?: string
  /** Optional output cap after applying stable registry order. */
  maxProfiles?: number
}

type LanguageLookupMaps = {
  extension: ReadonlyMap<string, SupportedLanguageId>
  manifestName: ReadonlyMap<string, SupportedLanguageId>
  manifestExtension: ReadonlyMap<string, SupportedLanguageId>
}

function buildUniqueLookup(
  entries: ReadonlyArray<readonly [string, SupportedLanguageId]>,
  label: string,
): ReadonlyMap<string, SupportedLanguageId> {
  const lookup = new Map<string, SupportedLanguageId>()
  for (const [signal, languageId] of entries) {
    const existing = lookup.get(signal)
    if (existing && existing !== languageId) {
      throw new Error(
        `Duplicate ${label} language signal ${signal}: ${existing}, ${languageId}`,
      )
    }
    lookup.set(signal, languageId)
  }
  return lookup
}

function buildLanguageLookups(): LanguageLookupMaps {
  const extensionEntries: Array<readonly [string, SupportedLanguageId]> = []
  const manifestNameEntries: Array<readonly [string, SupportedLanguageId]> = []
  const manifestExtensionEntries: Array<
    readonly [string, SupportedLanguageId]
  > = []

  for (const languageId of SUPPORTED_LANGUAGE_IDS) {
    const capability = LANGUAGE_CAPABILITY_REGISTRY[languageId]
    for (const extension of capability.extensions) {
      extensionEntries.push([extension.toLowerCase(), languageId])
    }
    for (const manifestName of capability.manifestNames) {
      manifestNameEntries.push([manifestName, languageId])
    }
    for (const extension of capability.manifestExtensions) {
      manifestExtensionEntries.push([extension.toLowerCase(), languageId])
    }
  }

  return {
    extension: buildUniqueLookup(extensionEntries, 'source extension'),
    manifestName: buildUniqueLookup(manifestNameEntries, 'manifest name'),
    manifestExtension: buildUniqueLookup(
      manifestExtensionEntries,
      'manifest extension',
    ),
  }
}

const LANGUAGE_LOOKUPS = buildLanguageLookups()

function getBaseName(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  return normalized.slice(normalized.lastIndexOf('/') + 1)
}

function getFileExtension(name: string): string {
  const baseName = getBaseName(name)
  const index = baseName.lastIndexOf('.')
  if (index <= 0) return ''
  return baseName.slice(index).toLowerCase()
}

export function detectLanguageIdForPath(
  filePath: string,
): SupportedLanguageId | undefined {
  const baseName = getBaseName(filePath)
  if (
    [
      'build.gradle',
      'build.gradle.kts',
      'settings.gradle',
      'settings.gradle.kts',
      'gradle.properties',
    ].includes(baseName)
  ) {
    return undefined
  }
  const extension = getFileExtension(baseName)

  return (
    LANGUAGE_LOOKUPS.manifestName.get(baseName) ??
    LANGUAGE_LOOKUPS.manifestExtension.get(extension) ??
    LANGUAGE_LOOKUPS.extension.get(extension)
  )
}

function profilesForIds(
  detected: ReadonlySet<SupportedLanguageId>,
  maxProfiles?: number,
): LanguageProfile[] {
  const ordered = SUPPORTED_LANGUAGE_IDS.filter((id) => detected.has(id)).map(
    (id) => LANGUAGE_CAPABILITY_REGISTRY[id],
  )
  if (maxProfiles === undefined) return ordered
  return ordered.slice(0, Math.max(0, Math.floor(maxProfiles)))
}

export function detectLanguageProfilesFromPaths(
  filePaths: readonly string[],
): LanguageProfile[] {
  const detected = new Set<SupportedLanguageId>()
  for (const filePath of filePaths) {
    const languageId = detectLanguageIdForPath(filePath)
    if (languageId) detected.add(languageId)
  }
  return profilesForIds(detected)
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function containsTaskAlias(taskText: string, alias: string): boolean {
  const escaped = escapeRegex(alias)
  const startsWithWord = /^\w/.test(alias)
  const endsWithWord = /\w$/.test(alias)
  const pattern = `${startsWithWord ? '\\b' : ''}${escaped}${endsWithWord ? '\\b' : ''}`
  return new RegExp(pattern, 'i').test(taskText)
}

function containsPathSignal(taskText: string, signal: string): boolean {
  const escaped = escapeRegex(signal)
  return new RegExp(`${escaped}(?=$|[\\s\`'"),:;])`, 'i').test(taskText)
}

/**
 * Detect explicit language signals in task text. Ambiguous lowercase "go" is
 * intentionally ignored; "Go", "Golang", .go paths, go.mod, and Go tool
 * names remain reliable signals.
 */
export function detectLanguageProfilesFromTask(
  taskText: string,
): LanguageProfile[] {
  const detected = new Set<SupportedLanguageId>()

  for (const languageId of SUPPORTED_LANGUAGE_IDS) {
    const capability = LANGUAGE_CAPABILITY_REGISTRY[languageId]
    const hasAlias = capability.taskAliases.some((alias) =>
      containsTaskAlias(taskText, alias),
    )
    const hasManifest = capability.manifestNames.some((manifest) =>
      containsPathSignal(taskText, manifest),
    )
    const hasManifestExtension = capability.manifestExtensions.some(
      (extension) => containsPathSignal(taskText, extension),
    )
    const hasSourceExtension = capability.extensions.some((extension) =>
      containsPathSignal(taskText, extension),
    )
    const explicitlyNamesGo = languageId === 'go' && /\bGo\b/.test(taskText)

    if (
      hasAlias ||
      hasManifest ||
      hasManifestExtension ||
      hasSourceExtension ||
      explicitlyNamesGo
    ) {
      detected.add(languageId)
    }
  }

  return profilesForIds(detected)
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

    const languageId = detectLanguageIdForPath(node.name)
    if (languageId) detected.add(languageId)
  }
}

export function detectLanguageProfiles(
  fileTree: FileTreeNode[],
): LanguageProfile[] {
  const detected = new Set<SupportedLanguageId>()
  collectDetectedLanguages(fileTree, detected)
  return profilesForIds(detected)
}

/**
 * Prefer explicit target paths and task language names over every language in
 * a polyglot repository. Repository-wide detection is the fallback when the
 * caller has no focused signal.
 */
export function selectLanguageProfiles({
  fileTree,
  targetPaths = [],
  taskText = '',
  maxProfiles,
}: LanguageProfileSelection): LanguageProfile[] {
  const focusedIds = new Set<SupportedLanguageId>()
  for (const profile of detectLanguageProfilesFromPaths(targetPaths)) {
    focusedIds.add(profile.id)
  }
  for (const profile of detectLanguageProfilesFromTask(taskText)) {
    focusedIds.add(profile.id)
  }

  if (focusedIds.size > 0) return profilesForIds(focusedIds, maxProfiles)

  const repositoryIds = new Set(
    detectLanguageProfiles(fileTree).map((profile) => profile.id),
  )
  return profilesForIds(repositoryIds, maxProfiles)
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
        `- ${profile.displayName}: ${profile.guidance} ${profile.idiomGuidance.join(' ')}`,
    )
    .join('\n')

  return `## Language profile\n\nDetected: ${languages}. Prefer repository-local compiler, framework, API, formatter, linter, and test conventions when they are more specific than this bundled guidance.\n\n${rows}\n`
}

export function formatLanguageProfilePromptForFileTree(
  fileTree: FileTreeNode[],
  scope: Omit<LanguageProfileSelection, 'fileTree'> = {},
): string {
  return formatLanguageProfilePrompt({
    profiles: selectLanguageProfiles({ fileTree, ...scope }),
  })
}
