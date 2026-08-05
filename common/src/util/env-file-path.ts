const ENV_TEMPLATE_BASENAMES = new Set([
  '.env.example',
  '.env.sample',
  '.env.template',
])

function basename(filePath: string): string {
  const segments: string[] = []
  for (const segment of filePath.replaceAll('\\', '/').split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      segments.pop()
      continue
    }
    segments.push(segment)
  }
  const name = segments.at(-1)?.toLowerCase() ?? ''
  // `C:.env` is a drive-relative path on Windows, not a file literally named
  // `C:.env`. Full drive paths already split at their slash above.
  return /^[a-z]:/.test(name) ? name.slice(2) : name
}

export function isEnvTemplateFilePath(filePath: string): boolean {
  return ENV_TEMPLATE_BASENAMES.has(basename(filePath))
}

export function isEnvFilePath(filePath: string): boolean {
  const name = basename(filePath)
  // Win32 strips trailing spaces/dots from ordinary path components, and NTFS
  // alternate data streams append `:<stream>` to the underlying filename.
  // Classify those aliases as env files, but keep the template exemption exact.
  const windowsBaseName = name.split(':', 1)[0]!.replace(/[ .]+$/g, '')
  return (
    windowsBaseName === '.env' || windowsBaseName.startsWith('.env.')
  )
}

export function isSensitiveEnvFilePath(filePath: string): boolean {
  return isEnvFilePath(filePath) && !isEnvTemplateFilePath(filePath)
}
