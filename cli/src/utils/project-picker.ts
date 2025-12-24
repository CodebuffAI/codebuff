import path from 'path'

export function shouldShowProjectPicker(
  startCwd: string,
  homeDir: string,
): boolean {
  const relativeToHome = path.relative(startCwd, homeDir)
  return (
    relativeToHome === '' ||
    (!relativeToHome.startsWith('..') && !path.isAbsolute(relativeToHome))
  )
}
