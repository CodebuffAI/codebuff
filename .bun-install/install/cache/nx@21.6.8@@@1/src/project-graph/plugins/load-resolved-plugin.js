"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadResolvedNxPluginAsync = loadResolvedNxPluginAsync;
const loaded_nx_plugin_1 = require("./loaded-nx-plugin");
async function loadResolvedNxPluginAsync(pluginConfiguration, pluginPath, name) {
    const plugin = await importPluginModule(pluginPath);
    plugin.name ??= name;
    return new loaded_nx_plugin_1.LoadedNxPlugin(plugin, pluginConfiguration);
}
async function importPluginModule(pluginPath) {
    const m = await Promise.resolve(`${pluginPath}`).then(s => require(s));
    if (m.default &&
        ('createNodes' in m.default ||
            'createNodesV2' in m.default ||
            'createDependencies' in m.default ||
            'createMetadata' in m.default ||
            'preTasksExecution' in m.default ||
            'postTasksExecution' in m.default)) {
        return m.default;
    }
    return m;
}
