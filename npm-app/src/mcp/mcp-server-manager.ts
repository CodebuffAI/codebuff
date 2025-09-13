import { spawn, ChildProcess } from 'child_process'
import fs from 'fs'
import path from 'path'
import { logger } from '../utils/logger'
import { getProjectRoot } from '../project-files'

export interface McpServerConfig {
    command: string
    args: string[]
    env?: Record<string, string>
    disabled?: boolean
    autoApprove?: string[]
}

export interface McpServersConfig {
    mcpServers: Record<string, McpServerConfig>
}

export interface McpTool {
    name: string
    description?: string
    inputSchema?: any
}

export interface McpServer {
    name: string
    config: McpServerConfig
    process?: ChildProcess
    tools: McpTool[]
    connected: boolean
}

export class McpServerManager {
    private static instance: McpServerManager | null = null
    private servers: Map<string, McpServer> = new Map()
    private initialized = false

    private constructor() { }

    public static getInstance(): McpServerManager {
        if (!McpServerManager.instance) {
            McpServerManager.instance = new McpServerManager()
        }
        return McpServerManager.instance
    }

    public async initialize(): Promise<void> {
        if (this.initialized) {
            return
        }

        logger.info('Initializing MCP Server Manager...')

        try {
            const config = await this.loadMcpConfig()
            if (!config) {
                logger.info('No MCP configuration found, skipping MCP server initialization')
                this.initialized = true
                return
            }

            await this.startServers(config)
            this.initialized = true
            logger.info(`MCP Server Manager initialized with ${this.servers.size} servers`)
        } catch (error) {
            logger.error({ error }, 'Failed to initialize MCP Server Manager')
            this.initialized = true // Mark as initialized even on error to prevent retry loops
        }
    }

    private async loadMcpConfig(): Promise<McpServersConfig | null> {
        const projectRoot = getProjectRoot() || process.cwd()
        const workspaceMcpPath = path.join(projectRoot, '.kiro', 'settings', 'mcp.json')
        const globalMcpPath = path.join(process.env.HOME || '', '.kiro', 'settings', 'mcp.json')

        logger.info({ projectRoot, workspaceMcpPath, globalMcpPath }, 'Loading MCP config paths')

        let workspaceConfig: McpServersConfig | null = null
        let globalConfig: McpServersConfig | null = null

        // Load workspace config
        if (fs.existsSync(workspaceMcpPath)) {
            try {
                const content = fs.readFileSync(workspaceMcpPath, 'utf-8')
                workspaceConfig = JSON.parse(content)
                logger.info('Loaded workspace MCP configuration')
            } catch (error) {
                logger.error({ error, path: workspaceMcpPath }, 'Failed to parse workspace MCP config')
            }
        }

        // Load global config
        if (fs.existsSync(globalMcpPath)) {
            try {
                const content = fs.readFileSync(globalMcpPath, 'utf-8')
                globalConfig = JSON.parse(content)
                logger.info('Loaded global MCP configuration')
            } catch (error) {
                logger.error({ error, path: globalMcpPath }, 'Failed to parse global MCP config')
            }
        }

        // Merge configs (workspace takes precedence)
        if (!workspaceConfig && !globalConfig) {
            return null
        }

        const mergedConfig: McpServersConfig = {
            mcpServers: {
                ...(globalConfig?.mcpServers || {}),
                ...(workspaceConfig?.mcpServers || {}),
            }
        }

        return mergedConfig
    }

    private async startServers(config: McpServersConfig): Promise<void> {
        const serverPromises = Object.entries(config.mcpServers).map(async ([name, serverConfig]) => {
            if (serverConfig.disabled) {
                logger.info(`Skipping disabled MCP server: ${name}`)
                return
            }

            try {
                await this.startServer(name, serverConfig)
            } catch (error) {
                logger.error({ error, serverName: name }, `Failed to start MCP server: ${name}`)
            }
        })

        await Promise.allSettled(serverPromises)
    }

