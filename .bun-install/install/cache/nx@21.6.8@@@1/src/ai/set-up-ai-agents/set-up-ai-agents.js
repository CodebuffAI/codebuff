"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupAiAgentsGenerator = setupAiAgentsGenerator;
exports.setupAiAgentsGeneratorImpl = setupAiAgentsGeneratorImpl;
const fs_1 = require("fs");
const os_1 = require("os");
const path_1 = require("path");
const format_changed_files_with_prettier_if_available_1 = require("../../generators/internal-utils/format-changed-files-with-prettier-if-available");
const json_1 = require("../../generators/utils/json");
const native_1 = require("../../native");
const package_json_1 = require("../../utils/package-json");
const provenance_1 = require("../../utils/provenance");
const constants_1 = require("../constants");
const utils_1 = require("../utils");
const constants_2 = require("../constants");
async function setupAiAgentsGenerator(tree, options, inner = false) {
    const normalizedOptions = normalizeOptions(options);
    // Use environment variable to force local execution
    if (process.env.NX_AI_FILES_USE_LOCAL === 'true' || inner) {
        return await setupAiAgentsGeneratorImpl(tree, normalizedOptions);
    }
    try {
        await (0, provenance_1.ensurePackageHasProvenance)('nx', normalizedOptions.packageVersion);
        const { tempDir, cleanup } = (0, package_json_1.installPackageToTmp)('nx', normalizedOptions.packageVersion);
        let modulePath = (0, path_1.join)(tempDir, 'node_modules', 'nx', 'src/ai/set-up-ai-agents/set-up-ai-agents.js');
        const module = await Promise.resolve(`${modulePath}`).then(s => require(s));
        const setupAiAgentsGeneratorResult = await module.setupAiAgentsGenerator(tree, normalizedOptions, true);
        cleanup();
        return setupAiAgentsGeneratorResult;
    }
    catch (error) {
        return await setupAiAgentsGeneratorImpl(tree, normalizedOptions);
    }
}
function normalizeOptions(options) {
    return {
        directory: options.directory,
        writeNxCloudRules: options.writeNxCloudRules ?? false,
        packageVersion: options.packageVersion ?? 'latest',
        agents: options.agents ?? [...utils_1.supportedAgents],
    };
}
async function setupAiAgentsGeneratorImpl(tree, options) {
    const hasAgent = (agent) => options.agents.includes(agent);
    const agentsMd = (0, constants_1.agentsMdPath)(options.directory);
    // write AGENTS.md for most agents
    if (hasAgent('cursor') || hasAgent('copilot') || hasAgent('codex')) {
        writeAgentRules(tree, agentsMd, options.writeNxCloudRules);
    }
    if (hasAgent('claude')) {
        const claudePath = (0, path_1.join)(options.directory, 'CLAUDE.md');
        writeAgentRules(tree, claudePath, options.writeNxCloudRules);
        const mcpJsonPath = (0, path_1.join)(options.directory, '.mcp.json');
        if (!tree.exists(mcpJsonPath)) {
            (0, json_1.writeJson)(tree, mcpJsonPath, {});
        }
        (0, json_1.updateJson)(tree, mcpJsonPath, mcpConfigUpdater);
    }
    if (hasAgent('gemini')) {
        const geminiSettingsPath = (0, path_1.join)(options.directory, '.gemini', 'settings.json');
        if (!tree.exists(geminiSettingsPath)) {
            (0, json_1.writeJson)(tree, geminiSettingsPath, {});
        }
        (0, json_1.updateJson)(tree, geminiSettingsPath, mcpConfigUpdater);
        const contextFileName = (0, json_1.readJson)(tree, geminiSettingsPath).contextFileName;
        const geminiMd = (0, constants_1.geminiMdPath)(options.directory);
        // Only set contextFileName to AGENTS.md if GEMINI.md doesn't exist already to preserve existing setups
        if (!contextFileName && !tree.exists(geminiMd)) {
            writeAgentRules(tree, agentsMd, options.writeNxCloudRules);
            (0, json_1.updateJson)(tree, geminiSettingsPath, (json) => ({
                ...json,
                contextFileName: 'AGENTS.md',
            }));
        }
        else {
            writeAgentRules(tree, contextFileName ?? geminiMd, options.writeNxCloudRules);
        }
    }
    await (0, format_changed_files_with_prettier_if_available_1.formatChangedFilesWithPrettierIfAvailable)(tree);
    // we use the check variable to determine if we should actually make changes or just report what would be changed
    return async (check = false) => {
        const messages = [];
        const errors = [];
        if (hasAgent('codex')) {
            if ((0, fs_1.existsSync)(constants_1.codexConfigTomlPath)) {
                const tomlContents = (0, fs_1.readFileSync)(constants_1.codexConfigTomlPath, 'utf-8');
                if (!tomlContents.includes(constants_2.nxMcpTomlHeader)) {
                    if (!check) {
                        (0, fs_1.appendFileSync)(constants_1.codexConfigTomlPath, `\n${constants_2.nxMcpTomlConfig}`);
                    }
                    messages.push({
                        title: `Updated ${constants_1.codexConfigTomlPath} with nx-mcp server`,
                    });
                }
            }
            else {
                if (!check) {
                    (0, fs_1.mkdirSync)((0, path_1.join)((0, os_1.homedir)(), '.codex'), { recursive: true });
                    (0, fs_1.writeFileSync)(constants_1.codexConfigTomlPath, constants_2.nxMcpTomlConfig);
                }
                messages.push({
                    title: `Created ${constants_1.codexConfigTomlPath} with nx-mcp server`,
                });
            }
        }
        if (hasAgent('copilot')) {
            try {
                if ((0, native_1.isEditorInstalled)(0 /* SupportedEditor.VSCode */) &&
                    (0, native_1.canInstallNxConsoleForEditor)(0 /* SupportedEditor.VSCode */)) {
                    if (!check) {
                        (0, native_1.installNxConsoleForEditor)(0 /* SupportedEditor.VSCode */);
                    }
                    messages.push({
                        title: `Installed Nx Console for VSCode`,
                    });
                }
            }
            catch (e) {
                errors.push({
                    title: `Failed to install Nx Console for VSCode. Please install it manually.`,
                    bodyLines: [e.message],
                });
            }
            try {
                if ((0, native_1.isEditorInstalled)(1 /* SupportedEditor.VSCodeInsiders */) &&
                    (0, native_1.canInstallNxConsoleForEditor)(1 /* SupportedEditor.VSCodeInsiders */)) {
                    if (!check) {
                        (0, native_1.installNxConsoleForEditor)(1 /* SupportedEditor.VSCodeInsiders */);
                    }
                    messages.push({
                        title: `Installed Nx Console for VSCode Insiders`,
                    });
                }
            }
            catch (e) {
                errors.push({
                    title: `Failed to install Nx Console for VSCode Insiders. Please install it manually.`,
                    bodyLines: [e.message],
                });
            }
        }
        if (hasAgent('cursor')) {
            try {
                if ((0, native_1.isEditorInstalled)(2 /* SupportedEditor.Cursor */) &&
                    (0, native_1.canInstallNxConsoleForEditor)(2 /* SupportedEditor.Cursor */)) {
                    if (!check) {
                        (0, native_1.installNxConsoleForEditor)(2 /* SupportedEditor.Cursor */);
                    }
                    messages.push({
                        title: `Installed Nx Console for Cursor`,
                    });
                }
            }
            catch (e) {
                errors.push({
                    title: `Failed to install Nx Console for Cursor. Please install it manually.`,
                    bodyLines: [e.message],
                });
            }
        }
        return {
            messages,
            errors,
        };
    };
}
function writeAgentRules(tree, path, writeNxCloudRules) {
    const expectedRules = (0, constants_2.getAgentRulesWrapped)(writeNxCloudRules);
    if (!tree.exists(path)) {
        tree.write(path, expectedRules);
        return;
    }
    const existing = tree.read(path, 'utf-8');
    const regex = constants_2.rulesRegex;
    const existingNxConfiguration = existing.match(regex);
    if (existingNxConfiguration) {
        const contentOnly = (str) => str
            .replace(constants_2.nxRulesMarkerCommentStart, '')
            .replace(constants_2.nxRulesMarkerCommentEnd, '')
            .replace(constants_2.nxRulesMarkerCommentDescription, '')
            .replace(/\s/g, '');
        // we don't want to make updates on whitespace-only changes
        if (contentOnly(existingNxConfiguration[0]) === contentOnly(expectedRules)) {
            return;
        }
        // otherwise replace the existing configuration
        const updatedContent = existing.replace(regex, expectedRules);
        tree.write(path, updatedContent);
    }
    else {
        tree.write(path, existing + '\n\n' + expectedRules);
    }
}
function mcpConfigUpdater(existing) {
    if (existing.mcpServers) {
        existing.mcpServers['nx-mcp'] = {
            type: 'stdio',
            command: 'npx',
            args: ['nx', 'mcp'],
        };
    }
    else {
        existing.mcpServers = {
            'nx-mcp': {
                type: 'stdio',
                command: 'npx',
                args: ['nx', 'mcp'],
            },
        };
    }
    return existing;
}
exports.default = setupAiAgentsGenerator;
