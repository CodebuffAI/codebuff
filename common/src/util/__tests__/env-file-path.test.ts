import { describe, expect, test } from 'bun:test'

import {
  isEnvFilePath,
  isEnvTemplateFilePath,
  isSensitiveEnvFilePath,
} from '../env-file-path'

describe('env file paths', () => {
  test.each([
    ['.env', true],
    ['.ENV.LOCAL', true],
    ['config/.Env.Template', true],
    ['app.env', false],
  ])('%s env family → %s', (filePath, expected) => {
    expect(isEnvFilePath(filePath)).toBe(expected)
  })

  test.each([
    ['.env', true],
    ['.ENV', true],
    ['config/.env.local', true],
    ['config\\.Env.Production', true],
    ['.ENV/', true],
    ['config/.env.local/.', true],
    ['safe/../.env', true],
    ['.env ', true],
    ['.env:$DATA', true],
    ['config/.env.local:backup', true],
    ['C:.ENV', true],
    ['.env.example ', true],
    ['.env.example:$DATA', true],
    ['/tmp/.env.example', false],
    ['.ENV.SAMPLE', false],
    ['config\\.env.Template', false],
    ['.envrc', false],
    ['app.env', false],
    ['.env/..', false],
  ])('%s sensitive → %s', (filePath, expected) => {
    expect(isSensitiveEnvFilePath(filePath)).toBe(expected)
  })

  test.each([
    ['.env.example', true],
    ['.ENV.SAMPLE', true],
    ['config/.Env.Template', true],
    ['config/.Env.Template/./', true],
    ['C:.Env.Example', true],
    ['.env', false],
    ['.env.local', false],
    ['.env.example ', false],
    ['.env.example:$DATA', false],
    ['app.env.example', false],
  ])('%s template → %s', (filePath, expected) => {
    expect(isEnvTemplateFilePath(filePath)).toBe(expected)
  })
})
