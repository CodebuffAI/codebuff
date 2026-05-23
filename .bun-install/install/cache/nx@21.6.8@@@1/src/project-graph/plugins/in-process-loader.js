"use strict";
// This file contains methods and utilities that should **only** be used by the plugin worker.
Object.defineProperty(exports, "__esModule", { value: true });
exports.readPluginPackageJson = readPluginPackageJson;
exports.loadNxPlugin = loadNxPlugin;
exports.loadNxPluginAsync = loadNxPluginAsync;
const installation_directory_1 = require("../../utils/installation-directory");
const package_json_1 = require("../../utils/package-json");
const fileutils_1 = require("../../utils/fileutils");
const error_types_1 = require("../error-types");
const path = require("node:path/posix");
const load_resolved_plugin_1 = require("./load-resolved-plugin");
const resolve_plugin_1 = require("./resolve-plugin");
const transpiler_1 = require("./transpiler");
function readPluginPackageJson(pluginName, projects, paths = (0, installation_directory_1.getNxRequirePaths)()) {
    try {
        const result = (0, package_json_1.readModulePackageJsonWithoutFallbacks)(pluginName, paths);
        return {
            json: result.packageJson,
            path: result.path,
        };
    }
    catch (e) {
        if (e.code === 'MODULE_NOT_FOUND') {
            const localPluginPath = (0, resolve_plugin_1.resolveLocalNxPlugin)(pluginName, projects);
            if (localPluginPath) {
                const localPluginPackageJson = path.join(localPluginPath.path, 'package.json');
                if (!(0, transpiler_1.pluginTranspilerIsRegistered)()) {
                    (0, transpiler_1.registerPluginTSTranspiler)();
                }
                return {
                    path: localPluginPackageJson,
                    json: (0, fileutils_1.readJsonFile)(localPluginPackageJson),
                };
            }
        }
        throw e;
    }
}
function loadNxPlugin(plugin, root) {
    return [
        loadNxPluginAsync(plugin, (0, installation_directory_1.getNxRequirePaths)(root), root),
        () => { },
    ];
}
async function loadNxPluginAsync(pluginConfiguration, paths, root) {
    const moduleName = typeof pluginConfiguration === 'string'
        ? pluginConfiguration
        : pluginConfiguration.plugin;
    try {
        const { pluginPath, name, shouldRegisterTSTranspiler } = await (0, resolve_plugin_1.resolveNxPlugin)(moduleName, root, paths);
        if (shouldRegisterTSTranspiler) {
            (0, transpiler_1.registerPluginTSTranspiler)();
        }
        return (0, load_resolved_plugin_1.loadResolvedNxPluginAsync)(pluginConfiguration, pluginPath, name);
    }
    catch (e) {
        throw new error_types_1.LoadPluginError(moduleName, e);
    }
}
