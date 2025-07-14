import { ProjectFileContext } from '@codebuff/common/util/file'

export async function requestRelevantFiles(
  description: string,
  fileContext: ProjectFileContext,
  options: any
): Promise<string[]> {
  // TODO: Implement this function
  return []
}

export async function requestRelevantFilesForTraining(
  description: string,
  fileContext: ProjectFileContext,
  options: any
): Promise<string[]> {
  // TODO: Implement this function
  return []
}

export async function getRelevantFiles(
  description: string,
  fileContext: ProjectFileContext,
  options: any
): Promise<string[]> {
  // TODO: Implement this function
  return []
}

export async function getRelevantFilesForTraining(
  description: string,
  fileContext: ProjectFileContext,
  options: any
): Promise<string[]> {
  // TODO: Implement this function
  return []
}

export function topLevelDirectories(paths: string[]): string[] {
  // TODO: Implement this function
  return []
}

export function getExampleFileList(paths: string[]): string {
  // TODO: Implement this function
  return ''
}

export function generateNonObviousRequestFilesPrompt(
  description: string,
  fileContext: ProjectFileContext
): string {
  // TODO: Implement this function
  return ''
}

export function generateKeyRequestFilesPrompt(
  description: string,
  fileContext: ProjectFileContext
): string {
  // TODO: Implement this function
  return ''
}

export function getCustomFilePickerConfigForOrg(orgId: string): any {
  // TODO: Implement this function
  return null
}

export function isValidFilePickerModelName(modelName: string): boolean {
  // TODO: Implement this function
  return true
}
