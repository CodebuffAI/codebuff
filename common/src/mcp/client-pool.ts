export type MCPClientPoolStatus = {
  id: string
  state: 'connecting' | 'ready'
  connectedAt: number | null
  lastUsedAt: number
}

type MCPClientPoolAdapter<TClient, TConfig> = {
  keyOf: (config: TConfig) => string
  connect: (config: TConfig) => Promise<TClient>
  close: (client: TClient) => Promise<void>
}

type MCPClientPoolOptions = {
  connectTimeoutMs?: number
}

type PoolEntry<TClient> = {
  client: TClient | null
  connecting: Promise<TClient>
  connectedAt: number | null
  lastUsedAt: number
}

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  if (timeoutMs <= 0) return promise

  let timeout: ReturnType<typeof setTimeout> | undefined
  const rejection = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs)
  })
  return Promise.race([promise, rejection]).finally(() => {
    if (timeout) clearTimeout(timeout)
  })
}

/**
 * Reuses MCP transports across turns and owns their complete lifecycle.
 * Concurrent callers for the same config share one handshake.
 */
export class MCPClientPool<TClient, TConfig> {
  private readonly entries = new Map<string, PoolEntry<TClient>>()
  private readonly connectTimeoutMs: number

  constructor(
    private readonly adapter: MCPClientPoolAdapter<TClient, TConfig>,
    options: MCPClientPoolOptions = {},
  ) {
    this.connectTimeoutMs = options.connectTimeoutMs ?? 30_000
  }

  async get(config: TConfig): Promise<{ id: string; client: TClient }> {
    const id = this.adapter.keyOf(config)
    const existing = this.entries.get(id)
    if (existing) {
      existing.lastUsedAt = Date.now()
      return { id, client: existing.client ?? (await existing.connecting) }
    }

    const now = Date.now()
    const rawConnection = this.adapter.connect(config)
    const connecting = withTimeout(
      rawConnection,
      this.connectTimeoutMs,
      `MCP connection timed out after ${this.connectTimeoutMs}ms`,
    )
    const entry: PoolEntry<TClient> = {
      client: null,
      connecting,
      connectedAt: null,
      lastUsedAt: now,
    }
    this.entries.set(id, entry)

    try {
      const client = await connecting
      entry.client = client
      entry.connectedAt = Date.now()
      entry.lastUsedAt = entry.connectedAt
      return { id, client }
    } catch (error) {
      if (this.entries.get(id) === entry) this.entries.delete(id)
      // A timed-out transport can still finish later. Close it instead of
      // leaking a child process or socket no caller can reach.
      rawConnection.then(this.adapter.close).catch(() => {})
      throw error
    }
  }

  getReady(id: string): TClient | undefined {
    const entry = this.entries.get(id)
    if (!entry?.client) return undefined
    entry.lastUsedAt = Date.now()
    return entry.client
  }

  statuses(): MCPClientPoolStatus[] {
    return [...this.entries.entries()]
      .map(([id, entry]) => ({
        id,
        state: entry.client ? ('ready' as const) : ('connecting' as const),
        connectedAt: entry.connectedAt,
        lastUsedAt: entry.lastUsedAt,
      }))
      .sort((a, b) => a.id.localeCompare(b.id))
  }

  async close(id: string): Promise<boolean> {
    const entry = this.entries.get(id)
    if (!entry) return false
    this.entries.delete(id)
    const client = entry.client ?? (await entry.connecting.catch(() => null))
    if (client) await this.adapter.close(client)
    return true
  }

  async closeAll(): Promise<void> {
    const ids = [...this.entries.keys()]
    await Promise.allSettled(ids.map((id) => this.close(id)))
  }
}
