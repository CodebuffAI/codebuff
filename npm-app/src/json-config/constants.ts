import { z } from 'zod'

export const StartupProcessSchema = z.object({
  name: z.string().min(1, 'Process name is required'),
  command: z.string().min(1, 'Command is required'),
  cwd: z.string().optional(),
  enabled: z.boolean().optional().default(true),
})

export const CodebuffConfigSchema = z.object({
  startupProcesses: z.array(StartupProcessSchema).optional(),
})

export type StartupProcess = z.infer<typeof StartupProcessSchema>
export type CodebuffConfig = z.infer<typeof CodebuffConfigSchema>
