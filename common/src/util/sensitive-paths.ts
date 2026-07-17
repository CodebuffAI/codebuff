import path from 'node:path'

const SENSITIVE_EXTENSIONS = new Set([
  '.pem',
  '.key',
  '.p12',
  '.pfx',
  '.jks',
  '.keystore',
  '.crt',
  '.cer',
])
const SENSITIVE_BASENAMES = new Set([
  '.htpasswd',
  '.netrc',
  'credentials',
  '.npmrc',
  '.yarnrc',
  '.yarnrc.yml',
  'auth.json',
  '.pypirc',
  'terraform.tfvars',
  '.terraformrc',
])
const ENV_TEMPLATE_SUFFIXES = ['.env.example', '.env.sample', '.env.template']
const AGENT_SESSION_ARTIFACT_BASENAMES = new Set([
  'spec.md',
  'plan.md',
  'status.md',
  'lessons.md',
  'state.json',
  'audit-report.md',
])

function toPortablePath(value: string): string {
  return value.split(path.sep).join('/').replace(/^\.\//, '')
}

export function isEnvTemplatePath(filePath: string): boolean {
  const basename = path.posix.basename(toPortablePath(filePath).toLowerCase())
  return ENV_TEMPLATE_SUFFIXES.some((suffix) => basename.endsWith(suffix))
}

/** Mandatory, case-normalized sensitive-file policy shared by discovery and reads. */
export function isMandatorySensitiveReadPath(filePath: string): boolean {
  const portable = toPortablePath(filePath).toLowerCase()
  const basename = path.posix.basename(portable)
  const extension = path.posix.extname(portable)
  const envFile =
    (basename === '.env' || basename.startsWith('.env.')) &&
    !isEnvTemplatePath(portable)
  return (
    envFile ||
    SENSITIVE_EXTENSIONS.has(extension) ||
    SENSITIVE_BASENAMES.has(basename) ||
    (/^id_(rsa|ed25519|dsa|ecdsa)/.test(basename) &&
      !basename.endsWith('.pub')) ||
    basename.endsWith('_credentials') ||
    basename.includes('kubeconfig') ||
    basename.includes('.tfstate')
  )
}

/**
 * Runtime-owned plan/audit artifacts remain readable even when a repository
 * intentionally gitignores `.agents/`. Mandatory sensitive-file policy and
 * an explicit host fileFilter still take precedence over this exception.
 */
export function isAgentSessionArtifactPath(filePath: string): boolean {
  const portable = toPortablePath(filePath).toLowerCase().replace(/\/+$/, '')
  const segments = portable.split('/').filter(Boolean)
  if (segments[0] !== '.agents' || segments[1] !== 'sessions') return false

  // Permit traversal to the sessions root and a concrete session directory;
  // every child is still checked independently before it is exposed.
  if (segments.length === 2 || segments.length === 3) return true
  if (segments.length < 4) return false

  const remainder = segments.slice(3)
  if (
    remainder.length === 1 &&
    AGENT_SESSION_ARTIFACT_BASENAMES.has(remainder[0])
  ) {
    return true
  }
  if (remainder[0] !== 'findings') return false
  if (remainder.length === 1) return true
  return remainder.length === 2 && remainder[1].endsWith('.md')
}
