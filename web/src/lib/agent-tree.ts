interface ParsedAgentId {
  publisher: string
  agentId: string
  version: string | null
}

export interface AgentTreeNode {
  /** Full agent ID (publisher/agentId@version) */
  fullId: string
  /** Agent ID without publisher/version */
  agentId: string
  /** Publisher ID */
  publisher: string
  /** Version string */
  version: string | null
  /** Human-readable display name */
  displayName: string
  /** Description of when/why to spawn this agent */
  spawnerPrompt: string | null
  /** Whether this agent exists in the store */
  isAvailable: boolean
  /** Child agents (spawnableAgents) */
  children: AgentTreeNode[]
  /** Whether this node was detected as part of a cycle */
  isCyclic: boolean
}

export interface AgentTreeData {
  /** Root agent node */
  root: AgentTreeNode
  /** Total count of unique agents in the tree */
  totalAgents: number
  /** Maximum depth of the tree */
  maxDepth: number
  /** Whether any cycles were detected */
  hasCycles: boolean
}

export interface AgentLookupResult {
  displayName: string
  spawnerPrompt: string | null
  spawnableAgents: string[]
  isAvailable: boolean
}

function sanitizeIdForMermaid(id: string): string {
  return id.replace(/[/@.]/g, '_')
}

/** Parse agent ID string (e.g. "publisher/agentId@version") */
function parseAgentId(
  agentIdString: string,
  defaultPublisher?: string,
): ParsedAgentId {
  // Fully qualified: publisher/agentId@version
  const fqMatch = agentIdString.match(/^([^/]+)\/(.+)@(.+)$/)
  if (fqMatch) {
    return {
      publisher: fqMatch[1]!,
      agentId: fqMatch[2]!,
      version: fqMatch[3]!,
    }
  }

  // With publisher but no version: publisher/agentId
  const publisherMatch = agentIdString.match(/^([^/]+)\/(.+)$/)
  if (publisherMatch) {
    return {
      publisher: publisherMatch[1]!,
      agentId: publisherMatch[2]!,
      version: null,
    }
  }

  // Simple ID: agentId
  return {
    publisher: defaultPublisher ?? 'unknown',
    agentId: agentIdString,
    version: null,
  }
}

function formatAgentId(parsed: ParsedAgentId): string {
  if (parsed.version) {
    return `${parsed.publisher}/${parsed.agentId}@${parsed.version}`
  }
  return `${parsed.publisher}/${parsed.agentId}`
}

interface BuildTreeContext {
  lookupAgent: (
    publisher: string,
    agentId: string,
    version: string | null,
  ) => Promise<AgentLookupResult | null>
  visitedIds: Set<string>
  currentDepth: number
  maxDepth: number
}

async function buildTreeNodeRecursive(
  agentIdString: string,
  defaultPublisher: string,
  ctx: BuildTreeContext,
): Promise<AgentTreeNode> {
  const parsed = parseAgentId(agentIdString, defaultPublisher)
  const fullId = formatAgentId(parsed)

  // Check for cycles
  if (ctx.visitedIds.has(fullId)) {
    return {
      fullId,
      agentId: parsed.agentId,
      publisher: parsed.publisher,
      version: parsed.version,
      displayName: parsed.agentId,
      spawnerPrompt: null,
      isAvailable: false,
      children: [],
      isCyclic: true,
    }
  }

  // Mark as visited
  ctx.visitedIds.add(fullId)

  // Look up agent data
  const agentData = await ctx.lookupAgent(
    parsed.publisher,
    parsed.agentId,
    parsed.version,
  )

  const node: AgentTreeNode = {
    fullId,
    agentId: parsed.agentId,
    publisher: parsed.publisher,
    version: parsed.version,
    displayName: agentData?.displayName ?? parsed.agentId,
    spawnerPrompt: agentData?.spawnerPrompt ?? null,
    isAvailable: agentData?.isAvailable ?? false,
    children: [],
    isCyclic: false,
  }

  // Recursively build children if we haven't hit max depth
  if (agentData && ctx.currentDepth < ctx.maxDepth) {
    const childPromises = agentData.spawnableAgents.map((childId) =>
      buildTreeNodeRecursive(childId, parsed.publisher, {
        ...ctx,
        currentDepth: ctx.currentDepth + 1,
        visitedIds: new Set(ctx.visitedIds), // Clone for each branch
      }),
    )
    node.children = await Promise.all(childPromises)
  }

  return node
}

