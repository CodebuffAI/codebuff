"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.yargsMcpCommand = void 0;
exports.yargsMcpCommand = {
    command: 'mcp',
    describe: 'Starts the Nx MCP server.',
    // @ts-expect-error - yargs types are outdated, refer to docs - https://github.com/yargs/yargs/blob/main/docs/api.md#commandmodule
    builder: async (y, helpOrVersionSet) => {
        if (helpOrVersionSet) {
            (await Promise.resolve().then(() => require('./mcp'))).showHelp();
            process.exit(0);
        }
        return y
            .version(false)
            .strict(false)
            .parserConfiguration({
            'unknown-options-as-args': true,
            'populate--': true,
        })
            .usage('')
            .help(false)
            .showHelpOnFail(false);
    },
    handler: async (args) => {
        await (await Promise.resolve().then(() => require('./mcp'))).mcpHandler(args);
        process.exit(0);
    },
};
