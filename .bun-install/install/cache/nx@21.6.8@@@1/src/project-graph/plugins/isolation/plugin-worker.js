"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_perf_hooks_1 = require("node:perf_hooks");
node_perf_hooks_1.performance.mark(`plugin worker ${process.pid} code loading -- start`);
const messaging_1 = require("./messaging");
const serializable_error_1 = require("../../../utils/serializable-error");
const consume_messages_from_socket_1 = require("../../../utils/consume-messages-from-socket");
const net_1 = require("net");
const fs_1 = require("fs");
if (process.env.NX_PERF_LOGGING === 'true') {
    require('../../../utils/perf-logging');
}
node_perf_hooks_1.performance.mark(`plugin worker ${process.pid} code loading -- end`);
node_perf_hooks_1.performance.measure(`plugin worker ${process.pid} code loading`, `plugin worker ${process.pid} code loading -- start`, `plugin worker ${process.pid} code loading -- end`);
global.NX_GRAPH_CREATION = true;
global.NX_PLUGIN_WORKER = true;
let connected = false;
let plugin;
const socketPath = process.argv[2];
const server = (0, net_1.createServer)((socket) => {
    connected = true;
    // This handles cases where the host process was killed
    // after the worker connected but before the worker was
    // instructed to load the plugin.
    const loadTimeout = setTimeout(() => {
        console.error(`Plugin Worker exited because no plugin was loaded within 10 seconds of starting up.`);
        process.exit(1);
    }, 10000).unref();
    socket.on('data', (0, consume_messages_from_socket_1.consumeMessagesFromSocket)((raw) => {
        const message = JSON.parse(raw.toString());
        if (!(0, messaging_1.isPluginWorkerMessage)(message)) {
            return;
        }
        return (0, messaging_1.consumeMessage)(socket, message, {
            load: async ({ plugin: pluginConfiguration, root, name, pluginPath, shouldRegisterTSTranspiler, }) => {
                if (loadTimeout)
                    clearTimeout(loadTimeout);
                process.chdir(root);
                try {
                    const { loadResolvedNxPluginAsync } = await Promise.resolve().then(() => require('../load-resolved-plugin'));
                    // Register the ts-transpiler if we are pointing to a
                    // plain ts file that's not part of a plugin project
                    if (shouldRegisterTSTranspiler) {
                        require('../transpiler').registerPluginTSTranspiler();
                    }
                    plugin = await loadResolvedNxPluginAsync(pluginConfiguration, pluginPath, name);
                    return {
                        type: 'load-result',
                        payload: {
                            name: plugin.name,
                            include: plugin.include,
                            exclude: plugin.exclude,
                            createNodesPattern: plugin.createNodes?.[0],
                            hasCreateDependencies: 'createDependencies' in plugin && !!plugin.createDependencies,
                            hasProcessProjectGraph: 'processProjectGraph' in plugin &&
                                !!plugin.processProjectGraph,
                            hasCreateMetadata: 'createMetadata' in plugin && !!plugin.createMetadata,
                            hasPreTasksExecution: 'preTasksExecution' in plugin && !!plugin.preTasksExecution,
                            hasPostTasksExecution: 'postTasksExecution' in plugin && !!plugin.postTasksExecution,
                            success: true,
                        },
                    };
                }
                catch (e) {
                    return {
                        type: 'load-result',
                        payload: {
                            success: false,
                            error: (0, serializable_error_1.createSerializableError)(e),
                        },
                    };
                }
            },
            createNodes: async ({ configFiles, context, tx }) => {
                try {
                    const result = await plugin.createNodes[1](configFiles, context);
                    return {
                        type: 'createNodesResult',
                        payload: { result, success: true, tx },
                    };
                }
                catch (e) {
                    return {
                        type: 'createNodesResult',
                        payload: {
                            success: false,
                            error: (0, serializable_error_1.createSerializableError)(e),
                            tx,
                        },
                    };
                }
            },
            createDependencies: async ({ context, tx }) => {
                try {
                    const result = await plugin.createDependencies(context);
                    return {
                        type: 'createDependenciesResult',
                        payload: { dependencies: result, success: true, tx },
                    };
                }
                catch (e) {
                    return {
                        type: 'createDependenciesResult',
                        payload: {
                            success: false,
                            error: (0, serializable_error_1.createSerializableError)(e),
                            tx,
                        },
                    };
                }
            },
            createMetadata: async ({ graph, context, tx }) => {
                try {
                    const result = await plugin.createMetadata(graph, context);
                    return {
                        type: 'createMetadataResult',
                        payload: { metadata: result, success: true, tx },
                    };
                }
                catch (e) {
                    return {
                        type: 'createMetadataResult',
                        payload: {
                            success: false,
                            error: (0, serializable_error_1.createSerializableError)(e),
                            tx,
                        },
                    };
                }
            },
            preTasksExecution: async ({ tx, context }) => {
                try {
                    const mutations = await plugin.preTasksExecution?.(context);
                    return {
                        type: 'preTasksExecutionResult',
                        payload: { success: true, tx, mutations },
                    };
                }
                catch (e) {
                    return {
                        type: 'preTasksExecutionResult',
                        payload: {
                            success: false,
                            error: (0, serializable_error_1.createSerializableError)(e),
                            tx,
                        },
                    };
                }
            },
            postTasksExecution: async ({ tx, context }) => {
                try {
                    await plugin.postTasksExecution?.(context);
                    return {
                        type: 'postTasksExecutionResult',
                        payload: { success: true, tx },
                    };
                }
                catch (e) {
                    return {
                        type: 'postTasksExecutionResult',
                        payload: {
                            success: false,
                            error: (0, serializable_error_1.createSerializableError)(e),
                            tx,
                        },
                    };
                }
            },
        });
    }));
    // There should only ever be one host -> worker connection
    // since the worker is spawned per host process. As such,
    // we can safely close the worker when the host disconnects.
    socket.on('end', () => {
        // Destroys the socket once it's fully closed.
        socket.destroySoon();
        // Stops accepting new connections, but existing connections are
        // not closed immediately.
        server.close(() => {
            try {
                (0, fs_1.unlinkSync)(socketPath);
            }
            catch (e) { }
            process.exit(0);
        });
    });
});
server.listen(socketPath);
if (process.env.NX_PLUGIN_NO_TIMEOUTS !== 'true') {
    setTimeout(() => {
        if (!connected) {
            console.error('The plugin worker is exiting as it was not connected to within 5 seconds.');
            process.exit(1);
        }
    }, 5000).unref();
}
const exitHandler = (exitCode) => () => {
    server.close();
    try {
        (0, fs_1.unlinkSync)(socketPath);
    }
    catch (e) { }
    process.exit(exitCode);
};
const events = ['SIGINT', 'SIGTERM', 'SIGQUIT', 'exit'];
events.forEach((event) => process.once(event, exitHandler(0)));
process.once('uncaughtException', exitHandler(1));
process.once('unhandledRejection', exitHandler(1));
