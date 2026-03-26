import fs from 'fs'
import path from 'path'

import { z } from 'zod'

const CONFIG_PATH = '.agents/evals/evalbuff.json'

const evalbuffConfigSchema = z.object({
  version: z.number(),
  project: z
    .object({
      name: z.string().optional(),
      description: z.string().optional(),
    })
    .optional(),
  context: z
    .object({
      maxFiles: z.number().optional(),
      excludePatterns: z.array(z.string()).optional(),
    })
    .optional(),
  review: z
    .object({
      defaultBranch: z.string().optional(),
    })
    .optional(),
})

export type EvalbuffConfig = z.infer<typeof evalbuffConfigSchema>

export function configPath(projectRoot: string): string {
  return path.join(projectRoot, CONFIG_PATH)
}

export function readConfig(projectRoot: string): EvalbuffConfig | null {
  const filePath = configPath(projectRoot)
  if (!fs.existsSync(filePath)) return null

  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    return evalbuffConfigSchema.parse(raw)
  } catch (error) {
    process.stderr.write(
      `Warning: Failed to parse evalbuff.json: ${error instanceof Error ? error.message : String(error)}. Using defaults.\n`,
    )
    return null
  }
}

export function writeConfig(
  projectRoot: string,
  config: EvalbuffConfig,
): void {
  const filePath = configPath(projectRoot)
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2) + '\n')
}

export function detectProjectName(projectRoot: string): string {
  const pkgPath = path.join(projectRoot, 'package.json')
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
      if (typeof pkg.name === 'string' && pkg.name) return pkg.name
    } catch {
      // ignore
    }
  }

  const pyprojectPath = path.join(projectRoot, 'pyproject.toml')
  if (fs.existsSync(pyprojectPath)) {
    try {
      const content = fs.readFileSync(pyprojectPath, 'utf8')
      const nameMatch = content.match(/^name\s*=\s*"([^"]+)"/m)
      if (nameMatch) return nameMatch[1]
    } catch {
      // ignore
    }
  }

  return path.basename(projectRoot)
}

export function detectProjectDescription(projectRoot: string): string {
  const pkgPath = path.join(projectRoot, 'package.json')
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
      if (typeof pkg.description === 'string' && pkg.description)
        return pkg.description
    } catch {
      // ignore
    }
  }
  return ''
}

export function getDefaultConfig(projectRoot: string): EvalbuffConfig {
  const name = detectProjectName(projectRoot)
  const description = detectProjectDescription(projectRoot)

  return {
    version: 1,
    project: {
      name,
      ...(description && { description }),
    },
    context: {
      maxFiles: 15,
      excludePatterns: ['dist/**', 'node_modules/**', '*.generated.ts'],
    },
    review: {
      defaultBranch: 'main',
    },
  }
}
