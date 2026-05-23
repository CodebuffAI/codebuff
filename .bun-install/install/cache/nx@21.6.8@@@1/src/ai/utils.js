"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.agentDisplayMap = exports.supportedAgents = void 0;
exports.getAgentConfigurations = getAgentConfigurations;
exports.configureAgents = configureAgents;
const fs_1 = require("fs");
const path_1 = require("path");
const configuration_1 = require("../config/configuration");
const tree_1 = require("../generators/tree");
const native_1 = require("../native");
const fileutils_1 = require("../utils/fileutils");
const nx_cloud_utils_1 = require("../utils/nx-cloud-utils");
const output_1 = require("../utils/output");
const constants_1 = require("./constants");
const set_up_ai_agents_1 = require("./set-up-ai-agents/set-up-ai-agents");
// when adding new agents, be sure to also update the list in
// packages/create-nx-workspace/src/create-workspace-options.ts
exports.supportedAgents = [
    'claude',
    'codex',
    'copilot',
    'cursor',
    'gemini',
];
exports.agentDisplayMap = {
    claude: 'Claude Code',
    gemini: 'Gemini',
    codex: 'OpenAI Codex',
    copilot: 'GitHub Copilot for VSCode',
    cursor: 'Cursor',
};
async function getAgentConfigurations(agentsToConsider, workspaceRoot) {
    const nonConfiguredAgents = [];
    const partiallyConfiguredAgents = [];
    const fullyConfiguredAgents = [];
    const disabledAgents = [];
    for (const agent of agentsToConsider) {
        const configuration = await getAgentConfiguration(agent, workspaceRoot);
        if (configuration.disabled) {
            disabledAgents.push(configuration);
            continue;
        }
        if (configuration.mcp && configuration.rules) {
            fullyConfiguredAgents.push(configuration);
        }
        else if (!configuration.mcp && !configuration.rules) {
            nonConfiguredAgents.push(configuration);
        }
        else {
            partiallyConfiguredAgents.push(configuration);
        }
    }
    return {
        nonConfiguredAgents,
        partiallyConfiguredAgents,
        fullyConfiguredAgents,
        disabledAgents,
    };
}
async function getAgentConfiguration(agent, workspaceRoot) {
    let agentConfiguration;
    switch (agent) {
        case 'claude': {
            const mcpPath = (0, constants_1.claudeMcpPath)(workspaceRoot);
            let mcpConfigured;
            try {
                const mcpContents = (0, fileutils_1.readJsonFile)(mcpPath);
                mcpConfigured = !!mcpContents?.['mcpServers']?.['nx-mcp'];
            }
            catch {
                mcpConfigured = false;
            }
            const rulesPath = (0, constants_1.claudeMdPath)(workspaceRoot);
            const rulesExists = (0, fs_1.existsSync)(rulesPath);
            agentConfiguration = {
                rules: rulesExists,
                mcp: mcpConfigured,
                rulesPath: rulesPath,
                mcpPath: mcpPath,
            };
            break;
        }
        case 'gemini': {
            const geminiRulePath = (0, constants_1.geminiMdPath)(workspaceRoot);
            const geminiMdExists = (0, fs_1.existsSync)(geminiRulePath);
            const settingsPath = (0, constants_1.geminiSettingsPath)(workspaceRoot);
            let mcpConfigured;
            const geminiSettings = (0, constants_1.parseGeminiSettings)(workspaceRoot);
            const customContextFilePath = geminiSettings?.contextFileName;
            const customContextFilePathExists = customContextFilePath
                ? (0, fs_1.existsSync)((0, path_1.resolve)(workspaceRoot, customContextFilePath))
                : false;
            mcpConfigured = geminiSettings?.['mcpServers']?.['nx-mcp'];
            agentConfiguration = {
                rules: (!customContextFilePath && geminiMdExists) ||
                    (customContextFilePath && customContextFilePathExists),
                mcp: mcpConfigured,
                rulesPath: customContextFilePath ?? geminiRulePath,
                mcpPath: settingsPath,
            };
            break;
        }
        case 'copilot': {
            const rulesPath = (0, constants_1.agentsMdPath)(workspaceRoot);
            const hasInstalledVSCode = (0, native_1.isEditorInstalled)(0 /* SupportedEditor.VSCode */);
            const hasInstalledVSCodeInsiders = (0, native_1.isEditorInstalled)(1 /* SupportedEditor.VSCodeInsiders */);
            const hasInstalledNxConsoleForVSCode = hasInstalledVSCode &&
                !(0, native_1.canInstallNxConsoleForEditor)(0 /* SupportedEditor.VSCode */);
            const hasInstalledNxConsoleForVSCodeInsiders = hasInstalledVSCodeInsiders &&
                !(0, native_1.canInstallNxConsoleForEditor)(1 /* SupportedEditor.VSCodeInsiders */);
            const agentsMdExists = (0, fs_1.existsSync)(rulesPath);
            agentConfiguration = {
                mcp: hasInstalledNxConsoleForVSCode ||
                    hasInstalledNxConsoleForVSCodeInsiders,
                rules: agentsMdExists,
                rulesPath,
                mcpPath: null,
                disabled: !hasInstalledVSCode && !hasInstalledVSCodeInsiders,
            };
            break;
        }
        case 'cursor': {
            const rulesPath = (0, constants_1.agentsMdPath)(workspaceRoot);
            const hasInstalledCursor = (0, native_1.isEditorInstalled)(2 /* SupportedEditor.Cursor */);
            const hasInstalledNxConsole = !(0, native_1.canInstallNxConsoleForEditor)(2 /* SupportedEditor.Cursor */);
            const agentsMdExists = (0, fs_1.existsSync)(rulesPath);
            agentConfiguration = {
                mcp: hasInstalledCursor ? hasInstalledNxConsole : false,
                rules: agentsMdExists,
                rulesPath,
                mcpPath: null,
                disabled: !hasInstalledCursor,
            };
            break;
        }
        case 'codex': {
            const rulesPath = (0, constants_1.agentsMdPath)(workspaceRoot);
            const agentsMdExists = (0, fs_1.existsSync)(rulesPath);
            let mcpConfigured;
            if ((0, fs_1.existsSync)(constants_1.codexConfigTomlPath)) {
                const tomlContents = (0, fs_1.readFileSync)(constants_1.codexConfigTomlPath, 'utf-8');
                mcpConfigured = tomlContents.includes(constants_1.nxMcpTomlHeader);
            }
            else {
                mcpConfigured = false;
            }
            agentConfiguration = {
                mcp: mcpConfigured,
                rules: agentsMdExists,
                rulesPath,
                mcpPath: constants_1.codexConfigTomlPath,
            };
            break;
        }
    }
    return {
        ...agentConfiguration,
        outdated: agentConfiguration.mcp &&
            agentConfiguration.rules &&
            (await agentWouldChangeWithGenerator(agent, workspaceRoot)),
        name: agent,
        displayName: exports.agentDisplayMap[agent],
    };
}
async function agentWouldChangeWithGenerator(agent, workspaceRoot) {
    const tree = new tree_1.FsTree(workspaceRoot, false);
    const callback = await (0, set_up_ai_agents_1.default)(tree, {
        directory: '.',
        agents: [agent],
        writeNxCloudRules: (0, nx_cloud_utils_1.isNxCloudUsed)((0, configuration_1.readNxJson)()),
    }, true);
    const modificationResults = await callback(true);
    return (tree.listChanges().length > 0 || modificationResults.messages.length > 0);
}
async function configureAgents(agents, workspaceRoot, useLatest) {
    const writeNxCloudRules = (0, nx_cloud_utils_1.isNxCloudUsed)((0, configuration_1.readNxJson)());
    const tree = new tree_1.FsTree(workspaceRoot, false);
    const callback = await (0, set_up_ai_agents_1.default)(tree, {
        directory: '.',
        agents,
        writeNxCloudRules,
    }, !useLatest);
    // changes that are out of scope for the generator itself because they do more than modify the tree
    (0, tree_1.flushChanges)(workspaceRoot, tree.listChanges());
    const modificationResults = await callback();
    modificationResults.messages.forEach((message) => output_1.output.log(message));
    modificationResults.errors.forEach((error) => output_1.output.error(error));
}