export async function buildAgentTree(params: {
  rootPublisher: string
  rootAgentId: string
  rootVersion: string
  rootDisplayName: string
  rootSpawnerPrompt: string | null
  rootSpawnableAgents: string[]
  lookupAgent: (
    publisher: string,
    agentId: string,
    version: string | null,
  ) => Promise<AgentLookupResult | null>
  maxDepth?: number
}): Promise<AgentTreeData> {
  const {
    rootPublisher,
    rootAgentId,
    rootVersion,
    rootDisplayName,
    rootSpawnerPrompt,
    rootSpawnableAgents,
    lookupAgent,
    maxDepth = 5,
  } = params

  const rootFullId = `${rootPublisher}/${rootAgentId}@${rootVersion}`
  const visitedIds = new Set<string>([rootFullId])

  // Build children
  const childPromises = rootSpawnableAgents.map((childId) =>
    buildTreeNodeRecursive(childId, rootPublisher, {
      lookupAgent,
      visitedIds: new Set(visitedIds),
      currentDepth: 1,
      maxDepth,
    }),
  )
  const children = await Promise.all(childPromises)

  const root: AgentTreeNode = {
    fullId: rootFullId,
    agentId: rootAgentId,
    publisher: rootPublisher,
    version: rootVersion,
    displayName: rootDisplayName,
    spawnerPrompt: rootSpawnerPrompt,
    isAvailable: true,
    children,
    isCyclic: false,
  }

  // Calculate tree stats
  const stats = calculateTreeStats(root)

  return {
    root,
    ...stats,
  }
}

function calculateTreeStats(node: AgentTreeNode): {
  totalAgents: number
  maxDepth: number
  hasCycles: boolean
} {
  const uniqueIds = new Set<string>()
  let hasCycles = false

  function traverse(n: AgentTreeNode, depth: number): number {
    uniqueIds.add(n.fullId)
    if (n.isCyclic) hasCycles = true

    let maxChildDepth = depth
    for (const child of n.children) {
      const childDepth = traverse(child, depth + 1)
      maxChildDepth = Math.max(maxChildDepth, childDepth)
    }
    return maxChildDepth
  }

  const maxDepth = traverse(node, 0)

  return {
    totalAgents: uniqueIds.size,
    maxDepth,
    hasCycles,
  }
}

export function generateMermaidDiagram(tree: AgentTreeData): string {
  // Use LR (left-to-right) layout for better handling of many siblings
  const lines: string[] = ['flowchart LR']
  const nodeDefinitions: string[] = []
  const connections: string[] = []
  const seenNodes = new Set<string>()

  function getNodeLabel(node: AgentTreeNode): string {
    const name = node.displayName
    const version = node.version ? `v${node.version}` : ''
    // Escape special characters for Mermaid to prevent XSS
    const escapedName = name
      .replace(/"/g, "'")
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/&(?!lt;|gt;|amp;)/g, '&amp;')
    const escapedVersion = version.replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return escapedVersion ? `"${escapedName}<br/>${escapedVersion}"` : `"${escapedName}"`
  }

  function traverse(node: AgentTreeNode, parentSanitizedId: string | null) {
    const sanitizedId = sanitizeIdForMermaid(node.fullId)

    if (!seenNodes.has(sanitizedId)) {
      seenNodes.add(sanitizedId)
      const label = getNodeLabel(node)

      if (node.isCyclic) {
        nodeDefinitions.push(`  ${sanitizedId}[${label}]:::cyclic`)
      } else if (!node.isAvailable) {
        nodeDefinitions.push(`  ${sanitizedId}[${label}]:::unavailable`)
      } else if (!parentSanitizedId) {
        nodeDefinitions.push(`  ${sanitizedId}[${label}]:::root`)
      } else {
        nodeDefinitions.push(`  ${sanitizedId}[${label}]`)
      }
    }

    if (parentSanitizedId) {
      connections.push(`  ${parentSanitizedId} --> ${sanitizedId}`)
    }

    if (!node.isCyclic) {
      for (const child of node.children) {
        traverse(child, sanitizedId)
      }
    }
  }

  traverse(tree.root, null)

  lines.push(...nodeDefinitions)
  lines.push('')
  lines.push(...connections)
  lines.push('')
  lines.push('  %% Styling')
  lines.push('  classDef default fill:#1e293b,stroke:#475569,color:#e2e8f0')
  lines.push('  classDef root fill:#3b82f6,stroke:#1d4ed8,color:#fff')
  lines.push('  classDef cyclic fill:#78350f,stroke:#d97706,color:#fef3c7,stroke-dasharray: 5 5')
  lines.push('  classDef unavailable fill:#374151,stroke:#4b5563,color:#9ca3af')

  return lines.join('\n')
}

export interface NodeData {
  fullId: string
  agentId: string
  publisher: string
  version: string | null
  displayName: string
  spawnerPrompt: string | null
  isAvailable: boolean
  isCyclic: boolean
  childCount: number
}

export function generateNodeDataMap(tree: AgentTreeData): Map<string, NodeData> {
  const nodeMap = new Map<string, NodeData>()

  function traverse(node: AgentTreeNode) {
    const sanitizedId = sanitizeIdForMermaid(node.fullId)

    if (!nodeMap.has(sanitizedId)) {
      nodeMap.set(sanitizedId, {
        fullId: node.fullId,
        agentId: node.agentId,
        publisher: node.publisher,
        version: node.version,
        displayName: node.displayName,
        spawnerPrompt: node.spawnerPrompt,
        isAvailable: node.isAvailable,
        isCyclic: node.isCyclic,
        childCount: node.children.length,
      })
    }

    if (!node.isCyclic) {
      for (const child of node.children) {
        traverse(child)
      }
    }
  }

  traverse(tree.root)
  return nodeMap
}
