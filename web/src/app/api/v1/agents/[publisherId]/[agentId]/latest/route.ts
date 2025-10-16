import { GET as wrapped } from '@/app/api/agents/[publisherId]/[agentId]/latest/route'

export function GET(...args: Parameters<typeof wrapped>) {
  return wrapped(...args)
}
