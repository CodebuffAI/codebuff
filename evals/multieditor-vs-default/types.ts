import { z } from 'zod'

export const multieditorEvalTaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  prompt: z.string().min(1),
  repository: z.object({
    name: z.string().min(1),
    path: z.string().min(1).optional(),
    baseCommit: z.string().min(1).optional(),
  }),
  bucket: z.enum([
    'one-file-bugfix',
    'multi-file-feature',
    'existing-helper-reuse',
    'tests-required',
    'ui-component-change',
    'config-schema-update',
    'ambiguous-path-discovery',
    'refactor-lite',
  ]),
  validationCommands: z.array(z.string().min(1)).default([]),
  scoringNotes: z.array(z.string().min(1)).default([]),
})

export const multieditorEvalSuiteSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1).optional(),
  tasks: z.array(multieditorEvalTaskSchema).min(1),
})

export const editorRunResultSchema = z.object({
  taskId: z.string().min(1),
  editorKind: z.enum(['default', 'multieditor']),
  appliedCleanly: z.boolean(),
  validationPassed: z.boolean(),
  satisfiedTask: z.boolean(),
  hallucinatedPaths: z.number().int().min(0).default(0),
  changedFiles: z.number().int().min(0).default(0),
  reviewerScore: z.number().min(0).max(10).optional(),
  notes: z.array(z.string().min(1)).default([]),
})

export type MultieditorEvalTask = z.infer<typeof multieditorEvalTaskSchema>
export type MultieditorEvalSuite = z.infer<typeof multieditorEvalSuiteSchema>
export type EditorRunResult = z.infer<typeof editorRunResultSchema>

export type ComparisonScore = {
  taskId: string
  defaultScore: number | undefined
  multieditorScore: number | undefined
  winner: 'default' | 'multieditor' | 'tie' | 'incomplete'
}