    private async startServer(name: string, config: McpServerConfig): Promise<void> {
        logger.info(`Starting MCP server: ${name}`)

        const server: McpServer = {
            name,
            config,
            tools: [],
            connected: false,
        }

        try {
            // Start the MCP server process
            const env = {
                ...process.env,
                ...(config.env || {}),
            }

            const childProcess = spawn(config.command, config.args, {
                env,
                stdio: ['pipe', 'pipe', 'pipe'],
            })

            server.process = childProcess

            // Handle process events
            childProcess.on('error', (error) => {
                logger.error({ error, serverName: name }, `MCP server process error: ${name}`)
                server.connected = false
            })

            childProcess.on('exit', (code, signal) => {
                logger.info({ code, signal, serverName: name }, `MCP server exited: ${name}`)
                server.connected = false
            })

            // For now, we'll assume the server is connected if it starts successfully
            // In a full implementation, you would implement the MCP protocol handshake
            server.connected = true

            // Mock some tools for demonstration
            // In a real implementation, you would discover tools via MCP protocol
            server.tools = await this.discoverServerTools(name, config)

            this.servers.set(name, server)
            logger.info(`MCP server started successfully: ${name}`)
        } catch (error) {
            logger.error({ error, serverName: name }, `Failed to start MCP server: ${name}`)
            throw error
        }
    }

    private async discoverServerTools(serverName: string, config: McpServerConfig): Promise<McpTool[]> {
        // This is a mock implementation
        // In a real MCP implementation, you would use the MCP protocol to discover available tools
        const mockTools: Record<string, McpTool[]> = {
            'Context7': [
                { name: 'mcp_Context7_resolve_library_id', description: 'Resolve library ID for Context7' },
                { name: 'mcp_Context7_get_library_docs', description: 'Get library documentation from Context7' },
            ],
            'sequential-thinking': [
                { name: 'mcp_sequential_thinking_sequentialthinking', description: 'Sequential thinking tool' },
            ],
            'filesystem': [
                { name: 'mcp_filesystem_read_file', description: 'Read file contents' },
                { name: 'mcp_filesystem_write_file', description: 'Write file contents' },
                { name: 'mcp_filesystem_list_directory', description: 'List directory contents' },
                { name: 'mcp_filesystem_create_directory', description: 'Create directory' },
            ],
            'brave-search': [
                { name: 'mcp_brave_search_web', description: 'Search the web using Brave' },
            ],
        }

        return mockTools[serverName] || []
    }

    public getAvailableTools(): McpTool[] {
        const allTools: McpTool[] = []
        for (const server of this.servers.values()) {
            if (server.connected) {
                allTools.push(...server.tools)
            }
        }
        return allTools
    }

    public getServer(name: string): McpServer | undefined {
        return this.servers.get(name)
    }

    public getAllServers(): McpServer[] {
        return Array.from(this.servers.values())
    }

    public async callTool(toolName: string, params: any): Promise<any> {
        // Find which server has this tool
        for (const server of this.servers.values()) {
            if (server.connected && server.tools.some(tool => tool.name === toolName)) {
                return await this.callServerTool(server, toolName, params)
            }
        }

        throw new Error(`Tool not found: ${toolName}`)
    }

    private async callServerTool(server: McpServer, toolName: string, params: any): Promise<any> {
        // This is a mock implementation
        // In a real MCP implementation, you would use the MCP protocol to call the tool
        logger.info({ serverName: server.name, toolName, params }, 'Calling MCP tool')

        // Mock response based on tool name
        if (toolName.includes('resolve_library_id')) {
            return { libraryId: '/mock/library', description: 'Mock library for testing' }
        } else if (toolName.includes('get_library_docs')) {
            return { documentation: 'Mock documentation content', examples: [] }
        } else if (toolName.includes('sequentialthinking')) {
            return { thought: 'Mock sequential thinking response', nextThoughtNeeded: false }
        } else if (toolName.includes('read_file')) {
            return { content: 'Mock file content', path: params.path || 'unknown' }
        }

        return { result: 'Mock MCP tool response', toolName, params }
    }

    public async shutdown(): Promise<void> {
        logger.info('Shutting down MCP servers...')

        const shutdownPromises = Array.from(this.servers.values()).map(async (server) => {
            if (server.process && !server.process.killed) {
                return new Promise<void>((resolve) => {
                    server.process!.on('exit', () => resolve())
                    server.process!.kill('SIGTERM')

                    // Force kill after 5 seconds
                    setTimeout(() => {
                        if (!server.process!.killed) {
                            server.process!.kill('SIGKILL')
                        }
                        resolve()
                    }, 5000)
                })
            }
        })

        await Promise.allSettled(shutdownPromises)
        this.servers.clear()
        logger.info('MCP servers shutdown complete')
    }
}