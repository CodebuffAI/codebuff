"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureAiAgentsHandler = configureAiAgentsHandler;
exports.configureAiAgentsHandlerImpl = configureAiAgentsHandlerImpl;
const enquirer_1 = require("enquirer");
const output_1 = require("../../utils/output");
const provenance_1 = require("../../utils/provenance");
const chalk = require("chalk");
const utils_1 = require("../../ai/utils");
const devkit_internals_1 = require("../../devkit-internals");
const workspace_root_1 = require("../../utils/workspace-root");
const ora = require("ora");
const path_1 = require("path");
async function configureAiAgentsHandler(args, inner = false) {
    // Use environment variable to force local execution
    if (process.env.NX_AI_FILES_USE_LOCAL === 'true' || inner) {
        return await configureAiAgentsHandlerImpl(args);
    }
    let cleanup;
    try {
        await (0, provenance_1.ensurePackageHasProvenance)('nx', 'latest');
        const packageInstallResults = (0, devkit_internals_1.installPackageToTmp)('nx', 'latest');
        cleanup = packageInstallResults.cleanup;
        let modulePath = require.resolve('nx/src/command-line/configure-ai-agents/configure-ai-agents.js', { paths: [packageInstallResults.tempDir] });
        const module = await Promise.resolve(`${modulePath}`).then(s => require(s));
        const configureAiAgentsResult = await module.configureAiAgentsHandler(args, true);
        cleanup();
        return configureAiAgentsResult;
    }
    catch (error) {
        if (cleanup) {
            cleanup();
        }
        // Fall back to local implementation
        return configureAiAgentsHandlerImpl(args);
    }
}
async function configureAiAgentsHandlerImpl(options) {
    const normalizedOptions = normalizeOptions(options);
    const { nonConfiguredAgents, partiallyConfiguredAgents, fullyConfiguredAgents, disabledAgents, } = await (0, utils_1.getAgentConfigurations)(normalizedOptions.agents, workspace_root_1.workspaceRoot);
    if (disabledAgents.length > 0) {
        const commandNames = disabledAgents.map((a) => {
            if (a.name === 'cursor')
                return '"cursor"';
            if (a.name === 'copilot')
                return '"code"/"code-insiders"';
            return a;
        });
        const title = commandNames.length === 1
            ? `${commandNames[0]} command not available.`
            : `CLI commands ${commandNames
                .map((c) => `${c}`)
                .join('/')} not available.`;
        output_1.output.log({
            title,
            bodyLines: [
                chalk.dim('To manually configure the Nx MCP in your editor, install Nx Console (https://nx.dev/getting-started/editor-setup)'),
            ],
        });
    }
    if (normalizedOptions.agents.filter((agentName) => !disabledAgents.find((a) => a.name === agentName)).length === 0) {
        output_1.output.error({
            title: 'Please select at least one AI agent to configure.',
        });
        process.exit(1);
    }
    // important for wording
    const usingAllAgents = normalizedOptions.agents.length === utils_1.supportedAgents.length;
    if (normalizedOptions.check) {
        const outOfDateAgents = fullyConfiguredAgents.filter((a) => a?.outdated);
        // only error if something is fully configured but outdated
        if (normalizedOptions.check === 'outdated') {
            if (fullyConfiguredAgents.length === 0) {
                output_1.output.log({
                    title: 'No AI agents are configured',
                    bodyLines: [
                        'You can configure AI agents by running `nx configure-ai-agents`.',
                    ],
                });
                process.exit(0);
            }
            if (outOfDateAgents.length === 0) {
                output_1.output.success({
                    title: 'All configured AI agents are up to date',
                    bodyLines: fullyConfiguredAgents.map((a) => `- ${a.displayName}`),
                });
                process.exit(0);
            }
            else {
                output_1.output.log({
                    title: 'The following AI agents are out of date:',
                    bodyLines: [
                        ...outOfDateAgents.map((a) => {
                            const rulesPath = a.rulesPath;
                            const displayPath = rulesPath.startsWith(workspace_root_1.workspaceRoot)
                                ? (0, path_1.relative)(workspace_root_1.workspaceRoot, rulesPath)
                                : rulesPath;
                            return `- ${a.displayName} (${displayPath})`;
                        }),
                        '',
                        'You can update them by running `nx configure-ai-agents`.',
                    ],
                });
                process.exit(1);
            }
            // error on any partial, outdated or non-configured agent
        }
        else if (normalizedOptions.check === 'all') {
            if (partiallyConfiguredAgents.length === 0 &&
                outOfDateAgents.length === 0 &&
                nonConfiguredAgents.length === 0) {
                output_1.output.success({
                    title: `All ${!usingAllAgents ? 'selected' : 'supported'} AI agents are fully configured and up to date`,
                    bodyLines: fullyConfiguredAgents.map((a) => `- ${a.displayName}`),
                });
                process.exit(0);
            }
            output_1.output.error({
                title: 'The following agents are not fully configured or up to date:',
                bodyLines: [
                    ...partiallyConfiguredAgents,
                    ...outOfDateAgents,
                    ...nonConfiguredAgents,
                ].map((a) => getAgentChoiceForPrompt(a).message),
            });
            process.exit(1);
        }
    }
    const allAgentChoices = [];
    const preselectedIndices = [];
    let currentIndex = 0;
    // Partially configured agents first (highest priority)
    partiallyConfiguredAgents.forEach((a) => {
        allAgentChoices.push(getAgentChoiceForPrompt(a));
        preselectedIndices.push(currentIndex);
        currentIndex++;
    });
    // Outdated agents second
    for (const a of fullyConfiguredAgents) {
        if (a.outdated) {
            allAgentChoices.push(getAgentChoiceForPrompt(a));
            preselectedIndices.push(currentIndex);
            currentIndex++;
        }
    }
    // Non-configured agents last
    nonConfiguredAgents.forEach((a) => {
        allAgentChoices.push(getAgentChoiceForPrompt(a));
        currentIndex++;
    });
    if (allAgentChoices.length === 0) {
        output_1.output.success({
            title: `No new agents to configure. All ${!usingAllAgents ? 'selected' : 'supported'} AI agents are already configured:`,
            bodyLines: fullyConfiguredAgents.map((agent) => `- ${agent.displayName}`),
        });
        process.exit(0);
    }
    let selectedAgents;
    if (options.interactive !== false) {
        try {
            selectedAgents = (await (0, enquirer_1.prompt)({
                type: 'multiselect',
                name: 'agents',
                message: 'Which AI agents would you like to configure? (space to select, enter to confirm)',
                choices: allAgentChoices,
                initial: preselectedIndices,
                required: true,
                footer: function () {
                    const focused = this.focused;
                    if (focused.partial) {
                        return chalk.dim(focused.partialReason);
                    }
                    if (focused.agentConfiguration.outdated) {
                        return chalk.dim(`  The rules file at ${focused.rulesDisplayPath} can be updated with the latest Nx recommendations`);
                    }
                    if (!focused.agentConfiguration.mcp &&
                        !focused.agentConfiguration.rules) {
                        return chalk.dim(`  Configures agent rules at ${focused.rulesDisplayPath} and the Nx MCP server ${focused.mcpDisplayPath
                            ? `at ${focused.mcpDisplayPath}`
                            : 'via Nx Console'}`);
                    }
                },
            })).agents;
        }
        catch {
            process.exit(1);
        }
    }
    else {
        // in non-interactive mode, configure all
        selectedAgents = allAgentChoices.map((a) => a.name);
    }
    if (selectedAgents?.length === 0) {
        output_1.output.log({
            title: 'No agents selected',
        });
        process.exit(0);
    }
    const configSpinner = ora(`Configuring agent(s)...`).start();
    try {
        await (0, utils_1.configureAgents)(selectedAgents, workspace_root_1.workspaceRoot, false);
        const configuredOrUpdatedAgents = [
            ...new Set([
                ...fullyConfiguredAgents.map((a) => a.name),
                ...selectedAgents,
            ]),
        ];
        configSpinner.stop();
        output_1.output.log({
            title: 'AI agents set up successfully. Configured Agents:',
            bodyLines: configuredOrUpdatedAgents.map((agent) => `- ${utils_1.agentDisplayMap[agent]}`),
        });
        return;
    }
    catch (e) {
        configSpinner.fail('Failed to set up AI agents');
        output_1.output.error({
            title: 'Error details:',
            bodyLines: [e.message],
        });
        process.exit(1);
    }
}
function getAgentChoiceForPrompt(agent) {
    const partiallyConfigured = agent.mcp !== agent.rules;
    let message = agent.displayName;
    if (partiallyConfigured) {
        message += ` (${agent.rules ? 'MCP missing' : 'rules missing'})`;
    }
    else if (agent.outdated) {
        message += ' (out of date)';
    }
    const rulesDisplayPath = agent.rulesPath.startsWith(workspace_root_1.workspaceRoot)
        ? (0, path_1.relative)(workspace_root_1.workspaceRoot, agent.rulesPath)
        : agent.rulesPath;
    const mcpDisplayPath = agent.mcpPath?.startsWith(workspace_root_1.workspaceRoot)
        ? (0, path_1.relative)(workspace_root_1.workspaceRoot, agent.mcpPath)
        : agent.mcpPath;
    const partialReason = partiallyConfigured
        ? agent.rules
            ? `  Partially configured: MCP missing ${agent.mcpPath ? `at ${mcpDisplayPath}` : 'via Nx Console'}`
            : `  Partially configured: rules file missing at ${rulesDisplayPath}`
        : undefined;
    return {
        name: agent.name,
        message,
        partial: partiallyConfigured,
        partialReason,
        agentConfiguration: agent,
        rulesDisplayPath,
        mcpDisplayPath,
    };
}
function normalizeOptions(options) {
    const agents = (options.agents ?? utils_1.supportedAgents).filter((a) => utils_1.supportedAgents.includes(a));
    // it used to be just --check which was implicitly 'outdated'
    const check = (options.check === true ? 'outdated' : options.check) ?? false;
    return {
        ...options,
        agents,
        check,
    };
}
