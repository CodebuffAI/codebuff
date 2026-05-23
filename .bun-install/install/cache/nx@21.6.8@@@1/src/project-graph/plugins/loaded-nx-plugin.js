"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoadedNxPlugin = void 0;
const error_types_1 = require("../error-types");
const enabled_1 = require("./isolation/enabled");
const client_1 = require("../../daemon/client/client");
class LoadedNxPlugin {
    constructor(plugin, pluginDefinition) {
        this.name = plugin.name;
        if (typeof pluginDefinition !== 'string') {
            this.options = pluginDefinition.options;
            this.include = pluginDefinition.include;
            this.exclude = pluginDefinition.exclude;
        }
        if (plugin.createNodes && !plugin.createNodesV2) {
            throw new Error(`Plugin ${plugin.name} only provides \`createNodes\` which was removed in Nx 21, it should provide a \`createNodesV2\` implementation.`);
        }
        if (plugin.createNodesV2) {
            this.createNodes = [
                plugin.createNodesV2[0],
                async (configFiles, context) => {
                    const result = await plugin.createNodesV2[1](configFiles, this.options, context);
                    return result.map((r) => [this.name, r[0], r[1]]);
                },
            ];
        }
        if (this.createNodes) {
            const inner = this.createNodes[1];
            this.createNodes[1] = async (...args) => {
                performance.mark(`${plugin.name}:createNodes - start`);
                try {
                    return await inner(...args);
                }
                catch (e) {
                    if ((0, error_types_1.isAggregateCreateNodesError)(e)) {
                        throw e;
                    }
                    // The underlying plugin errored out. We can't know any partial results.
                    throw new error_types_1.AggregateCreateNodesError([[null, e]], []);
                }
                finally {
                    performance.mark(`${plugin.name}:createNodes - end`);
                    performance.measure(`${plugin.name}:createNodes`, `${plugin.name}:createNodes - start`, `${plugin.name}:createNodes - end`);
                }
            };
        }
        if (plugin.createDependencies) {
            this.createDependencies = async (context) => plugin.createDependencies(this.options, context);
        }
        if (plugin.createMetadata) {
            this.createMetadata = async (graph, context) => plugin.createMetadata(graph, this.options, context);
        }
        if (plugin.preTasksExecution) {
            this.preTasksExecution = async (context) => {
                const updates = {};
                let originalEnv = process.env;
                if ((0, enabled_1.isIsolationEnabled)() || (0, client_1.isDaemonEnabled)()) {
                    process.env = new Proxy(originalEnv, {
                        set: (target, key, value) => {
                            target[key] = value;
                            updates[key] = value;
                            return true;
                        },
                    });
                }
                await plugin.preTasksExecution(this.options, context);
                process.env = originalEnv;
                return updates;
            };
        }
        if (plugin.postTasksExecution) {
            this.postTasksExecution = async (context) => plugin.postTasksExecution(this.options, context);
        }
    }
}
exports.LoadedNxPlugin = LoadedNxPlugin;
