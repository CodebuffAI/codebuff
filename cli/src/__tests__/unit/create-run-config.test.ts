import { describe, test, expect } from 'bun:test'

import { isSensitiveFile, isEnvTemplateFile } from '../../utils/create-run-config'

describe('isSensitiveFile', () => {
  test.each([
    // Env files (blocked)
    ['.env', true],
    ['.env.local', true],
    ['config/.env.production', true],

    // Env templates (allowed)
    ['.env.example', false],
    ['.env.sample', false],
    ['.env.template', false],

    // Sensitive extensions
    ['private.pem', true],
    ['server.key', true],
    ['cert.p12', true],
    ['app.keystore', true],
    ['server.crt', true],

    // Sensitive basenames
    ['.htpasswd', true],
    ['.netrc', true],
    ['credentials', true],
    ['.npmrc', true],
    ['.yarnrc.yml', true],
    ['auth.json', true],
    ['terraform.tfvars', true],

    // SSH keys (prefix pattern)
    ['id_rsa', true],
    ['id_ed25519', true],
    ['id_rsa_github', true],
    ['id_rsa.pub', false], // public keys allowed

    // Credentials suffix pattern
    ['aws_credentials', true],
    ['db_credentials', true],

    // Substring patterns
    ['kubeconfig', true],
    ['my-kubeconfig.yaml', true],
    ['terraform.tfstate', true],
    ['prod.tfstate.backup', true],

    // Non-sensitive (should NOT be blocked)
    ['package.json', false],
    ['README.md', false],
    ['src/index.ts', false],
    ['.envrc', false],
    ['credentials.ts', false],
    ['terraform.tf', false],
    ['kube-config.ts', false],
  ])('%s → %s', (file, expected) => {
    expect(isSensitiveFile(file)).toBe(expected)
  })
})

describe('isEnvTemplateFile', () => {
  test.each([
    ['.env.example', true],
    ['.env.sample', true],
    ['.env.template', true],
    ['config/.env.example', true],
    ['.env', false],
    ['.env.local', false],
    ['package.json', false],
  ])('%s → %s', (file, expected) => {
    expect(isEnvTemplateFile(file)).toBe(expected)
  })
})
