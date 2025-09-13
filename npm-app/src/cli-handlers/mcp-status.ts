import { green, red, yellow, cyan, bold } from 'picocolors'
import { McpServerManager } from '../mcp/mcp-server-manager'
import { logger } from '../utils/logger'

export function handleMcpStatus(): void {
    try {
        const mcpManager = McpServerManager.getInstance()
        const servers = mcpManager.getAllServers()
        const availableTools = mcpManager.getAvailableTools()

        console.log(bold('\n🔧 MCP Server Status\n'))

        if (servers.length === 0) {
            console.log(yellow('No MCP servers configured.'))
            console.log('Add servers to .kiro/settings/mcp.json to get started.')
            return
        }

        // Display server status
        console.log(bold('Servers:'))
        servers.forEach((server) => {
            const status = server.connected ? green('✓ Connected') : red('✗ Disconnected')
            const toolCount = server.tools.length

            console.log(`  ${bold(server.name)}: ${status} (${toolCount} tools)`)

            if (server.config.disabled) {
                console.log(`    ${yellow('(Disabled in configuration)')}`)
            }

            if (server.tools.length > 0) {
                console.log(`    Tools: ${server.tools.map(t => cyan(t.name)).join(', ')}`)
            }
        })

        // Display available tools summary
        console.log(bold(`\nAvailable Tools (${availableTools.length}):`))
        if (availableTools.length > 0) {
            availableTools.forEach((tool) => {
                console.log(`  ${green('•')} ${cyan(tool.name)}${tool.description ? ` - ${tool.description}` : ''}`)
            })
        } else {
            console.log(yellow('  No tools available. Check server connections.'))
        }

        console.log(bold('\nUsage in Agents:'))
        console.log('Add MCP tools to your agent\'s toolNames array:')
        console.log(cyan('  toolNames: [\'mcp_tool_name\' as any, \'end_turn\']'))

    } catch (error) {
        logger.error({ error }, 'Error getting MCP status')
        console.log(red('Error getting MCP server status. Check logs for details.'))
    }
}

export async function handleMcpTest(toolName?: string): Promise<void> {
    try {
        const mcpManager = McpServerManager.getInstance()

        if (!toolName) {
            console.log(yellow('Please specify a tool name to test.'))
            console.log('Example: mcp-test mcp_Context7_resolve_library_id')
            return
        }

        console.log(bold(`\n🧪 Testing MCP Tool: ${cyan(toolName)}\n`))

        // Test with sample parameters
        const testParams = getTestParameters(toolName)
        console.log(`Parameters: ${JSON.stringify(testParams, null, 2)}`)

        const startTime = Date.now()
        const result = await mcpManager.callTool(toolName, testParams)
        const duration = Date.now() - startTime

        console.log(green(`\n✓ Tool call successful (${duration}ms)`))
        console.log(bold('Result:'))
        console.log(JSON.stringify(result, null, 2))

    } catch (error) {
        logger.error({ error, toolName }, 'MCP tool test failed')
        console.log(red(`✗ Tool call failed: ${error instanceof Error ? error.message : String(error)}`))
    }
}

function getTestParameters(toolName: string): any {
    // Return appropriate test parameters based on tool name
    if (toolName.includes('resolve_library_id')) {
        return { libraryName: 'react' }
    } else if (toolName.includes('get_library_docs')) {
        return { context7CompatibleLibraryID: '/facebook/react' }
    } else if (toolName.includes('sequentialthinking')) {
        return {
            thought: 'This is a test thought',
            nextThoughtNeeded: false,
            thoughtNumber: 1,
            totalThoughts: 1
        }
    } else if (toolName.includes('read_file')) {
        return { path: 'package.json' }
    } else if (toolName.includes('list_directory')) {
        return { path: '.' }
    }

    return {}
}