"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initHandler = initHandler;
exports.detectPlugins = detectPlugins;
const fs_1 = require("fs");
const enquirer_1 = require("enquirer");
const semver_1 = require("semver");
const nx_json_1 = require("../../config/nx-json");
const fileutils_1 = require("../../utils/fileutils");
const get_package_name_from_import_path_1 = require("../../utils/get-package-name-from-import-path");
const output_1 = require("../../utils/output");
const package_manager_1 = require("../../utils/package-manager");
const versions_1 = require("../../utils/versions");
const workspace_context_1 = require("../../utils/workspace-context");
const connect_to_nx_cloud_1 = require("../nx-cloud/connect/connect-to-nx-cloud");
const configure_plugins_1 = require("./configure-plugins");
const ai_agent_prompts_1 = require("./ai-agent-prompts");
const set_up_ai_agents_1 = require("../../ai/set-up-ai-agents/set-up-ai-agents");
const tree_1 = require("../../generators/tree");
const add_nx_to_monorepo_1 = require("./implementation/add-nx-to-monorepo");
const add_nx_to_npm_repo_1 = require("./implementation/add-nx-to-npm-repo");
const add_nx_to_turborepo_1 = require("./implementation/add-nx-to-turborepo");
const angular_1 = require("./implementation/angular");
const add_nx_scripts_1 = require("./implementation/dot-nx/add-nx-scripts");
const utils_1 = require("./implementation/utils");
const react_1 = require("./implementation/react");
async function initHandler(options) {
    process.env.NX_RUNNING_NX_INIT = 'true';
    const version = process.env.NX_VERSION ?? ((0, semver_1.prerelease)(versions_1.nxVersion) ? versions_1.nxVersion : 'latest');
    if (process.env.NX_VERSION) {
        output_1.output.log({ title: `Using version ${process.env.NX_VERSION}` });
    }
    // TODO(jack): Remove this Angular logic once `@nx/angular` is compatible with inferred targets.
    if ((0, fs_1.existsSync)('angular.json')) {
        await (0, angular_1.addNxToAngularCliRepo)({
            ...options,
            integrated: !!options.integrated,
        });
        (0, utils_1.printFinalMessage)({
            learnMoreLink: 'https://nx.dev/technologies/angular/migration/angular',
        });
        return;
    }
    const _isNonJs = !(0, fs_1.existsSync)('package.json') || options.useDotNxInstallation;
    const packageJson = _isNonJs
        ? null
        : (0, fileutils_1.readJsonFile)('package.json');
    const _isTurborepo = (0, fs_1.existsSync)('turbo.json');
    const _isMonorepo = _isNonJs ? false : (0, utils_1.isMonorepo)(packageJson);
    const _isCRA = _isNonJs ? false : (0, utils_1.isCRA)(packageJson);
    let guided = true;
    if (options.interactive && !(_isTurborepo || _isCRA || _isNonJs)) {
        const setupType = await (0, enquirer_1.prompt)([
            {
                type: 'select',
                name: 'setupPreference',
                message: 'Would you like a minimum or guided setup?',
                choices: [{ name: 'Minimum' }, { name: 'Guided' }],
            },
        ]).then((r) => r.setupPreference);
        guided = setupType === 'Guided';
    }
    /**
     * Turborepo users must have set up individual scripts already, and we keep the transition as minimal as possible.
     * We log a message during the conversion process in addNxToTurborepo about how they can learn more about the power
     * of Nx plugins and how it would allow them to infer all the relevant scripts automatically, including all cache
     * inputs and outputs.
     */
    if (_isTurborepo) {
        await (0, add_nx_to_turborepo_1.addNxToTurborepo)({
            interactive: options.interactive,
        });
        (0, utils_1.printFinalMessage)({
            learnMoreLink: 'https://nx.dev/recipes/adopting-nx/from-turborepo',
        });
        return;
    }
    const pmc = (0, package_manager_1.getPackageManagerCommand)();
    if (_isCRA) {
        await (0, react_1.addNxToCraRepo)({
            addE2e: false,
            force: options.force,
            vite: true,
            integrated: false,
            interactive: options.interactive,
            nxCloud: false,
        });
    }
    else if (_isMonorepo) {
        await (0, add_nx_to_monorepo_1.addNxToMonorepo)({
            interactive: options.interactive,
            nxCloud: false,
        }, guided);
    }
    else if (_isNonJs) {
        (0, add_nx_scripts_1.generateDotNxSetup)(version);
        console.log('');
    }
    else {
        await (0, add_nx_to_npm_repo_1.addNxToNpmRepo)({
            interactive: options.interactive,
            nxCloud: false,
        }, guided);
    }
    const repoRoot = process.cwd();
    (0, utils_1.createNxJsonFile)(repoRoot, [], [], {});
    (0, utils_1.updateGitIgnore)(repoRoot);
    const nxJson = (0, nx_json_1.readNxJson)(repoRoot);
    if (guided) {
        output_1.output.log({ title: '🧐 Checking dependencies' });
        let plugins;
        let updatePackageScripts;
        if (_isCRA) {
            plugins = ['@nx/vite'];
            updatePackageScripts = true;
        }
        else {
            const { plugins: _plugins, updatePackageScripts: _updatePackageScripts } = await detectPlugins(nxJson, options.interactive);
            plugins = _plugins;
            updatePackageScripts = _updatePackageScripts;
        }
        output_1.output.log({ title: '📦 Installing Nx' });
        (0, configure_plugins_1.installPluginPackages)(repoRoot, pmc, plugins);
        await (0, configure_plugins_1.configurePlugins)(plugins, updatePackageScripts, pmc, repoRoot, options.verbose);
    }
    const selectedAgents = await (0, ai_agent_prompts_1.determineAiAgents)(options.aiAgents, options.interactive && guided);
    if (selectedAgents && selectedAgents.length > 0) {
        const tree = new tree_1.FsTree(repoRoot, false);
        const aiAgentsCallback = await (0, set_up_ai_agents_1.setupAiAgentsGenerator)(tree, {
            directory: '.',
            writeNxCloudRules: options.nxCloud !== false,
            packageVersion: 'latest',
            agents: [...selectedAgents],
        });
        const changes = tree.listChanges();
        (0, tree_1.flushChanges)(repoRoot, changes);
        if (aiAgentsCallback) {
            const results = await aiAgentsCallback();
            results.messages.forEach((m) => output_1.output.log(m));
            results.errors.forEach((e) => output_1.output.error(e));
        }
    }
    let useNxCloud = options.nxCloud;
    if (useNxCloud === undefined) {
        output_1.output.log({ title: '🛠️ Setting up Self-Healing CI and Remote Caching' });
        useNxCloud = options.interactive
            ? await (0, connect_to_nx_cloud_1.connectExistingRepoToNxCloudPrompt)()
            : false;
    }
    if (useNxCloud) {
        await (0, utils_1.initCloud)('nx-init');
    }
    (0, utils_1.printFinalMessage)({
        learnMoreLink: 'https://nx.dev/getting-started/adding-to-existing',
        appendLines: _isMonorepo
            ? [
                `- Read a detailed guide about adding Nx to NPM/YARN/PNPM workspaces: https://nx.dev/recipes/adopting-nx/adding-to-monorepos`,
                `- Learn how Nx helps manage your TypeScript monorepo: https://nx.dev/features/maintain-ts-monorepos`,
            ]
            : [],
    });
}
const npmPackageToPluginMap = {
    // Generic JS tools
    eslint: '@nx/eslint',
    storybook: '@nx/storybook',
    // Bundlers
    vite: '@nx/vite',
    vitest: '@nx/vite',
    webpack: '@nx/webpack',
    '@rspack/core': '@nx/rspack',
    rollup: '@nx/rollup',
    // Testing tools
    jest: '@nx/jest',
    cypress: '@nx/cypress',
    '@playwright/test': '@nx/playwright',
    // Frameworks
    detox: '@nx/detox',
    expo: '@nx/expo',
    next: '@nx/next',
    nuxt: '@nx/nuxt',
    'react-native': '@nx/react-native',
    '@remix-run/dev': '@nx/remix',
    '@rsbuild/core': '@nx/rsbuild',
    '@react-router/dev': '@nx/react',
};
async function detectPlugins(nxJson, interactive, includeAngularCli) {
    let files = ['package.json'].concat((0, workspace_context_1.globWithWorkspaceContextSync)(process.cwd(), ['**/*/package.json']));
    const currentPlugins = new Set((nxJson.plugins ?? []).map((p) => {
        const plugin = typeof p === 'string' ? p : p.plugin;
        return (0, get_package_name_from_import_path_1.getPackageNameFromImportPath)(plugin);
    }));
    const detectedPlugins = new Set();
    for (const file of files) {
        if (!(0, fs_1.existsSync)(file))
            continue;
        let packageJson;
        try {
            packageJson = (0, fileutils_1.readJsonFile)(file);
        }
        catch {
            // Could have malformed JSON for unit tests, etc.
            continue;
        }
        const deps = {
            ...packageJson.dependencies,
            ...packageJson.devDependencies,
        };
        const _npmPackageToPluginMap = {
            ...npmPackageToPluginMap,
        };
        if (includeAngularCli) {
            _npmPackageToPluginMap['@angular/cli'] = '@nx/angular';
        }
        for (const [dep, plugin] of Object.entries(_npmPackageToPluginMap)) {
            if (deps[dep]) {
                detectedPlugins.add(plugin);
            }
        }
    }
    let gradlewFiles = ['gradlew', 'gradlew.bat'].concat((0, workspace_context_1.globWithWorkspaceContextSync)(process.cwd(), [
        '**/gradlew',
        '**/gradlew.bat',
    ]));
    if (gradlewFiles.some((f) => (0, fs_1.existsSync)(f))) {
        detectedPlugins.add('@nx/gradle');
    }
    // Remove existing plugins
    for (const plugin of detectedPlugins) {
        if (currentPlugins.has(plugin)) {
            detectedPlugins.delete(plugin);
        }
    }
    const plugins = Array.from(detectedPlugins);
    if (plugins.length === 0) {
        return {
            plugins: [],
            updatePackageScripts: false,
        };
    }
    if (!interactive) {
        output_1.output.log({
            title: `Recommended Plugins:`,
            bodyLines: [
                `Adding these Nx plugins to integrate with the tools used in your workspace:`,
                ...plugins.map((p) => `- ${p}`),
            ],
        });
        return {
            plugins,
            updatePackageScripts: true,
        };
    }
    output_1.output.log({
        title: `Recommended Plugins:`,
        bodyLines: [
            `Add these Nx plugins to integrate with the tools used in your workspace.`,
        ],
    });
    const pluginsToInstall = await (0, enquirer_1.prompt)([
        {
            name: 'plugins',
            type: 'multiselect',
            message: `Which plugins would you like to add? Press <Space> to select and <Enter> to submit.`,
            choices: plugins.map((p) => ({ name: p, value: p })),
            /**
             * limit is missing from the interface but it limits the amount of options shown
             */
            limit: process.stdout.rows - 4, // 4 leaves room for the header above, the prompt and some whitespace
        },
    ]).then((r) => r.plugins);
    if (pluginsToInstall?.length === 0)
        return {
            plugins: [],
            updatePackageScripts: false,
        };
    const updatePackageScripts = (0, fs_1.existsSync)('package.json') &&
        (await (0, enquirer_1.prompt)([
            {
                name: 'updatePackageScripts',
                type: 'autocomplete',
                message: `Do you want to start using Nx in your package.json scripts?`,
                choices: [
                    {
                        name: 'Yes',
                    },
                    {
                        name: 'No',
                    },
                ],
                initial: 0,
            },
        ]).then((r) => r.updatePackageScripts === 'Yes'));
    return { plugins: pluginsToInstall, updatePackageScripts };
}
