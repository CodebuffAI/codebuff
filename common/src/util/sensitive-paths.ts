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
